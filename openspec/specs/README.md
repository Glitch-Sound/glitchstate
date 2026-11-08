# 仕様書の一覧

各仕様書の役割と関係を示す。\
要件の内容は各仕様書を正とし、ここには書かない。

## 一覧

| capability | 扱う内容 |
| --- | --- |
| state-definitions | `.gls`による状態定義の記法、定義順、解析結果、不正入力の報告 |
| state-definition-preview | VS Codeでの状態定義表、対象文書、保存前の更新、診断と正常な表の保持 |

## 関係と読む順番

`state-definitions`で入力と解析結果を確認し、`state-definition-preview`で利用者が確認する表示と編集時の振る舞いを読む。\
プレビューは、状態定義の解析結果から生成する。
