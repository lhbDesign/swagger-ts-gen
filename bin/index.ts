#!/usr/bin/env node
import process from 'node:process';

import { loadConfig } from '../src/config.js';
import { runGenerateTypes, startMcpServer } from '../src/mcp-server.js';

// Parse CLI args
const args = process.argv.slice(2);

type CliError = {
  type: string;
  message: string;
  context?: string;
};

const CRITICAL_ERROR_TYPES = new Set([
  'CONFIG_NOT_FOUND',
  'PARSE_ERROR',
  'SWAGGER_FETCH_ERROR',
  'WRITE_ERROR',
]);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
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
  if (hasFlag('--mcp')) {
    await startMcpServer();
    return;
  }

  const cwd = process.cwd();
  const config = loadConfig(cwd);

  const cliFile = getArg('--file');
  const filePaths = cliFile ? [cliFile] : (config.defaultFiles ?? []);
  const swaggerUrl = getArg('--swagger') ?? config.swaggerUrl;
  const dryRun = hasFlag('--dry-run');
  const endpointPrefix = getArg('--endpoint-prefix') ?? config.endpointPrefix;
  const clientName = getArg('--client-name') ?? config.clientName;

  if (filePaths.length === 0) {
    exitWithFailure({
      code: 'USAGE_ERROR',
      message:
        'No target file specified. Use --file <path> or set defaultFiles in swagger-ts-gen.config.json.',
      errors: [
        {
          type: 'USAGE_ERROR',
          message:
            'No target file specified. Use --file <path> or set defaultFiles in swagger-ts-gen.config.json.',
        },
      ],
      status: 1,
    });
  }

  if (!swaggerUrl) {
    exitWithFailure({
      code: 'CONFIG_NOT_FOUND',
      message:
        'No swaggerUrl provided. Use --swagger <url> or set swaggerUrl in swagger-ts-gen.config.json.',
      errors: [
        {
          type: 'CONFIG_NOT_FOUND',
          message:
            'No swaggerUrl provided. Use --swagger <url> or set swaggerUrl in swagger-ts-gen.config.json.',
        },
      ],
      status: 1,
    });
  }

  const criticalErrors: CliError[] = [];

  for (const filePath of filePaths) {
    console.log(`\n📄 Processing: ${filePath}`);
    const result = await runGenerateTypes({
      filePath,
      swaggerUrl,
      dryRun,
      cwd,
      endpointPrefix,
      clientName,
    });

    const { summary, errors } = result;
    console.log('✅ swagger-ts-mcp complete');
    console.log(`   Processed endpoints : ${summary.processedEndpoints}`);
    console.log(`   Generated param types: ${summary.generatedParamTypes}`);
    console.log(`   Generated resp types : ${summary.generatedResponseTypes}`);
    console.log(`   Skipped (existing)   : ${summary.skippedTypes}`);

    if (errors.length > 0) {
      console.warn(`\n⚠️  Errors (${errors.length}):`);
      for (const err of errors) {
        console.warn(
          `   [${err.type}] ${err.message}${err.context ? ` (${err.context})` : ''}`,
        );
      }
      criticalErrors.push(
        ...errors
          .filter(isCriticalError)
          .map((err) => ({
            type: err.type,
            message: err.message,
            context: err.context ?? filePath,
          })),
      );
    }
  }

  if (criticalErrors.length > 0) {
    exitWithFailure({
      code: 'CRITICAL_FAILURE',
      message: 'One or more files failed with critical errors.',
      errors: criticalErrors,
      status: 2,
    });
  }

  if (dryRun) {
    console.log('\n(dry-run mode — no files were modified)');
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  printStructuredFailure({
    code: 'UNEXPECTED_ERROR',
    message: 'Unexpected runtime error in CLI.',
    errors: [{ type: 'UNEXPECTED_ERROR', message }],
  });
  process.exit(2);
});
