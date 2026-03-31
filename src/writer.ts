import type { WriteOptions, WriteResult } from './types.js';

import * as fs from 'node:fs';

function extractTypeName(typeDef: string): string {
  const match = /export (?:interface|type) (\w+)/.exec(typeDef);
  return match?.[1] ?? '';
}

function typeExistsInFile(content: string, typeName: string): boolean {
  return new RegExp(`(?:interface|type)\\s+${typeName}\\b`).test(content);
}

export function writeTypes(options: WriteOptions): WriteResult {
  const { filePath, insertions, dryRun } = options;

  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n');
  // If file ends with \n, split produces a trailing empty string — keep it for reconstruction
  // but work with the logical lines (all entries including trailing empty)

  const insertedTypes: string[] = [];
  const skippedTypes: string[] = [];
  const updatedFunctions: string[] = [];

  // Process insertions in reverse order of insertBeforeLine to avoid line-number shifting
  const sorted = [...insertions].sort(
    (a, b) => b.insertBeforeLine - a.insertBeforeLine,
  );

  // We need to track the current file content string for type-existence checks
  // Rebuild content string after each insertion to keep checks accurate
  let currentContent = raw;

  for (const insertion of sorted) {
    const { functionName, typeDefinitions, newParamType, insertBeforeLine } =
      insertion;

    // Determine which type defs to insert vs skip
    const toInsert: string[] = [];
    for (const typeDef of typeDefinitions) {
      const typeName = extractTypeName(typeDef);
      if (typeName && typeExistsInFile(currentContent, typeName)) {
        skippedTypes.push(typeName);
      } else {
        toInsert.push(typeDef);
        if (typeName) insertedTypes.push(typeName);
      }
    }

    // insertBeforeLine is 1-based; convert to 0-based index
    const insertIdx = insertBeforeLine - 1;

    if (toInsert.length > 0) {
      // Build the lines to insert: each typeDef string may be multi-line
      const newLines: string[] = [];
      for (const typeDef of toInsert) {
        const defLines = typeDef.split('\n');
        newLines.push(...defLines);
      }
      // Insert before the target line
      lines.splice(insertIdx, 0, ...newLines);
      // Rebuild currentContent for subsequent type-existence checks
      currentContent = lines.join('\n');
    }

    // Replace `: any` in the function signature line
    // After insertion, the function line has shifted by the number of inserted lines
    const shift = toInsert.reduce((acc, td) => acc + td.split('\n').length, 0);
    const funcLineIdx = insertIdx + shift;

    if (funcLineIdx < lines.length) {
      const original = lines[funcLineIdx];
      const updated = original.replace(/:\s*any\b/, `: ${newParamType}`);
      if (updated !== original) {
        lines[funcLineIdx] = updated;
        updatedFunctions.push(functionName);
        currentContent = lines.join('\n');
      }
    }
  }

  const result: WriteResult = {
    filePath,
    insertedTypes,
    skippedTypes,
    updatedFunctions,
  };

  if (!dryRun) {
    const output = lines.join('\n');
    fs.writeFileSync(filePath, output, 'utf8');
  }

  return result;
}
