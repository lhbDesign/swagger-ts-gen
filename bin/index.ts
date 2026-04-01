#!/usr/bin/env node
import process from "node:process";

import { loadConfig } from "../src/config.js";
import type { McpGenerateResult } from "../src/types.js";
import { runGenerateTypes, startMcpServer } from "../src/mcp-server.js";

// Parse CLI args
const args = process.argv.slice(2);

type CliError = {
  type: string;
  message: string;
  context?: string;
};

type CliFileResult = {
  filePath: string;
  result: McpGenerateResult;
};

const CRITICAL_ERROR_TYPES = new Set([
  "CONFIG_NOT_FOUND",
  "PARSE_ERROR",
  "SWAGGER_FETCH_ERROR",
  "WRITE_ERROR",
]);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

function getArgValues(flag: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) {
      const next = args[i + 1];
      if (next && !next.startsWith("--")) values.push(next);
    }
  }
  return values;
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

function hasMissingValue(flag: string): boolean {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) {
      const next = args[i + 1];
      if (!next || next.startsWith("--")) return true;
    }
  }
  return false;
}

function parseFunctionNames(): string[] | undefined {
  if (!hasFlag("--functions")) return undefined;
  const rawValues = getArgValues("--functions");
  const names = rawValues
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (names.length === 0) return [];
  return [...new Set(names)];
}

function isCriticalError(error: CliError): boolean {
  return CRITICAL_ERROR_TYPES.has(error.type);
}

function printStructuredFailure(options: {
  code: string;
  message: string;
  errors: CliError[];
}): void {
  console.error(
    JSON.stringify(
      {
        success: false,
        code: options.code,
        message: options.message,
        errors: options.errors,
      },
      null,
      2,
    ),
  );
}

function printStructuredSuccess(options: {
  dryRun: boolean;
  files: CliFileResult[];
}): void {
  console.log(
    JSON.stringify(
      {
        success: true,
        dryRun: options.dryRun,
        files: options.files.map((item) => ({
          filePath: item.filePath,
          success: item.result.success,
          summary: item.result.summary,
          modifiedFiles: item.result.modifiedFiles,
          errors: item.result.errors,
          generatedTypes: item.result.generatedTypes,
        })),
      },
      null,
      2,
    ),
  );
}

function exitWithFailure(options: {
  code: string;
  message: string;
  errors: CliError[];
  status: number;
}): never {
  printStructuredFailure(options);
  process.exit(options.status);
}

async function main(): Promise<void> {
  // MCP server mode
  if (hasFlag("--mcp")) {
    await startMcpServer();
    return;
  }

  if (hasMissingValue("--functions")) {
    exitWithFailure({
      code: "USAGE_ERROR",
      message:
        "Invalid --functions value. Use --functions <name1,name2> or repeat --functions <name>.",
      errors: [
        {
          type: "USAGE_ERROR",
          message:
            "Invalid --functions value. Use --functions <name1,name2> or repeat --functions <name>.",
        },
      ],
      status: 1,
    });
  }

  const functionNames = parseFunctionNames();
  if (hasFlag("--functions") && functionNames && functionNames.length === 0) {
    exitWithFailure({
      code: "USAGE_ERROR",
      message:
        "No function names provided. Use --functions <name1,name2> or repeat --functions <name>.",
      errors: [
        {
          type: "USAGE_ERROR",
          message:
            "No function names provided. Use --functions <name1,name2> or repeat --functions <name>.",
        },
      ],
      status: 1,
    });
  }

  const jsonOutput = hasFlag("--json");
  const silentOutput = hasFlag("--silent");

  const cwd = process.cwd();
  const config = loadConfig(cwd);

  const cliFile = getArg("--file");
  const filePaths = cliFile ? [cliFile] : (config.defaultFiles ?? []);
  const swaggerUrl = getArg("--swagger") ?? config.swaggerUrl;
  const dryRun = hasFlag("--dry-run");
  const endpointPrefix = getArg("--endpoint-prefix") ?? config.endpointPrefix;
  const clientName = getArg("--client-name") ?? config.clientName;

  if (filePaths.length === 0) {
    exitWithFailure({
      code: "USAGE_ERROR",
      message:
        "No target file specified. Use --file <path> or set defaultFiles in swagger-ts-gen.config.json.",
      errors: [
        {
          type: "USAGE_ERROR",
          message:
            "No target file specified. Use --file <path> or set defaultFiles in swagger-ts-gen.config.json.",
        },
      ],
      status: 1,
    });
  }

  if (!swaggerUrl) {
    exitWithFailure({
      code: "CONFIG_NOT_FOUND",
      message:
        "No swaggerUrl provided. Use --swagger <url|filePath> or set swaggerUrl in swagger-ts-gen.config.json.",
      errors: [
        {
          type: "CONFIG_NOT_FOUND",
          message:
            "No swaggerUrl provided. Use --swagger <url|filePath> or set swaggerUrl in swagger-ts-gen.config.json.",
        },
      ],
      status: 1,
    });
  }

  const criticalErrors: CliError[] = [];
  const fileResults: CliFileResult[] = [];

  for (const filePath of filePaths) {
    if (!jsonOutput && !silentOutput) {
      console.log(`\n📄 Processing: ${filePath}`);
    }

    const result = await runGenerateTypes({
      filePath,
      swaggerUrl,
      dryRun,
      cwd,
      endpointPrefix,
      clientName,
      functionNames,
    });

    fileResults.push({ filePath, result });

    const { summary, errors } = result;
    if (!jsonOutput && !silentOutput) {
      console.log("✅ swagger-ts-mcp complete");
      console.log(` Processed endpoints : ${summary.processedEndpoints}`);
      console.log(` Generated param types: ${summary.generatedParamTypes}`);
      console.log(` Generated resp types : ${summary.generatedResponseTypes}`);
      console.log(` Skipped (existing) : ${summary.skippedTypes}`);
    }

    if (errors.length > 0 && !jsonOutput) {
      console.warn(`\n⚠️ Errors (${errors.length}):`);
      for (const err of errors) {
        console.warn(
          ` [${err.type}] ${err.message}${err.context ? ` (${err.context})` : ""}`,
        );
      }
    }

    if (errors.length > 0) {
      criticalErrors.push(
        ...errors.filter(isCriticalError).map((err) => ({
          type: err.type,
          message: err.message,
          context: err.context ?? filePath,
        })),
      );
    }
  }

  if (criticalErrors.length > 0) {
    exitWithFailure({
      code: "CRITICAL_FAILURE",
      message: "One or more files failed with critical errors.",
      errors: criticalErrors,
      status: 2,
    });
  }

  if (jsonOutput) {
    printStructuredSuccess({ dryRun, files: fileResults });
    return;
  }

  if (dryRun && !silentOutput) {
    console.log("\n(dry-run mode — no files were modified)");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  printStructuredFailure({
    code: "UNEXPECTED_ERROR",
    message: "Unexpected runtime error in CLI.",
    errors: [{ type: "UNEXPECTED_ERROR", message }],
  });
  process.exit(2);
});
