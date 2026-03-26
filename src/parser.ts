import type { ParsedFunction, ParseResult, HttpMethod } from './types.js';

import * as fs from 'node:fs';

import ts from 'typescript';

const HTTP_METHODS: HttpMethod[] = ['get', 'post', 'put', 'delete', 'patch'];

function getLineNumber(sourceFile: ts.SourceFile, pos: number): number {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

function getEnclosingFunction(
  node: ts.Node,
):
  | ts.FunctionDeclaration
  | ts.VariableDeclaration
  | ts.MethodDeclaration
  | null {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current)) {
      return current;
    }
    if (ts.isVariableDeclaration(current)) {
      const init = current.initializer;
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
        return current;
      }
    }
    if (ts.isMethodDeclaration(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function getFunctionName(
  enclosing:
    | ts.FunctionDeclaration
    | ts.VariableDeclaration
    | ts.MethodDeclaration,
): string {
  if (ts.isFunctionDeclaration(enclosing)) {
    return enclosing.name?.text ?? 'anonymous';
  }
  if (ts.isVariableDeclaration(enclosing)) {
    return ts.isIdentifier(enclosing.name) ? enclosing.name.text : 'anonymous';
  }
  if (ts.isMethodDeclaration(enclosing)) {
    return ts.isIdentifier(enclosing.name) ? enclosing.name.text : 'anonymous';
  }
  return 'anonymous';
}

function getParamType(
  enclosing:
    | ts.FunctionDeclaration
    | ts.VariableDeclaration
    | ts.MethodDeclaration,
  sourceFile: ts.SourceFile,
): string | null {
  let params: ts.NodeArray<ts.ParameterDeclaration> | undefined;

  if (ts.isFunctionDeclaration(enclosing)) {
    params = enclosing.parameters;
  } else if (ts.isVariableDeclaration(enclosing)) {
    const init = enclosing.initializer;
    if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
      params = init.parameters;
    }
  } else if (ts.isMethodDeclaration(enclosing)) {
    params = enclosing.parameters;
  }

  if (!params || params.length === 0) return null;

  const firstParam = params[0];
  if (!firstParam.type) return null;

  return firstParam.type.getText(sourceFile);
}

export function parseApiFile(
  filePath: string,
  clientName = 'requestClient',
): ParseResult {
  const content = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
  );

  const functions: ParsedFunction[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const propAccess = node.expression;
      const objName = ts.isIdentifier(propAccess.expression)
        ? propAccess.expression.text
        : null;
      const methodName = propAccess.name.text as HttpMethod;

      if (objName === clientName && HTTP_METHODS.includes(methodName)) {
        // Use the enclosing function declaration line, not the requestClient call line
        // This ensures type definitions are inserted above the function, not inside it
        const enclosingForLine = getEnclosingFunction(node);
        const declarationNode = enclosingForLine ?? node;
        // For VariableDeclaration, walk up to VariableStatement to get the export line
        let topNode: ts.Node = declarationNode;
        if (
          ts.isVariableDeclaration(declarationNode) &&
          ts.isVariableDeclarationList(declarationNode.parent)
        ) {
          topNode = declarationNode.parent.parent; // VariableStatement
        }
        const lineNumber = getLineNumber(
          sourceFile,
          topNode.getStart(sourceFile),
        );

        // Extract endpoint from first argument
        let endpoint = '';
        if (node.arguments.length > 0) {
          const firstArg = node.arguments[0];
          endpoint = ts.isStringLiteral(firstArg)
            ? firstArg.text
            : firstArg.getText(sourceFile);
        }

        const enclosing = getEnclosingFunction(node);
        const name = enclosing ? getFunctionName(enclosing) : 'anonymous';
        const paramType = enclosing
          ? getParamType(enclosing, sourceFile)
          : null;
        const hasAnyType = paramType === null || paramType === 'any';

        functions.push({
          name,
          method: methodName,
          endpoint,
          paramType,
          hasAnyType,
          lineNumber,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  const pendingFunctions = functions.filter((f) => f.hasAnyType);

  return {
    filePath,
    functions,
    pendingFunctions,
  };
}
