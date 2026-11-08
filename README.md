# GlitchState

状態定義・状態遷移図・状態遷移表を、単一のDSLから一体的に設計・可視化するVS Code拡張機能。

## セットアップ

### 必要なもの

- Node.js 22.12以上
- npm
- Visual Studio Code

### 手順

1. `npm ci` で依存をインストールする。
2. `npm run check:product` でプロダクトの検査を実行する。
3. `npm run build` で拡張機能をビルドする。
4. VS Codeでプロジェクトを開き、`F5`でExtension Development Hostを起動する。

## 使い方

1. `.gls`ファイルを作成し、状態・イベント・遷移を定義する。
2. VS Codeでファイルを開き、プレビューを表示する。
3. 状態定義・状態遷移図・状態遷移表を同一画面で確認する。
4. DSLを編集すると、プレビューが自動更新される。
5. 状態を選択すると、各表示領域の関連箇所が強調される。
6. 状態遷移図は拡大・縮小・リセットでき、PNG/SVG形式で保存できる。

## 開発

この節は、OpenSpec を使った開発のためのものである。\
OpenSpec の部分を切り離して納品する場合は、納品物からこの節を削除する。

### 開発に必要なもの

- Node.js 22.12 以上と npm(OpenSpec CLI と検査スクリプトに使う)
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

1. セットアップの手順で、プロダクトの依存を入れる。
2. `npm install` で、OpenSpec を入れる。
3. OpenSpec のグローバル設定を行う。
4. `git config core.hooksPath .githooks` で、コミット前のフックを有効にする。
5. `npm run check` で、全体検証が成功することを確かめる。

全体検証は、プロダクトの検査と OpenSpec の検査をまとめて実行し、コミットの前にフックで自動で実行される。\
AI ツール向けの生成されたファイル(`.github/skills/`、`.claude/skills/`、`.agents/skills/` のうち、使うツールのもの)はコミットし、手で編集しない。\
OpenSpec を更新した後は、`npx --no-install openspec update` で生成し直す。

### 参照する文書

- プロダクトの目的と範囲: [product.md](openspec/product.md)
- 開発の進め方: [AGENTS.md](AGENTS.md)
- 仕様書の一覧: [openspec/specs/README.md](openspec/specs/README.md)
