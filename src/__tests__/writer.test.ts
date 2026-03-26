// Feature: swagger-ts-type-generator, Property 10: 类型插入位置正确性, Property 11: 写入幂等性, Property 12: dry-run 不修改文件

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { writeTypes } from '../writer.js';

function writeTempFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'writer-test-'));
  const file = path.join(dir, 'api.ts');
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

// ─── Unit Tests ───────────────────────────────────────────────────────────────

describe('writeTypes - unit tests', () => {
  it('inserts type definition before the function line', () => {
    const content = `export function getListApi(params: any) {\n  return requestClient.get('/list', { params });\n}\n`;
    const file = writeTempFile(content);

    writeTypes({
      filePath: file,
      insertions: [
        {
          functionName: 'getListApi',
          typeDefinitions: ['export interface GetListParams {\n  page?: number;\n}'],
          newParamType: 'GetListParams',
          insertBeforeLine: 1,
        },
      ],
    });

    const result = fs.readFileSync(file, 'utf8');
    const lines = result.split('\n');
    const typeIdx = lines.findIndex((l) => l.includes('export interface GetListParams'));
    const funcIdx = lines.findIndex((l) => l.includes('export function getListApi'));
    expect(typeIdx).toBeGreaterThanOrEqual(0);
    expect(funcIdx).toBeGreaterThan(typeIdx);
  });

  it('skips insertion when type already exists in file', () => {
    const content = `export interface GetListParams {\n  page?: number;\n}\nexport function getListApi(params: any) {\n  return requestClient.get('/list', { params });\n}\n`;
    const file = writeTempFile(content);

    const result = writeTypes({
      filePath: file,
      insertions: [
        {
          functionName: 'getListApi',
          typeDefinitions: ['export interface GetListParams {\n  page?: number;\n}'],
          newParamType: 'GetListParams',
          insertBeforeLine: 4,
        },
      ],
    });

    expect(result.skippedTypes).toContain('GetListParams');
    expect(result.insertedTypes).not.toContain('GetListParams');
  });

  it('replaces `any` with the new type name in the function signature', () => {
    const content = `export function createApi(data: any) {\n  return requestClient.post('/create', data);\n}\n`;
    const file = writeTempFile(content);

    writeTypes({
      filePath: file,
      insertions: [
        {
          functionName: 'createApi',
          typeDefinitions: ['export interface CreateParams {\n  name: string;\n}'],
          newParamType: 'CreateParams',
          insertBeforeLine: 1,
        },
      ],
    });

    const result = fs.readFileSync(file, 'utf8');
    expect(result).toContain('data: CreateParams');
    expect(result).not.toMatch(/data:\s*any/);
  });

  it('preserves all other lines unchanged', () => {
    const content = `// top comment\nexport function myApi(p: any) {\n  return requestClient.get('/my', { params: p });\n}\n// bottom comment\n`;
    const file = writeTempFile(content);

    writeTypes({
      filePath: file,
      insertions: [
        {
          functionName: 'myApi',
          typeDefinitions: ['export interface MyParams {\n  id: number;\n}'],
          newParamType: 'MyParams',
          insertBeforeLine: 2,
        },
      ],
    });

    const result = fs.readFileSync(file, 'utf8');
    expect(result).toContain('// top comment');
    expect(result).toContain('// bottom comment');
    expect(result).toContain("return requestClient.get('/my', { params: p });");
  });

  it('dryRun=true does not modify the file', () => {
    const content = `export function dryApi(p: any) {\n  return requestClient.get('/dry', { params: p });\n}\n`;
    const file = writeTempFile(content);

    writeTypes({
      filePath: file,
      insertions: [
        {
          functionName: 'dryApi',
          typeDefinitions: ['export interface DryParams {\n  x: string;\n}'],
          newParamType: 'DryParams',
          insertBeforeLine: 1,
        },
      ],
      dryRun: true,
    });

    const after = fs.readFileSync(file, 'utf8');
    expect(after).toBe(content);
  });

  it('dryRun=true returns the expected insertedTypes', () => {
    const content = `export function dryApi(p: any) {\n  return requestClient.get('/dry', { params: p });\n}\n`;
    const file = writeTempFile(content);

    const result = writeTypes({
      filePath: file,
      insertions: [
        {
          functionName: 'dryApi',
          typeDefinitions: ['export interface DryParams {\n  x: string;\n}'],
          newParamType: 'DryParams',
          insertBeforeLine: 1,
        },
      ],
      dryRun: true,
    });

    expect(result.insertedTypes).toContain('DryParams');
  });

  it('handles multiple insertions correctly', () => {
    const content = `export function apiA(p: any) {\n  return requestClient.get('/a', { params: p });\n}\nexport function apiB(d: any) {\n  return requestClient.post('/b', d);\n}\n`;
    const file = writeTempFile(content);

    const result = writeTypes({
      filePath: file,
      insertions: [
        {
          functionName: 'apiA',
          typeDefinitions: ['export interface ApiAParams {\n  a: string;\n}'],
          newParamType: 'ApiAParams',
          insertBeforeLine: 1,
        },
        {
          functionName: 'apiB',
          typeDefinitions: ['export interface ApiBParams {\n  b: number;\n}'],
          newParamType: 'ApiBParams',
          insertBeforeLine: 4,
        },
      ],
    });

    expect(result.insertedTypes).toContain('ApiAParams');
    expect(result.insertedTypes).toContain('ApiBParams');
    const written = fs.readFileSync(file, 'utf8');
    expect(written).toContain('export interface ApiAParams');
    expect(written).toContain('export interface ApiBParams');
  });

  it('returns correct updatedFunctions list', () => {
    const content = `export function updateApi(data: any) {\n  return requestClient.put('/update', data);\n}\n`;
    const file = writeTempFile(content);

    const result = writeTypes({
      filePath: file,
      insertions: [
        {
          functionName: 'updateApi',
          typeDefinitions: ['export interface UpdateParams {\n  id: number;\n}'],
          newParamType: 'UpdateParams',
          insertBeforeLine: 1,
        },
      ],
    });

    expect(result.updatedFunctions).toContain('updateApi');
  });
});

// ─── Property 10: 类型插入位置正确性 ──────────────────────────────────────────

describe('Property 10: 类型插入位置正确性', () => {
  /**
   * Validates: Requirements 4.1, 4.4
   *
   * For any file content and insertion, after writeTypes the type definition
   * appears before the function line.
   */
  it('type definition appears before the function line after insertion', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 40 }), { minLength: 2, maxLength: 8 }),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[A-Z][a-zA-Z]+$/.test(s)),
        (extraLines, typeName) => {
          // Build a file: some lines, then a function line with `any`
          const funcLine = `export function testFn(p: any) { return requestClient.get('/x', { params: p }); }`;
          const allLines = [...extraLines, funcLine];
          const content = allLines.join('\n') + '\n';
          const file = writeTempFile(content);
          const insertBeforeLine = allLines.length; // 1-based line of funcLine

          const typeDef = `export interface ${typeName} {\n  id: number;\n}`;

          writeTypes({
            filePath: file,
            insertions: [
              {
                functionName: 'testFn',
                typeDefinitions: [typeDef],
                newParamType: typeName,
                insertBeforeLine,
              },
            ],
          });

          const written = fs.readFileSync(file, 'utf8');
          const lines = written.split('\n');
          const typeIdx = lines.findIndex((l) => l.includes(`export interface ${typeName}`));
          const funcIdx = lines.findIndex((l) => l.includes('export function testFn'));

          return typeIdx >= 0 && funcIdx > typeIdx;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 11: 写入幂等性 ──────────────────────────────────────────────────

describe('Property 11: 写入幂等性', () => {
  /**
   * Validates: Requirements 4.2
   *
   * For any file that already contains a type definition, running writeTypes
   * again produces the same file content (type goes to skippedTypes, file unchanged).
   */
  it('second writeTypes call leaves file unchanged when type already exists', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[A-Z][a-zA-Z]+$/.test(s)),
        (typeName) => {
          const typeDef = `export interface ${typeName} {\n  id: number;\n}`;
          const funcLine = `export function testFn(p: any) { return requestClient.get('/x', { params: p }); }`;
          const content = `${typeDef}\n${funcLine}\n`;
          const file = writeTempFile(content);

          const insertion = {
            functionName: 'testFn',
            typeDefinitions: [typeDef],
            newParamType: typeName,
            insertBeforeLine: 4, // after the 3-line type def
          };

          // First call — type already exists, should skip
          const result = writeTypes({ filePath: file, insertions: [insertion] });
          const afterFirst = fs.readFileSync(file, 'utf8');

          // Second call
          writeTypes({ filePath: file, insertions: [insertion] });
          const afterSecond = fs.readFileSync(file, 'utf8');

          return (
            result.skippedTypes.includes(typeName) &&
            afterFirst === afterSecond
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 12: dry-run 不修改文件 ──────────────────────────────────────────

describe('Property 12: dry-run 不修改文件', () => {
  /**
   * Validates: Requirements 5.5
   *
   * For any file and insertion, running writeTypes with dryRun=true leaves
   * the file content unchanged.
   */
  it('dryRun=true never modifies the file', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 0, maxLength: 30 }), { minLength: 1, maxLength: 6 }),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[A-Z][a-zA-Z]+$/.test(s)),
        (extraLines, typeName) => {
          const funcLine = `export function dryFn(p: any) { return requestClient.post('/dry', p); }`;
          const allLines = [...extraLines, funcLine];
          const content = allLines.join('\n') + '\n';
          const file = writeTempFile(content);

          const typeDef = `export interface ${typeName} {\n  val: string;\n}`;

          writeTypes({
            filePath: file,
            insertions: [
              {
                functionName: 'dryFn',
                typeDefinitions: [typeDef],
                newParamType: typeName,
                insertBeforeLine: allLines.length,
              },
            ],
            dryRun: true,
          });

          const after = fs.readFileSync(file, 'utf8');
          return after === content;
        },
      ),
      { numRuns: 100 },
    );
  });
});
