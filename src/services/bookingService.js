// @ts-check
/**
 * src/services/bookingService.js
 * Domain business logic for bookings, lifecycle transitions, and check-ins.
 */

import { bookingRepo, projectRepo, itemRepo, userRepo, notificationRepo, getLabDistance } from '../repo/index.js';
import { mediate } from '../scheduler/index.js';
import { geminiService } from './gemini.js';
import { generateCheckinToken, verifyCheckinToken } from './checkin.js';
import { now, SLOT_DURATION_MS, MS_PER_DAY } from '../config.js';
import { AppError } from '../errors.js';

export const VALID_TRANSITIONS = {
  pending:            ['approved', 'rejected', 'changes_requested', 'waitlisted'],
  waitlisted:         ['approved', 'rejected'],
  approved:           ['checked_in', 'released_no_show', 'completed'],
  changes_requested:  ['pending', 'rejected'],
  checked_in:         ['completed'],
  rejected:           [],
  released_no_show:   [],
  completed:          [],
  reallocated:        [],
};

/**
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function isLegalTransition(from, to) {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Validates slot bounds, weekday, hour window, and project deadline.
 * @param {string} start
 * @param {string} end
 * @param {string} hardDeadline
 */
export function validateSlotTiming(start, end, hardDeadline) {
  const startD = new Date(start);
  const endD   = new Date(end);
  if (startD.getDay() === 0 || startD.getDay() === 6) {
    throw AppError.badRequest('Slots are only available on weekdays', 'INVALID_SLOT_DAY');
  }
  if (startD.getHours() < 8 || endD.getHours() > 20) {
    throw AppError.badRequest('Slots must be between 08:00 and 20:00', 'INVALID_SLOT_HOUR');
  }
  if (endD.getTime() - startD.getTime() !== SLOT_DURATION_MS) {
    throw AppError.badRequest('Each slot must be exactly 1 hour', 'INVALID_SLOT_DURATION');
  }
  if (startD > new Date(hardDeadline)) {
    throw AppError.badRequest('Slot is after the project deadline', 'SLOT_PAST_DEADLINE');
  }
}

/**
 * Build request object for mediation.
 * @param {import('../types.js').User} user
 * @param {import('../types.js').ProjectCard} project
 * @param {import('../types.js').Item} item
 * @param {string} start
 * @param {string} end
 * @returns {import('../types.js').ScoredRequest}
 */
function buildMyRequest(user, project, item, start, end) {
  return {
    id: 'new',
    userId: user.id,
    projectId: project.id,
    itemId: item.id,
    start,
    end,
    requestedAt: now().toISOString(),
    projectDeadline: project.hardDeadline,
    projectHoursNeeded: project.hoursNeeded,
    userTrailingHours: userRepo.getTrailingHours(user.id),
    itemTier: item.tier,
    neededTier: item.tier,
    firstTimeUser: (user?.trailingUsageHours ?? 0) === 0,
  };
}

/**
 * Map overlapping bookings to competing ScoredRequests.
 * @param {import('../types.js').Booking[]} overlapping
 * @param {import('../types.js').Item} item
 * @returns {import('../types.js').ScoredRequest[]}
 */
function buildCompetingRequests(overlapping, item) {
  return overlapping.map((b) => {
    const compUser    = userRepo.findById(b.userId);
    const compProject = projectRepo.findById(b.projectId);
    const fallbackDeadline = new Date(Date.now() + MS_PER_DAY * 30).toISOString();
    return {
      id: b.id,
      userId: b.userId,
      projectId: b.projectId,
      itemId: b.itemId,
      start: b.start,
      end: b.end,
      requestedAt: b.requestedAt,
      projectDeadline: compProject?.hardDeadline ?? fallbackDeadline,
      projectHoursNeeded: compProject?.hoursNeeded ?? 10,
      userTrailingHours: userRepo.getTrailingHours(b.userId),
      itemTier: item.tier,
      neededTier: item.tier,
      firstTimeUser: (compUser?.trailingUsageHours ?? 0) === 0,
    };
  });
}

/**
 * Create a new booking request, handling conflicts and mediation.
 */
export async function createBooking({ user, projectId, itemId, start, end }) {
  const project = projectRepo.findById(projectId);
  if (!project) { throw AppError.notFound('Project not found', 'PROJECT_NOT_FOUND'); }
  if (user.role === 'student' && !project.teamMembers.includes(user.userId) && project.createdBy !== user.userId) {
    throw AppError.forbidden('You are not a member of this project');
  }
  const item = itemRepo.findById(itemId);
  if (!item) { throw AppError.notFound('Item not found', 'ITEM_NOT_FOUND'); }

  validateSlotTiming(start, end, project.hardDeadline);

  const overlapping = bookingRepo.findOverlapping(itemId, start, end);
  let status = item.requiresApproval ? 'pending' : 'approved';
  let mediationResult = null;

  if (overlapping.length > 0) {
    const fullUser = userRepo.findById(user.userId);
    const myReq = buildMyRequest(fullUser ?? { id: user.userId, trailingUsageHours: 0 }, project, item, start, end);
    const competing = buildCompetingRequests(overlapping, item);
    mediationResult = mediate([...competing, myReq], itemRepo.findAll(), bookingRepo.findAll(), getLabDistance, now());
    status = mediationResult.winner === 'new'
      ? (item.requiresApproval ? 'pending' : 'approved')
      : 'waitlisted';
  }

  const booking = bookingRepo.create({ projectId, itemId, userId: user.userId, start, end, status });

  if (status === 'approved') {
    const token = generateCheckinToken(booking.id);
    bookingRepo.update(booking.id, { checkinToken: token });
    booking.checkinToken = token;
  } else if (status === 'pending') {
    const deptFaculty = userRepo.findByRole('faculty').filter((f) => f.department === item.department);
    for (const f of deptFaculty) {
      notificationRepo.add(f.id, 'info',
        `New approval request for "${item.name}" from project "${project.title}".`,
        { bookingId: booking.id });
    }
  }

  let negotiationText = null;
  if (mediationResult) {
    const { text } = await geminiService.negotiationText(mediationResult, item);
    negotiationText = text;
  }

  return { booking, mediationResult, negotiationText };
}

/**
 * Process a booking approval/rejection action by faculty or admin.
 */
export async function approveBooking({ user, bookingId, action, comment }) {
  const booking = bookingRepo.findById(bookingId);
  if (!booking) { throw AppError.notFound('Booking not found', 'BOOKING_NOT_FOUND'); }
  const item = itemRepo.findById(booking.itemId);
  if (!item) { throw AppError.notFound('Item not found', 'ITEM_NOT_FOUND'); }

  if (user.role === 'faculty') {
    const facultyUser = userRepo.findById(user.userId);
    if (facultyUser?.department !== item.department) {
      throw AppError.forbidden('You can only approve bookings for your department');
    }
  }

  const targetStatus = action === 'approve' ? 'approved' : (action === 'reject' ? 'rejected' : 'changes_requested');
  if (!isLegalTransition(booking.status, targetStatus)) {
    throw AppError.conflict(`Cannot transition from ${booking.status} to ${targetStatus}`, 'ILLEGAL_TRANSITION');
  }

  const updated = bookingRepo.update(booking.id, {
    status: targetStatus,
    approvedBy: user.userId,
    approvedAt: now().toISOString(),
    comment,
  });

  if (targetStatus === 'approved') {
    const token = generateCheckinToken(booking.id);
    bookingRepo.update(booking.id, { checkinToken: token });
    updated.checkinToken = token;
  }

  const studentUser = userRepo.findById(booking.userId);
  const project = projectRepo.findById(booking.projectId);
  let readinessSummary = null;
  if (studentUser && project && item) {
    readinessSummary = await geminiService.readinessSummary(booking, item, studentUser, project);
  }

  notificationRepo.add(
    booking.userId,
    action === 'approve' ? 'success' : 'warning',
    `Your booking for "${item?.name}" was ${targetStatus}.${comment ? ` Comment: ${comment}` : ''}`,
    { bookingId: booking.id }
  );

  return { booking: updated, readinessSummary };
}

/**
 * Check in via QR code token (technician / admin).
 */
export function checkinBooking({ token }) {
  const all = bookingRepo.findAll();
  const booking = all.find((b) => b.checkinToken === token);
  if (!booking) { throw AppError.notFound('Token not found', 'TOKEN_NOT_FOUND'); }
  if (booking.status !== 'approved') {
    throw AppError.conflict('Booking is not in approved state', 'BOOKING_NOT_APPROVED');
  }

  const result = verifyCheckinToken(token, booking);
  if (!result.valid) { throw AppError.badRequest(result.reason, 'INVALID_CHECKIN_TOKEN'); }

  bookingRepo.update(booking.id, { checkedIn: true, checkedInAt: now().toISOString(), status: 'checked_in' });
  notificationRepo.add(booking.userId, 'success', `Checked in for ${booking.itemId}. Enjoy your session!`, { bookingId: booking.id });
  return { ok: true, bookingId: booking.id };
}

/**
 * Process a waitlist swap action (accept / decline).
 */
export function processSwapReply({ user, bookingId, action }) {
  const booking = bookingRepo.findById(bookingId);
  if (!booking) { throw AppError.notFound('Booking not found', 'BOOKING_NOT_FOUND'); }
  if (booking.userId !== user.userId && user.role !== 'admin') {
    throw AppError.forbidden('Forbidden');
  }
  if (action === 'accept') {
    bookingRepo.update(bookingId, { status: 'reallocated' });
    notificationRepo.add(booking.userId, 'info', 'Swap accepted. Your booking has been reallocated.', { bookingId });
  }
  return { ok: true, action };
}
