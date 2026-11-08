const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");

const source = (name = "待機", action = "記録する", target = "RUNNING") =>
  `State IDLE as "${name}" color "#4F46E5":\n    待つ\nState RUNNING as "実行中" color "#22C55E":\n    走る\nEvent START as "開始"\nTransition IDLE on START -> ${target}:\n    ${action}`;
const expected = (
  name = "待機",
  action = "記録する",
  targetStateId = "RUNNING",
) => ({
  states: [
    { id: "IDLE", name, color: "#4F46E5", meaning: "待つ" },
    { id: "RUNNING", name: "実行中", color: "#22C55E", meaning: "走る" },
  ],
  events: [{ id: "START", name: "開始" }],
  transitions: [
    { fromStateId: "IDLE", eventId: "START", action, targetStateId },
  ],
});
const open = () => vscode.commands.executeCommand("glitchstate.openPreview");
const uriIs =
  (document, version = document.version) =>
  (data) =>
    data.uri === document.uri.toString() && data.version === version;

async function rendered(api, action, predicate) {
  let subscription;
  let timer;
  const result = new Promise((resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("両表の描画完了を受信できない")),
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

async function closeTarget(document) {
  const tabs = vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter(
      (tab) =>
        tab.input instanceof vscode.TabInputText &&
        tab.input.uri.toString() === document.uri.toString(),
    );
  assert.ok(tabs.length > 0);
  let subscription;
  let timer;
  const closed = new Promise((resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("再オープン前の文書を破棄できない")),
      10000,
    );
    subscription = vscode.workspace.onDidCloseTextDocument((item) => {
      if (item.uri.toString() === document.uri.toString()) resolve();
    });
  });
  try {
    assert.equal(await vscode.window.tabGroups.close(tabs), true);
    await closed;
    assert.equal(document.isClosed, true);
  } finally {
    clearTimeout(timer);
    subscription.dispose();
  }
}

exports.run = async () => {
  const extension = vscode.extensions.all.find(
    (item) => item.packageJSON.name === "glitchstate",
  );
  assert.ok(extension);
  const api = await extension.activate();
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "glitchstate-transitions-"),
  );
  const document = async (name, text = source()) => {
    const uri = vscode.Uri.file(path.join(directory, name));
    await fs.writeFile(uri.fsPath, text);
    return vscode.workspace.openTextDocument(uri);
  };
  const prepareReopen = async (name) => {
    const uri = vscode.Uri.file(path.join(directory, name));
    await fs.writeFile(uri.fsPath, source("閉じる前"));
    await vscode.commands.executeCommand("vscode.open", uri, {
      viewColumn: vscode.ViewColumn.One,
      preview: false,
    });
    const doc = vscode.window.activeTextEditor?.document;
    assert.equal(doc?.uri.toString(), uri.toString());
    for (const name of ["編集1", "編集2", "閉じる前"])
      await replace(doc, source(name));
    await doc.save();
    const data = await rendered(api, open, uriIs(doc));
    assert.deepEqual(data.model, expected("閉じる前"));
    const version = doc.version;
    await closeTarget(doc);
    assert.equal(api.currentPreviewUri(), uri.toString());
    await fs.writeFile(uri.fsPath, source("再オープン", "新しい処理", "IDLE"));
    return { uri, version };
  };
  const assertSinglePanel = () =>
    assert.equal(
      vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .filter((tab) => tab.input instanceof vscode.TabInputWebview).length,
      1,
    );
  const cases = [
    /** REQ-013-S01 */
    async function transitionDirtyUpdates() {
      const doc = await document("dirty-transitions.gls");
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      await replace(doc, source("保存前", "未保存の処理", "IDLE"));
      const initial = await rendered(api, open, uriIs(doc));
      assert.deepEqual(
        initial.model,
        expected("保存前", "未保存の処理", "IDLE"),
      );
      assert.equal(doc.isDirty, true);
      const next = source("更新後", "更新した処理", "-").replace(
        'as "開始"',
        'as "開始要求"',
      );
      const data = await rendered(
        api,
        () => replace(doc, next),
        uriIs(doc, doc.version + 1),
      );
      assert.deepEqual(data.model, {
        ...expected("更新後", "更新した処理", null),
        events: [{ id: "START", name: "開始要求" }],
      });
      assert.equal(doc.isDirty, true);
      assert.equal(await fs.readFile(doc.uri.fsPath, "utf8"), source());
      assertSinglePanel();
    },
    /** REQ-013-S02 */
    async function transitionRetainAfterError() {
      const doc = await document("retained-transitions.gls");
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      await rendered(api, open, uriIs(doc));
      const data = await rendered(
        api,
        () => replace(doc, source("途中の状態", "途中の処理", "MISSING")),
        uriIs(doc, doc.version + 1),
      );
      assert.deepEqual(data.model, expected());
      assert.equal(data.hasErrors, true);
      const diagnostics = vscode.languages.getDiagnostics(doc.uri);
      assert.equal(diagnostics.length, 1);
      assert.equal(diagnostics[0].code, "reference");
      assert.equal(diagnostics[0].range.start.line, 5);
      assert.equal(diagnostics[0].message, "遷移先状態ID MISSING は未宣言");
    },
    /** REQ-013-S03 */
    async function transitionInvalidSwitch() {
      const a = await document("valid-transitions.gls");
      await vscode.window.showTextDocument(a, vscode.ViewColumn.One);
      await rendered(api, open, uriIs(a));
      const b = await document(
        "invalid-transitions.gls",
        source("別文書", "別の処理", "MISSING"),
      );
      await vscode.window.showTextDocument(b, vscode.ViewColumn.One);
      const data = await rendered(api, open, uriIs(b));
      assert.equal(data.model, null);
      assert.equal(data.hasErrors, true);
      assert.equal(vscode.languages.getDiagnostics(b.uri)[0].code, "reference");
      assertSinglePanel();
    },
    /** REQ-013-S06 */
    async function transitionRepair() {
      const doc = await document(
        "repair-transitions.gls",
        source("復旧後", "復旧の処理", "MISSING"),
      );
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      await rendered(api, open, uriIs(doc));
      const data = await rendered(
        api,
        () => replace(doc, source("復旧後", "復旧の処理", "IDLE")),
        uriIs(doc, doc.version + 1),
      );
      assert.deepEqual(data.model, expected("復旧後", "復旧の処理", "IDLE"));
      assert.equal(data.hasErrors, false);
      assert.equal(vscode.languages.getDiagnostics(doc.uri).length, 0);
      assert.equal(doc.isDirty, true);
    },
    /** REQ-013-S05 */
    async function transitionUpdateAfterReopen() {
      const previous = await prepareReopen("reopen-transition-edit.gls");
      const reopened = await vscode.workspace.openTextDocument(previous.uri);
      assert.ok(reopened.version + 1 < previous.version);
      await vscode.window.showTextDocument(reopened, vscode.ViewColumn.One);
      const data = await rendered(
        api,
        () => replace(reopened, source("開き直した編集", "編集した処理", "-")),
        uriIs(reopened, reopened.version + 1),
      );
      assert.deepEqual(
        data.model,
        expected("開き直した編集", "編集した処理", null),
      );
      assert.ok(data.version < previous.version);
      assert.equal(reopened.isDirty, true);
      assertSinglePanel();
    },
    /** REQ-013-S05 */
    async function transitionCommandAfterReopen() {
      const previous = await prepareReopen("reopen-transition-command.gls");
      const reopened = await vscode.workspace.openTextDocument(previous.uri);
      assert.ok(reopened.version < previous.version);
      await vscode.window.showTextDocument(reopened, vscode.ViewColumn.One);
      const data = await rendered(api, open, uriIs(reopened));
      assert.deepEqual(
        data.model,
        expected("再オープン", "新しい処理", "IDLE"),
      );
      assert.ok(data.version < previous.version);
      assertSinglePanel();
    },
  ];
  const errors = [];
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
    throw new AggregateError(errors, "状態遷移表の統合テストが失敗した");
};
