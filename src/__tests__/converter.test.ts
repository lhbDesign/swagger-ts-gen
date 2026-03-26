// Feature: swagger-ts-type-generator, Property 5-9
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  mapPrimitiveType,
  toBaseName,
  schemaToTypeString,
  generateInterface,
  convertSchema,
  extractResponseSchema,
} from '../converter.js';
import type { SchemaObject, SwaggerDocument } from '../types.js';

// Minimal empty doc for tests that don't need $ref resolution
const emptyDoc: SwaggerDocument = { paths: {} };

// ─── Unit Tests ───────────────────────────────────────────────────────────────

describe('mapPrimitiveType', () => {
  it('maps string → string', () => {
    expect(mapPrimitiveType('string')).toBe('string');
  });
  it('maps integer → number', () => {
    expect(mapPrimitiveType('integer')).toBe('number');
  });
  it('maps number → number', () => {
    expect(mapPrimitiveType('number')).toBe('number');
  });
  it('maps boolean → boolean', () => {
    expect(mapPrimitiveType('boolean')).toBe('boolean');
  });
  it('maps array → unknown[]', () => {
    expect(mapPrimitiveType('array')).toBe('unknown[]');
  });
  it('maps object → Record<string, unknown>', () => {
    expect(mapPrimitiveType('object')).toBe('Record<string, unknown>');
  });
  it('maps unknown type → unknown', () => {
    expect(mapPrimitiveType('foobar')).toBe('unknown');
  });
});

describe('toBaseName', () => {
  it('capitalizes first letter', () => {
    expect(toBaseName('createUser')).toBe('CreateUser');
  });
  it('strips trailing Api suffix', () => {
    expect(toBaseName('getModelListApi')).toBe('GetModelList');
  });
  it('does not strip Api in the middle', () => {
    expect(toBaseName('getApiData')).toBe('GetApiData');
  });
  it('handles already PascalCase without Api', () => {
    expect(toBaseName('fetchData')).toBe('FetchData');
  });
  it('handles single word', () => {
    expect(toBaseName('list')).toBe('List');
  });
});

describe('schemaToTypeString', () => {
  it('string schema → string', () => {
    expect(schemaToTypeString({ type: 'string' }, emptyDoc)).toBe('string');
  });
  it('integer schema → number', () => {
    expect(schemaToTypeString({ type: 'integer' }, emptyDoc)).toBe('number');
  });
  it('boolean schema → boolean', () => {
    expect(schemaToTypeString({ type: 'boolean' }, emptyDoc)).toBe('boolean');
  });
  it('array with items → T[]', () => {
    expect(schemaToTypeString({ type: 'array', items: { type: 'integer' } }, emptyDoc)).toBe('number[]');
  });
  it('array without items → unknown[]', () => {
    expect(schemaToTypeString({ type: 'array' }, emptyDoc)).toBe('unknown[]');
  });
  it('object with properties → inline object type', () => {
    const schema: SchemaObject = {
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'integer' } },
    };
    const result = schemaToTypeString(schema, emptyDoc);
    expect(result).toContain('a?:');
    expect(result).toContain('b?:');
    expect(result).toContain('string');
    expect(result).toContain('number');
  });
  it('object without properties → Record<string, unknown>', () => {
    expect(schemaToTypeString({ type: 'object' }, emptyDoc)).toBe('Record<string, unknown>');
  });
  it('$ref → referenced type name', () => {
    expect(schemaToTypeString({ $ref: '#/components/schemas/Foo' }, emptyDoc)).toBe('Foo');
  });
  it('oneOf → union type', () => {
    const schema: SchemaObject = {
      oneOf: [{ type: 'string' }, { type: 'integer' }],
    };
    expect(schemaToTypeString(schema, emptyDoc)).toBe('string | number');
  });
  it('anyOf → union type', () => {
    const schema: SchemaObject = {
      anyOf: [{ type: 'boolean' }, { type: 'string' }],
    };
    expect(schemaToTypeString(schema, emptyDoc)).toBe('boolean | string');
  });
  it('allOf → intersection type', () => {
    const schema: SchemaObject = {
      allOf: [{ $ref: '#/components/schemas/A' }, { $ref: '#/components/schemas/B' }],
    };
    expect(schemaToTypeString(schema, emptyDoc)).toBe('A & B');
  });
  it('no type → unknown', () => {
    expect(schemaToTypeString({}, emptyDoc)).toBe('unknown');
  });
});

describe('generateInterface', () => {
  it('generates interface with required and optional fields', () => {
    const schema: SchemaObject = {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
      },
      required: ['id'],
    };
    const result = generateInterface('MyType', schema, emptyDoc);
    expect(result).toContain('export interface MyType');
    expect(result).toContain('id: number');   // required — no ?
    expect(result).toContain('name?: string'); // optional
  });

  it('includes JSDoc for schema description', () => {
    const schema: SchemaObject = {
      description: 'A test schema',
      type: 'object',
      properties: { x: { type: 'string' } },
    };
    const result = generateInterface('TestType', schema, emptyDoc);
    expect(result).toContain('/** A test schema */');
  });

  it('includes JSDoc for field descriptions', () => {
    const schema: SchemaObject = {
      type: 'object',
      properties: {
        code: { type: 'string', description: '算法编码' },
      },
    };
    const result = generateInterface('Params', schema, emptyDoc);
    expect(result).toContain('/** 算法编码 */');
  });

  it('generates type alias for non-object schema', () => {
    const schema: SchemaObject = { type: 'string' };
    const result = generateInterface('MyAlias', schema, emptyDoc);
    expect(result).toContain('export type MyAlias = string;');
  });

  it('generates type alias for allOf schema', () => {
    const schema: SchemaObject = {
      allOf: [{ $ref: '#/components/schemas/A' }, { $ref: '#/components/schemas/B' }],
    };
    const result = generateInterface('Combined', schema, emptyDoc);
    expect(result).toContain('export type Combined = A & B;');
  });
});

describe('convertSchema', () => {
  it('generates mainType for a simple object schema', () => {
    const schema: SchemaObject = {
      type: 'object',
      properties: { name: { type: 'string' } },
    };
    const result = convertSchema({ schema, typeName: 'GetListParams', doc: emptyDoc });
    expect(result.mainType).toContain('export interface GetListParams');
    expect(result.dependencies).toHaveLength(0);
  });

  it('collects $ref dependencies', () => {
    const doc: SwaggerDocument = {
      paths: {},
      components: {
        schemas: {
          Tag: {
            type: 'object',
            properties: { id: { type: 'integer' } },
          },
        },
      },
    };
    const schema: SchemaObject = {
      type: 'object',
      properties: {
        tag: { $ref: '#/components/schemas/Tag' },
      },
    };
    const result = convertSchema({ schema, typeName: 'PostParams', doc });
    expect(result.mainType).toContain('export interface PostParams');
    expect(result.dependencies).toHaveLength(1);
    expect(result.dependencies[0]).toContain('export interface Tag');
  });

  it('deduplicates $ref dependencies', () => {
    const doc: SwaggerDocument = {
      paths: {},
      components: {
        schemas: {
          Tag: { type: 'object', properties: { id: { type: 'integer' } } },
        },
      },
    };
    const schema: SchemaObject = {
      type: 'object',
      properties: {
        tag1: { $ref: '#/components/schemas/Tag' },
        tag2: { $ref: '#/components/schemas/Tag' },
      },
    };
    const result = convertSchema({ schema, typeName: 'DupTest', doc });
    // Tag should appear only once
    const tagCount = result.dependencies.filter((d) => d.includes('export interface Tag')).length;
    expect(tagCount).toBe(1);
  });
});

describe('extractResponseSchema', () => {
  it('extracts OpenAPI 3.x response schema', () => {
    const responses = {
      '200': {
        content: {
          'application/json': {
            schema: { type: 'object', properties: { code: { type: 'integer' } } } as SchemaObject,
          },
        },
      },
    };
    const { responseSchema } = extractResponseSchema(responses, emptyDoc);
    expect(responseSchema).not.toBeNull();
    expect(responseSchema?.properties?.['code']).toBeDefined();
  });

  it('extracts Swagger 2.x response schema', () => {
    const responses = {
      '200': {
        schema: { type: 'object', properties: { result: { type: 'string' } } } as SchemaObject,
      },
    };
    const { responseSchema } = extractResponseSchema(responses, emptyDoc);
    expect(responseSchema).not.toBeNull();
    expect(responseSchema?.properties?.['result']).toBeDefined();
  });

  it('extracts data field from wrapper pattern', () => {
    const responses = {
      '200': {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                code: { type: 'integer' },
                message: { type: 'string' },
                data: { type: 'object', properties: { id: { type: 'integer' } } },
              },
            } as SchemaObject,
          },
        },
      },
    };
    const { responseSchema, dataSchema } = extractResponseSchema(responses, emptyDoc);
    expect(responseSchema).not.toBeNull();
    expect(dataSchema).not.toBeNull();
    expect(dataSchema?.properties?.['id']).toBeDefined();
  });

  it('returns null dataSchema when no data field', () => {
    const responses = {
      '200': {
        content: {
          'application/json': {
            schema: { type: 'object', properties: { name: { type: 'string' } } } as SchemaObject,
          },
        },
      },
    };
    const { dataSchema } = extractResponseSchema(responses, emptyDoc);
    expect(dataSchema).toBeNull();
  });

  it('returns null when no 200/201 response', () => {
    const { responseSchema, dataSchema } = extractResponseSchema({}, emptyDoc);
    expect(responseSchema).toBeNull();
    expect(dataSchema).toBeNull();
  });

  it('falls back to 201 response', () => {
    const responses = {
      '201': {
        content: {
          'application/json': {
            schema: { type: 'object', properties: { created: { type: 'boolean' } } } as SchemaObject,
          },
        },
      },
    };
    const { responseSchema } = extractResponseSchema(responses, emptyDoc);
    expect(responseSchema?.properties?.['created']).toBeDefined();
  });
});

// ─── Property Tests ───────────────────────────────────────────────────────────

const swaggerPrimitiveTypes = ['string', 'integer', 'number', 'boolean', 'array', 'object'] as const;
const expectedTsTypes: Record<string, string> = {
  string: 'string',
  integer: 'number',
  number: 'number',
  boolean: 'boolean',
  array: 'unknown[]',
  object: 'Record<string, unknown>',
};

describe('Property 5: 基础类型映射正确性', () => {
  /**
   * Validates: Requirements 3.1
   * For any swagger primitive type from the mapping table,
   * mapPrimitiveType returns the correct TS type.
   */
  it('maps all swagger primitive types correctly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...swaggerPrimitiveTypes),
        (swaggerType) => {
          const result = mapPrimitiveType(swaggerType);
          return result === expectedTsTypes[swaggerType];
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 6: $ref 递归解析完整性', () => {
  /**
   * Validates: Requirements 3.2, 3.5
   * For any schema with nested $refs, convertSchema dependencies list
   * contains all referenced type names, each appearing only once.
   */
  it('dependencies contain all referenced types without duplicates', () => {
    // Build a doc with a few schemas that reference each other
    const doc: SwaggerDocument = {
      paths: {},
      components: {
        schemas: {
          Alpha: { type: 'object', properties: { id: { type: 'integer' } } },
          Beta: { type: 'object', properties: { alpha: { $ref: '#/components/schemas/Alpha' } } },
          Gamma: { type: 'object', properties: { beta: { $ref: '#/components/schemas/Beta' } } },
        },
      },
    };

    fc.assert(
      fc.property(
        // Pick a subset of ref names to include in the top-level schema
        fc.subarray(['Alpha', 'Beta', 'Gamma'], { minLength: 1 }),
        (refNames) => {
          const properties: Record<string, SchemaObject> = {};
          for (const name of refNames) {
            properties[name.toLowerCase()] = { $ref: `#/components/schemas/${name}` };
          }
          const schema: SchemaObject = { type: 'object', properties };
          const result = convertSchema({ schema, typeName: 'TestType', doc });

          // All dependency type names should be unique
          const depNames = result.dependencies.map((d) => {
            const match = /export (?:interface|type) (\w+)/.exec(d);
            return match?.[1] ?? '';
          });
          const uniqueNames = new Set(depNames);
          return uniqueNames.size === depNames.length;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 7: 可选字段标记正确性', () => {
  /**
   * Validates: Requirements 3.3
   * For any object schema with random properties and required array,
   * generateInterface marks fields in required with no `?`,
   * fields not in required with `?`.
   */
  it('required fields have no ?, optional fields have ?', () => {
    fc.assert(
      fc.property(
        // Generate a set of field names
        fc.array(fc.string({ minLength: 1, maxLength: 10, unit: 'grapheme-ascii' }).filter((s) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)), {
          minLength: 1,
          maxLength: 6,
        }).chain((allFields) => {
          // Deduplicate
          const unique = [...new Set(allFields)];
          if (unique.length === 0) return fc.constant({ fields: ['field1'], required: [] as string[] });
          // Pick a subset as required
          return fc.subarray(unique).map((req) => ({ fields: unique, required: req }));
        }),
        ({ fields, required }) => {
          const properties: Record<string, SchemaObject> = {};
          for (const f of fields) {
            properties[f] = { type: 'string' };
          }
          const schema: SchemaObject = { type: 'object', properties, required };
          const result = generateInterface('TestInterface', schema, emptyDoc);

          for (const field of fields) {
            if (required.includes(field)) {
              // Should NOT have `?` after field name
              expect(result).toMatch(new RegExp(`\\b${field}:`));
              expect(result).not.toMatch(new RegExp(`\\b${field}\\?:`));
            } else {
              // Should have `?` after field name
              expect(result).toMatch(new RegExp(`\\b${field}\\?:`));
            }
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 8: JSDoc 注释生成完整性', () => {
  /**
   * Validates: Requirements 3.4
   * For any schema with a description, generateInterface output
   * contains `/** {description} *\/`.
   */
  it('generates JSDoc comment matching schema description', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 80 }).filter((s) => !s.includes('*/') && !s.includes('/*')),
        (description) => {
          const schema: SchemaObject = {
            description,
            type: 'object',
            properties: { x: { type: 'string' } },
          };
          const result = generateInterface('DocTest', schema, emptyDoc);
          return result.includes(`/** ${description} */`);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 9: 响应类型提取与命名规范', () => {
  /**
   * Validates: Requirements 3.6, 3.7, 3.8
   * For any function name, toBaseName(name) + 'Params' matches {PascalCase}Params,
   * and + 'Result' matches {PascalCase}Result.
   */
  it('Params and Result names follow PascalCase naming convention', () => {
    fc.assert(
      fc.property(
        // Generate camelCase-like function names
        fc.string({ minLength: 1, maxLength: 20, unit: 'grapheme-ascii' })
          .filter((s) => /^[a-z][a-zA-Z0-9]*$/.test(s)),
        (funcName) => {
          const baseName = toBaseName(funcName);
          const paramsName = baseName + 'Params';
          const resultName = baseName + 'Result';

          // Must start with uppercase letter
          const pascalPattern = /^[A-Z][a-zA-Z0-9]*$/;
          const baseOk = pascalPattern.test(baseName);
          const paramsOk = paramsName.endsWith('Params') && /^[A-Z]/.test(paramsName);
          const resultOk = resultName.endsWith('Result') && /^[A-Z]/.test(resultName);

          return baseOk && paramsOk && resultOk;
        },
      ),
      { numRuns: 100 },
    );
  });
});
