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
単一のプレビューに状態定義表、状態遷移図、状態遷移表を上から順に表示する。\
状態定義表は色、状態、意味の3列で、色列には指定した色の色見本だけを表示する。\
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
構文や定義の誤りはVS CodeのProblemsに表示し、同じ文書の最後の正常な図と両方の表を保持する。\
正常な内容をまだ表示していない場合は、解析エラーで表示できないことを案内する。\
修正すると保存前でも図、両方の表と診断が更新される。

### 基本状態遷移図

状態定義表と状態遷移表の間に、状態名と指定カラーを持つノードを表示する。\
遷移のない状態も表示し、状態の定義順を基準に自動配置する。\
状態間の遷移は淡い矢印で示し、イベント名と処理のラベルは図に表示しない。

- 同じ遷移元と遷移先を持つ定義は、イベントが異なっていても1本の矢印にまとめる。
- 逆方向の遷移は別の矢印、自状態への遷移は自己ループとして表示する。
- 遷移なしと未定義の組み合わせには矢印を作らない。
- 図の中をドラッグして表示範囲を移動でき、ホイールで拡大縮小できる。
- ノードの移動、接続編集、選択連動、グループ、操作ボタン、画像保存には対応しない。
- 状態がない場合は、図の代わりに案内を表示する。

### 基本状態遷移表

同じ`.gls`にイベントと遷移を追加すると、状態遷移図の下に状態遷移表を表示する。\
イベントを定義順の行、状態を定義順の列に並べ、状態ヘッダの文字色に状態カラーを使う。\
定義済みセルは処理を上段、遷移先の状態名を下段にラベルなしで表示し、定義のない組み合わせは赤文字の`未定義`で示す。

```gls
Event START as "開始"
Event STOP as "停止"

Transition IDLE on START -> RUNNING:
    開始を記録する
    実行を準備する

Transition RUNNING on STOP -> IDLE:
    -

Transition IDLE on STOP -> -:
    -
```

この例は、上の状態定義に追記して使う。\
STARTとRUNNINGの組み合わせは未定義である。\
IDLEとSTOPは明示的な処理なし、遷移なしであり、上下に`-`を表示する定義済みセルになる。

- イベントは`Event <ID> as "<イベント名>"`で宣言する。\
  IDと名前の制約は状態と同じで、状態とイベントのIDは別に管理する。\
  同じ名前のイベントも異なるIDで定義できる。
- 遷移は`Transition <遷移元状態ID> on <イベントID> -> <遷移先>:`で宣言する。\
  参照には宣言済みのIDを使い、状態、イベント、遷移の宣言の前後関係は問わない。
- 処理は意味と同じく半角空白4個で下げた1行以上の本文とする。\
  本文の非空行が`-`だけの1行なら処理なしになり、遷移先の`-`は遷移なしになる。\
  処理なしの`-`と他の本文行は混在できず、処理本文自体の省略はできない。
- 自状態のIDを遷移先に指定すると、その状態への明示的な遷移になる。\
  遷移なしの`-`とは区別する。
- 同じイベントIDの重複、同じ遷移元状態IDとイベントIDの組み合わせの重複、未宣言IDへの参照は診断する。
- 状態だけの文書も引き続き使える。\
  状態またはイベントが0件の場合は状態遷移表のセルを作らず、不足する軸を案内する。
- 状態定義表、図、状態遷移表は未保存の編集を同じ解析結果から反映し、エラー中は同じ文書の最後の正常な3表示を保つ。
- 平坦なイベントと単一の遷移先に対応し、イベント階層と条件分岐は扱わない。\
  処理は実行せず、表示用の文字列として扱う。

[基本状態遷移のサンプル](examples/basic-transitions.gls)で状態とイベントをまとめて確認できる。

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
単体テストはCore、Extension、Webviewの`.test.ts`とWebviewの`.test.tsx`を収集する。\
プロダクトの検査にはこれらのテストも含み、VS Codeを起動できるデスクトップ環境で実行する。\
統合テストは初回にVS Codeのテスト用バイナリを取得する。

全体検証は、プロダクトの検査と OpenSpec の検査をまとめて実行し、コミットの前にフックで自動で実行される。\
AI ツール向けの生成されたファイル(`.github/skills/`、`.claude/skills/`、`.agents/skills/` のうち、使うツールのもの)はコミットし、手で編集しない。\
OpenSpec を更新した後は、`npx --no-install openspec update` で生成し直す。

### 参照する文書

- プロダクトの目的と範囲: [product.md](openspec/product.md)
- 開発の進め方: [AGENTS.md](AGENTS.md)
- 仕様書の一覧: [openspec/specs/README.md](openspec/specs/README.md)
