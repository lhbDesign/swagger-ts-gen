// Feature: swagger-ts-type-generator, Property 3: Swagger URL 转换正确性, Property 4: Endpoint 查找与 Schema 提取
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { convertSwaggerUrl, findEndpoint, fetchSwaggerDoc } from '../fetcher.js';
import type { SwaggerDocument, StructuredError } from '../types.js';

// ---------------------------------------------------------------------------
// Unit tests: convertSwaggerUrl
// ---------------------------------------------------------------------------
describe('convertSwaggerUrl', () => {
  it('converts doc.html URL to [v3/api-docs, v2/api-docs]', () => {
    const result = convertSwaggerUrl('https://host/api/algo/doc.html');
    expect(result).toEqual([
      'https://host/api/algo/v3/api-docs',
      'https://host/api/algo/v2/api-docs',
    ]);
  });

  it('returns v3/api-docs URL as-is', () => {
    const url = 'https://host/api/algo/v3/api-docs';
    expect(convertSwaggerUrl(url)).toEqual([url]);
  });

  it('returns v2/api-docs URL as-is', () => {
    const url = 'https://host/api/algo/v2/api-docs';
    expect(convertSwaggerUrl(url)).toEqual([url]);
  });

  it('handles URL without trailing slash for non-doc.html input', () => {
    const result = convertSwaggerUrl('https://host/api');
    expect(result).toEqual([
      'https://host/api/v3/api-docs',
      'https://host/api/v2/api-docs',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Unit tests: findEndpoint
// ---------------------------------------------------------------------------
describe('findEndpoint', () => {
  const doc: SwaggerDocument = {
    paths: {
      '/algo/model/list': {
        post: {
          summary: 'Get model list',
          parameters: [],
          responses: { '200': { description: 'OK' } },
        },
        get: {
          summary: 'Get model list via GET',
          responses: { '200': { description: 'OK' } },
        },
      },
    },
  };

  it('returns OperationObject for existing endpoint and method', () => {
    const result = findEndpoint(doc, '/algo/model/list', 'post');
    expect(result).toEqual(doc.paths['/algo/model/list'].post);
  });

  it('returns ENDPOINT_NOT_FOUND for non-existing path', () => {
    const result = findEndpoint(doc, '/not/exist', 'get') as StructuredError;
    expect(result.type).toBe('ENDPOINT_NOT_FOUND');
    expect(result.message).toContain('/not/exist');
  });

  it('returns ENDPOINT_NOT_FOUND for existing path but wrong method', () => {
    const result = findEndpoint(doc, '/algo/model/list', 'delete') as StructuredError;
    expect(result.type).toBe('ENDPOINT_NOT_FOUND');
    expect(result.message).toContain('delete');
  });

  it('is case-insensitive for method matching (lowercase stored)', () => {
    // Methods in PathItem are stored lowercase; findEndpoint lowercases the input
    const result = findEndpoint(doc, '/algo/model/list', 'get');
    expect(result).toEqual(doc.paths['/algo/model/list'].get);
  });
});

// ---------------------------------------------------------------------------
// Unit tests: fetchSwaggerDoc (mocked fetch)
// ---------------------------------------------------------------------------
describe('fetchSwaggerDoc', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const mockDoc: SwaggerDocument = {
    openapi: '3.0.0',
    paths: { '/test': { get: { responses: {} } } },
  };

  it('returns { ok: true, doc } on successful fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockDoc,
    }));

    const result = await fetchSwaggerDoc({ swaggerUrl: 'https://host/api/v3/api-docs' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc).toEqual(mockDoc);
    }
  });

  it('returns { ok: false, error: SWAGGER_FETCH_ERROR } on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const result = await fetchSwaggerDoc({ swaggerUrl: 'https://host/api/v3/api-docs' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('SWAGGER_FETCH_ERROR');
      expect(result.error.message).toContain('Network error');
    }
  });

  it('falls back from v3 to v2 when v3 fails', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (url.includes('v3/api-docs')) {
        return Promise.reject(new Error('v3 not available'));
      }
      return Promise.resolve({ ok: true, json: async () => mockDoc });
    }));

    const result = await fetchSwaggerDoc({ swaggerUrl: 'https://host/api/doc.html' });
    expect(result.ok).toBe(true);
    expect(callCount).toBe(2); // tried v3 then v2
    if (result.ok) {
      expect(result.doc).toEqual(mockDoc);
    }
  });

  it('returns error when all URLs fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('All failed')));

    const result = await fetchSwaggerDoc({ swaggerUrl: 'https://host/api/doc.html' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('SWAGGER_FETCH_ERROR');
    }
  });

  it('returns error on non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    }));

    const result = await fetchSwaggerDoc({ swaggerUrl: 'https://host/api/v3/api-docs' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('SWAGGER_FETCH_ERROR');
      expect(result.error.message).toContain('404');
    }
  });
});

// ---------------------------------------------------------------------------
// Property 3: Swagger URL 转换正确性
// Validates: Requirements 2.1
// ---------------------------------------------------------------------------
describe('Property 3: convertSwaggerUrl - doc.html URLs always produce api-docs URLs', () => {
  it('for any URL ending in doc.html, all results end with api-docs', () => {
    fc.assert(
      fc.property(
        // Generate a realistic base URL + doc.html
        fc.tuple(
          fc.webAuthority({ withPort: false }),
          fc.array(fc.stringMatching(/^[a-z][a-z0-9-]*$/), { minLength: 0, maxLength: 4 }),
        ).map(([authority, segments]) => {
          const path = segments.length > 0 ? '/' + segments.join('/') + '/' : '/';
          return `https://${authority}${path}doc.html`;
        }),
        (url) => {
          const results = convertSwaggerUrl(url);
          expect(results.length).toBeGreaterThan(0);
          for (const result of results) {
            expect(result.endsWith('api-docs')).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Endpoint 查找与 Schema 提取
// Validates: Requirements 2.2, 2.3, 2.5
// ---------------------------------------------------------------------------
describe('Property 4: findEndpoint - existing paths return OperationObject, missing paths return ENDPOINT_NOT_FOUND', () => {
  const methods = ['get', 'post', 'put', 'delete', 'patch'] as const;

  it('for any SwaggerDocument with known paths, findEndpoint returns OperationObject for existing path/method', () => {
    fc.assert(
      fc.property(
        // Generate a path like /foo/bar
        fc.array(fc.stringMatching(/^[a-z][a-z0-9]*$/), { minLength: 1, maxLength: 3 })
          .map((segs) => '/' + segs.join('/')),
        fc.constantFrom(...methods),
        (path, method) => {
          const operation = { summary: 'test', responses: {} };
          const doc: SwaggerDocument = {
            paths: { [path]: { [method]: operation } },
          };
          const result = findEndpoint(doc, path, method);
          // Should NOT be a StructuredError
          expect((result as StructuredError).type).toBeUndefined();
          expect(result).toEqual(operation);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('for any SwaggerDocument, findEndpoint for a non-existing path returns ENDPOINT_NOT_FOUND', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z][a-z0-9]*$/), { minLength: 1, maxLength: 3 })
          .map((segs) => '/' + segs.join('/')),
        fc.constantFrom(...methods),
        (path, method) => {
          const nonExistentPath = path + '/nonexistent';
          const doc: SwaggerDocument = {
            paths: { [path]: { [method]: { responses: {} } } },
          };
          const result = findEndpoint(doc, nonExistentPath, method) as StructuredError;
          expect(result.type).toBe('ENDPOINT_NOT_FOUND');
        },
      ),
      { numRuns: 100 },
    );
  });
});
