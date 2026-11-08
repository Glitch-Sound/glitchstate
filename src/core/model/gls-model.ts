/** 状態、イベント、遷移の共通モデルと解析結果を定義する。 */
export interface StateDefinition {
  readonly id: string;
  readonly name: string;
  readonly meaning: string;
  readonly color: string;
}

export interface GlsModel {
  readonly states: readonly StateDefinition[];
  readonly events: readonly EventDefinition[];
  readonly transitions: readonly TransitionDefinition[];
}

export interface EventDefinition {
  readonly id: string;
  readonly name: string;
}

export interface TransitionDefinition {
  readonly fromStateId: string;
  readonly eventId: string;
  readonly action: string | null;
  readonly targetStateId: string | null;
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
