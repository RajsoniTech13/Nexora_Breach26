/**
 * Custom application error with HTTP status code support.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Enum-like constants for split methods (mirrors DB enum).
 */
export const SplitMethod = {
  EQUAL: 'equal',
  PERCENTAGE: 'percentage',
  CUSTOM: 'custom',
} as const;
export type SplitMethod = (typeof SplitMethod)[keyof typeof SplitMethod];

/**
 * Enum-like constants for member roles (mirrors DB enum).
 */
export const MemberRole = {
  ADMIN: 'admin',
  MEMBER: 'member',
} as const;
export type MemberRole = (typeof MemberRole)[keyof typeof MemberRole];

/**
 * Enum-like constants for settlement status (mirrors DB enum).
 */
export const SettlementStatus = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;
export type SettlementStatus = (typeof SettlementStatus)[keyof typeof SettlementStatus];

/**
 * Enum-like constants for ledger entry side (mirrors DB enum).
 */
export const EntrySide = {
  DEBIT: 'debit',
  CREDIT: 'credit',
} as const;
export type EntrySide = (typeof EntrySide)[keyof typeof EntrySide];

/**
 * Enum-like constants for reference type (mirrors DB enum).
 */
export const ReferenceType = {
  EXPENSE: 'expense',
  SETTLEMENT: 'settlement',
  REFUND: 'refund',
} as const;
export type ReferenceType = (typeof ReferenceType)[keyof typeof ReferenceType];

/**
 * Enum-like constants for account type (mirrors DB enum).
 */
export const AccountType = {
  USER_PAYABLE: 'user_payable',
  USER_RECEIVABLE: 'user_receivable',
  GROUP_EXPENSE: 'group_expense',
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];

/**
 * Enum-like constants for activity actions (mirrors DB enum).
 */
export const ActionType = {
  EXPENSE_ADDED: 'expense_added',
  EXPENSE_UPDATED: 'expense_updated',
  EXPENSE_DELETED: 'expense_deleted',
  SETTLEMENT_MADE: 'settlement_made',
  MEMBER_ADDED: 'member_added',
  MEMBER_REMOVED: 'member_removed',
} as const;
export type ActionType = (typeof ActionType)[keyof typeof ActionType];
