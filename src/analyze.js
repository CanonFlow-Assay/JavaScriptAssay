import ts from 'typescript';
import { dirname, resolve } from 'node:path';
import { sha256 } from './canonical.js';
const mutators = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'copyWithin',
  'fill',
  'set',
  'add',
  'delete',
  'clear'
]);
const effects = new Set([
  'fetch',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  'alert',
  'prompt'
]);
const infrastructure = new Set([
  'fs',
  'fs/promises',
  'child_process',
  'http',
  'https',
  'net',
  'dns',
  'os',
  'process',
  'console',
  'timers',
  'timers/promises',
  'crypto',
  'worker_threads',
  'readline',
  'dgram',
  'cluster'
]);
export const analyze = (sources, domainFiles, boundaryFiles) => {
  const findings = [],
    errors = [],
    unsupported = [];
  const domains = new Set(domainFiles),
    boundaries = new Set(boundaryFiles);
  const byAbsolute = new Map(sources.map((source) => [resolve(source.absolute), source.path]));
  for (const source of sources) {
    const ast = ts.createSourceFile(
      source.path,
      source.text,
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.JS
    );
    errors.push(
      ...ast.parseDiagnostics.map(
        (d) => source.path + ': ' + ts.flattenDiagnosticMessageText(d.messageText, '\n')
      )
    );
    if (!domains.has(source.path)) continue;
    const add = (node, ruleId) => {
      const pos = ast.getLineAndCharacterOfPosition(node.getStart(ast));
      const finding = {
        path: source.path,
        line: pos.line + 1,
        column: pos.character + 1,
        ruleId,
        severity: 'error'
      };
      findings.push({
        ...finding,
        fingerprint: sha256(JSON.stringify(finding))
      });
    };
    const inspectImport = (node, specifier) => {
      const name = specifier.text;
      if (name.startsWith('node:') || infrastructure.has(name)) {
        add(node, 'JSA-E01');
        return;
      }
      if (!name.startsWith('.')) {
        unsupported.push(source.path + ': unassessed external module ' + name);
        return;
      }
      const target = resolve(dirname(source.absolute), name),
        imported = byAbsolute.get(target);
      if (imported && boundaries.has(imported)) add(node, 'JSA-E02');
      else if (!imported || !domains.has(imported))
        unsupported.push(source.path + ': dependency outside declared domain scope: ' + name);
    };
    const propertyTarget = (target) => {
      if (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target))
        return true;
      if (ts.isParenthesizedExpression(target) || ts.isSpreadElement(target))
        return propertyTarget(target.expression);
      if (ts.isBinaryExpression(target) && target.operatorToken.kind === ts.SyntaxKind.EqualsToken)
        return propertyTarget(target.left);
      if (ts.isArrayLiteralExpression(target)) return target.elements.some(propertyTarget);
      if (ts.isObjectLiteralExpression(target))
        return target.properties.some((property) =>
          ts.isPropertyAssignment(property)
            ? propertyTarget(property.initializer)
            : ts.isSpreadAssignment(property)
              ? propertyTarget(property.expression)
              : false
        );
      return false;
    };
    const callableName = (expression) => {
      if (ts.isParenthesizedExpression(expression)) return callableName(expression.expression);
      if (
        ts.isElementAccessExpression(expression) &&
        expression.argumentExpression &&
        ts.isStringLiteral(expression.argumentExpression)
      )
        return callableName(expression.expression) + '.' + expression.argumentExpression.text;
      if (ts.isPropertyAccessExpression(expression))
        return callableName(expression.expression) + '.' + expression.name.text;
      return expression.getText(ast);
    };
    const visit = (node) => {
      if (ts.isThrowStatement(node)) add(node, 'JSA-D01');
      if (ts.isVariableDeclarationList(node) && !(node.flags & ts.NodeFlags.Const))
        add(node, 'JSA-I01');
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
        propertyTarget(node.left)
      )
        add(node, 'JSA-I02');
      if (
        (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
        [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)
      )
        add(node, 'JSA-I02');
      if (ts.isDeleteExpression(node)) add(node, 'JSA-I02');
      if (
        (ts.isForOfStatement(node) || ts.isForInStatement(node)) &&
        propertyTarget(node.initializer)
      )
        add(node, 'JSA-I02');
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier))
        inspectImport(node, node.moduleSpecifier);
      if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        inspectImport(node, node.moduleSpecifier);
      if (ts.isNewExpression(node) && node.expression.getText(ast) === 'Date') add(node, 'JSA-E01');
      if (ts.isCallExpression(node)) {
        const expression = node.expression,
          name = callableName(expression).replace(/^globalThis\./, '');
        if (expression.kind === ts.SyntaxKind.ImportKeyword || name === 'require')
          add(node, 'JSA-E03');
        if (
          effects.has(name) ||
          /^(console|process)\./.test(name) ||
          [
            'Math.random',
            'Date.now',
            'performance.now',
            'Object.assign',
            'Reflect.set',
            'Object.defineProperty'
          ].includes(name)
        )
          add(
            node,
            ['Object.assign', 'Reflect.set', 'Object.defineProperty'].includes(name)
              ? 'JSA-I02'
              : 'JSA-E01'
          );
        if (ts.isPropertyAccessExpression(expression) && mutators.has(expression.name.text))
          add(node, 'JSA-I02');
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  findings.sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      a.line - b.line ||
      a.column - b.column ||
      a.ruleId.localeCompare(b.ruleId)
  );
  return { findings, errors, unsupported: [...new Set(unsupported)].sort() };
};
