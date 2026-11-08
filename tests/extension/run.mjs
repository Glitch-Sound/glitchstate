import { resolve } from "node:path";
import { runTests } from "@vscode/test-electron";

delete process.env.ELECTRON_RUN_AS_NODE;
delete process.env.VSCODE_CLI;

try {
  await runTests({
    extensionDevelopmentPath: resolve("."),
    extensionTestsPath: resolve("tests/extension/suite.cjs"),
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
