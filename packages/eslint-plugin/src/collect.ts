import type { ImportKind, RawImport } from '@migration-tracker/core';
import { ASTUtils, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { collectDirectives, findSuppression } from './suppression.js';

export type SpecifierNode = TSESTree.StringLiteral | TSESTree.TemplateLiteral;

export interface CollectedImport {
  raw: RawImport;
  node: SpecifierNode;
}

type SourceCode = Readonly<TSESLint.SourceCode>;

function isSpecifierLiteral(
  node: TSESTree.Node | undefined,
  sourceCode: SourceCode,
  checkParens = true,
): node is SpecifierNode {
  if (!node) return false;
  // The TS AST keeps parentheses as nodes, so the scanner ignores `require(('m'))`.
  if (checkParens && ASTUtils.isParenthesized(node, sourceCode)) return false;
  if (node.type === 'Literal') return typeof node.value === 'string';
  if (node.type === 'TemplateLiteral') return node.expressions.length === 0 && node.quasis[0]?.value.cooked != null;
  return false;
}

function specifierText(node: SpecifierNode): string {
  return node.type === 'Literal' ? node.value : (node.quasis[0]?.value.cooked ?? '');
}

function importTypeOnly(node: TSESTree.ImportDeclaration): boolean {
  if (node.importKind === 'type') return true;
  if (node.specifiers.length === 0) return false;
  return node.specifiers.every((s) => s.type === 'ImportSpecifier' && s.importKind === 'type');
}

function exportTypeOnly(node: TSESTree.ExportNamedDeclaration | TSESTree.ExportAllDeclaration): boolean {
  if (node.exportKind === 'type') return true;
  if (node.type === 'ExportAllDeclaration') return false;
  if (node.specifiers.length === 0) return false;
  return node.specifiers.every((s) => s.exportKind === 'type');
}

function isRequireCall(node: TSESTree.CallExpression, sourceCode: SourceCode): boolean {
  const callee = node.callee;
  return (
    callee.type === 'Identifier' &&
    callee.name === 'require' &&
    node.arguments.length === 1 &&
    !ASTUtils.isParenthesized(callee, sourceCode)
  );
}

/**
 * Walks the ESTree AST and returns every import site with its specifier node,
 * producing the same `RawImport`s (order included) as scanner's `scanSource`.
 */
export function collectImports(sourceCode: SourceCode, filePath: string): CollectedImport[] {
  const directives = collectDirectives(sourceCode.getAllComments());
  const keys = sourceCode.visitorKeys as Record<string, readonly string[] | undefined>;
  // The scanner reads files with the BOM intact and TS counts it as a column.
  const bomShift = sourceCode.hasBOM ? 1 : 0;
  const out: CollectedImport[] = [];

  const emit = (node: SpecifierNode, importKind: ImportKind, typeOnly: boolean, anchor: TSESTree.Node): void => {
    const line = node.loc.start.line;
    const raw: RawImport = {
      filePath,
      moduleSpecifier: specifierText(node),
      importKind,
      typeOnly,
      line,
      column: node.loc.start.column + 1 + (line === 1 ? bomShift : 0),
    };
    const suppression = findSuppression(directives, anchor.loc.start.line - 1, line - 1);
    if (suppression) raw.suppression = { groupIds: [...suppression.groupIds], reason: suppression.reason };
    out.push({ raw, node });
  };

  const visit = (node: TSESTree.Node, parent: TSESTree.Node | undefined): void => {
    switch (node.type) {
      case 'ImportDeclaration':
        if (isSpecifierLiteral(node.source, sourceCode)) emit(node.source, 'import', importTypeOnly(node), node);
        break;
      case 'TSImportEqualsDeclaration': {
        const ref = node.moduleReference;
        // `require(…)` here is syntax (only a string literal is allowed), not a call with parenthesized args.
        if (ref.type === 'TSExternalModuleReference' && isSpecifierLiteral(ref.expression, sourceCode, false)) {
          // `export import x = require('m')`: TS includes the `export` modifier in the statement.
          const anchor = parent?.type === 'ExportNamedDeclaration' && parent.declaration === node ? parent : node;
          emit(ref.expression, 'import-equals', node.importKind === 'type', anchor);
        }
        break;
      }
      case 'ExportAllDeclaration':
      case 'ExportNamedDeclaration':
        if (node.source && isSpecifierLiteral(node.source, sourceCode)) {
          emit(node.source, 'export-from', exportTypeOnly(node), node);
        }
        break;
      case 'ImportExpression':
        if (isSpecifierLiteral(node.source, sourceCode)) emit(node.source, 'dynamic-import', false, node);
        break;
      case 'CallExpression':
        if (isRequireCall(node, sourceCode) && isSpecifierLiteral(node.arguments[0], sourceCode)) {
          emit(node.arguments[0], 'require', false, node);
        }
        break;
      default:
        break;
    }
    for (const key of keys[node.type] ?? []) {
      const child = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(child)) {
        for (const c of child) if (isNode(c)) visit(c, node);
      } else if (isNode(child)) {
        visit(child, node);
      }
    }
  };
  visit(sourceCode.ast, undefined);

  out.sort((a, b) => (a.raw.line ?? 0) - (b.raw.line ?? 0) || (a.raw.column ?? 0) - (b.raw.column ?? 0));
  return out;
}

function isNode(value: unknown): value is TSESTree.Node {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

/** `RawImport`s for a file, equal to scanner's `scanSource(code, filePath)`. Exported for parity tests. */
export function collectRawImports(sourceCode: SourceCode, filePath: string): RawImport[] {
  return collectImports(sourceCode, filePath).map((c) => c.raw);
}
