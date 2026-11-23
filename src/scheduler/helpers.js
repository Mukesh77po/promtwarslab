// @ts-check
/**
 * src/scheduler/helpers.js
 * Search and formatting helpers for the Conflict Mediator.
 */

import {
  SLOT_DAY_START,
  SLOT_DAY_END,
  SLOT_HOURS,
  MAX_FREE_SLOT_SEARCH_DAYS,
  SLOT_DURATION_MS,
  MS_PER_DAY,
  SWAP_DAYS_THRESHOLD,
} from '../config.js';

/**
 * Check whether two intervals [aStart, aEnd) and [bStart, bEnd) overlap.
 * Back-to-back slots (aEnd === bStart) do NOT overlap.
 * @param {number} aStart @param {number} aEnd
 * @param {number} bStart @param {number} bEnd
 * @returns {boolean}
 */
export function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Generate valid weekday slot hours for a given date.
 * @returns {number[]} array of valid start hours (08-19)
 */
export function weekdaySlotHours() {
  const hours = [];
  for (let h = SLOT_DAY_START; h < SLOT_DAY_END; h += SLOT_HOURS) {
    hours.push(h);
  }
  return hours;
}

/**
 * Check if a candidate slot overlaps any active booking.
 * @param {Date} slotStart
 * @param {Date} slotEnd
 * @param {Array<{start: string, end: string, status: string}>} existingBookings
 * @returns {boolean}
 */
function isSlotBusy(slotStart, slotEnd, existingBookings) {
  return existingBookings.some((b) => {
    if (!['approved', 'pending', 'checked_in'].includes(b.status)) { return false; }
    return intervalsOverlap(
      slotStart.getTime(), slotEnd.getTime(),
      new Date(b.start).getTime(), new Date(b.end).getTime()
    );
  });
}

/**
 * Find next free slot for an item before or on deadline.
 * @param {string} _itemId
 * @param {Date} afterDate
 * @param {Date} deadline
 * @param {Array<{start: string, end: string, status: string}>} existingBookings
 * @returns {{ start: Date, end: Date }|null}
 */
export function findNextFreeSlot(_itemId, afterDate, deadline, existingBookings) {
  const slotHours = weekdaySlotHours();
  const deadlineMs = deadline.getTime();
  const current = new Date(afterDate);
  current.setMinutes(0, 0, 0);
  current.setHours(current.getHours() + 1);

  for (let attempt = 0; attempt < MAX_FREE_SLOT_SEARCH_DAYS; attempt++) {
    if (current.getDay() === 0) { current.setDate(current.getDate() + 1); continue; }
    if (current.getDay() === 6) { current.setDate(current.getDate() + 2); continue; }

    for (const h of slotHours) {
      const slotStart = new Date(current);
      slotStart.setHours(h, 0, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setHours(h + SLOT_HOURS);

      if (slotStart.getTime() <= afterDate.getTime()) { continue; }
      if (slotStart.getTime() > deadlineMs) { return null; }

      if (!isSlotBusy(slotStart, slotEnd, existingBookings)) {
        return { start: slotStart, end: slotEnd };
      }
    }
    current.setDate(current.getDate() + 1);
  }
  return null;
}

/**
 * Find an equivalent item (same equivalentGroup, acceptable tier) that is free.
 * @param {import('../types.js').Item} item
 * @param {string} start
 * @param {string} end
 * @param {import('../types.js').Item[]} allItems
 * @param {import('../types.js').Booking[]} allBookings
 * @param {(a: string, b: string) => number} getLabDistance
 * @param {number} [maxTierStep=1]
 * @returns {{ item: import('../types.js').Item, distance: number }|null}
 */
export function findEquivalentItem(item, start, end, allItems, allBookings, getLabDistance, maxTierStep = 1) {
  if (!item.equivalentGroup) { return null; }
  const startMs = new Date(start).getTime();
  const endMs   = new Date(end).getTime();

  const candidates = allItems.filter((alt) =>
    alt.id !== item.id &&
    alt.equivalentGroup === item.equivalentGroup &&
    alt.tier >= item.tier - maxTierStep &&
    alt.status !== 'maintenance'
  );

  const available = candidates.map((alt) => {
    const busy = allBookings.some((b) => {
      if (b.itemId !== alt.id) { return false; }
      if (!['approved', 'pending', 'checked_in'].includes(b.status)) { return false; }
      return intervalsOverlap(startMs, endMs, new Date(b.start).getTime(), new Date(b.end).getTime());
    });
    return { item: alt, distance: getLabDistance(item.lab, alt.lab), busy };
  }).filter((c) => !c.busy);

  if (!available.length) { return null; }
  available.sort((a, b) => a.distance - b.distance || a.item.tier - b.item.tier);
  return available[0];
}

/**
 * Build alternative proposals for a losing request.
 * @param {object} params
 * @returns {{ alternatives: import('../types.js').ConflictAlternative[], swap: import('../types.js').SwapProposal|null }}
 */
export function buildLoserAlternatives({ loser, winner, item, allItems, allBookings, getLabDistance, ref, itemBookings }) {
  const loserDeadline = new Date(loser.req.projectDeadline);
  if (loserDeadline <= ref) { return { alternatives: [], swap: null }; }

  /** @type {import('../types.js').ConflictAlternative[]} */
  const alternatives = [];
  const nextSlot = findNextFreeSlot(loser.req.itemId, new Date(loser.req.start), loserDeadline, itemBookings);

  if (nextSlot) {
    alternatives.push({
      bookingId: loser.req.id,
      type: 'next_slot',
      description: `Next free slot: ${nextSlot.start.toISOString()} – ${nextSlot.end.toISOString()}`,
      data: { start: nextSlot.start.toISOString(), end: nextSlot.end.toISOString() },
    });
  }

  if (item) {
    const equiv = findEquivalentItem(item, loser.req.start, loser.req.end, allItems, allBookings, getLabDistance);
    if (equiv) {
      alternatives.push({
        bookingId: loser.req.id,
        type: 'equivalent_item',
        description: `Equivalent: ${equiv.item.name} (${equiv.item.lab}, ${equiv.distance === 0 ? 'same lab' : `distance ${equiv.distance}`})`,
        data: { itemId: equiv.item.id, itemName: equiv.item.name, lab: equiv.item.lab, distance: equiv.distance },
      });
    }
  }

  if (nextSlot) {
    const durMs = new Date(loser.req.end).getTime() - new Date(loser.req.start).getTime();
    const halfHours = Math.max(1, Math.round(durMs / SLOT_DURATION_MS / 2));
    const splitEnd = new Date(nextSlot.start);
    splitEnd.setHours(splitEnd.getHours() + halfHours);
    alternatives.push({
      bookingId: loser.req.id,
      type: 'split_slot',
      description: `Split: ${halfHours}h in next free slot`,
      data: { start: nextSlot.start.toISOString(), end: splitEnd.toISOString(), originalHours: halfHours * 2 },
    });
  }

  const winnerDeadline = new Date(winner.req.projectDeadline);
  const loserDaysLeft  = (loserDeadline.getTime() - ref.getTime()) / MS_PER_DAY;
  const winnerDaysLeft = (winnerDeadline.getTime() - ref.getTime()) / MS_PER_DAY;
  let swap = null;
  if (loserDaysLeft < winnerDaysLeft - SWAP_DAYS_THRESHOLD) {
    swap = {
      proposedBy: loser.req.id,
      proposedTo: winner.req.id,
      reason: `Loser deadline is ${(winnerDaysLeft - loserDaysLeft).toFixed(1)} days sooner than winner.`,
      status: /** @type {const} */ ('pending'),
    };
  }

  return { alternatives, swap };
}

/**
 * Build human-readable template reason.
 * @param {object} winner
 * @param {object[]} losers
 * @param {import('../types.js').Item|undefined} item
 * @returns {string}
 */
export function buildReason(winner, losers, item) {
  const itemName = item?.name ?? 'requested item';
  const loserNames = losers.map((l) => l.req.userId).join(', ');
  return `Request ${winner.req.id} has the highest priority score (${winner.total.toFixed(3)}) ` +
    `for "${itemName}" based on deadline proximity (${winner.breakdown.deadline.toFixed(2)}), ` +
    `fairness (${winner.breakdown.fairness.toFixed(2)}), ` +
    `specificity (${winner.breakdown.specificity.toFixed(2)}), ` +
    `and feasibility (${winner.breakdown.feasibility.toFixed(2)}). ` +
    (losers.length ? `${losers.length} competing request(s) [${loserNames}] have been offered alternatives.` : '');
}
