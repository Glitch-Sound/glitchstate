/** DSL解析と表示用共通モデルの公開入口を提供する。 */
export type {
  GlsDiagnostic,
  GlsModel,
  ParseResult,
  StateDefinition,
} from "./model/gls-model";
export { parseGls } from "./parser/parse-gls";
