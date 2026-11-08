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
function checkCallable(path, source, declaration, label) {
  const documentation = declaration.jsDoc?.[0];
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
    declaration.body?.statements.some(ts.isThrowStatement) &&
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
  if (
    !comments.some((comment) =>
      source.text.slice(comment.pos, comment.end).startsWith("/**"),
    )
  ) {
    console.error(`${path}: モジュールのドキュメントコメントがない`);
    errors++;
  }

  for (const statement of source.statements) {
    if (
      !ts.canHaveModifiers(statement) ||
      !ts
        .getModifiers(statement)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    )
      continue;
    if (
      !ts.isFunctionDeclaration(statement) &&
      !ts.isClassDeclaration(statement)
    )
      continue;
    const name = statement.name?.text ?? "default";
    if (!statement.jsDoc?.[0]?.comment) {
      console.error(`${path}: ${name} の概要がない`);
      errors++;
      continue;
    }
    if (ts.isFunctionDeclaration(statement)) {
      checkCallable(path, source, statement, name);
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
        );
      }
    }
  }
}
if (errors > 0) process.exitCode = 1;
