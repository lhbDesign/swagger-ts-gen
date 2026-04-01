import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { runGenerateTypes } from "../mcp-server.js";

type MockFetchResponse = {
  ok: boolean;
  status?: number;
  statusText?: string;
  json: () => Promise<unknown>;
};

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function writeFile(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, "utf8");
}

const MULTI_FUNCTION_API_CONTENT = `
export async function getUserApi(params: any) {
 return requestClient.get('/user/get', { params });
}

export async function createUserApi(data: any) {
 return requestClient.post('/user/create', data);
}
`;

const SWAGGER_DOC_FOR_MULTI_FUNCTION = {
  openapi: "3.0.0",
  paths: {
    "/user/get": {
      get: {
        parameters: [{ name: "id", in: "query", schema: { type: "string" } }],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/user/create": {
      post: {
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                  },
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

function runCli(args: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(testDir, "../..");
  const binPath = path.join(projectRoot, "bin", "index.ts");

  const result = spawnSync("node", ["--import", "tsx", binPath, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe("CLI-related e2e behaviors via runGenerateTypes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("processes only selected functions when functionNames is provided", async () => {
    const dir = makeTempDir("cli-test-");
    const filePath = path.join(dir, "api.ts");
    writeFile(filePath, MULTI_FUNCTION_API_CONTENT);

    try {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => SWAGGER_DOC_FOR_MULTI_FUNCTION,
        } as MockFetchResponse),
      );

      const result = await runGenerateTypes({
        filePath,
        swaggerUrl: "https://example.com/v3/api-docs",
        functionNames: ["createUserApi"],
        cwd: dir,
      });

      expect(result.success).toBe(true);
      expect(result.summary.processedEndpoints).toBe(1);
      expect(result.generatedTypes.map((t) => t.functionName)).toEqual([
        "createUserApi",
      ]);

      const written = fs.readFileSync(filePath, "utf8");
      expect(written).toContain("export interface CreateUserParams");
      expect(written).not.toContain("export interface GetUserParams");
    } finally {
      cleanupDir(dir);
    }
  });

  it("is idempotent on repeated runs (no duplicate type insertion)", async () => {
    const dir = makeTempDir("cli-test-");
    const filePath = path.join(dir, "api.ts");
    writeFile(filePath, MULTI_FUNCTION_API_CONTENT);

    try {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => SWAGGER_DOC_FOR_MULTI_FUNCTION,
        } as MockFetchResponse),
      );

      const first = await runGenerateTypes({
        filePath,
        swaggerUrl: "https://example.com/v3/api-docs",
        cwd: dir,
      });
      expect(first.success).toBe(true);

      const second = await runGenerateTypes({
        filePath,
        swaggerUrl: "https://example.com/v3/api-docs",
        cwd: dir,
      });
      expect(second.success).toBe(true);

      const content = fs.readFileSync(filePath, "utf8");
      const getUserParamCount =
        content.match(/export interface GetUserParams/g)?.length ?? 0;
      const createUserParamCount =
        content.match(/export interface CreateUserParams/g)?.length ?? 0;

      expect(getUserParamCount).toBe(1);
      expect(createUserParamCount).toBe(1);
    } finally {
      cleanupDir(dir);
    }
  });

  it("supports local swagger json file input", async () => {
    const dir = makeTempDir("cli-test-");
    const filePath = path.join(dir, "api.ts");
    const swaggerPath = path.join(dir, "openapi.json");

    writeFile(filePath, MULTI_FUNCTION_API_CONTENT);
    writeFile(
      swaggerPath,
      JSON.stringify(SWAGGER_DOC_FOR_MULTI_FUNCTION, null, 2),
    );

    try {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      const result = await runGenerateTypes({
        filePath,
        swaggerUrl: swaggerPath,
        cwd: dir,
      });

      expect(result.success).toBe(true);
      expect(result.generatedTypes.length).toBeGreaterThan(0);
      expect(fetchSpy).not.toHaveBeenCalled();

      const written = fs.readFileSync(filePath, "utf8");
      expect(written).toContain("export interface GetUserParams");
      expect(written).toContain("export interface CreateUserParams");
    } finally {
      cleanupDir(dir);
    }
  });
});

describe("CLI output modes", () => {
  it("--json prints structured success output", () => {
    const dir = makeTempDir("cli-output-");
    const filePath = path.join(dir, "api.ts");
    const swaggerPath = path.join(dir, "openapi.json");

    writeFile(filePath, MULTI_FUNCTION_API_CONTENT);
    writeFile(
      swaggerPath,
      JSON.stringify(SWAGGER_DOC_FOR_MULTI_FUNCTION, null, 2),
    );

    try {
      const result = runCli([
        "--file",
        filePath,
        "--swagger",
        swaggerPath,
        "--json",
      ]);

      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(Array.isArray(output.files)).toBe(true);
      expect(output.files.length).toBe(1);
      expect(output.files[0].filePath).toBe(filePath);
    } finally {
      cleanupDir(dir);
    }
  });

  it("--silent suppresses success logs", () => {
    const dir = makeTempDir("cli-output-");
    const filePath = path.join(dir, "api.ts");
    const swaggerPath = path.join(dir, "openapi.json");

    writeFile(filePath, MULTI_FUNCTION_API_CONTENT);
    writeFile(
      swaggerPath,
      JSON.stringify(SWAGGER_DOC_FOR_MULTI_FUNCTION, null, 2),
    );

    try {
      const result = runCli([
        "--file",
        filePath,
        "--swagger",
        swaggerPath,
        "--silent",
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
      expect(result.stderr.trim()).toBe("");
    } finally {
      cleanupDir(dir);
    }
  });

  it("--silent still prints failure errors", () => {
    const dir = makeTempDir("cli-output-");
    const filePath = path.join(dir, "api.ts");

    writeFile(filePath, MULTI_FUNCTION_API_CONTENT);

    try {
      const result = runCli([
        "--file",
        filePath,
        "--swagger",
        path.join(dir, "missing-openapi.json"),
        "--silent",
        "--json",
      ]);

      expect(result.status).toBe(2);
      const errorOutput = JSON.parse(result.stderr);
      expect(errorOutput.success).toBe(false);
      expect(errorOutput.code).toBe("CRITICAL_FAILURE");
      expect(Array.isArray(errorOutput.errors)).toBe(true);
      expect(errorOutput.errors[0].type).toBe("SWAGGER_FETCH_ERROR");
    } finally {
      cleanupDir(dir);
    }
  });
});
