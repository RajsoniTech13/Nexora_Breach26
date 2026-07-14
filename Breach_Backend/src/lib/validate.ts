import { AppError } from '../types/index.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUUID(value: unknown, fieldName: string): string {
  const str = String(value ?? '').trim();
  if (!UUID_RE.test(str)) {
    throw new AppError(`${fieldName} must be a valid UUID`, 400);
  }
  return str;
}

export function validateRequired(value: unknown, fieldName: string): string {
  const str = String(value ?? '').trim();
  if (str.length === 0) {
    throw new AppError(`${fieldName} is required`, 400);
  }
  return str;
}

export function validatePositiveAmount(value: unknown, fieldName = 'amount'): number {
  const num = Number(value);
  if (isNaN(num) || num <= 0) {
    throw new AppError(`${fieldName} must be a positive number`, 400);
  }
  return Math.round(num * 100) / 100;
}

export function validateEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fieldName: string,
): T {
  const str = String(value ?? '').trim().toLowerCase() as T;
  if (!allowed.includes(str)) {
    throw new AppError(`${fieldName} must be one of: ${allowed.join(', ')}`, 400);
  }
  return str;
}

export function validateOptionalString(value: unknown, maxLength: number, fieldName: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  const str = String(value).trim();
  if (str.length > maxLength) {
    throw new AppError(`${fieldName} must be at most ${maxLength} characters`, 400);
  }
  return str;
}

export function validatePagination(query: Record<string, unknown>): { limit: number; offset: number } {
  const page = Math.max(1, parseInt(String(query['page'] ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query['limit'] ?? '20'), 10) || 20));
  return { limit, offset: (page - 1) * limit };
}
