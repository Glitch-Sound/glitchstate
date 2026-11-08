const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");

const source = (
  name = "待機",
  action = "記録する",
  target = "RUNNING",
  categories = ["操作", "運転", "開始系"],
  headers = ["系統", "区分", "種別"],
) =>
  [
    `State IDLE as "${name}" color "#4F46E5":`,
    "    待つ",
    'State RUNNING as "実行中" color "#22C55E":',
    "    走る",
    'State RECOVERED as "回復済み" color "#F97316":',
    "    回復した",
    `EventCategoryHeaders ${headers.map((name) => `"${name}"`).join(" > ")}`,
    `Event START as "開始"${categories.length ? ` in ${categories.map((name) => `"${name}"`).join(" > ")}` : ""}`,
    `Transition IDLE on START -> ${target}:`,
    `    ${action}`,
  ].join("\n");
const expected = (
  name = "待機",
  action = "記録する",
  targetStateId = "RUNNING",
  categories = ["操作", "運転", "開始系"],
  headers = ["系統", "区分", "種別"],
) => ({
  states: [
    { id: "IDLE", name, color: "#4F46E5", meaning: "待つ" },
    { id: "RUNNING", name: "実行中", color: "#22C55E", meaning: "走る" },
    {
      id: "RECOVERED",
      name: "回復済み",
      color: "#F97316",
      meaning: "回復した",
    },
  ],
  events: [
    {
      id: "START",
      name: "開始",
      ...(categories.length ? { categoryPath: categories } : {}),
    },
  ],
  transitions: [
    { fromStateId: "IDLE", eventId: "START", action, targetStateId },
  ],
  eventCategoryHeaders: headers,
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
      () => reject(new Error("3表示の描画完了を受信できない")),
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
    path.join(os.tmpdir(), "glitchstate-categories-"),
  );
  const document = async (name, text = source()) => {
    const uri = vscode.Uri.file(path.join(directory, name));
    await fs.writeFile(uri.fsPath, text);
    return vscode.workspace.openTextDocument(uri);
  };
  const show = async (doc) => {
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    return rendered(api, open, uriIs(doc));
  };
  const edit = (doc, text) =>
    rendered(api, () => replace(doc, text), uriIs(doc, doc.version + 1));
  const assertSinglePanel = () =>
    assert.equal(
      vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .filter((tab) => tab.input instanceof vscode.TabInputWebview).length,
      1,
    );
  const prepareReopen = async (name) => {
    const uri = vscode.Uri.file(path.join(directory, name));
    await fs.writeFile(uri.fsPath, source());
    await vscode.commands.executeCommand("vscode.open", uri, {
      viewColumn: vscode.ViewColumn.One,
      preview: false,
    });
    const doc = vscode.window.activeTextEditor?.document;
    assert.equal(doc?.uri.toString(), uri.toString());
    for (const name of ["編集1", "編集2", "閉じる前"])
      await replace(doc, source(name));
    await doc.save();
    const before = await rendered(api, open, uriIs(doc));
    assert.deepEqual(before.model, expected("閉じる前"));
    const previous = { uri: doc.uri, version: doc.version };
    await closeTarget(doc);
    assert.equal(api.currentPreviewUri(), previous.uri.toString());
    await fs.writeFile(
      previous.uri.fsPath,
      source(
        "再オープン",
        "再開を記録する",
        "RECOVERED",
        ["業務", "復旧"],
        ["領域", "用途"],
      ),
    );
    return previous;
  };
  const cases = [
    /** REQ-021-S01 */
    async function categoryDirtyUpdates() {
      const doc = await document("category-dirty.gls");
      assert.deepEqual((await show(doc)).model, expected());
      for (const categories of [
        ["業務", "運転", "開始系"],
        ["通信", "監視"],
        [],
        ["操作", "運転", "開始系"],
      ]) {
        const data = await edit(
          doc,
          source("待機", "記録する", "RUNNING", categories),
        );
        assert.deepEqual(
          data.model,
          expected("待機", "記録する", "RUNNING", categories),
        );
        assert.equal(doc.isDirty, true);
      }
      const two = source().replace(
        "Event START",
        'Event Z_OTHER as "別イベント" in "操作"\nEvent START',
      );
      const withTwo = await edit(doc, two);
      assert.deepEqual(withTwo.model.events, [
        { id: "Z_OTHER", name: "別イベント", categoryPath: ["操作"] },
        expected().events[0],
      ]);
      const reversed = await edit(
        doc,
        source().replace(
          "Transition IDLE",
          'Event Z_OTHER as "別イベント" in "操作"\nTransition IDLE',
        ),
      );
      assert.deepEqual(reversed.model.events, [
        expected().events[0],
        { id: "Z_OTHER", name: "別イベント", categoryPath: ["操作"] },
      ]);
      assert.deepEqual(reversed.model.transitions, expected().transitions);
      assert.equal(await fs.readFile(doc.uri.fsPath, "utf8"), source());
      assertSinglePanel();
    },
    /** REQ-021-S02 */
    async function categoryRepairAfterRetainedModel() {
      const doc = await document("category-repair.gls");
      assert.deepEqual((await show(doc)).model, expected());
      const invalid = await edit(
        doc,
        source("途中", "途中の処理", "RUNNING", [
          "操作",
          "運転",
          "開始系",
          "超過",
        ]),
      );
      assert.equal(invalid.hasErrors, true);
      assert.deepEqual(invalid.model, expected());
      const diagnostics = vscode.languages.getDiagnostics(doc.uri);
      assert.equal(diagnostics.length, 1);
      assert.equal(diagnostics[0].code, "category-depth");
      assert.equal(diagnostics[0].range.start.line, 7);
      const repaired = await edit(
        doc,
        source(
          "再開待ち",
          "再開を記録する",
          "RECOVERED",
          ["業務", "復旧"],
          ["領域", "用途"],
        ),
      );
      assert.deepEqual(
        repaired.model,
        expected(
          "再開待ち",
          "再開を記録する",
          "RECOVERED",
          ["業務", "復旧"],
          ["領域", "用途"],
        ),
      );
      assert.equal(repaired.hasErrors, false);
      assert.deepEqual(vscode.languages.getDiagnostics(doc.uri), []);
      assert.equal(doc.isDirty, true);
      assert.equal(await fs.readFile(doc.uri.fsPath, "utf8"), source());
      assertSinglePanel();
    },
    /** REQ-021-S06 */
    async function categoryHeaderRepair() {
      const doc = await document("category-header-repair.gls");
      await show(doc);
      const renamed = await edit(
        doc,
        source(
          "待機",
          "記録する",
          "RUNNING",
          ["操作", "運転", "開始系"],
          ["領域", "用途", "詳細"],
        ),
      );
      assert.deepEqual(
        renamed.model,
        expected(
          "待機",
          "記録する",
          "RUNNING",
          ["操作", "運転", "開始系"],
          ["領域", "用途", "詳細"],
        ),
      );
      const invalid = await edit(
        doc,
        source(
          "待機",
          "記録する",
          "RUNNING",
          ["操作", "運転", "開始系"],
          ["領域"],
        ),
      );
      assert.equal(invalid.hasErrors, true);
      assert.deepEqual(invalid.model, renamed.model);
      const diagnostics = vscode.languages.getDiagnostics(doc.uri);
      assert.equal(diagnostics.length, 1);
      assert.equal(diagnostics[0].code, "category-headers-missing");
      assert.equal(diagnostics[0].range.start.line, 7);
      const repaired = await edit(doc, source());
      assert.deepEqual(repaired.model, expected());
      assert.equal(repaired.hasErrors, false);
      assert.deepEqual(vscode.languages.getDiagnostics(doc.uri), []);
      assert.equal(doc.isDirty, true);
    },
    /** REQ-021-S05 */
    async function categoryOtherDocument() {
      const a = await document("category-a.gls");
      await show(a);
      const b = await document(
        "category-b.gls",
        source("別文書", "別の処理", "RUNNING", ["A", "B", "C", "D"]),
      );
      const received = [];
      const subscription = api.onDidRenderPreview((data) =>
        received.push(data),
      );
      try {
        await replace(
          b,
          source("別文書の編集", "別の処理", "RUNNING", ["A", "B", "C", "D"]),
        );
        assert.equal(api.currentPreviewUri(), a.uri.toString());
        assert.deepEqual(vscode.languages.getDiagnostics(a.uri), []);
        assert.deepEqual(vscode.languages.getDiagnostics(b.uri), []);
        assert.deepEqual(
          (await rendered(api, open, uriIs(a))).model,
          expected(),
        );
        assert.ok(received.every((data) => data.uri === a.uri.toString()));
        const switched = await show(b);
        assert.equal(switched.model, null);
        assert.equal(switched.hasErrors, true);
        assert.equal(
          vscode.languages.getDiagnostics(b.uri)[0].code,
          "category-depth",
        );
        assertSinglePanel();
      } finally {
        subscription.dispose();
      }
    },
    /** REQ-021-S04 */
    async function categoryUpdateAfterReopen() {
      const previous = await prepareReopen("category-reopen-edit.gls");
      const doc = await vscode.workspace.openTextDocument(previous.uri);
      assert.ok(doc.version + 1 < previous.version);
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      const updated = await edit(
        doc,
        source(
          "再オープンの編集",
          "編集した処理",
          "RECOVERED",
          ["通信", "復旧"],
          ["領域", "用途"],
        ),
      );
      assert.deepEqual(
        updated.model,
        expected(
          "再オープンの編集",
          "編集した処理",
          "RECOVERED",
          ["通信", "復旧"],
          ["領域", "用途"],
        ),
      );
      assert.ok(updated.version < previous.version);
      assert.equal(doc.isDirty, true);
      assertSinglePanel();
    },
    /** REQ-021-S04 */
    async function categoryCommandAfterReopen() {
      const previous = await prepareReopen("category-reopen-command.gls");
      const doc = await vscode.workspace.openTextDocument(previous.uri);
      assert.ok(doc.version < previous.version);
      const updated = await show(doc);
      assert.deepEqual(
        updated.model,
        expected(
          "再オープン",
          "再開を記録する",
          "RECOVERED",
          ["業務", "復旧"],
          ["領域", "用途"],
        ),
      );
      assert.ok(updated.version < previous.version);
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
      for (const doc of vscode.workspace.textDocuments)
        if (doc.isDirty && doc.uri.fsPath.startsWith(directory))
          await doc.save();
    }
  } finally {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await fs.rm(directory, { recursive: true, force: true });
  }
  if (errors.length)
    throw new AggregateError(errors, "イベント分類の統合テストが失敗した");
};
