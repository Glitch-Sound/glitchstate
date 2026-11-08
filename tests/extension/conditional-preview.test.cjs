const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");

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

const defaults = {
  name: "待機",
  commonAction: "要求を記録する",
  branches: [
    { condition: "準備完了", action: "開始する", targetStateId: "RUNNING" },
    { condition: "それ以外", action: null, targetStateId: null },
  ],
  categories: ["操作", "運転"],
  headers: ["系統", "区分", "種別"],
};
const source = (options = {}) => {
  const o = { ...defaults, ...options };
  return [
    `State IDLE as "${o.name}" color "#4F46E5":`,
    "    待つ",
    'State RUNNING as "実行中" color "#22C55E":',
    "    走る",
    'State RECOVERED as "回復済み" color "#F97316":',
    "    回復した",
    `EventCategoryHeaders ${o.headers.map((s) => `"${s}"`).join(" > ")}`,
    ...(o.extraFirst ? ['Event EXTRA as "追加イベント"'] : []),
    `Event START as "開始"${o.categories.length ? ` in ${o.categories.map((s) => `"${s}"`).join(" > ")}` : ""}`,
    ...(o.extraLast ? ['Event EXTRA as "追加イベント"'] : []),
    ...(o.plain
      ? ["Transition IDLE on START -> RUNNING:", "    分岐なし処理"]
      : [
          "Transition IDLE on START:",
          "    Common:",
          ...String(o.commonAction ?? "-")
            .split("\n")
            .map((s) => `        ${s}`),
          ...o.branches.flatMap((b) => [
            `    Branch "${b.condition}" -> ${b.targetStateId ?? "-"}:`,
            ...String(b.action ?? "-")
              .split("\n")
              .map((s) => `        ${s}`),
          ]),
        ]),
  ].join("\n");
};
const expected = (options = {}) => {
  const o = { ...defaults, ...options };
  return {
    states: [
      { id: "IDLE", name: o.name, color: "#4F46E5", meaning: "待つ" },
      { id: "RUNNING", name: "実行中", color: "#22C55E", meaning: "走る" },
      {
        id: "RECOVERED",
        name: "回復済み",
        color: "#F97316",
        meaning: "回復した",
      },
    ],
    events: [
      ...(o.extraFirst ? [{ id: "EXTRA", name: "追加イベント" }] : []),
      {
        id: "START",
        name: "開始",
        ...(o.categories.length ? { categoryPath: o.categories } : {}),
      },
      ...(o.extraLast ? [{ id: "EXTRA", name: "追加イベント" }] : []),
    ],
    eventCategoryHeaders: o.headers,
    transitions: [
      o.plain
        ? {
            fromStateId: "IDLE",
            eventId: "START",
            action: "分岐なし処理",
            targetStateId: "RUNNING",
          }
        : {
            fromStateId: "IDLE",
            eventId: "START",
            commonAction: o.commonAction,
            branches: o.branches,
          },
    ],
  };
};
const repair = {
  name: "再開待ち",
  commonAction: "再開要求を記録する",
  branches: [
    { condition: "復旧可能", action: "復旧する", targetStateId: "RECOVERED" },
    defaults.branches[1],
  ],
  categories: ["業務", "復旧"],
  headers: ["領域", "用途"],
};

exports.run = async () => {
  const extension = vscode.extensions.all.find(
    (item) => item.packageJSON.name === "glitchstate",
  );
  assert.ok(extension);
  const api = await extension.activate();
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "glitchstate-conditional-"),
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
  const single = () =>
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
      await replace(doc, source({ name }));
    await doc.save();
    assert.deepEqual(
      (await rendered(api, open, uriIs(doc))).model,
      expected({ name: "閉じる前" }),
    );
    const before = { uri: doc.uri, version: doc.version };
    await closeTarget(doc);
    assert.equal(api.currentPreviewUri(), uri.toString());
    await fs.writeFile(uri.fsPath, source(repair));
    return before;
  };
  const cases = [
    /** REQ-027-S01 */
    async function conditionalDirtyUpdates() {
      const doc = await document("conditional-dirty.gls");
      assert.deepEqual((await show(doc)).model, expected());
      const [first, second] = defaults.branches;
      for (const options of [
        { commonAction: "変更した共通" },
        { branches: [{ ...first, condition: "変更した条件" }, second] },
        { branches: [{ ...first, action: "変更した処理" }, second] },
        { branches: [{ ...first, targetStateId: "RECOVERED" }, second] },
        { branches: [{ ...first, targetStateId: null }, second] },
        {
          branches: [
            ...defaults.branches,
            { condition: "追加", action: "追加処理", targetStateId: "IDLE" },
          ],
        },
        { branches: [first] },
        { branches: [second, first] },
        { plain: true },
        {},
        { categories: ["通信", "監視", "障害"] },
        { headers: ["領域", "用途"] },
        { extraFirst: true },
        { extraLast: true },
      ]) {
        const data = await edit(doc, source(options));
        assert.deepEqual(data.model, expected(options));
        assert.equal(data.hasErrors, false);
        assert.equal(doc.isDirty, true);
      }
      assert.equal(await fs.readFile(doc.uri.fsPath, "utf8"), source());
      single();
    },
    /** REQ-027-S02 */
    async function conditionalRepairAfterRetainedModel() {
      const doc = await document("conditional-repair.gls");
      assert.deepEqual((await show(doc)).model, expected());
      const data = await edit(
        doc,
        source({
          branches: [
            { ...defaults.branches[0], targetStateId: "MISSING" },
            defaults.branches[1],
          ],
        }),
      );
      assert.equal(data.hasErrors, true);
      assert.deepEqual(data.model, expected());
      const diagnostics = vscode.languages.getDiagnostics(doc.uri);
      assert.equal(diagnostics.length, 1);
      assert.equal(diagnostics[0].code, "reference");
      assert.equal(diagnostics[0].range.start.line, 11);
      assert.match(diagnostics[0].message, /MISSING/);
      const repaired = await edit(doc, source(repair));
      assert.deepEqual(repaired.model, expected(repair));
      assert.equal(repaired.hasErrors, false);
      assert.deepEqual(vscode.languages.getDiagnostics(doc.uri), []);
      assert.equal(doc.isDirty, true);
      assert.equal(await fs.readFile(doc.uri.fsPath, "utf8"), source());
      single();
    },
    /** REQ-027-S05 */
    async function conditionalOtherDocument() {
      const a = await document("conditional-a.gls");
      await show(a);
      const invalid = source({
        branches: [{ ...defaults.branches[0], targetStateId: "MISSING" }],
      });
      const b = await document("conditional-b.gls", invalid);
      const notices = [];
      const subscription = api.onDidRenderPreview((data) => notices.push(data));
      try {
        await replace(b, invalid.replace("要求を記録する", "別文書の共通"));
        assert.equal(api.currentPreviewUri(), a.uri.toString());
        assert.deepEqual(vscode.languages.getDiagnostics(a.uri), []);
        assert.deepEqual(vscode.languages.getDiagnostics(b.uri), []);
        assert.deepEqual(
          (await rendered(api, open, uriIs(a))).model,
          expected(),
        );
        assert.ok(notices.every((data) => data.uri === a.uri.toString()));
        const switched = await show(b);
        assert.equal(switched.model, null);
        assert.equal(switched.hasErrors, true);
        assert.equal(
          vscode.languages.getDiagnostics(b.uri)[0].range.start.line,
          11,
        );
        single();
      } finally {
        subscription.dispose();
      }
    },
    /** REQ-027-S04 */
    async function conditionalUpdateAfterReopen() {
      const before = await prepareReopen("conditional-reopen-update.gls");
      const doc = await vscode.workspace.openTextDocument(before.uri);
      assert.ok(doc.version + 1 < before.version);
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      const options = { ...repair, name: "再オープンの編集" };
      const data = await edit(doc, source(options));
      assert.ok(data.version < before.version);
      assert.deepEqual(data.model, expected(options));
      assert.equal(doc.isDirty, true);
      single();
    },
    /** REQ-027-S04 */
    async function conditionalCommandAfterReopen() {
      const before = await prepareReopen("conditional-reopen-command.gls");
      const doc = await vscode.workspace.openTextDocument(before.uri);
      assert.ok(doc.version < before.version);
      const data = await show(doc);
      assert.ok(data.version < before.version);
      assert.deepEqual(data.model, expected(repair));
      single();
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
    throw new AggregateError(errors, "条件分岐の統合テストが失敗した");
};
