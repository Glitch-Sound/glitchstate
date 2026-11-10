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
  readonly eventCategoryHeaders?: readonly string[];
  readonly stateGroups?: readonly StateGroupDefinition[];
}

export interface StateGroupDefinition {
  readonly id: string;
  readonly name: string;
  readonly stateIds: readonly string[];
}

export interface EventDefinition {
  readonly id: string;
  readonly name: string;
  readonly categoryPath?: readonly string[];
}

export interface PlainTransitionDefinition {
  readonly fromStateId: string;
  readonly eventId: string;
  readonly action: string | null;
  readonly targetStateId: string | null;
}

export interface TransitionBranch {
  readonly condition: string;
  readonly action: string | null;
  readonly targetStateId: string | null;
}

export interface ConditionalTransitionDefinition {
  readonly fromStateId: string;
  readonly eventId: string;
  readonly commonAction: string | null;
  readonly branches: readonly TransitionBranch[];
}

export type TransitionDefinition =
  | PlainTransitionDefinition
  | ConditionalTransitionDefinition;

export interface GlsDiagnostic {
  readonly code: string;
  readonly line: number;
  readonly message: string;
}

export interface ParseResult {
  readonly model: GlsModel | null;
  readonly diagnostics: readonly GlsDiagnostic[];
}
