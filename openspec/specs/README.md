# 仕様書の一覧

各仕様書の役割と関係を示す。\
要件の内容は各仕様書を正とし、ここには書かない。

## 一覧

| capability | 扱う内容 |
| --- | --- |
| state-definitions | `.gls`による状態定義の記法、定義順、解析結果、受け付ける宣言と不正入力の報告 |
| state-transitions | `.gls`によるイベントと分類経路、文書単位の分類列見出し、処理と遷移先、参照と重複の検証 |
| state-definition-preview | VS Codeでの状態定義表、対象文書、保存前の更新、診断と正常な表の保持 |
| state-transition-diagram | 状態名とカラーのノード、方向付きの淡い矢印、自己ループ、図と両方の表の整合 |
| state-transition-table | イベントと状態を軸とする表、分類と個別の列見出し、セルの処理と遷移先、未定義、両方の表の更新 |

## 関係と読む順番

`state-definitions`で状態の入力と解析結果、受け付ける宣言を確認し、`state-transitions`でイベントの分類と列見出し、遷移の記法と参照を確認する。\
`state-definition-preview`でプレビューの対象と状態定義表、`state-transition-table`で状態遷移表と両方の表の整合を読む。\
`state-transition-diagram`で状態間の図と3表示の整合を読む。\
状態定義表、状態遷移図、状態遷移表は、同じ文書の解析結果から生成する。
