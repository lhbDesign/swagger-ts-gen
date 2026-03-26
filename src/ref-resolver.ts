import type { SchemaObject, SwaggerDocument } from './types.js';

/**
 * 从 $ref 字符串中提取 schema 名称
 * 支持 "#/components/schemas/Foo" 和 "#/definitions/Foo"
 */
export function extractRefName(ref: string): string {
  const parts = ref.split('/');
  return parts[parts.length - 1] ?? ref;
}

/**
 * 解析 $ref 引用，返回对应的 SchemaObject
 * 支持 OpenAPI 3.x (#/components/schemas/) 和 Swagger 2.x (#/definitions/)
 * 如果找不到，返回 { type: 'unknown' }
 */
export function resolveRef(ref: string, doc: SwaggerDocument): SchemaObject {
  const name = extractRefName(ref);

  if (ref.startsWith('#/components/schemas/')) {
    return doc.components?.schemas?.[name] ?? { type: 'unknown' };
  }

  if (ref.startsWith('#/definitions/')) {
    return doc.definitions?.[name] ?? { type: 'unknown' };
  }

  return { type: 'unknown' };
}

/**
 * 递归收集一个 schema 中所有 $ref 引用的 schema 名称（去重）
 * resolvedRefs 用于防止循环引用
 * Returns a Map of refName -> SchemaObject for all referenced schemas
 */
export function collectRefs(
  schema: SchemaObject,
  doc: SwaggerDocument,
  resolvedRefs: Set<string>,
): Map<string, SchemaObject> {
  const result = new Map<string, SchemaObject>();

  if (!schema) return result;

  // 处理直接 $ref
  if (schema.$ref) {
    const name = extractRefName(schema.$ref);
    if (!resolvedRefs.has(name)) {
      resolvedRefs.add(name);
      const resolved = resolveRef(schema.$ref, doc);
      result.set(name, resolved);
      // 递归收集被引用 schema 内部的 $ref
      const nested = collectRefs(resolved, doc, resolvedRefs);
      for (const [k, v] of nested) {
        result.set(k, v);
      }
    }
    return result;
  }

  // 遍历 properties
  if (schema.properties) {
    for (const prop of Object.values(schema.properties)) {
      const nested = collectRefs(prop, doc, resolvedRefs);
      for (const [k, v] of nested) {
        result.set(k, v);
      }
    }
  }

  // 遍历 items（array）
  if (schema.items) {
    const nested = collectRefs(schema.items, doc, resolvedRefs);
    for (const [k, v] of nested) {
      result.set(k, v);
    }
  }

  // 遍历 oneOf / anyOf / allOf
  for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
    const list = schema[key];
    if (list) {
      for (const sub of list) {
        const nested = collectRefs(sub, doc, resolvedRefs);
        for (const [k, v] of nested) {
          result.set(k, v);
        }
      }
    }
  }

  return result;
}
