import type { BaselineDefinitionInput, BaselineRecordInput } from "../src/components/guiding-questions-preview.fixtures";

export type BaselineWrite = {
  operationId: string;
  expectedRevision: number;
  definitionId: string;
  definitionVersion: number;
  answers: Record<string, string>;
};

// Lucas's MIN-214 proposed methods. No owner/status/timestamp is supplied by a screen.
export type BaselineService = {
  loadBaseline(): Promise<BaselineRecordInput | null>;
  saveBaselineDraft(input: BaselineWrite): Promise<void>;
  submitBaseline(input: BaselineWrite): Promise<void>;
  loadOriginalBaseline(): Promise<{
    contractVersion: "sprint3-storage/v1";
    original: BaselineRecordInput | null;
    definition: BaselineDefinitionInput | null;
  }>;
};

export class BaselineError extends Error {
  constructor(public code: "STALE_REVISION" | "BASELINE_IMMUTABLE" | "OPERATION_CONFLICT" | "INVALID_INPUT" | "UNAVAILABLE", message: string) {
    super(message);
  }
}

export function validBaselineAnswers(definition: BaselineDefinitionInput, answers: Record<string, string>, submit: boolean) {
  const questions = definition.questions;
  return questions.length === 5 && new Set(questions.map(q => q.questionId)).size === 5 &&
    Object.keys(answers).every(key => questions.some(q => q.questionId === key)) &&
    questions.every(q => typeof q.questionId === "string" && q.questionId.trim() && q.prompt.trim() &&
      Number.isInteger(q.maxCharacters) && q.maxCharacters > 0 && q.maxCharacters <= 20000 &&
      (answers[q.questionId] === undefined ? !submit : typeof answers[q.questionId] === "string" &&
        Array.from(answers[q.questionId]).length <= q.maxCharacters && (!submit || !!answers[q.questionId].trim())));
}

export function baselineOperationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Correlation identifier for local fixture retries, never an auth credential.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const value = Math.floor(Math.random() * 16);
    return (c === "x" ? value : (value & 3) | 8).toString(16);
  });
}
