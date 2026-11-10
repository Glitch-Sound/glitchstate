const assert = require("node:assert/strict");
const vscode = require("vscode");

exports.run = async () => {
  await vscode.commands.executeCommand("glitchstate.openPreview");
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes("glitchstate.openPreview"));
  await require("./state-preview.test.cjs").run();
  await require("./transition-preview.test.cjs").run();
  await require("./diagram-preview.test.cjs").run();
  await require("./category-preview.test.cjs").run();
  await require("./conditional-preview.test.cjs").run();
  await require("./group-preview.test.cjs").run();
};
