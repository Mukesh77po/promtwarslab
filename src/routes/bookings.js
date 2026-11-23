// @ts-check
/**
 * src/routes/bookings.js
 * Booking HTTP endpoints: request, approval, check-in, waitlist swap, QR code.
 */

import { Router } from 'express';
import { bookingRepo, itemRepo, userRepo, projectRepo } from '../repo/index.js';
import { validateBookingRequest, validateApprovalAction, validateCheckin, validateWaitlistAction } from '../validation/index.js';
import { requireAuth, requireRole } from '../middleware/index.js';
import { geminiService } from '../services/gemini.js';
import { generateCheckinToken } from '../services/checkin.js';
import { sweepNoShows } from '../services/noshow.js';
import { AppError } from '../errors.js';
import { HTTP_STATUS } from '../config.js';
import {
  createBooking,
  approveBooking,
  checkinBooking,
  processSwapReply,
} from '../services/bookingService.js';
import QRCode from 'qrcode';

const router = Router();

/** POST /api/bookings/swapreply */
router.post('/swapreply', requireRole('student', 'admin'), (req, res, next) => {
  try {
    const val = validateWaitlistAction(req.body);
    if (val.error) { throw AppError.badRequest(val.error); }
    const result = processSwapReply({ user: req.user, bookingId: val.value.bookingId, action: val.value.action });
    return res.json(result);
  } catch (err) { return next(err); }
});

/** POST /api/bookings/checkin */
router.post('/checkin', requireRole('technician', 'admin'), (req, res, next) => {
  try {
    sweepNoShows();
    const val = validateCheckin(req.body);
    if (val.error) { throw AppError.badRequest(val.error); }
    const result = checkinBooking({ token: val.value.token });
    return res.json(result);
  } catch (err) { return next(err); }
});

/** GET /api/bookings */
router.get('/', requireAuth, (req, res) => {
  sweepNoShows();
  const { role, userId } = req.user;
  let bookings;
  if (role === 'admin') {
    bookings = bookingRepo.findAll();
  } else if (role === 'faculty') {
    const facultyUser = userRepo.findById(userId);
    bookings = bookingRepo.findPending(facultyUser?.department ?? null);
  } else if (role === 'technician') {
    bookings = bookingRepo.findActive();
  } else {
    bookings = bookingRepo.findByUser(userId);
  }
  return res.json({ bookings });
});

/** GET /api/bookings/:id */
router.get('/:id', requireAuth, (req, res, next) => {
  sweepNoShows();
  const booking = bookingRepo.findById(req.params.id);
  if (!booking) { return next(AppError.notFound('Booking not found')); }
  if (req.user.role === 'student' && booking.userId !== req.user.userId) {
    return next(AppError.forbidden());
  }
  return res.json({ booking });
});

/** POST /api/bookings */
router.post('/', requireRole('student', 'admin'), async (req, res, next) => {
  try {
    const val = validateBookingRequest(req.body);
    if (val.error) { throw AppError.badRequest(val.error); }
    const result = await createBooking({ user: req.user, ...val.value });
    return res.status(HTTP_STATUS.CREATED).json(result);
  } catch (err) { return next(err); }
});

/** POST /api/bookings/:id/approve */
router.post('/:id/approve', requireRole('faculty', 'admin'), async (req, res, next) => {
  try {
    const val = validateApprovalAction(req.body);
    if (val.error) { throw AppError.badRequest(val.error); }
    const result = await approveBooking({
      user: req.user,
      bookingId: req.params.id,
      action: val.value.action,
      comment: val.value.comment,
    });
    return res.json(result);
  } catch (err) { return next(err); }
});

/** GET /api/bookings/:id/readiness */
router.get('/:id/readiness', requireRole('faculty', 'admin'), async (req, res, next) => {
  try {
    const booking = bookingRepo.findById(req.params.id);
    if (!booking) { throw AppError.notFound('Booking not found'); }
    const item    = itemRepo.findById(booking.itemId);
    const user    = userRepo.findById(booking.userId);
    const project = projectRepo.findById(booking.projectId);
    if (!item || !user || !project) { throw AppError.notFound('Related data not found'); }
    const summary = await geminiService.readinessSummary(booking, item, user, project);
    return res.json(summary);
  } catch (err) { return next(err); }
});

/** GET /api/bookings/:id/qr */
router.get('/:id/qr', requireAuth, async (req, res, next) => {
  try {
    const booking = bookingRepo.findById(req.params.id);
    if (!booking) { throw AppError.notFound('Booking not found'); }
    if (booking.status !== 'approved') { throw AppError.conflict('Booking is not approved'); }
    if (req.user.role === 'student' && booking.userId !== req.user.userId) {
      throw AppError.forbidden();
    }
    const token = booking.checkinToken ?? generateCheckinToken(booking.id);
    if (!booking.checkinToken) { bookingRepo.update(booking.id, { checkinToken: token }); }
    const svg = await QRCode.toString(token, { type: 'svg', margin: 2 });
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.send(svg);
  } catch (err) { return next(err); }
});

export default router;
