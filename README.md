# GlitchState

状態定義・状態遷移図・状態遷移表を、単一のDSLから一体的に設計・可視化するVS Code拡張機能。

## セットアップ

### 必要なもの

- Node.js 22.12以上
- Corepackとpnpm
- Visual Studio Code

### 手順

1. `corepack pnpm install --frozen-lockfile` で依存をインストールする。
2. `npx --no-install playwright install chromium`でテスト用のChromiumを取得する。
3. VS Codeを起動できるデスクトップ環境で`npm run check:product`を実行し、プロダクトの検査を行う。
4. VS Codeでプロジェクトを開き、`F5`でExtension Development Hostを起動する。
5. `.gls`のサンプルを開き、コマンドパレットから`GlitchState: プレビューを開く`を実行する。

## 使い方

`.gls`ファイルを開き、コマンドパレットから`GlitchState: プレビューを開く`を実行する。\
単一のプレビューに色、状態、意味の3列の状態定義表が表示され、色列には指定した色の色見本だけを表示する。\
保存前の変更も自動で反映され、別の文書をプレビューする場合は、その文書をアクティブにして同じコマンドを実行する。

```gls
State IDLE as "待機" color "#4F46E5":
    開始を待つ状態

State RUNNING as "実行中" color "#22C55E":
    処理を実行している状態
```

- 状態ID、状態名、カラー、意味はすべて必須である。
- IDは英字または`_`で始まり、以後に英数字または`_`を使える。\
  大文字と小文字を区別し、同じ文書内で重複させない。
- 状態名は二重引用符で囲み、空白だけの名前、名前の途中の改行と二重引用符は使えない。\
  エスケープ構文はなく、同じ表示名の状態は別のIDで定義できる。
- カラーは`#`と6桁の16進数字で指定する。
- 意味は次の行から半角空白4個で下げ、1行以上の内容を記述する。\
  複数行の意味は表でも改行され、空白だけの行は無視する。
- 状態は定義した順に表示する。

[状態定義のサンプル](examples/order-state.gls)から試せる。\
構文や定義の誤りはVS CodeのProblemsに表示し、同じ文書の最後の正常な表を保持する。\
正常な内容をまだ表示していない場合は、解析エラーで表示できないことを案内する。\
修正すると保存前でも表と診断が更新される。

## 開発

この節は、OpenSpec を使った開発のためのものである。\
OpenSpec の部分を切り離して納品する場合は、納品物からこの節を削除する。

### 開発に必要なもの

- Node.js 22.12以上、Corepack、pnpm
- git(コミット前のフックで全体検証を実行する)

### OpenSpec のグローバル設定

OpenSpec が生成するワークフローは、マシンごとのグローバル設定で決まる。\
生成されるファイルを全員で一致させるため、各マシンで最初に1回だけ次を実行する。

```sh
npx --no-install openspec config set profile custom
npx --no-install openspec config set workflows '["explore","ff","apply","update","verify","sync","archive"]'
npx --no-install openspec config set delivery skills
```

Windows PowerShell 5.1 では、2行目が `expected array, received string` で失敗することがある。\
その場合は `npx --no-install openspec config profile` を実行し、対話の画面で上と同じワークフローと配信方法(skills)を選ぶ。\
設定は `npx --no-install openspec config list` で確認できる。

### 開発の準備

1. セットアップの手順で、プロダクトと開発用の依存を入れる。
2. OpenSpecのグローバル設定を行う。
3. `git config core.hooksPath .githooks` で、コミット前のフックを有効にする。
4. `npm run check` で、全体検証が成功することを確かめる。

プロダクトだけの検査は `npm run check:product` で実行する。\
単体テストは `corepack pnpm test`、ブラウザーテストは `corepack pnpm test:visual`、VS Code統合テストは `corepack pnpm test:extension` で実行する。\
初回は`npx --no-install playwright install chromium`でブラウザーテスト用のChromiumを取得する。\
プロダクトの検査にはこれらのテストも含み、VS Codeを起動できるデスクトップ環境で実行する。\
統合テストは初回にVS Codeのテスト用バイナリを取得する。

全体検証は、プロダクトの検査と OpenSpec の検査をまとめて実行し、コミットの前にフックで自動で実行される。\
AI ツール向けの生成されたファイル(`.github/skills/`、`.claude/skills/`、`.agents/skills/` のうち、使うツールのもの)はコミットし、手で編集しない。\
OpenSpec を更新した後は、`npx --no-install openspec update` で生成し直す。

### 参照する文書

- プロダクトの目的と範囲: [product.md](openspec/product.md)
- 開発の進め方: [AGENTS.md](AGENTS.md)
- 仕様書の一覧: [openspec/specs/README.md](openspec/specs/README.md)
