// @ts-check
/**
 * src/errors.js
 * Centralized application error hierarchy.
 */

import { HTTP_STATUS } from './config.js';

/**
 * Standard application error with HTTP status, machine-readable code, and safe public message.
 */
export class AppError extends Error {
  /**
   * @param {number} status - HTTP status code
   * @param {string} code - Machine-readable code (e.g. 'NOT_FOUND')
   * @param {string} publicMessage - Safe client-facing message
   */
  constructor(status, code, publicMessage) {
    super(publicMessage);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * @param {string} msg
   * @param {string} [code]
   */
  static badRequest(msg, code = 'BAD_REQUEST') {
    return new AppError(HTTP_STATUS.BAD_REQUEST, code, msg);
  }

  /**
   * @param {string} [msg]
   * @param {string} [code]
   */
  static unauthorized(msg = 'Authentication required', code = 'UNAUTHORIZED') {
    return new AppError(HTTP_STATUS.UNAUTHORIZED, code, msg);
  }

  /**
   * @param {string} [msg]
   * @param {string} [code]
   */
  static forbidden(msg = 'Forbidden', code = 'FORBIDDEN') {
    return new AppError(HTTP_STATUS.FORBIDDEN, code, msg);
  }

  /**
   * @param {string} msg
   * @param {string} [code]
   */
  static notFound(msg = 'Resource not found', code = 'NOT_FOUND') {
    return new AppError(HTTP_STATUS.NOT_FOUND, code, msg);
  }

  /**
   * @param {string} msg
   * @param {string} [code]
   */
  static conflict(msg, code = 'CONFLICT') {
    return new AppError(HTTP_STATUS.CONFLICT, code, msg);
  }
}
