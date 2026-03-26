#!/usr/bin/env node
import process from 'node:process';

import { loadConfig } from '../src/config.js';
import { runGenerateTypes, startMcpServer } from '../src/mcp-server.js';

// Parse CLI args
const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

async function main(): Promise<void> {
  // MCP server mode
  if (hasFlag('--mcp')) {
    await startMcpServer();
    return;
  }

  const cwd = process.cwd();
  const config = loadConfig(cwd);

  const filePath = getArg('--file') ?? config.defaultFiles?.[0];
  const swaggerUrl = getArg('--swagger') ?? config.swaggerUrl;
  const dryRun = hasFlag('--dry-run');
  const endpointPrefix = getArg('--endpoint-prefix') ?? config.endpointPrefix;
  const clientName = getArg('--client-name') ?? config.clientName;

  if (!filePath) {
    console.error(
      'Error: No target file specified. Use --file <path> or set defaultFiles in swagger-ts-gen.config.json',
    );
    process.exit(1);
  }

  if (!swaggerUrl) {
    console.error(
      'Error [CONFIG_NOT_FOUND]: No swaggerUrl provided. Use --swagger <url> or set swaggerUrl in swagger-ts-gen.config.json',
    );
    process.exit(1);
  }

  const result = await runGenerateTypes({
    filePath,
    swaggerUrl,
    dryRun,
    cwd,
    endpointPrefix,
    clientName,
  });

  // Print summary
  const { summary, errors } = result;
  console.log(`\n✅ swagger-ts-gen complete`);
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
  }

  if (dryRun) {
    console.log('\n(dry-run mode — no files were modified)');
  }
}

main().catch((error: unknown) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
