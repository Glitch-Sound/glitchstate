import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

let errors = 0;
function checkCallable(path, source, declaration, label, documentation) {
  if (!documentation?.comment) {
    console.error(`${path}: ${label} の概要がない`);
    errors++;
    return;
  }
  const documentedParameters = new Set(
    documentation.tags
      ?.filter(ts.isJSDocParameterTag)
      .map((tag) => tag.name.getText(source)) ?? [],
  );
  for (const parameter of declaration.parameters) {
    if (!documentedParameters.has(parameter.name.getText(source))) {
      console.error(
        `${path}: ${label} の引数 ${parameter.name.getText(source)} の説明がない`,
      );
      errors++;
    }
  }
  if (
    declaration.type &&
    declaration.type.kind !== ts.SyntaxKind.VoidKeyword &&
    !documentation.tags?.some(ts.isJSDocReturnTag)
  ) {
    console.error(`${path}: ${label} の戻り値の説明がない`);
    errors++;
  }
  if (
    declaration.body &&
    ts.isBlock(declaration.body) &&
    declaration.body.statements.some(ts.isThrowStatement) &&
    !documentation.tags?.some((tag) => tag.tagName.text === "throws")
  ) {
    console.error(`${path}: ${label} の例外の説明がない`);
    errors++;
  }
}
for (const path of sourceFiles("src")) {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const comments = ts.getLeadingCommentRanges(source.text, 0) ?? [];
  const moduleComment = comments.find((comment) =>
    source.text.slice(comment.pos, comment.end).startsWith("/**"),
  );
  const documentationOf = (node) =>
    node.jsDoc?.find(
      (documentation) => documentation.pos !== moduleComment?.pos,
    );
  if (!moduleComment) {
    console.error(`${path}: モジュールのドキュメントコメントがない`);
    errors++;
  }
  const namedExports = new Set(
    source.statements.flatMap((statement) => {
      if (
        ts.isExportAssignment(statement) &&
        ts.isIdentifier(statement.expression)
      ) {
        return [statement.expression.text];
      }
      if (
        ts.isExportDeclaration(statement) &&
        !statement.moduleSpecifier &&
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause)
      ) {
        return statement.exportClause.elements.map(
          (element) => (element.propertyName ?? element.name).text,
        );
      }
      return [];
    }),
  );

  for (const statement of source.statements) {
    if (
      ts.isExportAssignment(statement) &&
      (ts.isArrowFunction(statement.expression) ||
        ts.isFunctionExpression(statement.expression))
    ) {
      checkCallable(
        path,
        source,
        statement.expression,
        "default",
        documentationOf(statement) ?? documentationOf(statement.expression),
      );
      continue;
    }
    const directlyExported =
      ts.canHaveModifiers(statement) &&
      ts
        .getModifiers(statement)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (
      !directlyExported &&
      !(
        ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(
          (declaration) =>
            ts.isIdentifier(declaration.name) &&
            namedExports.has(declaration.name.text),
        )
      ) &&
      !(
        (ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement)) &&
        statement.name &&
        namedExports.has(statement.name.text)
      )
    )
      continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          !directlyExported &&
          (!ts.isIdentifier(declaration.name) ||
            !namedExports.has(declaration.name.text))
        )
          continue;
        const initializer = declaration.initializer;
        if (
          initializer &&
          (ts.isArrowFunction(initializer) ||
            ts.isFunctionExpression(initializer))
        ) {
          checkCallable(
            path,
            source,
            initializer,
            declaration.name.getText(source),
            documentationOf(declaration) ??
              documentationOf(statement) ??
              documentationOf(initializer),
          );
        }
      }
      continue;
    }
    if (
      !ts.isFunctionDeclaration(statement) &&
      !ts.isClassDeclaration(statement)
    )
      continue;
    const name = statement.name?.text ?? "default";
    if (!documentationOf(statement)?.comment) {
      console.error(`${path}: ${name} の概要がない`);
      errors++;
      continue;
    }
    if (ts.isFunctionDeclaration(statement)) {
      checkCallable(path, source, statement, name, documentationOf(statement));
    } else {
      for (const member of statement.members) {
        if (!ts.isMethodDeclaration(member)) continue;
        if (
          ts
            .getModifiers(member)
            ?.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword)
        )
          continue;
        checkCallable(
          path,
          source,
          member,
          `${name}.${member.name.getText(source)}`,
          documentationOf(member),
        );
      }
    }
  }
}
if (errors > 0) process.exitCode = 1;
