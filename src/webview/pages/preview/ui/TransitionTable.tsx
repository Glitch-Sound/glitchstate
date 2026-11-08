/** 共通モデルからイベントと状態の交点を描画する。 */
import { type ReactElement, useId } from "react";
import type { GlsModel } from "../../../../core";
import { buildEventRows } from "../model/build-event-rows";

/** 状態遷移表または不足する軸の案内を表示する。
 * @param props 定義順の状態とイベント、IDで関連付けた遷移のモデル。
 * @returns 処理と遷移先を持つ表、または空の軸の案内。
 */
export function TransitionTable(props: { model: GlsModel }): ReactElement {
  const { model } = props;
  const prefix = useId();
  const { depth, rows } = buildEventRows(model.events);
  const categoryColumns = Array.from({ length: depth }, (_, level) => ({
    id: `category-column-${level}`,
    name: model.eventCategoryHeaders?.[level],
  }));
  const activeCategoryIds: string[] = [];
  const names = new Map(model.states.map((state) => [state.id, state.name]));
  const transitions = new Map(
    model.transitions.map((transition) => [
      `${transition.fromStateId}:${transition.eventId}`,
      transition,
    ]),
  );
  return (
    <section
      className="transition-section"
      aria-labelledby="transition-heading"
    >
      <h2 id="transition-heading">状態遷移表</h2>
      {model.states.length === 0 ? (
        <p role="status">状態が定義されていない。</p>
      ) : model.events.length === 0 ? (
        <p role="status">イベントが定義されていない。</p>
      ) : (
        <div className="transition-scroll">
          <table className="transition-table" aria-label="状態遷移表">
            <thead>
              <tr>
                {categoryColumns.map((column) => (
                  <th
                    key={column.id}
                    id={`${prefix}-${column.id}`}
                    scope="col"
                    className="event-category-header"
                  >
                    {column.name}
                  </th>
                ))}
                <th id={`${prefix}-event-column`} scope="col">
                  イベント
                </th>
                {model.states.map((state, index) => (
                  <th
                    key={state.id}
                    id={`${prefix}-state-${index}`}
                    scope="col"
                    style={{ color: state.color }}
                  >
                    {state.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ event, categories }, row) => {
                for (const category of categories) {
                  if (category.name !== null)
                    activeCategoryIds[category.level] =
                      `${prefix}-category-${row}-${category.level}`;
                }
                activeCategoryIds.length = event.categoryPath?.length ?? 0;
                const rowHeaders = [
                  ...activeCategoryIds,
                  `${prefix}-event-${row}`,
                ].join(" ");
                return (
                  <tr key={event.id} data-event-id={event.id}>
                    {categories.map((category) =>
                      category.name === null ? (
                        <td key={category.level} colSpan={category.colSpan} />
                      ) : (
                        <th
                          key={category.level}
                          className="event-category"
                          id={`${prefix}-category-${row}-${category.level}`}
                          headers={`${prefix}-category-column-${category.level}`}
                          rowSpan={category.rowSpan}
                        >
                          {category.name}
                        </th>
                      ),
                    )}
                    <th
                      id={`${prefix}-event-${row}`}
                      headers={`${prefix}-event-column`}
                      scope="row"
                    >
                      {event.name}
                    </th>
                    {model.states.map((state, column) => {
                      const headers = `${rowHeaders} ${prefix}-state-${column}`;
                      const transition = transitions.get(
                        `${state.id}:${event.id}`,
                      );
                      return transition ? (
                        <td key={state.id} headers={headers}>
                          <div className="transition-action">
                            {transition.action ?? "-"}
                          </div>
                          <div className="transition-target">
                            {transition.targetStateId === null
                              ? "-"
                              : names.get(transition.targetStateId)}
                          </div>
                        </td>
                      ) : (
                        <td
                          key={state.id}
                          headers={headers}
                          className="transition-undefined"
                        >
                          未定義
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
