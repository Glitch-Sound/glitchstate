/** 宣言順のイベントから分類セルの連続範囲と空欄を作る。 */
import type { EventDefinition } from "../../../../core";

export interface EventCategoryCell {
  readonly level: number;
  readonly name: string | null;
  readonly rowSpan: number;
  readonly colSpan: number;
}

/** 共通する祖先分類を連続するイベントの範囲でまとめる。
 * @param events 検証済みの宣言順のイベント。入力は変更しない。
 * @returns 最大分類深さと、各イベントに描画する分類セル。nullの名前は不足する段の空欄。
 */
export function buildEventRows(events: readonly EventDefinition[]): {
  depth: number;
  rows: { event: EventDefinition; categories: EventCategoryCell[] }[];
} {
  const depth = events.reduce(
    (max, event) => Math.max(max, event.categoryPath?.length ?? 0),
    0,
  );
  const samePrefix = (
    index: number,
    path: readonly string[],
    level: number,
  ) => {
    const other = events[index]?.categoryPath;
    return (
      !!other &&
      other.length > level &&
      path.slice(0, level + 1).every((name, i) => other[i] === name)
    );
  };
  const rows = events.map((event, index) => {
    const path = event.categoryPath ?? [];
    const categories: EventCategoryCell[] = [];
    for (const [level, name] of path.entries()) {
      if (samePrefix(index - 1, path, level)) continue;
      let rowSpan = 1;
      while (samePrefix(index + rowSpan, path, level)) rowSpan++;
      categories.push({ level, name, rowSpan, colSpan: 1 });
    }
    if (path.length < depth)
      categories.push({
        level: path.length,
        name: null,
        rowSpan: 1,
        colSpan: depth - path.length,
      });
    return { event, categories };
  });
  return { depth, rows };
}
