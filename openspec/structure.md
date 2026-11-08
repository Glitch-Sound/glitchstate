# 構成

コードと文書をどこに置くかを定める。\
技術の選定は tech.md に書き、ここには書かない。

## ディレクトリ構成

```text
<ルート>/
├── src/
│   ├── core/               # DSL解析、検証、共通モデル
│   │   ├── model/          # 状態・イベント・遷移の型
│   │   ├── parser/         # DSL構文解析
│   │   └── validator/      # 定義と参照の検証
│   │
│   ├── preview-protocol/   # ExtensionとWebviewの通信契約
│   │
│   ├── extension/          # VS Code拡張本体
│   │
│   └── webview/            # プレビュー画面
│       ├── app/            # Webviewの起動、初期化
│       ├── pages/
│       │   └── preview/    # 統合プレビュー画面
│       │       ├── model/  # 図と表のモデル変換、図の配置、調整値
│       │       └── ui/     # 状態定義表、状態遷移図、状態遷移表の画面部品
│       └── shared/         # 実際に複数箇所で使う部品
│
├── syntaxes/               # .gls構文ハイライト
├── examples/               # DSLサンプル
├── tests/
│   ├── core/               # 解析・検証の単体テスト
│   ├── webview/            # UIのコンポーネントテスト
│   ├── visual/             # 見た目・描画のテスト
│   └── extension/          # VS Code連携の単体テストと統合テスト
│
├── .agents/skills/         # Codex 向けのスキル(OpenSpec が生成する)
├── .claude/skills/         # Claude Code 向けのスキル(OpenSpec が生成する)
├── .github/skills/         # GitHub Copilot 向けのスキル(OpenSpec が生成する)
├── .githooks/              # コミット前のフック
├── .vscode/                # VS Code の設定
├── openspec/               # 仕様と変更の管理
│   ├── changes/            # 進行中の変更と、アーカイブした変更
│   ├── schemas/            # 成果物の作り方(共通 schema)
│   └── specs/              # 正式仕様
├── scripts/                # 検査スクリプト(テンプレートの共通部分)
├── dist/                   # ビルド成果物(コミットしない)
├── biome.json              # フォーマットと静的解析
├── playwright.config.ts    # UI・視覚テスト
├── pnpm-lock.yaml          # プロダクトと開発用依存の固定
├── pnpm-workspace.yaml     # pnpmのインストール設定
├── steiger.config.ts       # WebviewのFSDルール
├── tsconfig.json           # TypeScriptの型検査
├── vite.config.ts          # Webviewのビルド
├── vitest.config.ts        # 単体テスト
├── AGENTS.md               # 開発エージェント向けの指示
├── CLAUUDE.md              # Claude Code に AGENTS.md を読み込ませる
├── README.md               # プロジェクトの説明とセットアップ
└── package.json            # 拡張機能、依存、ビルドと全体検証の定義
```

スキルのフォルダは、使う AI ツールのものだけができる。

## 配置原則

- 責務ごとにディレクトリを分ける。
- 上の構成にない置き場所は、先に決めておかず、必要になった change の設計判断で決める。\
  その判断の昇格を `openspec/structure.md の ディレクトリ構成` とし、上の構成に追記する。\
  直接変更で決めた場合は、同じ変更で追記する。
- テストは、テスト対象のコードとの対応が分かる場所に置く。
- 共通化は、複数の箇所で実際に使われてから行う。
- 用途の曖昧な置き場所(utils、common など)を作らない。

## 依存方向

- 依存は、外側(画面、CLI、API の入口)から内側(業務の処理)への一方向とする。
- 内側は、外側や外部サービスに直接依存しない。
- 機能どうしの直接の依存は避け、受け渡すデータの形を決めて連携する。
- 共通の部分は、個別の機能に依存しない。
- 循環する依存を作らない。
- CoreはExtensionおよびWebviewに依存しない。
- ExtensionはCoreの公開インターフェースを利用する。
- WebviewはCoreで定義された共通モデルを利用する。
- ExtensionとWebviewの通信はVS CodeのメッセージAPIを経由する。
- React Flowへの依存はWebview内に限定する。
- Webview内の状態定義・状態遷移図・状態遷移表は、互いの内部実装に依存しない。
- 表示領域間の連携は共通の選択状態とモデルを介して行う。

依存方向の例外が必要な場合は、理由とともにここに記録する。

## 命名規則

言語ごとの標準的な規約に従う。\
規約から外れる決まりや、プロジェクト固有の決まりがあれば、次の表に追加する。

| 対象 | 規則 | 例 |
| --- | --- | --- |
| DSLファイル | `.gls` | `order-state.gls` |
| 言語ID | `glitchstate` | `glitchstate` |
| TextMate Scope | `source.gls` | `source.gls` |
| TypeScriptファイル | kebab-case | `preview-panel.ts` |
| Reactコンポーネント | PascalCase | `StateDiagram.tsx` |
| TypeScript型 | PascalCase | `StateTransition` |
| 関数・変数 | camelCase | `parseDocument` |
| 定数 | UPPER_SNAKE_CASE | `DEFAULT_ZOOM` |
| VS Codeコマンド | `glitchstate.*` | `glitchstate.openPreview` |
| VS Code設定 | `glitchstate.*` | `glitchstate.preview.autoOpen` |
