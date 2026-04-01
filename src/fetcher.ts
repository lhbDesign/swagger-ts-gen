// Swagger Fetcher - 获取 Swagger 文档并提供 endpoint 查找功能
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  FetchOptions,
  SwaggerDocument,
  StructuredError,
  OperationObject,
  HttpMethod,
} from "./types.js";

export type FetchResult =
  | { ok: true; doc: SwaggerDocument }
  | { ok: false; error: StructuredError };

/**
 * 将 Swagger URL 转换为实际可请求的 api-docs 地址列表（按优先级排序）
 * - doc.html 结尾 → [v3/api-docs, v2/api-docs]
 * - 已是 v3/api-docs 或 v2/api-docs → 直接返回
 */
export function convertSwaggerUrl(url: string): string[] {
  const trimmed = url.trim();

  if (trimmed.endsWith("/v3/api-docs") || trimmed.endsWith("/v2/api-docs")) {
    return [trimmed];
  }

  // 去掉 doc.html 或末尾路径，保留 base path
  let base: string;
  if (trimmed.endsWith("doc.html")) {
    base = trimmed.slice(0, trimmed.length - "doc.html".length);
  } else {
    // 去掉末尾斜杠，作为 base
    base = trimmed.endsWith("/") ? trimmed : trimmed + "/";
  }

  return [`${base}v3/api-docs`, `${base}v2/api-docs`];
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function readSwaggerDocFromLocalFile(filePath: string): FetchResult {
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  try {
    const raw = fs.readFileSync(resolvedPath, "utf8");
    const doc = JSON.parse(raw) as SwaggerDocument;
    return { ok: true, doc };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: {
        type: "SWAGGER_FETCH_ERROR",
        message: `Failed to read Swagger document from local file ${resolvedPath}: ${message}`,
        context: resolvedPath,
      },
    };
  }
}

/**
 * 从 Swagger 文档中查找指定 endpoint 和 method 的 OperationObject
 * 找不到时返回 ENDPOINT_NOT_FOUND 结构化错误
 */
export function findEndpoint(
  doc: SwaggerDocument,
  endpoint: string,
  method: HttpMethod,
): OperationObject | StructuredError {
  const pathItem = doc.paths?.[endpoint];
  if (!pathItem) {
    return {
      type: "ENDPOINT_NOT_FOUND",
      message: `Endpoint "${endpoint}" not found in Swagger document`,
      context: endpoint,
    };
  }

  const operation = pathItem[method.toLowerCase() as HttpMethod];
  if (!operation) {
    return {
      type: "ENDPOINT_NOT_FOUND",
      message: `Method "${method}" not found for endpoint "${endpoint}"`,
      context: `${method.toUpperCase()} ${endpoint}`,
    };
  }

  return operation;
}

/**
 * 通过 HTTP 请求获取 Swagger 文档
 * - 自动处理 doc.html → v3/api-docs → v2/api-docs 的 URL 转换与回退
 * - 网络失败或非 2xx 响应时返回 { ok: false, error: StructuredError }，不抛出异常
 */
export async function fetchSwaggerDoc(
  options: FetchOptions,
): Promise<FetchResult> {
  const { swaggerUrl, timeout = 10000 } = options;
  if (!isHttpUrl(swaggerUrl)) {
    return readSwaggerDocFromLocalFile(swaggerUrl);
  }

  const urls = convertSwaggerUrl(swaggerUrl);

  let lastError: StructuredError | null = null;

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      let response: Response;
      try {
        response = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        lastError = {
          type: "SWAGGER_FETCH_ERROR",
          message: `HTTP ${response.status} ${response.statusText} from ${url}`,
          context: url,
        };
        continue; // try next URL
      }

      const doc = (await response.json()) as SwaggerDocument;
      return { ok: true, doc };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = {
        type: "SWAGGER_FETCH_ERROR",
        message: `Failed to fetch Swagger document from ${url}: ${message}`,
        context: url,
      };
      // continue to next URL
    }
  }

  return {
    ok: false,
    error: lastError ?? {
      type: "SWAGGER_FETCH_ERROR",
      message: `Failed to fetch Swagger document from ${swaggerUrl}`,
      context: swaggerUrl,
    },
  };
}
