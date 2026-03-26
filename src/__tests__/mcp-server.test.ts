// Feature: swagger-ts-type-generator, Property 15: MCP 响应结构完整性

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import * as fc from 'fast-check';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { runGenerateTypes } from '../mcp-server.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
  const filePath = path.join(dir, 'api.ts');
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function cleanupTempFile(filePath: string): void {
  try {
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  } catch {
    // ignore
  }
}

const MINIMAL_API_CONTENT = `
export async function getDataApi(params: any) {
  return requestClient.get('/api/data', { params });
}
`;

const STUB_SWAGGER_DOC = {
  openapi: '3.0.0',
  paths: {
    '/api/data': {
      get: {
        parameters: [{ name: 'id', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { id: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
  },
  components: { schemas: {} },
};

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe('runGenerateTypes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns CONFIG_NOT_FOUND error when no swaggerUrl and no config file', async () => {
    const result = await runGenerateTypes({
      filePath: '/nonexistent/file.ts',
      cwd: os.tmpdir(),
    });

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe('CONFIG_NOT_FOUND');
    expect(result.summary.processedEndpoints).toBe(0);
    expect(result.generatedTypes).toEqual([]);
    expect(result.modifiedFiles).toEqual([]);
  });

  it('returns PARSE_ERROR when filePath does not exist', async () => {
    const result = await runGenerateTypes({
      filePath: '/nonexistent/path/api.ts',
      swaggerUrl: 'https://example.com/v3/api-docs',
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.type === 'PARSE_ERROR')).toBe(true);
  });

  it('returns SWAGGER_FETCH_ERROR when swagger fetch fails', async () => {
    const filePath = makeTempFile(MINIMAL_API_CONTENT);
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network error')),
      );

      const result = await runGenerateTypes({
        filePath,
        swaggerUrl: 'https://unreachable.example.com/v3/api-docs',
        cwd: os.tmpdir(), // isolate from project config
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.type === 'SWAGGER_FETCH_ERROR')).toBe(
        true,
      );
    } finally {
      cleanupTempFile(filePath);
    }
  });

  it('returns success result with correct structure when everything works', async () => {
    const filePath = makeTempFile(MINIMAL_API_CONTENT);
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => STUB_SWAGGER_DOC,
        }),
      );

      const result = await runGenerateTypes({
        filePath,
        swaggerUrl: 'https://example.com/v3/api-docs',
        dryRun: true,
      });

      expect(typeof result.success).toBe('boolean');
      expect(typeof result.summary).toBe('object');
      expect(Array.isArray(result.generatedTypes)).toBe(true);
      expect(Array.isArray(result.modifiedFiles)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    } finally {
      cleanupTempFile(filePath);
    }
  });

  it('respects functionNames filter — only processes specified functions', async () => {
    const content = `
export async function getDataApi(params: any) {
  return requestClient.get('/api/data', { params });
}
export async function postItemApi(params: any) {
  return requestClient.post('/api/item', params);
}
`;
    const filePath = makeTempFile(content);
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            openapi: '3.0.0',
            paths: {
              '/api/data': {
                get: {
                  parameters: [
                    { name: 'id', in: 'query', schema: { type: 'string' } },
                  ],
                  responses: {},
                },
              },
              '/api/item': {
                post: {
                  requestBody: {
                    content: {
                      'application/json': {
                        schema: { type: 'object', properties: {} },
                      },
                    },
                  },
                  responses: {},
                },
              },
            },
            components: { schemas: {} },
          }),
        }),
      );

      const result = await runGenerateTypes({
        filePath,
        swaggerUrl: 'https://example.com/v3/api-docs',
        functionNames: ['getDataApi'],
        dryRun: true,
        cwd: os.tmpdir(), // isolate from project config
      });

      const names = result.generatedTypes.map((t) => t.functionName);
      expect(names).toContain('getDataApi');
      expect(names).not.toContain('postItemApi');
      expect(result.summary.processedEndpoints).toBe(1);
    } finally {
      cleanupTempFile(filePath);
    }
  });

  it('respects dryRun flag — does not modify file', async () => {
    const filePath = makeTempFile(MINIMAL_API_CONTENT);
    const originalContent = fs.readFileSync(filePath, 'utf8');
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => STUB_SWAGGER_DOC,
        }),
      );

      await runGenerateTypes({
        filePath,
        swaggerUrl: 'https://example.com/v3/api-docs',
        dryRun: true,
      });

      const afterContent = fs.readFileSync(filePath, 'utf8');
      expect(afterContent).toBe(originalContent);
    } finally {
      cleanupTempFile(filePath);
    }
  });
});

// ---------------------------------------------------------------------------
// Property 15: MCP 响应结构完整性
// Validates: Requirements 6.3
// ---------------------------------------------------------------------------

describe('Property 15: MCP 响应结构完整性', () => {
  it('response always contains all required fields for any input', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          filePath: fc.constant('/nonexistent/file.ts'),
          swaggerUrl: fc.option(fc.webUrl()),
          dryRun: fc.option(fc.boolean()),
        }),
        async (input) => {
          const result = await runGenerateTypes({
            filePath: input.filePath,
            swaggerUrl: input.swaggerUrl ?? undefined,
            dryRun: input.dryRun ?? undefined,
          });
          return (
            typeof result.success === 'boolean' &&
            typeof result.summary === 'object' &&
            result.summary !== null &&
            typeof result.summary.processedEndpoints === 'number' &&
            typeof result.summary.generatedParamTypes === 'number' &&
            typeof result.summary.generatedResponseTypes === 'number' &&
            typeof result.summary.skippedTypes === 'number' &&
            Array.isArray(result.generatedTypes) &&
            Array.isArray(result.modifiedFiles) &&
            Array.isArray(result.errors)
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
