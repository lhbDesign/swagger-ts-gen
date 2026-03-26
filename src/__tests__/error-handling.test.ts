// Feature: swagger-ts-type-generator, Property 14: 错误处理结构化

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { createError, isStructuredError, ERROR_TYPES } from '../errors.js';
import type { StructuredError } from '../types.js';

// ─── unit tests ─────────────────────────────────────────────────────────────

describe('createError', () => {
  it('returns object with correct type and message', () => {
    const err = createError('PARSE_ERROR', 'failed to parse file');
    expect(err.type).toBe('PARSE_ERROR');
    expect(err.message).toBe('failed to parse file');
  });

  it('includes context when provided', () => {
    const err = createError('WRITE_ERROR', 'write failed', 'src/api/index.ts');
    expect(err.context).toBe('src/api/index.ts');
  });

  it('omits context when not provided', () => {
    const err = createError('SWAGGER_FETCH_ERROR', 'network error');
    expect(err.context).toBeUndefined();
  });
});

describe('isStructuredError', () => {
  it('returns true for a valid StructuredError', () => {
    const err: StructuredError = { type: 'ENDPOINT_NOT_FOUND', message: 'not found' };
    expect(isStructuredError(err)).toBe(true);
  });

  it('returns true for a valid StructuredError with context', () => {
    const err: StructuredError = { type: 'CONFIG_NOT_FOUND', message: 'no config', context: 'cwd' };
    expect(isStructuredError(err)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isStructuredError(null)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isStructuredError('PARSE_ERROR')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isStructuredError(42)).toBe(false);
  });

  it('returns false for a plain object without type', () => {
    expect(isStructuredError({ message: 'oops' })).toBe(false);
  });

  it('returns false for an object with an invalid type value', () => {
    expect(isStructuredError({ type: 'UNKNOWN_ERROR', message: 'oops' })).toBe(false);
  });
});

describe('ERROR_TYPES constants', () => {
  it('all 5 error type constants are defined and match their string values', () => {
    expect(ERROR_TYPES.SWAGGER_FETCH_ERROR).toBe('SWAGGER_FETCH_ERROR');
    expect(ERROR_TYPES.ENDPOINT_NOT_FOUND).toBe('ENDPOINT_NOT_FOUND');
    expect(ERROR_TYPES.PARSE_ERROR).toBe('PARSE_ERROR');
    expect(ERROR_TYPES.WRITE_ERROR).toBe('WRITE_ERROR');
    expect(ERROR_TYPES.CONFIG_NOT_FOUND).toBe('CONFIG_NOT_FOUND');
  });
});

// ─── property test (属性 14) ─────────────────────────────────────────────────

/**
 * Validates: Requirements 2.4, 6.6
 *
 * 属性 14：对于任意错误类型和消息字符串，createError 始终返回包含
 * 正确 type 和 message 字段的结构化错误对象，且 isStructuredError 返回 true，
 * 不抛出任何异常。
 */
describe('Property 14: 错误处理结构化', () => {
  it('createError always returns a valid StructuredError for any type and message', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'SWAGGER_FETCH_ERROR',
          'ENDPOINT_NOT_FOUND',
          'PARSE_ERROR',
          'WRITE_ERROR',
          'CONFIG_NOT_FOUND',
        ),
        fc.string(),
        fc.option(fc.string()),
        (type, message, context) => {
          // should not throw
          const err = createError(type as StructuredError['type'], message, context ?? undefined);
          return (
            err.type === type &&
            err.message === message &&
            isStructuredError(err)
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
