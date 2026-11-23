// @ts-check
/**
 * src/scheduler/index.js
 * Conflict Mediator – pure functions; zero side-effects.
 * Weights are named constants from config.js (sum = 1, asserted in tests).
 */

import {
  WEIGHT_DEADLINE,
  WEIGHT_FAIRNESS,
  WEIGHT_SPECIFICITY,
  WEIGHT_FEASIBILITY,
  SLOT_DAY_START,
  SLOT_DAY_END,
  SCORE_EXP_DECAY,
  FAIRNESS_PENALTY,
  SPECIFICITY_PENALTY,
  MS_PER_DAY,
  now,
} from '../config.js';

import {
  intervalsOverlap,
  findNextFreeSlot,
  findEquivalentItem,
  buildLoserAlternatives,
  buildReason,
} from './helpers.js';

export {
  WEIGHT_DEADLINE,
  WEIGHT_FAIRNESS,
  WEIGHT_SPECIFICITY,
  WEIGHT_FEASIBILITY,
  intervalsOverlap,
  findNextFreeSlot,
  findEquivalentItem,
};

/**
 * Find conflicts among a list of bookings for the same item.
 * O(n log n) via sort + sweep.
 * @param {Array<{start: string, end: string, id: string}>} bookings
 * @returns {Array<[string, string]>} pairs of conflicting booking ids
 */
export function findConflicts(bookings) {
  if (bookings.length < 2) { return []; }
  const sorted = [...bookings].sort((a, b) =>
    new Date(a.start).getTime() - new Date(b.start).getTime()
  );
  const conflicts = [];
  for (let i = 0; i < sorted.length; i++) {
    const aEnd = new Date(sorted[i].end).getTime();
    for (let j = i + 1; j < sorted.length; j++) {
      if (new Date(sorted[j].start).getTime() >= aEnd) { break; }
      conflicts.push([sorted[i].id, sorted[j].id]);
    }
  }
  return conflicts;
}

/**
 * Compute priority score for a request.
 * @param {import('../types.js').ScoredRequest} req
 * @param {Date} referenceDate
 * @returns {{ total: number, breakdown: import('../types.js').ScoreBreakdown }}
 */
export function computeScore(req, referenceDate) {
  const daysUntil = Math.max(0, (new Date(req.projectDeadline).getTime() - referenceDate.getTime()) / MS_PER_DAY);
  const deadlineScore = daysUntil === 0 ? 1 : Math.exp(-SCORE_EXP_DECAY * daysUntil);
  const fairnessScore = req.firstTimeUser ? 1.0 : Math.max(0, 1 - req.userTrailingHours * FAIRNESS_PENALTY);
  const tierGap = req.itemTier - req.neededTier;
  const specificityScore = Math.max(0, 1 - tierGap * SPECIFICITY_PENALTY);

  const hoursAvailable = Math.max(0, daysUntil) * (SLOT_DAY_END - SLOT_DAY_START);
  const feasibilityScore = hoursAvailable === 0
    ? (req.projectHoursNeeded <= 0 ? 1 : 0)
    : Math.min(1, hoursAvailable / Math.max(1, req.projectHoursNeeded));

  const total = WEIGHT_DEADLINE * deadlineScore +
    WEIGHT_FAIRNESS * fairnessScore +
    WEIGHT_SPECIFICITY * specificityScore +
    WEIGHT_FEASIBILITY * feasibilityScore;

  return {
    total: Math.min(1, Math.max(0, total)),
    breakdown: {
      deadline:    +deadlineScore.toFixed(4),
      fairness:    +fairnessScore.toFixed(4),
      specificity: +specificityScore.toFixed(4),
      feasibility: +feasibilityScore.toFixed(4),
    },
  };
}

/**
 * Score and sort requests descending by priority with deterministic tie-break.
 * @param {import('../types.js').ScoredRequest[]} requests
 * @param {Date} ref
 */
function rankRequests(requests, ref) {
  const scored = requests.map((req) => ({ req, ...computeScore(req, ref) }));
  scored.sort((a, b) => {
    if (Math.abs(a.total - b.total) > 1e-9) { return b.total - a.total; }
    const tDiff = new Date(a.req.requestedAt).getTime() - new Date(b.req.requestedAt).getTime();
    if (tDiff !== 0) { return tDiff; }
    return a.req.id < b.req.id ? -1 : 1;
  });
  return scored;
}

/**
 * Mediate competing requests for the same item + time slot.
 * Pure function – deterministic, no I/O.
 * @param {import('../types.js').ScoredRequest[]} requests
 * @param {import('../types.js').Item[]} allItems
 * @param {import('../types.js').Booking[]} allBookings
 * @param {(a: string, b: string) => number} getLabDistance
 * @param {Date} [referenceDate]
 * @returns {import('../types.js').MediationResult}
 */
export function mediate(requests, allItems, allBookings, getLabDistance, referenceDate) {
  if (!requests || requests.length === 0) {
    throw new Error('mediate: at least one request required');
  }
  const ref = referenceDate ?? now();
  const ranked = rankRequests(requests, ref);
  const [winner, ...losers] = ranked;

  const item = allItems.find((it) => it.id === winner.req.itemId);
  const itemBookings = allBookings.filter((b) => b.itemId === winner.req.itemId && b.id !== winner.req.id);

  const alternatives = [];
  const swapProposals = [];
  for (const loser of losers) {
    const res = buildLoserAlternatives({ loser, winner, item, allItems, allBookings, getLabDistance, ref, itemBookings });
    alternatives.push(...res.alternatives);
    if (res.swap) { swapProposals.push(res.swap); }
  }

  const scores = Object.fromEntries(ranked.map((s) => [s.req.id, { total: +s.total.toFixed(4), breakdown: s.breakdown }]));
  return { winner: winner.req.id, scores, alternatives, swapProposals, reason: buildReason(winner, losers, item) };
}
