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

const groupPreviewModel = {
  states: ["A", "B", "C", "X", "Y"].map((id) => ({
    id,
    name: `状態${id}`,
    meaning: `意味${id}`,
    color: "#4F46E5",
  })),
  events: [
    { id: "START", name: "開始", categoryPath: ["操作", "運転"] },
    { id: "RETRY", name: "再試行" },
  ],
  eventCategoryHeaders: ["系統", "区分", "種別"],
  stateGroups: [{ id: "G", name: "稼働系", stateIds: ["C", "B", "A"] }],
  transitions: [
    { fromStateId: "A", eventId: "START", action: "処理A", targetStateId: "X" },
    {
      fromStateId: "B",
      eventId: "RETRY",
      commonAction: "共通B",
      branches: [
        { condition: "別", action: "別処理", targetStateId: "Y" },
        { condition: "一致", action: null, targetStateId: "X" },
      ],
    },
  ],
};
const repairedGroupPreviewModel = {
  ...groupPreviewModel,
  states: groupPreviewModel.states.map((s) =>
    s.id === "A" ? { ...s, name: "再開待ち" } : s,
  ),
  events: [
    { id: "START", name: "開始", categoryPath: ["業務", "復旧"] },
    { id: "RETRY", name: "再試行" },
  ],
  eventCategoryHeaders: ["領域", "用途"],
  stateGroups: [{ id: "G", name: "復旧系", stateIds: ["B", "C"] }],
  transitions: [
    {
      fromStateId: "A",
      eventId: "START",
      action: "再開処理",
      targetStateId: "Y",
    },
    {
      fromStateId: "B",
      eventId: "RETRY",
      commonAction: "復旧要求",
      branches: [
        { condition: "待つ", action: null, targetStateId: null },
        { condition: "復旧可能", action: "復旧処理", targetStateId: "Y" },
      ],
    },
    {
      fromStateId: "C",
      eventId: "RETRY",
      action: "Cの復旧",
      targetStateId: "Y",
    },
  ],
};
function groupPreviewSource(value) {
  const action = (text, indent) =>
    (text ?? "-").split("\n").map((line) => " ".repeat(indent) + line);
  return [
    ...value.states.flatMap((s) => [
      `State ${s.id} as "${s.name}" color "${s.color}":`,
      ...action(s.meaning, 4),
    ]),
    ...(value.eventCategoryHeaders
      ? [
          `EventCategoryHeaders ${value.eventCategoryHeaders.map((n) => `"${n}"`).join(" > ")}`,
        ]
      : []),
    ...value.events.map(
      (e) =>
        `Event ${e.id} as "${e.name}"${e.categoryPath ? ` in ${e.categoryPath.map((n) => `"${n}"`).join(" > ")}` : ""}`,
    ),
    ...value.transitions.flatMap((t) =>
      "branches" in t
        ? [
            `Transition ${t.fromStateId} on ${t.eventId}:`,
            "    Common:",
            ...action(t.commonAction, 8),
            ...t.branches.flatMap((b) => [
              `    Branch "${b.condition}" -> ${b.targetStateId ?? "-"}:`,
              ...action(b.action, 8),
            ]),
          ]
        : [
            `Transition ${t.fromStateId} on ${t.eventId} -> ${t.targetStateId ?? "-"}:`,
            ...action(t.action, 4),
          ],
    ),
    ...(value.stateGroups ?? []).flatMap((g) => [
      `StateGroup ${g.id} as "${g.name}":`,
      ...g.stateIds.map((id) => `    ${id}`),
    ]),
  ].join("\n");
}

exports.run = async () => {
  const extension = vscode.extensions.all.find(
    (item) => item.packageJSON.name === "glitchstate",
  );
  assert.ok(extension);
  const api = await extension.activate();
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "glitchstate-groups-"),
  );
  const source = (value = groupPreviewModel) => groupPreviewSource(value);
  const document = async (name, value = groupPreviewModel) => {
    const uri = vscode.Uri.file(path.join(directory, name));
    await fs.writeFile(uri.fsPath, source(value));
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
        .flatMap((g) => g.tabs)
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
    let current;
    for (const name of ["編集1", "編集2", "閉じる前"]) {
      current = {
        ...groupPreviewModel,
        states: groupPreviewModel.states.map((s) =>
          s.id === "A" ? { ...s, name } : s,
        ),
      };
      await replace(doc, source(current));
    }
    await doc.save();
    assert.deepEqual((await rendered(api, open, uriIs(doc))).model, current);
    const before = { uri: doc.uri, version: doc.version };
    await closeTarget(doc);
    assert.equal(api.currentPreviewUri(), uri.toString());
    await fs.writeFile(uri.fsPath, source(repairedGroupPreviewModel));
    return before;
  };
  const checks = [
    /** REQ-033-S01 */
    async function groupDirtyUpdates() {
      const doc = await document("group-dirty.gls");
      assert.deepEqual((await show(doc)).model, groupPreviewModel);
      const { stateGroups: _, ...legacy } = groupPreviewModel;
      for (const next of [
        legacy,
        groupPreviewModel,
        {
          ...groupPreviewModel,
          stateGroups: [{ id: "G", name: "改名", stateIds: ["C", "B", "A"] }],
        },
        {
          ...groupPreviewModel,
          stateGroups: [
            { id: "G", name: "稼働系", stateIds: ["A", "C"] },
            { id: "H", name: "別", stateIds: ["B", "Y"] },
          ],
        },
        {
          ...groupPreviewModel,
          transitions: [
            groupPreviewModel.transitions[0],
            {
              fromStateId: "B",
              eventId: "RETRY",
              action: "別",
              targetStateId: null,
            },
          ],
        },
        repairedGroupPreviewModel,
      ]) {
        const data = await edit(doc, source(next));
        assert.deepEqual(data.model, next);
        assert.equal(data.hasErrors, false);
        assert.equal(doc.isDirty, true);
      }
      assert.equal(await fs.readFile(doc.uri.fsPath, "utf8"), source());
      single();
    },
    /** REQ-033-S02 */
    async function groupRepairAfterRetainedModel() {
      const doc = await document("group-repair.gls");
      assert.deepEqual((await show(doc)).model, groupPreviewModel);
      const bad = source().replace(
        "    C\n    B\n    A",
        "    C\n    MISSING\n    A",
      );
      const retained = await edit(doc, bad);
      assert.equal(retained.hasErrors, true);
      assert.deepEqual(retained.model, groupPreviewModel);
      const diagnostics = vscode.languages.getDiagnostics(doc.uri);
      assert.equal(diagnostics.length, 1);
      assert.equal(diagnostics[0].code, "reference");
      assert.equal(diagnostics[0].range.start.line, 24);
      assert.match(diagnostics[0].message, /MISSING/);
      const current = await edit(doc, source(repairedGroupPreviewModel));
      assert.deepEqual(current.model, repairedGroupPreviewModel);
      assert.equal(current.hasErrors, false);
      assert.deepEqual(vscode.languages.getDiagnostics(doc.uri), []);
      assert.equal(doc.isDirty, true);
      assert.equal(await fs.readFile(doc.uri.fsPath, "utf8"), source());
      single();
    },
    /** REQ-033-S05 */
    async function groupOtherDocument() {
      const a = await document("group-a.gls");
      await show(a);
      const badModel = {
        ...groupPreviewModel,
        stateGroups: [
          { id: "G", name: "不正", stateIds: ["C", "MISSING", "A"] },
        ],
      };
      const b = await document("group-b.gls", badModel);
      const notices = [];
      const subscription = api.onDidRenderPreview((data) => notices.push(data));
      try {
        await replace(b, source(badModel).replace('"不正"', '"別文書"'));
        assert.equal(api.currentPreviewUri(), a.uri.toString());
        assert.deepEqual(vscode.languages.getDiagnostics(b.uri), []);
        assert.deepEqual(
          (await rendered(api, open, uriIs(a))).model,
          groupPreviewModel,
        );
        assert.ok(notices.every((n) => n.uri === a.uri.toString()));
        const switched = await show(b);
        assert.equal(switched.model, null);
        assert.equal(switched.hasErrors, true);
        assert.equal(
          vscode.languages.getDiagnostics(b.uri)[0].range.start.line,
          24,
        );
        single();
      } finally {
        subscription.dispose();
      }
    },
    /** REQ-033-S04 */
    async function groupUpdateAfterReopen() {
      const before = await prepareReopen("group-reopen-edit.gls");
      const doc = await vscode.workspace.openTextDocument(before.uri);
      assert.ok(doc.version + 1 < before.version);
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      const next = {
        ...repairedGroupPreviewModel,
        stateGroups: [
          { id: "G", name: "再オープン編集", stateIds: ["B", "C"] },
        ],
      };
      const data = await edit(doc, source(next));
      assert.ok(data.version < before.version);
      assert.deepEqual(data.model, next);
      assert.equal(doc.isDirty, true);
      single();
    },
    /** REQ-033-S04 */
    async function groupCommandAfterReopen() {
      const before = await prepareReopen("group-reopen-command.gls");
      const doc = await vscode.workspace.openTextDocument(before.uri);
      assert.ok(doc.version < before.version);
      const data = await show(doc);
      assert.ok(data.version < before.version);
      assert.deepEqual(data.model, repairedGroupPreviewModel);
      single();
    },
  ];
  const errors = [];
  try {
    for (const check of checks) {
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
    throw new AggregateError(errors, "状態グループの統合テストが失敗した");
};
