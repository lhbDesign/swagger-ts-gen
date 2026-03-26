import type {
  ConvertOptions,
  ConvertResult,
  SchemaObject,
  SwaggerDocument,
} from './types.js';

import { collectRefs, extractRefName, resolveRef } from './ref-resolver.js';

/**
 * Maps a Swagger primitive type string to a TypeScript type string.
 */
export function mapPrimitiveType(swaggerType: string): string {
  switch (swaggerType) {
    case 'array': {
      return 'unknown[]';
    }
    case 'boolean': {
      return 'boolean';
    }
    case 'integer':
    case 'number': {
      return 'number';
    }
    case 'object': {
      return 'Record<string, unknown>';
    }
    case 'string': {
      return 'string';
    }
    default: {
      return 'unknown';
    }
  }
}

/**
 * Converts a function name (camelCase) to a PascalCase base name.
 * e.g. "getModelListApi" → "GetModelList" (strips trailing "Api" if present)
 * e.g. "createUser" → "CreateUser"
 */
export function toBaseName(functionName: string): string {
  // Capitalize first letter
  const pascal = functionName.charAt(0).toUpperCase() + functionName.slice(1);
  // Strip trailing "Api" if present
  if (pascal.endsWith('Api')) {
    return pascal.slice(0, -3);
  }
  return pascal;
}

/**
 * Converts a single SchemaObject to an inline TypeScript type string.
 * Does NOT generate full interface declarations — just the type expression.
 */
export function schemaToTypeString(
  schema: SchemaObject,
  doc: SwaggerDocument,
  resolvedRefs?: Set<string>,
): string {
  if (!schema) return 'unknown';

  // Handle $ref
  if (schema.$ref) {
    return extractRefName(schema.$ref);
  }

  // Handle oneOf / anyOf → union
  if (schema.oneOf && schema.oneOf.length > 0) {
    return schema.oneOf
      .map((s) => schemaToTypeString(s, doc, resolvedRefs))
      .join(' | ');
  }
  if (schema.anyOf && schema.anyOf.length > 0) {
    return schema.anyOf
      .map((s) => schemaToTypeString(s, doc, resolvedRefs))
      .join(' | ');
  }

  // Handle allOf → intersection
  if (schema.allOf && schema.allOf.length > 0) {
    return schema.allOf
      .map((s) => schemaToTypeString(s, doc, resolvedRefs))
      .join(' & ');
  }

  // Handle array
  if (schema.type === 'array') {
    if (schema.items) {
      const itemType = schemaToTypeString(schema.items, doc, resolvedRefs);
      return `${itemType}[]`;
    }
    return 'unknown[]';
  }

  // Handle object with properties → inline object type
  if (schema.type === 'object' || schema.properties) {
    if (schema.properties && Object.keys(schema.properties).length > 0) {
      const required = schema.required ?? [];
      const fields = Object.entries(schema.properties).map(
        ([key, propSchema]) => {
          const optional = required.includes(key) ? '' : '?';
          const propType = schemaToTypeString(propSchema, doc, resolvedRefs);
          return `${key}${optional}: ${propType}`;
        },
      );
      return `{ ${fields.join('; ')} }`;
    }
    return 'Record<string, unknown>';
  }

  // Handle primitives
  if (schema.type) {
    return mapPrimitiveType(schema.type);
  }

  return 'unknown';
}

/**
 * Generates a full TypeScript interface declaration string for a named schema.
 * Includes JSDoc comment if schema.description is present.
 * Marks fields as optional if not in schema.required array.
 */
export function generateInterface(
  typeName: string,
  schema: SchemaObject,
  doc: SwaggerDocument,
  resolvedRefs?: Set<string>,
): string {
  const lines: string[] = [];

  // Top-level JSDoc
  if (schema.description) {
    lines.push(`/** ${schema.description} */`);
  }

  // Handle non-object schemas as type aliases
  if (!schema.properties && !schema.allOf && !schema.oneOf && !schema.anyOf) {
    if (schema.$ref) {
      const refName = extractRefName(schema.$ref);
      lines.push(`export type ${typeName} = ${refName};`);
      return lines.join('\n');
    }
    if (schema.type && schema.type !== 'object') {
      const tsType = schemaToTypeString(schema, doc, resolvedRefs);
      lines.push(`export type ${typeName} = ${tsType};`);
      return lines.join('\n');
    }
  }

  // Handle allOf / oneOf / anyOf as type aliases
  if (schema.allOf || schema.oneOf || schema.anyOf) {
    const tsType = schemaToTypeString(schema, doc, resolvedRefs);
    lines.push(`export type ${typeName} = ${tsType};`);
    return lines.join('\n');
  }

  // Generate interface
  lines.push(`export interface ${typeName} {`);

  const properties = schema.properties ?? {};
  const required = schema.required ?? [];

  for (const [fieldName, fieldSchema] of Object.entries(properties)) {
    // Field JSDoc
    if (fieldSchema.description) {
      lines.push(`  /** ${fieldSchema.description} */`);
    }
    const optional = required.includes(fieldName) ? '' : '?';
    const fieldType = schemaToTypeString(fieldSchema, doc, resolvedRefs);
    lines.push(`  ${fieldName}${optional}: ${fieldType};`);
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Main conversion function. Given a ConvertOptions, returns:
 * - mainType: the primary type definition string (interface or type alias)
 * - dependencies: array of dependency type definition strings (from $ref resolution)
 */
export function convertSchema(options: ConvertOptions): ConvertResult {
  const { schema, typeName, doc, resolvedRefs: externalRefs } = options;
  const resolvedRefs = externalRefs ?? new Set<string>();

  // Generate the main type
  const mainType = generateInterface(typeName, schema, doc, resolvedRefs);

  // Collect all $ref dependencies
  const refMap = collectRefs(schema, doc, resolvedRefs);

  const dependencies: string[] = [];
  for (const [refName, refSchema] of refMap) {
    const depInterface = generateInterface(
      refName,
      refSchema,
      doc,
      resolvedRefs,
    );
    dependencies.push(depInterface);
  }

  return { mainType, dependencies };
}

/**
 * Extracts the response schema from a Swagger operation's responses field.
 * Looks for HTTP 200 or 201 response.
 * If the response schema has a 'data' field (wrapper pattern), extracts it.
 * Returns { responseSchema, dataSchema } where dataSchema may be undefined.
 */
export function extractResponseSchema(
  responses: Record<string, import('./types.js').ResponseObject>,
  doc: SwaggerDocument,
): { dataSchema: SchemaObject | null; responseSchema: SchemaObject | null } {
  const response = responses['200'] ?? responses['201'];
  if (!response) {
    return { responseSchema: null, dataSchema: null };
  }

  let responseSchema: SchemaObject | null = null;

  // OpenAPI 3.x: content['application/json'].schema
  if (response.content?.['application/json']?.schema) {
    responseSchema = response.content['application/json'].schema;
  }
  // Swagger 2.x: response.schema
  else if (response.schema) {
    responseSchema = response.schema;
  }

  if (!responseSchema) {
    return { responseSchema: null, dataSchema: null };
  }

  // Resolve $ref if needed
  let resolvedSchema = responseSchema;
  if (responseSchema.$ref) {
    resolvedSchema = resolveRef(responseSchema.$ref, doc);
  }

  // Check for wrapper pattern with 'data' field
  const dataSchema = resolvedSchema.properties?.data ?? null;

  return { responseSchema: resolvedSchema, dataSchema };
}
