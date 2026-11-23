// @ts-check
/**
 * src/types.js
 * Central JSDoc type definitions for core domain entities.
 */

/**
 * @typedef {'student' | 'technician' | 'faculty' | 'admin'} UserRole
 */

/**
 * @typedef {'ECE' | 'Mechanical' | 'CSE' | 'Robotics'} DepartmentName
 */

/**
 * @typedef {'available' | 'in_use' | 'maintenance' | 'approval_required'} ItemStatus
 */

/**
 * @typedef {'low' | 'medium' | 'high'} RiskLevel
 */

/**
 * @typedef {object} ImageMetadata
 * @property {string} src
 * @property {string} alt
 * @property {string} credit
 * @property {string} licence
 * @property {string|null} sourceUrl
 */

/**
 * @typedef {object} Model3DPart
 * @property {string} id
 * @property {string} label
 * @property {string} description
 */

/**
 * @typedef {object} Model3D
 * @property {string} kind
 * @property {Model3DPart[]} parts
 */

/**
 * @typedef {object} Item
 * @property {string} id
 * @property {string} name
 * @property {DepartmentName} department
 * @property {string} lab
 * @property {string} location
 * @property {string} category
 * @property {number} tier
 * @property {string[]} specTags
 * @property {string} description
 * @property {string} datasheetSummary
 * @property {string[]} softwareInstalled
 * @property {ItemStatus} status
 * @property {boolean} requiresApproval
 * @property {RiskLevel} riskLevel
 * @property {string[]} prerequisiteModules
 * @property {string[]} compatibleWith
 * @property {string|null} [equivalentGroup]
 * @property {string[]} usageSteps
 * @property {string[]} safetyNotes
 * @property {Model3D} model3d
 * @property {ImageMetadata} [image]
 */

/**
 * @typedef {object} User
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {UserRole} role
 * @property {DepartmentName|null} department
 * @property {string[]} completedModules
 * @property {number} trailingUsageHours
 */

/**
 * @typedef {object} ProjectCard
 * @property {string} id
 * @property {string} title
 * @property {string} abstract
 * @property {string[]} teamMembers
 * @property {string} courseCode
 * @property {string} hardDeadline
 * @property {number} hoursNeeded
 * @property {string} createdBy
 * @property {string} createdAt
 */

/**
 * @typedef {'pending' | 'approved' | 'rejected' | 'changes_requested' | 'waitlisted' | 'reallocated' | 'checked_in' | 'released_no_show' | 'completed'} BookingStatus
 */

/**
 * @typedef {object} Booking
 * @property {string} id
 * @property {string} projectId
 * @property {string} itemId
 * @property {string} userId
 * @property {string} start
 * @property {string} end
 * @property {BookingStatus} status
 * @property {boolean} checkedIn
 * @property {string|null} [checkedInAt]
 * @property {string[]} waitlisted
 * @property {string} requestedAt
 * @property {string|null} approvedBy
 * @property {string|null} approvedAt
 * @property {string|null} checkinToken
 * @property {string} [comment]
 */

/**
 * @typedef {object} ScoredRequest
 * @property {string} id
 * @property {string} userId
 * @property {string} projectId
 * @property {string} itemId
 * @property {string} start
 * @property {string} end
 * @property {string} requestedAt
 * @property {string} projectDeadline
 * @property {number} projectHoursNeeded
 * @property {number} userTrailingHours
 * @property {number} itemTier
 * @property {number} neededTier
 * @property {boolean} firstTimeUser
 */

/**
 * @typedef {object} ScoreBreakdown
 * @property {number} deadline
 * @property {number} fairness
 * @property {number} specificity
 * @property {number} feasibility
 */

/**
 * @typedef {object} ConflictAlternative
 * @property {string} bookingId
 * @property {'next_slot' | 'equivalent_item' | 'split_slot' | 'swap_proposal'} type
 * @property {string} description
 * @property {object} [data]
 */

/**
 * @typedef {object} SwapProposal
 * @property {string} proposedBy
 * @property {string} proposedTo
 * @property {string} reason
 * @property {'pending' | 'accepted' | 'declined'} status
 */

/**
 * @typedef {object} MediationResult
 * @property {string} winner
 * @property {Record<string, { total: number, breakdown: ScoreBreakdown }>} scores
 * @property {ConflictAlternative[]} alternatives
 * @property {SwapProposal[]} swapProposals
 * @property {string} reason
 */

/**
 * @typedef {object} NotificationEntry
 * @property {string} id
 * @property {string} userId
 * @property {'info' | 'success' | 'warning' | 'error'} type
 * @property {string} message
 * @property {object} meta
 * @property {boolean} read
 * @property {string} createdAt
 */

export {};
