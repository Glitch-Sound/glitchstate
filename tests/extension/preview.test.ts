import { afterEach, beforeEach, expect, test, vi } from "vitest";

const host = vi.hoisted(() => {
  function channel() {
    const listeners = new Set<(value: unknown) => void>();
    return {
      event: (listener: (value: unknown) => void) => {
        listeners.add(listener);
        return { dispose: () => listeners.delete(listener) };
      },
      emit: (value?: unknown) => {
        for (const listener of listeners) listener(value);
      },
      clear: () => listeners.clear(),
    };
  }
  const changed = channel();
  const closed = channel();
  const commands = new Map<string, () => unknown>();
  const panels: ReturnType<typeof panel>[] = [];
  function panel() {
    const incoming = channel();
    const disposed = channel();
    const visibility = channel();
    return {
      visible: true,
      incoming,
      disposed,
      visibility,
      webview: {
        html: "",
        cspSource: "vscode-resource:",
        asWebviewUri: (uri: unknown) => uri,
        onDidReceiveMessage: incoming.event,
        postMessage: vi.fn(async (_data: unknown) => true),
      },
      reveal: vi.fn(),
      onDidDispose: disposed.event,
      onDidChangeViewState: visibility.event,
      dispose: () => disposed.emit(),
    };
  }
  const diagnostics = new Map<string, unknown[]>();
  const api = {
    window: {
      activeTextEditor: undefined as
        | undefined
        | { document: ReturnType<typeof doc> },
      createWebviewPanel: vi.fn(() => {
        const p = panel();
        panels.push(p);
        return p;
      }),
    },
    commands: {
      registerCommand: (id: string, handler: () => unknown) => {
        commands.set(id, handler);
        return { dispose: () => commands.delete(id) };
      },
    },
    workspace: {
      onDidChangeTextDocument: changed.event,
      onDidCloseTextDocument: closed.event,
    },
    languages: {
      createDiagnosticCollection: () => ({
        set: (uri: { toString(): string }, values: unknown[]) =>
          diagnostics.set(uri.toString(), values),
        delete: (uri: { toString(): string }) =>
          diagnostics.delete(uri.toString()),
        dispose: () => diagnostics.clear(),
      }),
    },
    Uri: {
      joinPath: (_base: unknown, ...parts: string[]) => ({
        fsPath: parts.join("/"),
        toString: () => parts.join("/"),
      }),
    },
    ViewColumn: { Beside: 2 },
    DiagnosticSeverity: { Error: 0 },
    Range: class {
      start;
      end;
      constructor(a: number, b: number, c: number, d: number) {
        this.start = { line: a, character: b };
        this.end = { line: c, character: d };
      }
    },
    Diagnostic: class {
      code?: string;
      source?: string;
      constructor(
        public range: unknown,
        public message: string,
        public severity: number,
      ) {}
    },
    EventEmitter: class {
      private channel = channel();
      event = this.channel.event;
      fire(value: unknown) {
        this.channel.emit(value);
      }
      dispose() {
        this.channel.clear();
      }
    },
  };
  function doc(name = "a.gls", stateName = "開始待ち") {
    return {
      uri: { toString: () => `file:///${name}` },
      fileName: name,
      version: 1,
      isClosed: false,
      text: `State IDLE as "${stateName}" color "#4F46E5":\n    開始を待つ状態`,
      getText() {
        return this.text;
      },
      lineAt() {
        return { text: this.text.split("\n")[0] };
      },
    };
  }
  return {
    api,
    commands,
    panels,
    changed,
    closed,
    diagnostics,
    doc,
    reset() {
      panels.length = 0;
      commands.clear();
      changed.clear();
      closed.clear();
      diagnostics.clear();
      api.window.createWebviewPanel.mockClear();
      api.window.activeTextEditor = undefined;
    },
  };
});

vi.mock("vscode", () => host.api);
vi.mock("node:fs", () => ({
  readFileSync: () => "<html><head></head><body></body></html>",
}));

import { activate } from "../../src/extension/extension";

let subscriptions: { dispose(): unknown }[];
beforeEach(() => {
  host.reset();
  subscriptions = [];
  activate({ subscriptions, extensionUri: {} } as never);
});
afterEach(() => {
  for (const item of subscriptions.reverse()) item.dispose();
});

async function open(document = host.doc()) {
  host.api.window.activeTextEditor = { document };
  await host.commands.get("glitchstate.openPreview")?.();
  host.panels[0]?.incoming.emit({ type: "glitchstate.ready" });
  return host.panels[0];
}

test("REQ-003-S01 未保存の文書本文をプレビューへ渡す", async () => {
  const panel = await open();
  expect(panel.webview.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      uri: "file:///a.gls",
      version: 1,
      model: {
        events: [],
        transitions: [],
        states: [
          {
            id: "IDLE",
            name: "開始待ち",
            meaning: "開始を待つ状態",
            color: "#4F46E5",
          },
        ],
      },
      hasErrors: false,
    }),
  );
});

test("REQ-003-S02 パネルを再利用して別文書へ切り替える", async () => {
  const panel = await open();
  await open(host.doc("b.gls", "実行中"));
  await open(host.doc("b.gls", "実行中"));
  expect(host.panels).toHaveLength(1);
  expect(panel.webview.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      uri: "file:///b.gls",
      model: {
        events: [],
        transitions: [],
        states: [
          {
            id: "IDLE",
            name: "実行中",
            meaning: "開始を待つ状態",
            color: "#4F46E5",
          },
        ],
      },
    }),
  );
});

test.each([undefined, host.doc("a.txt")])(
  "REQ-003-S03 対象外の文書では作成や切り替えをしない",
  async (document) => {
    host.api.window.activeTextEditor = document ? { document } : undefined;
    await host.commands.get("glitchstate.openPreview")?.();
    expect(host.panels).toHaveLength(0);
    const panel = await open();
    panel.webview.postMessage.mockClear();
    host.api.window.activeTextEditor = document ? { document } : undefined;
    await host.commands.get("glitchstate.openPreview")?.();
    expect(host.panels).toHaveLength(1);
    expect(panel.webview.postMessage).not.toHaveBeenCalled();
  },
);

test("REQ-003-S01 不正な通知を無視する", async () => {
  host.api.window.activeTextEditor = { document: host.doc() };
  await host.commands.get("glitchstate.openPreview")?.();
  const panel = host.panels[0];
  for (const message of [
    null,
    {},
    { type: "glitchstate.ready", command: "other" },
    { type: "glitchstate.rendered", uri: 4 },
  ])
    panel.incoming.emit(message);
  expect(panel.webview.postMessage).not.toHaveBeenCalled();
  panel.incoming.emit({ type: "glitchstate.ready" });
  expect(panel.webview.postMessage).toHaveBeenCalledTimes(1);
});

test("REQ-003-S02 再表示で最新の通知を送り直す", async () => {
  const panel = await open();
  panel.webview.postMessage.mockClear();
  panel.visibility.emit({ webviewPanel: panel });
  expect(panel.webview.postMessage).toHaveBeenCalledTimes(1);
});

const first = 'State Z_LAST as "待機" color "#4F46E5":\n    開始を待つ状態';
const second = 'State A_FIRST as "実行中" color "#22c55e":\n    処理中';
const initialStates = [
  { id: "Z_LAST", name: "待機", meaning: "開始を待つ状態", color: "#4F46E5" },
  { id: "A_FIRST", name: "実行中", meaning: "処理中", color: "#22c55e" },
];
const edits = [
  {
    text: `${first.replace("待機", "開始待ち")}\n${second}`,
    expected: [{ ...initialStates[0], name: "開始待ち" }, initialStates[1]],
  },
  {
    text: `${first.replace("開始を待つ状態", "要求の到着を待つ")}\n${second}`,
    expected: [
      { ...initialStates[0], meaning: "要求の到着を待つ" },
      initialStates[1],
    ],
  },
  {
    text: `${first.replace("#4F46E5", "#FF8800")}\n${second}`,
    expected: [{ ...initialStates[0], color: "#FF8800" }, initialStates[1]],
  },
  {
    text: `${second}\n${first}`,
    expected: [initialStates[1], initialStates[0]],
  },
  {
    text: `${first}\nState NEW as "追加" color "#000000":\n    追加状態\n${second}`,
    expected: [
      initialStates[0],
      { id: "NEW", name: "追加", meaning: "追加状態", color: "#000000" },
      initialStates[1],
    ],
  },
  { text: second, expected: [initialStates[1]] },
];

test.each(edits)(
  "REQ-005-S01 各項目と順序を保存前に更新: $text",
  async ({ text, expected }) => {
    const doc = host.doc();
    doc.text = `${first}\n${second}`;
    const panel = await open(doc);
    doc.text = text;
    doc.version++;
    host.changed.emit({ document: doc });
    expect(panel.webview.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        version: 2,
        model: { states: expected, events: [], transitions: [] },
      }),
    );
  },
);

test("REQ-005-S02 別の文書の変更を混入させない", async () => {
  const panel = await open();
  const previous = panel.webview.postMessage.mock.calls.slice();
  host.changed.emit({ document: host.doc("b.gls", "別の状態") });
  expect(panel.webview.postMessage.mock.calls).toEqual(previous);
});

test("REQ-005-S03 古い文書の結果を採用しない", async () => {
  const doc = host.doc();
  const panel = await open(doc);
  const stale = host.doc("a.gls", "古い結果");
  doc.text = doc.text.replace("開始待ち", "最新の状態");
  doc.version = 2;
  host.changed.emit({ document: doc });
  host.changed.emit({ document: stale });
  expect(panel.webview.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      version: 2,
      model: {
        events: [],
        transitions: [],
        states: [
          {
            id: "IDLE",
            name: "最新の状態",
            meaning: "開始を待つ状態",
            color: "#4F46E5",
          },
        ],
      },
    }),
  );
});

test("REQ-005-S04 準備完了前の編集を最新の通知にする", async () => {
  const doc = host.doc("a.gls", "待機");
  host.api.window.activeTextEditor = { document: doc };
  await host.commands.get("glitchstate.openPreview")?.();
  doc.text = doc.text.replace("待機", "開始待ち");
  doc.version++;
  host.changed.emit({ document: doc });
  host.panels[0].incoming.emit({ type: "glitchstate.ready" });
  expect(host.panels[0].webview.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      version: 2,
      model: {
        events: [],
        transitions: [],
        states: [
          {
            id: "IDLE",
            name: "開始待ち",
            meaning: "開始を待つ状態",
            color: "#4F46E5",
          },
        ],
      },
    }),
  );
});

test("REQ-006-S01 エラー行を通知し正常な表を保つ", async () => {
  const doc = host.doc("a.gls", "待機");
  const panel = await open(doc);
  doc.text = doc.text.replace("#4F46E5", "red");
  doc.version++;
  host.changed.emit({ document: doc });
  expect(host.diagnostics.get("file:///a.gls")).toEqual([
    expect.objectContaining({
      code: "color",
      message: expect.stringContaining("カラー"),
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: doc.text.split("\n")[0].length },
      },
    }),
  ]);
  expect(panel.webview.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      version: 2,
      hasErrors: true,
      model: {
        events: [],
        transitions: [],
        states: [
          {
            id: "IDLE",
            name: "待機",
            meaning: "開始を待つ状態",
            color: "#4F46E5",
          },
        ],
      },
    }),
  );
});

test("REQ-006-S02 初回のエラーで別URIのモデルを使わない", async () => {
  const panel = await open();
  const invalid = host.doc("b.gls");
  invalid.text = 'State OTHER as "不正" color "#000000":';
  await open(invalid);
  expect(panel.webview.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      uri: "file:///b.gls",
      model: null,
      hasErrors: true,
    }),
  );
  expect(host.diagnostics.get("file:///b.gls")).toEqual([
    expect.objectContaining({
      code: "meaning",
      range: expect.objectContaining({ start: { line: 0, character: 0 } }),
    }),
  ]);
});

test("REQ-006-S03 修正で表と診断を回復する", async () => {
  const doc = host.doc();
  doc.text = doc.text.replace("#4F46E5", "red");
  const panel = await open(doc);
  doc.text = doc.text.replace("red", "#0088FF");
  doc.version++;
  host.changed.emit({ document: doc });
  expect(host.diagnostics.get("file:///a.gls")).toEqual([]);
  expect(panel.webview.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      version: 2,
      hasErrors: false,
      model: {
        events: [],
        transitions: [],
        states: [
          {
            id: "IDLE",
            name: "開始待ち",
            meaning: "開始を待つ状態",
            color: "#0088FF",
          },
        ],
      },
    }),
  );
});

test("REQ-006-S01 正常な空のモデルを保持する", async () => {
  const doc = host.doc();
  const panel = await open(doc);
  doc.text = "";
  doc.version++;
  host.changed.emit({ document: doc });
  doc.text = "State";
  doc.version++;
  host.changed.emit({ document: doc });
  expect(panel.webview.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      hasErrors: true,
      model: { states: [], events: [], transitions: [] },
    }),
  );
});

test("REQ-006-S01 文書を切り替えてもURIごとに正常な表を保つ", async () => {
  const a = host.doc("a.gls", "Aの状態");
  const panel = await open(a);
  await open(host.doc("b.gls", "Bの状態"));
  a.text = a.text.replace("#4F46E5", "red");
  a.version++;
  await open(a);
  expect(panel.webview.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      uri: "file:///a.gls",
      hasErrors: true,
      model: {
        events: [],
        transitions: [],
        states: [
          {
            id: "IDLE",
            name: "Aの状態",
            meaning: "開始を待つ状態",
            color: "#4F46E5",
          },
        ],
      },
    }),
  );
});

test("REQ-005-S03 遅れた古いエラーで現在の診断を上書きしない", async () => {
  const doc = host.doc();
  await open(doc);
  const stale = host.doc();
  stale.text = stale.text.replace("#4F46E5", "red");
  doc.version = 2;
  host.changed.emit({ document: doc });
  host.changed.emit({ document: stale });
  expect(host.diagnostics.get("file:///a.gls")).toEqual([]);
});

test("REQ-006-S02 文書を閉じた後の再利用でキャッシュを持ち込まない", async () => {
  const doc = host.doc();
  const panel = await open(doc);
  host.closed.emit(doc);
  const reopened = host.doc();
  reopened.text = "State";
  await open(reopened);
  expect(panel.webview.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ model: null }),
  );
});

test("REQ-005-S03 解析途中で新しい版が到着した場合に古い診断を採用しない", async () => {
  const doc = host.doc();
  const panel = await open(doc);
  const newer = host.doc("a.gls", "新しい版");
  newer.version = 2;
  doc.getText = () => {
    host.changed.emit({ document: newer });
    return 'State IDLE as "古い版" color "red":\n    古いエラー';
  };
  host.changed.emit({ document: doc });
  expect(host.diagnostics.get("file:///a.gls")).toEqual([]);
  expect(panel.webview.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      version: 2,
      model: {
        events: [],
        transitions: [],
        states: [
          {
            id: "IDLE",
            name: "新しい版",
            meaning: "開始を待つ状態",
            color: "#4F46E5",
          },
        ],
      },
    }),
  );
});

test("REQ-005-S05 小さい版番号で再オープンした後も自動更新する", async () => {
  const previous = host.doc("a.gls", "閉じる前");
  previous.version = 9;
  const panel = await open(previous);
  const oldSequence = panel.webview.postMessage.mock.lastCall?.[0] as {
    sequence: number;
  };
  previous.isClosed = true;
  host.closed.emit(previous);
  const reopened = host.doc("a.gls", "再オープンした状態");
  host.api.window.activeTextEditor = { document: reopened };
  reopened.text = reopened.text.replace(
    "再オープンした状態",
    "再オープン後の編集",
  );
  reopened.version = 2;
  host.changed.emit({ document: reopened });
  expect(reopened.version).toBeLessThan(previous.version);
  expect(host.panels).toHaveLength(1);
  expect(panel.webview.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      uri: "file:///a.gls",
      version: 2,
      sequence: oldSequence.sequence + 1,
      model: {
        events: [],
        transitions: [],
        states: [
          {
            id: "IDLE",
            name: "再オープン後の編集",
            meaning: "開始を待つ状態",
            color: "#4F46E5",
          },
        ],
      },
    }),
  );
});

test("REQ-003-S04 小さい版番号で再オープンした文書をコマンドで表示する", async () => {
  const previous = host.doc("a.gls", "閉じる前");
  previous.version = 9;
  const panel = await open(previous);
  const oldSequence = panel.webview.postMessage.mock.lastCall?.[0] as {
    sequence: number;
  };
  previous.isClosed = true;
  host.closed.emit(previous);
  const reopened = host.doc("a.gls", "再オープンした状態");
  await open(reopened);
  expect(reopened.version).toBeLessThan(previous.version);
  expect(host.panels).toHaveLength(1);
  expect(panel.webview.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      uri: "file:///a.gls",
      version: 1,
      sequence: oldSequence.sequence + 1,
      model: {
        events: [],
        transitions: [],
        states: [
          {
            id: "IDLE",
            name: "再オープンした状態",
            meaning: "開始を待つ状態",
            color: "#4F46E5",
          },
        ],
      },
    }),
  );
});

const eventSource = 'Event Z_START as "開始"\nEvent A_STOP as "停止"';
const transitionSource = "Transition Z_LAST on Z_START -> -:\n    記録する";
const flowSource = `${first}\n${second}\n${eventSource}\n${transitionSource}`;
const flowEvents = [
  { id: "Z_START", name: "開始" },
  { id: "A_STOP", name: "停止" },
];
const flowTransition = {
  fromStateId: "Z_LAST",
  eventId: "Z_START",
  action: "記録する",
  targetStateId: null,
};
const flowModel = {
  states: initialStates,
  events: flowEvents,
  transitions: [flowTransition],
};
const flowEdits = [
  {
    source: flowSource.replace('as "開始"', 'as "開始要求"'),
    expected: {
      ...flowModel,
      events: [{ id: "Z_START", name: "開始要求" }, flowEvents[1]],
    },
  },
  {
    source: flowSource.replace("記録する", "実行する"),
    expected: {
      ...flowModel,
      transitions: [{ ...flowTransition, action: "実行する" }],
    },
  },
  {
    source: flowSource.replace("-> -:", "-> A_FIRST:"),
    expected: {
      ...flowModel,
      transitions: [{ ...flowTransition, targetStateId: "A_FIRST" }],
    },
  },
  {
    source: flowSource
      .replace("待機", "開始待ち")
      .replace("#4F46E5", "#FF8800"),
    expected: {
      ...flowModel,
      states: [
        { ...initialStates[0], name: "開始待ち", color: "#FF8800" },
        initialStates[1],
      ],
    },
  },
  {
    source: `${second}\n${first}\n${eventSource}\n${transitionSource}`,
    expected: { ...flowModel, states: [initialStates[1], initialStates[0]] },
  },
  {
    source: flowSource.replace(
      eventSource,
      'Event A_STOP as "停止"\nEvent Z_START as "開始"',
    ),
    expected: { ...flowModel, events: [flowEvents[1], flowEvents[0]] },
  },
  {
    source: `${flowSource}\nEvent NEW as "追加"`,
    expected: {
      ...flowModel,
      events: [...flowEvents, { id: "NEW", name: "追加" }],
    },
  },
  {
    source: flowSource.replace('\nEvent A_STOP as "停止"', ""),
    expected: { ...flowModel, events: [flowEvents[0]] },
  },
  {
    source: `${flowSource}\nState NEW as "追加" color "#000000":\n    新しい状態`,
    expected: {
      ...flowModel,
      states: [
        ...initialStates,
        { id: "NEW", name: "追加", color: "#000000", meaning: "新しい状態" },
      ],
    },
  },
  {
    source: flowSource.replace(`${second}\n`, ""),
    expected: { ...flowModel, states: [initialStates[0]] },
  },
  {
    source: `${flowSource}\nTransition A_FIRST on A_STOP -> Z_LAST:\n    停止する`,
    expected: {
      ...flowModel,
      transitions: [
        flowTransition,
        {
          fromStateId: "A_FIRST",
          eventId: "A_STOP",
          action: "停止する",
          targetStateId: "Z_LAST",
        },
      ],
    },
  },
  {
    source: flowSource.replace(`\n${transitionSource}`, ""),
    expected: { ...flowModel, transitions: [] },
  },
];

test.each(flowEdits)(
  "REQ-013-S01 保存前の各編集を同じモデルで送る: $source",
  async ({ source, expected }) => {
    const document = host.doc();
    document.text = flowSource;
    const panel = await open(document);
    document.text = source;
    document.version++;
    host.changed.emit({ document });
    expect(panel.webview.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        version: 2,
        model: expected,
        hasErrors: false,
      }),
    );
  },
);

test("REQ-013-S02 参照エラーでは状態も処理も最後の正常モデルに保つ", async () => {
  const document = host.doc();
  document.text = flowSource;
  const panel = await open(document);
  document.text = flowSource
    .replace("待機", "編集途中")
    .replace("記録する", "途中の処理")
    .replace("-> -:", "-> MISSING:");
  document.version++;
  host.changed.emit({ document });
  expect(panel.webview.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ model: flowModel, hasErrors: true }),
  );
  expect(host.diagnostics.get("file:///a.gls")).toEqual([
    expect.objectContaining({
      code: "reference",
      message: "遷移先状態ID MISSING は未宣言",
      range: expect.objectContaining({ start: { line: 6, character: 0 } }),
    }),
  ]);
});

test("REQ-013-S03 別URIの初回参照エラーに正常モデルを持ち込まない", async () => {
  const a = host.doc();
  a.text = flowSource;
  const panel = await open(a);
  const b = host.doc("b.gls");
  b.text = flowSource.replace("-> -:", "-> MISSING:");
  await open(b);
  expect(host.panels).toHaveLength(1);
  expect(panel.webview.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      uri: "file:///b.gls",
      model: null,
      hasErrors: true,
    }),
  );
});

test("REQ-013-S04 解析中の新しい状態と処理を古い結果で上書きしない", async () => {
  const document = host.doc();
  document.text = flowSource;
  const panel = await open(document);
  const newer = host.doc();
  newer.version = 2;
  newer.text = flowSource
    .replace("待機", "最新")
    .replace("記録する", "最新の処理");
  document.getText = () => {
    host.changed.emit({ document: newer });
    return flowSource.replace("-> -:", "-> MISSING:");
  };
  host.changed.emit({ document });
  expect(panel.webview.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      version: 2,
      hasErrors: false,
      model: {
        ...flowModel,
        states: [{ ...initialStates[0], name: "最新" }, initialStates[1]],
        transitions: [{ ...flowTransition, action: "最新の処理" }],
      },
    }),
  );
  expect(host.diagnostics.get("file:///a.gls")).toEqual([]);
});

test("REQ-013-S06 参照修正後に現在の状態と処理を送信して診断を消す", async () => {
  const document = host.doc();
  document.text = flowSource
    .replace("待機", "復旧後")
    .replace("記録する", "復旧の処理")
    .replace("-> -:", "-> MISSING:");
  const panel = await open(document);
  document.text = document.text.replace("MISSING", "A_FIRST");
  document.version++;
  host.changed.emit({ document });
  expect(panel.webview.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      model: {
        ...flowModel,
        states: [{ ...initialStates[0], name: "復旧後" }, initialStates[1]],
        transitions: [
          { ...flowTransition, action: "復旧の処理", targetStateId: "A_FIRST" },
        ],
      },
      hasErrors: false,
    }),
  );
  expect(host.diagnostics.get("file:///a.gls")).toEqual([]);
});

for (const command of [false, true]) {
  test(`REQ-013-S05 再オープン後の両表モデルを更新する: command=${command}`, async () => {
    const previous = host.doc();
    previous.text = flowSource;
    previous.version = 9;
    const panel = await open(previous);
    previous.isClosed = true;
    host.closed.emit(previous);
    const reopened = host.doc();
    reopened.text = flowSource
      .replace("待機", "再オープン")
      .replace("記録する", "新しい処理");
    host.api.window.activeTextEditor = { document: reopened };
    if (command) await open(reopened);
    else {
      reopened.version = 2;
      host.changed.emit({ document: reopened });
    }
    expect(reopened.version).toBeLessThan(previous.version);
    expect(host.panels).toHaveLength(1);
    expect(panel.webview.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        version: command ? 1 : 2,
        sequence: 2,
        hasErrors: false,
        model: {
          ...flowModel,
          states: [
            { ...initialStates[0], name: "再オープン" },
            initialStates[1],
          ],
          transitions: [{ ...flowTransition, action: "新しい処理" }],
        },
      }),
    );
  });
}
