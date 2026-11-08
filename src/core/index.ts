/** DSL解析と表示用共通モデルの公開入口を提供する。 */
export type {
  ConditionalTransitionDefinition,
  EventDefinition,
  GlsDiagnostic,
  GlsModel,
  ParseResult,
  PlainTransitionDefinition,
  StateDefinition,
  TransitionBranch,
  TransitionDefinition,
} from "./model/gls-model";
export { parseGls } from "./parser/parse-gls";
