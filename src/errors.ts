import type { StructuredError } from './types.js';

// Error type constants
export const ERROR_TYPES = {
  SWAGGER_FETCH_ERROR: 'SWAGGER_FETCH_ERROR',
  ENDPOINT_NOT_FOUND: 'ENDPOINT_NOT_FOUND',
  PARSE_ERROR: 'PARSE_ERROR',
  WRITE_ERROR: 'WRITE_ERROR',
  CONFIG_NOT_FOUND: 'CONFIG_NOT_FOUND',
} as const;

export type ErrorType = (typeof ERROR_TYPES)[keyof typeof ERROR_TYPES];

/**
 * Factory function to create a structured error object.
 * Never throws — always returns a StructuredError.
 */
export function createError(
  type: StructuredError['type'],
  message: string,
  context?: string,
): StructuredError {
  const err: StructuredError = { type, message };
  if (context !== undefined) {
    err.context = context;
  }
  return err;
}

/**
 * Type guard to check if a value is a StructuredError.
 */
export function isStructuredError(value: unknown): value is StructuredError {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  const validTypes = Object.values(ERROR_TYPES) as string[];
  return (
    typeof obj.type === 'string' &&
    validTypes.includes(obj.type) &&
    typeof obj.message === 'string'
  );
}
