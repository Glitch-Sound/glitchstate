/** DSL解析と表示用共通モデルの公開入口を提供する。 */
export type {
  EventDefinition,
  GlsDiagnostic,
  GlsModel,
  ParseResult,
  StateDefinition,
  TransitionDefinition,
} from "./model/gls-model";
export { parseGls } from "./parser/parse-gls";
