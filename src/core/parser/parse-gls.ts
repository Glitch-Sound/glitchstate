/** .glsの宣言と本文を元の行番号を保って解析する。 */
import type {
  GlsDiagnostic,
  ParseResult,
  PlainTransitionDefinition,
} from "../model/gls-model";
import {
  type EventCandidate,
  type EventCategoryHeadersCandidate,
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
import { parseConditionalTransition } from "./parse-conditional-transition";

type BodyLine = { text: string; line: number };

function readQuotedNames(
  source: string,
  label: string,
): { names: string[] } | { error: string } {
  const names: string[] = [];
  let rest = source.replace(/^ +/, "");
  while (true) {
    if (!rest) return { error: `${label}が必要` };
    const quoted = /^"([^"\r\n]*)"/.exec(rest);
    if (!quoted) return { error: `${label}の構文が不正` };
    names.push(quoted[1]);
    rest = rest.slice(quoted[0].length).replace(/^ +/, "");
    if (!rest) return { names };
    if (!rest.startsWith(">"))
      return { error: `${label}の構文が不正(区切り>が必要)` };
    rest = rest.slice(1).replace(/^ +/, "");
  }
}
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
      reference: Omit<PlainTransitionDefinition, "action">;
      line: number;
      body: BodyLine[];
    }
  | {
      kind: "conditional";
      reference: { fromStateId: string; eventId: string };
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
  const headers: EventCategoryHeadersCandidate[] = [];
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
    } else if (current.kind === "conditional") {
      const parsed = parseConditionalTransition(
        current.reference,
        current.line,
        current.body,
      );
      transitions.push(parsed.candidate);
      diagnostics.push(...parsed.diagnostics);
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
      if (current?.kind === "conditional")
        current.body.push({ text: line, line: lineNumber });
      else if (current && /^ {4}\S/.test(line))
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
    const event = /^Event +([^ ]+) +as +"([^"\r\n]*)"(.*)$/.exec(line);
    const header = /^EventCategoryHeaders\b([\s\S]*)$/.exec(line);
    const transition =
      /^Transition +([^ ]+) +on +([^ ]+) +-> +([^ :]+): *$/.exec(line);
    const conditional = /^Transition +([^ ]+) +on +([^ :]+): *$/.exec(line);
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
      const suffix = event[3];
      let categoryPath: string[] | undefined;
      if (!/^ *$/.test(suffix)) {
        const category = /^ +in(?: +(.*))?$/.exec(suffix);
        const parsed = category
          ? readQuotedNames(category[1] ?? "", "分類経路の分類名")
          : { error: "分類経路の構文が不正" };
        if ("error" in parsed)
          diagnostics.push({
            code: category ? "category-syntax" : "syntax",
            line: lineNumber,
            message: parsed.error,
          });
        else categoryPath = parsed.names;
      }
      events.push({
        line: lineNumber,
        event: {
          id: event[1],
          name: event[2],
          ...(categoryPath ? { categoryPath } : {}),
        },
      });
      afterEvent = true;
    } else if (header) {
      const parsed =
        /^ +/.test(header[1]) || !header[1]
          ? readQuotedNames(header[1], "列見出し名")
          : { error: "列見出しの構文が不正" };
      if ("error" in parsed)
        diagnostics.push({
          code: "category-headers-syntax",
          line: lineNumber,
          message: parsed.error,
        });
      else headers.push({ names: parsed.names, line: lineNumber });
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
    else if (conditional)
      current = {
        kind: "conditional",
        reference: { fromStateId: conditional[1], eventId: conditional[2] },
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
  diagnostics.push(...validateEvents(events, headers));
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
          ...(headers.length ? { eventCategoryHeaders: headers[0].names } : {}),
        },
    diagnostics,
  };
}
