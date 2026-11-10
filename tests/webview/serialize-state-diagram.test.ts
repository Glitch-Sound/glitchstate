import { expect, test } from "vitest";
import { DIAGRAM_EXPORT_CONFIG as c } from "../../src/webview/pages/preview/model/diagram-export-config";
import { serializeStateDiagram } from "../../src/webview/pages/preview/model/serialize-state-diagram";

test("REQ-042-S04 文字と属性をエスケープし外部資源を要求しない", () => {
  const result = serializeStateDiagram({
    background: "rgb(255, 255, 255)",
    nodes: [
      {
        id: "A",
        group: false,
        rect: { x: 0, y: 0, width: 100, height: 40 },
        fill: "white",
        stroke: "none",
        strokeWidth: 0,
        lines: [
          {
            text: '<b>A&B</b>"',
            x: 10,
            y: 20,
            fontFamily: "sans-serif",
            fontSize: 12,
            fontWeight: "400",
            fontStyle: "normal",
            fill: "red",
          },
        ],
      },
    ],
    edges: [],
  });
  expect(result).toContain("&lt;b&gt;A&amp;B&lt;/b&gt;&quot;");
  expect(result).not.toContain("<b>");
  expect(result).toContain(
    `viewBox="${-c.margin} ${-c.margin} ${100 + 2 * c.margin} ${40 + 2 * c.margin}"`,
  );
});
