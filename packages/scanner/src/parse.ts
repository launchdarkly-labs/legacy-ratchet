import type { ImportKind, RawImport } from '@migration-tracker/core';
import ts from 'typescript';
import { collectDirectives, findSuppression } from './suppression.js';

/** ScriptKind by extension. JS-family files use JSX-enabled TSX parsing. */
export function scriptKindFor(filePath: string): ts.ScriptKind {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.mts') || lower.endsWith('.cts')) {
    return ts.ScriptKind.TS;
  }
  return ts.ScriptKind.TSX;
}

function literalText(node: ts.Node | undefined): ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | undefined {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node;
  return undefined;
}

function importDeclarationTypeOnly(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name) return false;
  const bindings = clause.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings)) return false;
  return bindings.elements.length > 0 && bindings.elements.every((e) => e.isTypeOnly);
}

function exportDeclarationTypeOnly(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return true;
  const clause = node.exportClause;
  if (!clause || !ts.isNamedExports(clause)) return false;
  return clause.elements.length > 0 && clause.elements.every((e) => e.isTypeOnly);
}

/**
 * Parses `code` and returns every module import site. `filePath` is copied
 * verbatim onto each result and is also used to pick the ScriptKind.
 */
export function scanSource(code: string, filePath: string): RawImport[] {
  const sf = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true, scriptKindFor(filePath));
  const directives = collectDirectives(sf);
  const out: RawImport[] = [];

  const emit = (
    specifier: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
    importKind: ImportKind,
    typeOnly: boolean,
    anchor: ts.Node,
  ): void => {
    const spec = sf.getLineAndCharacterOfPosition(specifier.getStart(sf));
    const startLine = sf.getLineAndCharacterOfPosition(anchor.getStart(sf)).line;
    const raw: RawImport = {
      filePath,
      moduleSpecifier: specifier.text,
      importKind,
      typeOnly,
      line: spec.line + 1,
      column: spec.character + 1,
    };
    const suppression = findSuppression(directives, startLine, spec.line);
    if (suppression) raw.suppression = { groupIds: [...suppression.groupIds], reason: suppression.reason };
    out.push(raw);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const spec = literalText(node.moduleSpecifier);
      if (spec) emit(spec, 'import', importDeclarationTypeOnly(node), node);
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) {
        const spec = literalText(node.moduleReference.expression);
        if (spec) emit(spec, 'import-equals', node.isTypeOnly, node);
      }
    } else if (ts.isExportDeclaration(node)) {
      const spec = literalText(node.moduleSpecifier);
      if (spec) emit(spec, 'export-from', exportDeclarationTypeOnly(node), node);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const spec = literalText(node.arguments[0]);
        if (spec) emit(spec, 'dynamic-import', false, node);
      } else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments.length === 1
      ) {
        const spec = literalText(node.arguments[0]);
        if (spec) emit(spec, 'require', false, node);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);

  out.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0));
  return out;
}
