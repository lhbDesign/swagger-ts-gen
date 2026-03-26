// 共享类型定义 - swagger-ts-type-generator

export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';

export interface ParsedFunction {
  endpoint: string;
  hasAnyType: boolean;
  lineNumber: number;
  method: HttpMethod;
  name: string;
  paramType: string | null;
}

export interface ParseResult {
  filePath: string;
  functions: ParsedFunction[];
  pendingFunctions: ParsedFunction[];
}

export interface SchemaObject {
  $ref?: string;
  [key: string]: unknown;
  allOf?: SchemaObject[];
  anyOf?: SchemaObject[];
  description?: string;
  enum?: unknown[];
  format?: string;
  items?: SchemaObject;
  oneOf?: SchemaObject[];
  properties?: Record<string, SchemaObject>;
  required?: string[];
  type?: string;
}

export interface ParameterObject {
  description?: string;
  in: string;
  name: string;
  required?: boolean;
  schema?: SchemaObject;
}

export interface RequestBodyObject {
  content?: Record<string, { schema?: SchemaObject }>;
  required?: boolean;
}

export interface ResponseObject {
  content?: Record<string, { schema?: SchemaObject }>;
  description?: string;
  schema?: SchemaObject; // Swagger 2.x
}

export interface OperationObject {
  description?: string;
  operationId?: string;
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses?: Record<string, ResponseObject>;
  summary?: string;
}

export interface PathItem {
  delete?: OperationObject;
  get?: OperationObject;
  patch?: OperationObject;
  post?: OperationObject;
  put?: OperationObject;
}

export interface SwaggerDocument {
  components?: { schemas: Record<string, SchemaObject> };
  definitions?: Record<string, SchemaObject>;
  openapi?: string;
  paths: Record<string, PathItem>;
  swagger?: string;
}

export interface FetchOptions {
  swaggerUrl: string;
  timeout?: number;
}

export interface ConvertOptions {
  doc: SwaggerDocument;
  resolvedRefs?: Set<string>;
  schema: SchemaObject;
  typeName: string;
}

export interface ConvertResult {
  dependencies: string[];
  mainType: string;
}

export interface TypeInsertion {
  functionName: string;
  insertBeforeLine: number;
  newParamType: string;
  typeDefinitions: string[];
}

export interface WriteOptions {
  dryRun?: boolean;
  filePath: string;
  insertions: TypeInsertion[];
}

export interface WriteResult {
  filePath: string;
  insertedTypes: string[];
  skippedTypes: string[];
  updatedFunctions: string[];
}

export interface ToolConfig {
  /** HTTP 客户端对象名称，默认 "requestClient"。例如 "axios"、"http" */
  clientName?: string;
  defaultFiles?: string[];
  /** 接口路径前缀，查找 Swagger 时会自动去掉。例如 "/algo" */
  endpointPrefix?: string;
  namingConvention?: 'PascalCase';
  outputStyle?: 'interface' | 'type';
  swaggerUrl?: string;
}

export interface StructuredError {
  context?: string;
  message: string;
  type:
    | 'SWAGGER_FETCH_ERROR'
    | 'ENDPOINT_NOT_FOUND'
    | 'PARSE_ERROR'
    | 'WRITE_ERROR'
    | 'CONFIG_NOT_FOUND';
}

export interface McpGenerateResult {
  errors: StructuredError[];
  generatedTypes: Array<{
    functionName: string;
    paramType?: string;
    responseType?: string;
    typeDefinitions: string[];
  }>;
  modifiedFiles: string[];
  success: boolean;
  summary: {
    generatedParamTypes: number;
    generatedResponseTypes: number;
    processedEndpoints: number;
    skippedTypes: number;
  };
}
