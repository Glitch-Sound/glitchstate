/** 状態定義の共通モデルと解析結果を定義する。 */
export interface StateDefinition {
  readonly id: string;
  readonly name: string;
  readonly meaning: string;
  readonly color: string;
}

export interface GlsModel {
  readonly states: readonly StateDefinition[];
}

export interface GlsDiagnostic {
  readonly code: string;
  readonly line: number;
  readonly message: string;
}

export interface ParseResult {
  readonly model: GlsModel | null;
  readonly diagnostics: readonly GlsDiagnostic[];
}
