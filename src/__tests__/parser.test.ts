// Feature: swagger-ts-type-generator, Property 1: 解析结果完整性, Property 2: 待生成类型标记准确性

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';

import { parseApiFile } from '../parser.js';

function writeTempFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parser-test-'));
  const file = path.join(dir, 'api.ts');
  fs.writeFileSync(file, content, 'utf-8');
  return file;
}

// ─── Unit Tests ───────────────────────────────────────────────────────────────

describe('parseApiFile - unit tests', () => {
  it('parses a function with explicit type → not in pendingFunctions', () => {
    const file = writeTempFile(`
export function getModelListApi(params: GetModelListParams) {
  return requestClient.post('/algo/model/list', params);
}
`);
    const result = parseApiFile(file);
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('getModelListApi');
    expect(result.functions[0].paramType).toBe('GetModelListParams');
    expect(result.functions[0].hasAnyType).toBe(false);
    expect(result.pendingFunctions).toHaveLength(0);
  });

  it('parses a function with `any` type → in pendingFunctions', () => {
    const file = writeTempFile(`
export const createAlgoApi = (data: any) => {
  return requestClient.post('/algo/create', data);
};
`);
    const result = parseApiFile(file);
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('createAlgoApi');
    expect(result.functions[0].paramType).toBe('any');
    expect(result.functions[0].hasAnyType).toBe(true);
    expect(result.pendingFunctions).toHaveLength(1);
    expect(result.pendingFunctions[0].name).toBe('createAlgoApi');
  });

  it('parses a function with no type annotation → in pendingFunctions', () => {
    const file = writeTempFile(`
export function fetchDataApi(params) {
  return requestClient.get('/algo/data', { params });
}
`);
    const result = parseApiFile(file);
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].paramType).toBeNull();
    expect(result.functions[0].hasAnyType).toBe(true);
    expect(result.pendingFunctions).toHaveLength(1);
  });

  it('extracts correct HTTP method', () => {
    const file = writeTempFile(`
export const deleteAlgoApi = (id: number) => {
  return requestClient.delete('/algo/delete', { params: { id } });
};
`);
    const result = parseApiFile(file);
    expect(result.functions[0].method).toBe('delete');
  });

  it('extracts correct endpoint string', () => {
    const file = writeTempFile(`
export function listApi(p: Params) {
  return requestClient.get('/algo/list', { params: p });
}
`);
    const result = parseApiFile(file);
    expect(result.functions[0].endpoint).toBe('/algo/list');
  });

  it('extracts correct line number (function declaration line, not call line)', () => {
    const file = writeTempFile(`export function lineApi(p: Params) {
  return requestClient.post('/line', p);
}`);
    const result = parseApiFile(file);
    // lineNumber should point to the function declaration (line 1), not the requestClient call (line 2)
    expect(result.functions[0].lineNumber).toBe(1);
  });

  it('handles arrow function syntax', () => {
    const file = writeTempFile(`
export const arrowApi = (data: ArrowParams) => {
  return requestClient.put('/arrow', data);
};
`);
    const result = parseApiFile(file);
    expect(result.functions[0].name).toBe('arrowApi');
    expect(result.functions[0].method).toBe('put');
    expect(result.functions[0].paramType).toBe('ArrowParams');
    expect(result.functions[0].hasAnyType).toBe(false);
  });

  it('handles multiple requestClient calls in one file', () => {
    const file = writeTempFile(`
export function getApi(p: GetParams) {
  return requestClient.get('/get', { params: p });
}
export const postApi = (d: any) => {
  return requestClient.post('/post', d);
};
export function patchApi(d) {
  return requestClient.patch('/patch', d);
}
`);
    const result = parseApiFile(file);
    expect(result.functions).toHaveLength(3);
    expect(result.pendingFunctions).toHaveLength(2);
    const names = result.functions.map((f) => f.name);
    expect(names).toContain('getApi');
    expect(names).toContain('postApi');
    expect(names).toContain('patchApi');
  });

  it('returns empty functions array for file with no requestClient calls', () => {
    const file = writeTempFile(`
export function noRequestApi(p: SomeParams) {
  return fetch('/no-request', { method: 'GET' });
}
`);
    const result = parseApiFile(file);
    expect(result.functions).toHaveLength(0);
    expect(result.pendingFunctions).toHaveLength(0);
  });
});

// ─── Property 1: 解析结果完整性 ────────────────────────────────────────────────

describe('Property 1: 解析结果完整性', () => {
  /**
   * Validates: Requirements 1.1
   *
   * For any valid TypeScript API file, the parse result's `functions` list
   * should contain all `requestClient` calls in the file, with matching
   * method and endpoint.
   */
  it('functions.length equals the number of requestClient calls in the file', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            method: fc.constantFrom('get', 'post', 'put', 'delete', 'patch'),
            path: fc.stringMatching(/^\/[a-z]{1,10}(\/[a-z]{1,10}){0,2}$/),
            name: fc.stringMatching(/^[a-z][a-zA-Z]{2,10}Api$/),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (calls) => {
          // Deduplicate names to avoid duplicate function names
          const seen = new Set<string>();
          const uniqueCalls = calls.filter((c) => {
            if (seen.has(c.name)) return false;
            seen.add(c.name);
            return true;
          });

          const src = uniqueCalls
            .map(
              (c) =>
                `export function ${c.name}(p: SomeType) {\n  return requestClient.${c.method}('${c.path}', p);\n}`,
            )
            .join('\n');

          const file = writeTempFile(src);
          const result = parseApiFile(file);

          return result.functions.length === uniqueCalls.length;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('each parsed function has matching method and endpoint', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            method: fc.constantFrom('get', 'post', 'put', 'delete', 'patch'),
            path: fc.stringMatching(/^\/[a-z]{1,10}(\/[a-z]{1,10}){0,2}$/),
            name: fc.stringMatching(/^[a-z][a-zA-Z]{2,10}Api$/),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (calls) => {
          const seen = new Set<string>();
          const uniqueCalls = calls.filter((c) => {
            if (seen.has(c.name)) return false;
            seen.add(c.name);
            return true;
          });

          const src = uniqueCalls
            .map(
              (c) =>
                `export function ${c.name}(p: SomeType) {\n  return requestClient.${c.method}('${c.path}', p);\n}`,
            )
            .join('\n');

          const file = writeTempFile(src);
          const result = parseApiFile(file);

          return uniqueCalls.every((call) => {
            const found = result.functions.find((f) => f.name === call.name);
            return (
              found?.method === call.method && found?.endpoint === call.path
            );
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 2: 待生成类型标记准确性 ──────────────────────────────────────────

describe('Property 2: 待生成类型标记准确性', () => {
  /**
   * Validates: Requirements 1.2, 1.3
   *
   * pendingFunctions should be exactly the subset of functions where
   * paramType is null or 'any'. Functions with explicit types must not appear.
   */
  it('pendingFunctions is exactly the subset with any or no type', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.stringMatching(/^[a-z][a-zA-Z]{2,10}Api$/),
            typeKind: fc.constantFrom('explicit', 'any', 'none'),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (fns) => {
          const seen = new Set<string>();
          const uniqueFns = fns.filter((f) => {
            if (seen.has(f.name)) return false;
            seen.add(f.name);
            return true;
          });

          const src = uniqueFns
            .map((f) => {
              const paramDecl =
                f.typeKind === 'explicit'
                  ? 'p: ExplicitType'
                  : f.typeKind === 'any'
                    ? 'p: any'
                    : 'p';
              return `export function ${f.name}(${paramDecl}) {\n  return requestClient.get('/path', { params: p });\n}`;
            })
            .join('\n');

          const file = writeTempFile(src);
          const result = parseApiFile(file);

          const expectedPending = uniqueFns
            .filter((f) => f.typeKind === 'any' || f.typeKind === 'none')
            .map((f) => f.name);

          const actualPending = result.pendingFunctions.map((f) => f.name);

          // Same length and same names
          if (actualPending.length !== expectedPending.length) return false;
          return expectedPending.every((name) => actualPending.includes(name));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('functions with explicit types are never in pendingFunctions', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z][a-zA-Z]{2,10}Api$/), {
          minLength: 1,
          maxLength: 5,
        }),
        (names) => {
          const uniqueNames = [...new Set(names)];
          const src = uniqueNames
            .map(
              (name) =>
                `export function ${name}(p: ConcreteType) {\n  return requestClient.post('/ep', p);\n}`,
            )
            .join('\n');

          const file = writeTempFile(src);
          const result = parseApiFile(file);

          return result.pendingFunctions.length === 0;
        },
      ),
      { numRuns: 100 },
    );
  });
});
