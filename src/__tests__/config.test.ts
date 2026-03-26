// Feature: swagger-ts-type-generator, Property 13: 配置优先级与回退

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { loadConfig } from '../config.js';
import type { ToolConfig } from '../types.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'swagger-ts-gen-test-'));
}

function writeConfig(dir: string, config: ToolConfig): void {
  fs.writeFileSync(
    path.join(dir, 'swagger-ts-gen.config.json'),
    JSON.stringify(config),
    'utf-8',
  );
}

// ─── unit tests ─────────────────────────────────────────────────────────────

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty object when config file does not exist', () => {
    const result = loadConfig(tmpDir);
    expect(result).toEqual({});
  });

  it('returns parsed config when file exists', () => {
    const config: ToolConfig = {
      swaggerUrl: 'https://example.com/api/doc.html',
      defaultFiles: ['src/api/index.ts'],
      outputStyle: 'interface',
      namingConvention: 'PascalCase',
    };
    writeConfig(tmpDir, config);
    expect(loadConfig(tmpDir)).toEqual(config);
  });

  it('returns empty object when file contains invalid JSON', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'swagger-ts-gen.config.json'),
      'not valid json',
      'utf-8',
    );
    expect(loadConfig(tmpDir)).toEqual({});
  });

  it('returns empty object for a non-existent directory path', () => {
    expect(loadConfig(path.join(tmpDir, 'no-such-dir'))).toEqual({});
  });

  it('returns only the fields present in the config file', () => {
    writeConfig(tmpDir, { swaggerUrl: 'https://example.com' });
    const result = loadConfig(tmpDir);
    expect(result.swaggerUrl).toBe('https://example.com');
    expect(result.defaultFiles).toBeUndefined();
  });
});

// ─── property test (属性 13) ─────────────────────────────────────────────────

/**
 * Validates: Requirements 5.3, 6.5
 *
 * 属性 13：对于任意合法的 ToolConfig 对象写入配置文件后，
 * loadConfig 应能完整读回相同的值；
 * 当配置文件不存在时，loadConfig 始终返回空对象。
 */
describe('Property 13: 配置优先级与回退', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trips any valid ToolConfig written to disk', () => {
    const configArb = fc.record(
      {
        swaggerUrl: fc.oneof(fc.constant(undefined), fc.webUrl()),
        defaultFiles: fc.oneof(
          fc.constant(undefined),
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
        ),
        outputStyle: fc.oneof(
          fc.constant(undefined),
          fc.constantFrom('interface' as const, 'type' as const),
        ),
        namingConvention: fc.oneof(
          fc.constant(undefined),
          fc.constant('PascalCase' as const),
        ),
      },
      { withDeletedKeys: true },
    );

    fc.assert(
      fc.property(configArb, (config) => {
        writeConfig(tmpDir, config);
        const result = loadConfig(tmpDir);
        // Every key written must be readable back
        for (const [k, v] of Object.entries(config)) {
          expect((result as Record<string, unknown>)[k]).toEqual(v);
        }
        // Clean up for next iteration
        fs.unlinkSync(path.join(tmpDir, 'swagger-ts-gen.config.json'));
      }),
      { numRuns: 100 },
    );
  });

  it('always returns empty object when no config file is present', () => {
    fc.assert(
      fc.property(fc.string(), (_ignored) => {
        // Ensure no config file exists
        const p = path.join(tmpDir, 'swagger-ts-gen.config.json');
        if (fs.existsSync(p)) fs.unlinkSync(p);
        expect(loadConfig(tmpDir)).toEqual({});
      }),
      { numRuns: 100 },
    );
  });
});
