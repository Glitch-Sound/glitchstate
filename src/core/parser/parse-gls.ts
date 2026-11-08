/** .glsの宣言と本文を元の行番号を保って解析する。 */
import type {
  GlsDiagnostic,
  ParseResult,
  TransitionDefinition,
} from "../model/gls-model";
import {
  type EventCandidate,
  validateEvents,
} from "../validator/validate-events";
import {
  type StateCandidate,
  validateStates,
} from "../validator/validate-states";
import {
  type TransitionCandidate,
  validateTransitions,
} from "../validator/validate-transitions";

type BodyLine = { text: string; line: number };
type Block =
  | {
      kind: "state";
      id: string;
      name: string;
      color: string;
      line: number;
      body: BodyLine[];
    }
  | {
      kind: "transition";
      reference: Omit<TransitionDefinition, "action">;
      line: number;
      body: BodyLine[];
    };

/** 状態、イベント、遷移の本文を解析する。
 * @param source 保存前を含む文書の本文。
 * @returns 定義順のモデルまたは元の行を持つ診断。
 */
export function parseGls(source: string): ParseResult {
  const states: StateCandidate[] = [];
  const events: EventCandidate[] = [];
  const transitions: TransitionCandidate[] = [];
  const diagnostics: GlsDiagnostic[] = [];
  let current: Block | undefined;
  let afterEvent = false;
  const finish = () => {
    if (!current) return;
    const text = current.body.map((item) => item.text).join("\n");
    if (current.kind === "state") {
      states.push({
        line: current.line,
        state: {
          id: current.id,
          name: current.name,
          color: current.color,
          meaning: text,
        },
      });
    } else {
      transitions.push({
        line: current.line,
        body: current.body,
        transition: {
          ...current.reference,
          action: text === "-" ? null : text,
        },
      });
    }
    current = undefined;
  };
  for (const [index, line] of source
    .replaceAll("\r\n", "\n")
    .split("\n")
    .entries()) {
    if (!line.trim()) continue;
    const lineNumber = index + 1;
    if (/^\s/.test(line)) {
      if (current && /^ {4}\S/.test(line))
        current.body.push({ text: line.slice(4), line: lineNumber });
      else
        diagnostics.push({
          code: afterEvent ? "event-hierarchy" : "indent",
          line: lineNumber,
          message: afterEvent
            ? "イベントの階層や本文は未対応"
            : "本文のインデントには半角空白4個を使う",
        });
      continue;
    }
    finish();
    afterEvent = false;
    const state =
      /^State +([^ ]+) +as +"([^"\r\n]*)" +color +"([^"]*)": *$/.exec(line);
    const event = /^Event +([^ ]+) +as +"([^"\r\n]*)" *$/.exec(line);
    const transition =
      /^Transition +([^ ]+) +on +([^ ]+) +-> +([^ :]+): *$/.exec(line);
    if (state)
      current = {
        kind: "state",
        id: state[1],
        name: state[2],
        color: state[3],
        line: lineNumber,
        body: [],
      };
    else if (event) {
      events.push({
        line: lineNumber,
        event: { id: event[1], name: event[2] },
      });
      afterEvent = true;
    } else if (transition)
      current = {
        kind: "transition",
        reference: {
          fromStateId: transition[1],
          eventId: transition[2],
          targetStateId: transition[3] === "-" ? null : transition[3],
        },
        line: lineNumber,
        body: [],
      };
    else {
      const declaration = /^(State|Event|Transition)\b/.test(line);
      diagnostics.push({
        code: declaration ? "syntax" : "unsupported",
        line: lineNumber,
        message: declaration ? "宣言の構文が不正" : "未対応の記述",
      });
    }
  }
  finish();
  diagnostics.push(...validateStates(states));
  diagnostics.push(...validateEvents(events));
  diagnostics.push(
    ...validateTransitions(
      transitions,
      states.map((item) => item.state),
      events.map((item) => item.event),
    ),
  );
  return {
    model: diagnostics.length
      ? null
      : {
          states: states.map((item) => item.state),
          events: events.map((item) => item.event),
          transitions: transitions.map((item) => item.transition),
        },
    diagnostics,
  };
}
