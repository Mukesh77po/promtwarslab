// @ts-check
/**
 * src/repo/index.js
 * In-memory repository. Implements the same interface as a Firestore/pgvector
 * implementation would – swap this file to change the storage backend.
 */

import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { now, FAIRNESS_WINDOW_DAYS } from '../config.js';
import { LAB_DISTANCE, getLabDistance } from './distances.js';
import { seedUsers, seedProjects, seedBookings } from './seedData.js';

export { LAB_DISTANCE, getLabDistance };

const require = createRequire(import.meta.url);

// ── Seed data ─────────────────────────────────────────────────────────────────
const rawItems = require('../../data/seed.json');

// ── In-memory stores ─────────────────────────────────────────────────────────
/** @type {Map<string, import('../types.js').Item>} */
const items = new Map(rawItems.map((i) => [i.id, { ...i }]));

/** @type {Map<string, import('../types.js').User>} */
const users = new Map();

/** @type {Map<string, import('../types.js').ProjectCard>} */
const projects = new Map();

/** @type {Map<string, import('../types.js').Booking>} */
const bookings = new Map();

/** @type {Map<string, import('../types.js').NotificationEntry[]>} */
const notifications = new Map();

/** @type {Map<string, string>} */
const checkinTokens = new Map(); // token -> bookingId

for (const u of seedUsers) {
  users.set(u.id, u);
  notifications.set(u.id, []);
}

for (const p of seedProjects) {
  projects.set(p.id, p);
}

for (const b of seedBookings) {
  bookings.set(b.id, b);
}

// ── Item repository ───────────────────────────────────────────────────────────
export const itemRepo = {
  findAll() { return [...items.values()]; },
  findById(id) { return items.get(id) ?? null; },
  update(id, patch) {
    const item = items.get(id);
    if (!item) { throw new Error(`Item not found: ${id}`); }
    Object.assign(item, patch);
    return item;
  },
};

// ── User repository ───────────────────────────────────────────────────────────
export const userRepo = {
  findAll() { return [...users.values()]; },
  findById(id) { return users.get(id) ?? null; },
  findByRole(role) { return [...users.values()].filter((u) => u.role === role); },

  /**
   * Get trailing-14-day usage hours for a user.
   * @param {string} userId
   * @returns {number}
   */
  getTrailingHours(userId) {
    const u = users.get(userId);
    if (!u) { return 0; }
    const cutoff = now();
    cutoff.setDate(cutoff.getDate() - FAIRNESS_WINDOW_DAYS);
    const userBookings = [...bookings.values()].filter((b) =>
      b.userId === userId &&
      ['approved', 'completed', 'checked_in'].includes(b.status) &&
      new Date(b.start) >= cutoff
    );
    return (u.trailingUsageHours ?? 0) + userBookings.length;
  },
};

// ── Project repository ────────────────────────────────────────────────────────
export const projectRepo = {
  findAll() { return [...projects.values()]; },
  findById(id) { return projects.get(id) ?? null; },
  findByUser(userId) {
    return [...projects.values()].filter((p) => p.teamMembers.includes(userId) || p.createdBy === userId);
  },
  create(data) {
    const proj = { id: randomUUID(), createdAt: now().toISOString(), ...data };
    projects.set(proj.id, proj);
    return proj;
  },
  update(id, patch) {
    const proj = projects.get(id);
    if (!proj) { throw new Error(`Project not found: ${id}`); }
    Object.assign(proj, patch);
    return proj;
  },
};

// ── Booking repository ────────────────────────────────────────────────────────
export const bookingRepo = {
  findAll() { return [...bookings.values()]; },
  findById(id) { return bookings.get(id) ?? null; },
  findByItem(itemId) { return [...bookings.values()].filter((b) => b.itemId === itemId); },
  findByUser(userId) { return [...bookings.values()].filter((b) => b.userId === userId); },
  findByProject(projectId) { return [...bookings.values()].filter((b) => b.projectId === projectId); },
  findPending(department) {
    return [...bookings.values()].filter((b) => {
      if (b.status !== 'pending') { return false; }
      if (!department) { return true; }
      const item = items.get(b.itemId);
      return item && item.department === department;
    });
  },
  findActive() {
    return [...bookings.values()].filter((b) => ['approved', 'checked_in'].includes(b.status));
  },
  create(data) {
    const booking = {
      id: randomUUID(),
      requestedAt: now().toISOString(),
      checkedIn: false,
      waitlisted: [],
      checkinToken: null,
      approvedBy: null,
      approvedAt: null,
      ...data,
    };
    bookings.set(booking.id, booking);
    return booking;
  },
  update(id, patch) {
    const booking = bookings.get(id);
    if (!booking) { throw new Error(`Booking not found: ${id}`); }
    Object.assign(booking, patch);
    return booking;
  },
  delete(id) {
    return bookings.delete(id);
  },
  findOverlapping(itemId, start, end, excludeIds = []) {
    const startMs = new Date(start).getTime();
    const endMs   = new Date(end).getTime();
    return [...bookings.values()].filter((b) => {
      if (b.itemId !== itemId || excludeIds.includes(b.id)) { return false; }
      if (!['approved', 'pending', 'waitlisted', 'checked_in'].includes(b.status)) { return false; }
      const bStart = new Date(b.start).getTime();
      const bEnd   = new Date(b.end).getTime();
      return bStart < endMs && bEnd > startMs;
    });
  },
};

// ── Notification repository ───────────────────────────────────────────────────
export const notificationRepo = {
  findByUser(userId) { return notifications.get(userId) ?? []; },
  add(userId, type, message, meta = {}) {
    const list = notifications.get(userId) ?? [];
    const note = { id: randomUUID(), userId, type, message, meta, read: false, createdAt: now().toISOString() };
    list.push(note);
    notifications.set(userId, list);
    return note;
  },
  markRead(userId, notifId) {
    const list = notifications.get(userId) ?? [];
    const note = list.find((n) => n.id === notifId);
    if (note) { note.read = true; }
  },
};

// ── Checkin token store ───────────────────────────────────────────────────────
export const checkinStore = {
  set(token, bookingId) { checkinTokens.set(token, bookingId); },
  get(token) { return checkinTokens.get(token) ?? null; },
  delete(token) { checkinTokens.delete(token); },
};
