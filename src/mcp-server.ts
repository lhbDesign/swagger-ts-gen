import type {
  McpGenerateResult,
  StructuredError,
  TypeInsertion,
  SchemaObject,
} from './types.js';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { loadConfig } from './config.js';
import {
  convertSchema,
  extractResponseSchema,
  toBaseName,
} from './converter.js';
import { createError, isStructuredError } from './errors.js';
import { fetchSwaggerDoc, findEndpoint } from './fetcher.js';
import { parseApiFile } from './parser.js';
import { writeTypes } from './writer.js';

/**
 * Core logic: run the full generate_types pipeline.
 * Exported separately so it can be tested without starting the MCP server.
 */
export async function runGenerateTypes(input: {
  clientName?: string;
  cwd?: string;
  dryRun?: boolean;
  endpointPrefix?: string;
  filePath: string;
  functionNames?: string[];
  swaggerUrl?: string;
}): Promise<McpGenerateResult> {
  const errors: StructuredError[] = [];

  const emptyResult = (
    extraErrors: StructuredError[] = [],
  ): McpGenerateResult => ({
    success: false,
    summary: {
      processedEndpoints: 0,
      generatedParamTypes: 0,
      generatedResponseTypes: 0,
      skippedTypes: 0,
    },
    generatedTypes: [],
    modifiedFiles: [],
    errors: [...errors, ...extraErrors],
  });

  // 1. Load config
  const config = loadConfig(input.cwd ?? process.cwd());

  // 2. Resolve swaggerUrl
  const swaggerUrl = input.swaggerUrl ?? config.swaggerUrl;
  if (!swaggerUrl) {
    return emptyResult([
      createError(
        'CONFIG_NOT_FOUND',
        'No swaggerUrl provided and no config file found. Please provide --swagger or create swagger-ts-gen.config.json.',
      ),
    ]);
  }

  // Resolve endpointPrefix and clientName from input or config
  const endpointPrefix = input.endpointPrefix ?? config.endpointPrefix ?? '';
  const clientName = input.clientName ?? config.clientName ?? 'requestClient';

  // 3. Parse the API file
  let parseResult;
  try {
    parseResult = parseApiFile(input.filePath, clientName);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return emptyResult([
      createError(
        'PARSE_ERROR',
        `Failed to parse file: ${message}`,
        input.filePath,
      ),
    ]);
  }

  // 4. Filter functions
  let pendingFunctions = parseResult.pendingFunctions;
  if (input.functionNames && input.functionNames.length > 0) {
    const nameSet = new Set(input.functionNames);
    pendingFunctions = pendingFunctions.filter((fn) => nameSet.has(fn.name));
  }

  // 5. Fetch swagger doc
  const fetchResult = await fetchSwaggerDoc({ swaggerUrl });
  if (!fetchResult.ok) {
    return emptyResult([fetchResult.error]);
  }
  const doc = fetchResult.doc;

  // 6. Process each pending function
  const insertions: TypeInsertion[] = [];
  const generatedTypes: McpGenerateResult['generatedTypes'] = [];
  let generatedParamTypes = 0;
  let generatedResponseTypes = 0;

  for (const fn of pendingFunctions) {
    const baseName = toBaseName(fn.name);

    // a. Find endpoint (strip prefix if configured)
    const lookupEndpoint =
      endpointPrefix && fn.endpoint.startsWith(endpointPrefix)
        ? fn.endpoint.slice(endpointPrefix.length)
        : fn.endpoint;
    const endpointResult = findEndpoint(doc, lookupEndpoint, fn.method);
    if (isStructuredError(endpointResult)) {
      errors.push(endpointResult);
      continue;
    }
    const operation = endpointResult;

    // b. Extract request schema
    let paramSchema: SchemaObject;
    if (operation.requestBody?.content?.['application/json']?.schema) {
      paramSchema = operation.requestBody.content['application/json'].schema;
    } else if (operation.parameters) {
      const bodyParam = operation.parameters.find((p) => p.in === 'body');
      if (bodyParam?.schema) {
        paramSchema = bodyParam.schema;
      } else {
        const queryParams = operation.parameters.filter(
          (p) => p.in === 'query',
        );
        if (queryParams.length > 0) {
          const properties: Record<string, SchemaObject> = {};
          for (const qp of queryParams) {
            properties[qp.name] = qp.schema ?? { type: 'string' };
          }
          paramSchema = { type: 'object', properties };
        } else {
          paramSchema = { type: 'object', properties: {} };
        }
      }
    } else {
      paramSchema = { type: 'object', properties: {} };
    }

    // c. Check if paramSchema is effectively empty (no properties, no $ref, no body)
    const hasNoParams =
      !paramSchema.$ref &&
      !paramSchema.oneOf &&
      !paramSchema.anyOf &&
      !paramSchema.allOf &&
      (!paramSchema.properties ||
        Object.keys(paramSchema.properties).length === 0);

    if (hasNoParams) {
      // Swagger has no params for this endpoint — skip type generation entirely
      continue;
    }

    // d. Extract response schema
    const { responseSchema } = extractResponseSchema(
      operation.responses ?? {},
      doc,
    );

    // e. Convert param schema
    const paramTypeName = `${baseName}Params`;
    const paramConvert = convertSchema({
      schema: paramSchema,
      typeName: paramTypeName,
      doc,
    });

    // f. Convert response schema if available
    let responseTypeName: string | undefined;
    let responseConvert:
      | { dependencies: string[]; mainType: string }
      | undefined;
    if (responseSchema) {
      responseTypeName = `${baseName}Result`;
      responseConvert = convertSchema({
        schema: responseSchema,
        typeName: responseTypeName,
        doc,
      });
    }

    // g. Build TypeInsertion
    const typeDefinitions: string[] = [
      ...paramConvert.dependencies,
      paramConvert.mainType,
    ];
    if (responseConvert) {
      typeDefinitions.push(
        ...responseConvert.dependencies,
        responseConvert.mainType,
      );
    }

    insertions.push({
      functionName: fn.name,
      typeDefinitions,
      newParamType: paramTypeName,
      insertBeforeLine: fn.lineNumber,
    });

    // h. Track generated types
    generatedParamTypes++;
    if (responseTypeName) generatedResponseTypes++;

    generatedTypes.push({
      functionName: fn.name,
      paramType: paramTypeName,
      responseType: responseTypeName,
      typeDefinitions,
    });
  }

  // 7. Write types
  let modifiedFiles: string[] = [];
  let skippedTypes = 0;
  if (insertions.length > 0) {
    try {
      const writeResult = writeTypes({
        filePath: input.filePath,
        insertions,
        dryRun: input.dryRun,
      });
      skippedTypes = writeResult.skippedTypes.length;
      if (!input.dryRun && writeResult.insertedTypes.length > 0) {
        modifiedFiles = [input.filePath];
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(
        createError(
          'WRITE_ERROR',
          `Failed to write types: ${message}`,
          input.filePath,
        ),
      );
    }
  }

  // 8. Build and return result
  return {
    success: errors.length === 0,
    summary: {
      processedEndpoints: pendingFunctions.length,
      generatedParamTypes,
      generatedResponseTypes,
      skippedTypes,
    },
    generatedTypes,
    modifiedFiles,
    errors,
  };
}

/**
 * Create and return the MCP Server instance (does not start it).
 */
export function createMcpServer(): Server {
  const server = new Server(
    { name: 'swagger-ts-gen', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'generate_types',
        description: '从 Swagger 文档为前端接口文件生成 TypeScript 类型定义',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: '目标接口文件路径' },
            swaggerUrl: {
              type: 'string',
              description: 'Swagger 文档地址（可选，优先于配置文件）',
            },
            functionNames: {
              type: 'array',
              items: { type: 'string' },
              description:
                '指定要处理的函数名列表（可选，默认处理所有待生成类型的函数）',
            },
            dryRun: { type: 'boolean', description: '是否仅预览，不修改文件' },
          },
          required: ['filePath'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === 'generate_types') {
      const input = request.params.arguments as {
        dryRun?: boolean;
        filePath: string;
        functionNames?: string[];
        swaggerUrl?: string;
      };
      const result = await runGenerateTypes(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  return server;
}

/**
 * Start the MCP Server with stdio transport.
 */
export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
