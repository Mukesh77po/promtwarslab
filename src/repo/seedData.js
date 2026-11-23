// @ts-check
/**
 * src/repo/seedData.js
 * In-memory seed datasets for users, projects, and initial bookings.
 */

import { now } from '../config.js';

/**
 * Generates an ISO timestamp N days from logical now.
 * @param {number} d - Days offset
 * @returns {string}
 */
export function daysFromNow(d) {
  const t = now();
  t.setDate(t.getDate() + d);
  return t.toISOString();
}

/**
 * Generates an ISO timestamp today at hour h (skipping weekends).
 * @param {number} h - Hour (0-23)
 * @returns {string}
 */
export function todayAt(h) {
  const d = now();
  d.setHours(h, 0, 0, 0);
  while (d.getDay() === 0 || d.getDay() === 6) { d.setDate(d.getDate() + 1); }
  return d.toISOString();
}

/**
 * Generates an ISO timestamp tomorrow at hour h (skipping weekends).
 * @param {number} h - Hour (0-23)
 * @returns {string}
 */
export function tomorrowAt(h) {
  const d = now();
  d.setDate(d.getDate() + 1);
  d.setHours(h, 0, 0, 0);
  while (d.getDay() === 0 || d.getDay() === 6) { d.setDate(d.getDate() + 1); }
  return d.toISOString();
}

export const seedUsers = [
  { id: 'u-stu-alice',  name: 'Alice Kumar',    email: 'alice@college.edu',  role: 'student',    department: 'CSE',       completedModules: ['CS301', 'CS401'],           trailingUsageHours: 8  },
  { id: 'u-stu-bob',    name: 'Bob Sharma',      email: 'bob@college.edu',    role: 'student',    department: 'ECE',       completedModules: ['EC101', 'EC201', 'EC301'],  trailingUsageHours: 22 },
  { id: 'u-stu-carol',  name: 'Carol Patel',     email: 'carol@college.edu',  role: 'student',    department: 'Mechanical',completedModules: ['ME201'],                    trailingUsageHours: 3  },
  { id: 'u-stu-dave',   name: 'Dave Reddy',      email: 'dave@college.edu',   role: 'student',    department: 'Robotics',  completedModules: ['RB201', 'RB301'],           trailingUsageHours: 0  },
  { id: 'u-stu-eve',    name: 'Eve Nair',        email: 'eve@college.edu',    role: 'student',    department: 'CSE',       completedModules: ['CS301'],                    trailingUsageHours: 15 },
  { id: 'u-fac-ece',    name: 'Prof. R. Menon',  email: 'rmenon@college.edu', role: 'faculty',    department: 'ECE',       completedModules: [],                           trailingUsageHours: 0  },
  { id: 'u-fac-cse',    name: 'Prof. S. Iyer',   email: 'siyer@college.edu',  role: 'faculty',    department: 'CSE',       completedModules: [],                           trailingUsageHours: 0  },
  { id: 'u-fac-mech',   name: 'Prof. A. Ghosh',  email: 'aghosh@college.edu', role: 'faculty',    department: 'Mechanical',completedModules: [],                           trailingUsageHours: 0  },
  { id: 'u-fac-rob',    name: 'Prof. K. Rao',    email: 'krao@college.edu',   role: 'faculty',    department: 'Robotics',  completedModules: [],                           trailingUsageHours: 0  },
  { id: 'u-tech-raj',   name: 'Raj Technician',  email: 'raj@college.edu',    role: 'technician', department: null,        completedModules: [],                           trailingUsageHours: 0  },
  { id: 'u-admin',      name: 'Lab Admin',       email: 'admin@college.edu',  role: 'admin',      department: null,        completedModules: [],                           trailingUsageHours: 0  },
];

export const seedProjects = [
  { id: 'proj-cv-edge',   title: 'Edge Computer Vision for Campus Security', abstract: 'Deploy YOLOv8 on Jetson Orin for real-time object detection.', teamMembers: ['u-stu-alice'], courseCode: 'CS499', hardDeadline: daysFromNow(14), hoursNeeded: 20, createdBy: 'u-stu-alice', createdAt: daysFromNow(-5) },
  { id: 'proj-5g-ant',    title: '5G mmWave Antenna Characterisation',       abstract: 'Measure S-params and radiation pattern of 5G mmWave patch array.',  teamMembers: ['u-stu-bob'],  courseCode: 'EC402', hardDeadline: daysFromNow(10), hoursNeeded: 12, createdBy: 'u-stu-bob',   createdAt: daysFromNow(-3) },
  { id: 'proj-slam-robot',title: 'Autonomous SLAM Navigation Robot',          abstract: 'Build a ROS2 navigation stack using LiDAR and camera fusion.',      teamMembers: ['u-stu-dave'], courseCode: 'RB401', hardDeadline: daysFromNow(21), hoursNeeded: 30, createdBy: 'u-stu-dave',  createdAt: daysFromNow(-7) },
  { id: 'proj-fdm-proto',  title: 'FDM Printed Drone Frame Prototype',         abstract: 'Design and print a lightweight quadrotor frame in PETG.',           teamMembers: ['u-stu-carol'],courseCode: 'ME301', hardDeadline: daysFromNow(7),  hoursNeeded: 6,  createdBy: 'u-stu-carol', createdAt: daysFromNow(-2) },
];

export const seedBookings = [
  { id: 'bk-seed-1', projectId: 'proj-cv-edge',    itemId: 'jetson-orin-agx',       userId: 'u-stu-alice', start: todayAt(10), end: todayAt(11),   status: 'approved', checkedIn: false, waitlisted: [], requestedAt: daysFromNow(-4), approvedBy: 'u-fac-cse',  approvedAt: daysFromNow(-3), checkinToken: null },
  { id: 'bk-seed-2', projectId: 'proj-5g-ant',     itemId: 'vna-keysight-p9374a',   userId: 'u-stu-bob',   start: todayAt(14), end: todayAt(15),   status: 'approved', checkedIn: false, waitlisted: [], requestedAt: daysFromNow(-2), approvedBy: 'u-fac-ece',  approvedAt: daysFromNow(-1), checkinToken: null },
  { id: 'bk-seed-3', projectId: 'proj-slam-robot', itemId: 'lidar-ouster-os1',      userId: 'u-stu-dave',  start: tomorrowAt(9), end: tomorrowAt(10), status: 'pending',  checkedIn: false, waitlisted: [], requestedAt: daysFromNow(-1), approvedBy: null,          approvedAt: null,            checkinToken: null },
  { id: 'bk-seed-4', projectId: 'proj-fdm-proto',  itemId: 'printer-fdm-prusa',     userId: 'u-stu-carol', start: todayAt(13), end: todayAt(14),   status: 'completed',checkedIn: true,  waitlisted: [], requestedAt: daysFromNow(-3), approvedBy: null,          approvedAt: null,            checkinToken: null },
  { id: 'bk-seed-5', projectId: 'proj-cv-edge',    itemId: 'gpu-ws-rtx4090',        userId: 'u-stu-alice', start: tomorrowAt(11), end: tomorrowAt(12), status: 'pending', checkedIn: false, waitlisted: [], requestedAt: daysFromNow(-1), approvedBy: null,          approvedAt: null,            checkinToken: null },
];
