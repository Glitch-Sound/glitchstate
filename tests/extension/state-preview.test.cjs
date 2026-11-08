const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");

const source = (name = "待機", color = "#4F46E5") =>
  `State IDLE as "${name}" color "${color}":\n    開始を待つ状態`;

async function rendered(api, action, predicate) {
  assert.equal(
    typeof api?.onDidRenderPreview,
    "function",
    "描画完了通知が必要",
  );
  let subscription;
  let timer;
  const result = new Promise((resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("プレビューの描画完了を受信できない")),
      10000,
    );
    subscription = api.onDidRenderPreview((data) => {
      if (predicate(data)) resolve(data);
    });
  });
  try {
    await action();
    return await result;
  } finally {
    clearTimeout(timer);
    subscription.dispose();
  }
}

async function replace(document, text) {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    document.uri,
    new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length),
    ),
    text,
  );
  assert.equal(await vscode.workspace.applyEdit(edit), true);
}

const open = () => vscode.commands.executeCommand("glitchstate.openPreview");
const uriIs =
  (document, version = document.version) =>
  (data) =>
    data.uri === document.uri.toString() && data.version === version;

exports.run = async () => {
  const extension = vscode.extensions.all.find(
    (item) => item.packageJSON.name === "glitchstate",
  );
  assert.ok(extension);
  const api = await extension.activate();
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "glitchstate-tests-"),
  );
  const document = async (name, text = source()) => {
    const file = path.join(directory, name);
    await fs.writeFile(file, text);
    return vscode.workspace.openTextDocument(vscode.Uri.file(file));
  };
  const errors = [];
  const cases = [
    /** REQ-003-S01 */
    async function dirtyOpen() {
      const doc = await document("dirty.gls");
      assert.equal(doc.languageId, "glitchstate");
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      await replace(doc, source("開始待ち"));
      assert.equal(doc.isDirty, true);
      const data = await rendered(api, open, uriIs(doc));
      assert.deepEqual(data.model.states, [
        {
          id: "IDLE",
          name: "開始待ち",
          meaning: "開始を待つ状態",
          color: "#4F46E5",
        },
      ]);
      assert.equal(doc.isDirty, true);
    },
    /** REQ-003-S02 */
    async function reusePanel() {
      const a = await document("a.gls");
      const b = await document("b.gls", source("実行中"));
      await vscode.window.showTextDocument(a, vscode.ViewColumn.One);
      await rendered(api, open, uriIs(a));
      await vscode.window.showTextDocument(b, vscode.ViewColumn.One);
      const data = await rendered(api, open, uriIs(b));
      assert.equal(data.model.states[0].name, "実行中");
      await vscode.window.showTextDocument(b, vscode.ViewColumn.One);
      await rendered(api, open, uriIs(b));
      assert.equal(
        vscode.window.tabGroups.all
          .flatMap((group) => group.tabs)
          .filter((tab) => tab.input instanceof vscode.TabInputWebview).length,
        1,
      );
      assert.equal(api.currentPreviewUri(), b.uri.toString());
    },
    /** REQ-005-S01 */
    async function liveUpdate() {
      const doc = await document("live.gls");
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      await rendered(api, open, uriIs(doc));
      const next = source("開始待ち", "#FF8800").replace(
        "開始を待つ状態",
        "要求の到着を待つ",
      );
      const data = await rendered(
        api,
        () => replace(doc, next),
        uriIs(doc, doc.version + 1),
      );
      assert.deepEqual(data.model.states, [
        {
          id: "IDLE",
          name: "開始待ち",
          meaning: "要求の到着を待つ",
          color: "#FF8800",
        },
      ]);
      assert.equal(doc.isDirty, true);
      assert.equal(await fs.readFile(doc.uri.fsPath, "utf8"), source());
    },
    /** REQ-005-S02 */
    async function isolatedEdit() {
      const a = await document("isolated-a.gls");
      const b = await document("isolated-b.gls", source("別文書"));
      await vscode.window.showTextDocument(a, vscode.ViewColumn.One);
      await rendered(api, open, uriIs(a));
      const notices = [];
      const subscription = api.onDidRenderPreview((data) => notices.push(data));
      try {
        await vscode.window.showTextDocument(b, vscode.ViewColumn.One);
        await replace(b, source("別文書の変更"));
        assert.equal(api.currentPreviewUri(), a.uri.toString());
        await vscode.window.showTextDocument(a, vscode.ViewColumn.One);
        const data = await rendered(api, open, uriIs(a));
        assert.equal(data.model.states[0].name, "待機");
        assert.ok(notices.every((item) => item.uri === a.uri.toString()));
      } finally {
        subscription.dispose();
      }
    },
    /** REQ-006-S01 */
    async function retainAfterError() {
      const doc = await document("retained.gls");
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      await rendered(api, open, uriIs(doc));
      const data = await rendered(
        api,
        () => replace(doc, source("待機", "red")),
        uriIs(doc, doc.version + 1),
      );
      const diagnostics = vscode.languages.getDiagnostics(doc.uri);
      assert.equal(diagnostics.length, 1);
      assert.equal(diagnostics[0].code, "color");
      assert.equal(diagnostics[0].range.start.line, 0);
      assert.match(diagnostics[0].message, /カラー/);
      assert.equal(data.hasErrors, true);
      assert.deepEqual(data.model.states, [
        {
          id: "IDLE",
          name: "待機",
          meaning: "開始を待つ状態",
          color: "#4F46E5",
        },
      ]);
    },
    /** REQ-006-S02 */
    async function initiallyInvalid() {
      const doc = await document(
        "invalid.gls",
        'State OTHER as "不正" color "#000000":',
      );
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      const data = await rendered(api, open, uriIs(doc));
      assert.equal(data.model, null);
      assert.equal(data.hasErrors, true);
      const diagnostics = vscode.languages.getDiagnostics(doc.uri);
      assert.equal(diagnostics.length, 1);
      assert.equal(diagnostics[0].code, "meaning");
      assert.equal(diagnostics[0].range.start.line, 0);
    },
    /** REQ-006-S03 */
    async function repairError() {
      const doc = await document("repair.gls", source("待機", "red"));
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      await rendered(api, open, uriIs(doc));
      assert.equal(vscode.languages.getDiagnostics(doc.uri).length, 1);
      const data = await rendered(
        api,
        () => replace(doc, source("待機", "#0088FF")),
        uriIs(doc, doc.version + 1),
      );
      assert.equal(vscode.languages.getDiagnostics(doc.uri).length, 0);
      assert.equal(data.hasErrors, false);
      assert.equal(data.model.states[0].color, "#0088FF");
      assert.equal(doc.isDirty, true);
    },
    /** REQ-003-S03 */
    async function unrelatedDocument() {
      const before = api.currentPreviewUri();
      const other = await document("other.txt");
      await vscode.window.showTextDocument(other, vscode.ViewColumn.One);
      await open();
      assert.equal(api.currentPreviewUri(), before);
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      await open();
      assert.equal(api.currentPreviewUri(), undefined);
      assert.equal(
        vscode.window.tabGroups.all
          .flatMap((group) => group.tabs)
          .filter((tab) => tab.input instanceof vscode.TabInputWebview).length,
        0,
      );
    },
  ];
  try {
    for (const check of cases) {
      try {
        await check();
        console.log(`成功: ${check.name}`);
      } catch (error) {
        console.error(`失敗: ${check.name}`, error);
        errors.push(error);
      }
      for (const doc of vscode.workspace.textDocuments) {
        if (doc.isDirty && doc.uri.fsPath.startsWith(directory))
          await doc.save();
      }
    }
  } finally {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await fs.rm(directory, { recursive: true, force: true });
  }
  if (errors.length)
    throw new AggregateError(errors, "状態プレビューの統合テストが失敗した");
};
