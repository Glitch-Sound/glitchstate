/** React Webviewの起動先を設定する。 */
import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Webviewの起動先が見つからない");
}

createRoot(root).render(
  <React.StrictMode>
    <main>
      <h1>GlitchState</h1>
      <p>プレビューの開発環境を準備した。</p>
    </main>
  </React.StrictMode>,
);
