const assert = require("node:assert/strict");
const vscode = require("vscode");

exports.run = async () => {
  await vscode.commands.executeCommand("glitchstate.openPreview");
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes("glitchstate.openPreview"));
};
