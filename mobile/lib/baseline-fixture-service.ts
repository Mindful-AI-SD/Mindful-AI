import AsyncStorage from "@react-native-async-storage/async-storage";
import { BaselineError, validBaselineAnswers, type BaselineService, type BaselineWrite } from "./baseline";
import type { BaselineDefinitionInput, BaselineRecordInput } from "../src/components/guiding-questions-preview.fixtures";

type Envelope = { record: BaselineRecordInput; receipts: Record<string, string> };
const queues = new Map<string, Promise<unknown>>();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
// Fixture-only fingerprint: receipts must not duplicate private answer text.
function fingerprint(value: string) {
  let first = 2166136261, second = 5381;
  for (let index = 0; index < value.length; index++) {
    first = Math.imul(first ^ value.charCodeAt(index), 16777619);
    second = Math.imul(second, 33) ^ value.charCodeAt(index);
  }
  return `${first >>> 0}:${second >>> 0}`;
}

// Explicit local fixture implementation, NOT Supabase storage/RLS or cross-device sync.
// One stored envelope commits the record and retry receipt together. Serialization
// protects competing calls within this JS runtime, not separate tabs/processes.
export function createBaselineFixtureService(userId: string, definition: BaselineDefinitionInput): BaselineService {
  const key = `baseline-fixture:v1:${userId}`;
  async function read(): Promise<Envelope | null> {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return null;
    try {
      const value = JSON.parse(raw) as Envelope;
      const record = value.record;
      if (!record || record.contractVersion !== "sprint3-storage/v1" ||
        record.definitionId !== definition.definitionId || record.definitionVersion !== definition.definitionVersion ||
        !Number.isSafeInteger(record.revision) || record.revision < 1 ||
        !["draft", "submitted"].includes(record.status) ||
        !record.answers || typeof record.answers !== "object" || Array.isArray(record.answers) ||
        !validBaselineAnswers(definition, record.answers, record.status === "submitted") ||
        (record.status === "submitted" && !record.submittedAt) ||
        !value.receipts || typeof value.receipts !== "object" || Array.isArray(value.receipts)) throw new Error();
      return value;
    } catch { throw new BaselineError("UNAVAILABLE", "Could not read the saved baseline. Existing data has not been replaced."); }
  }
  function mutate(kind: "draft" | "submitted", request: BaselineWrite): Promise<void> {
    const input = clone(request);
    const operation = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
      const envelope = await read();
      const signature = fingerprint(JSON.stringify([kind, input.definitionId, input.definitionVersion, input.expectedRevision,
        Object.keys(input.answers).sort().map(key => [key, input.answers[key]])]));
      const receipt = envelope?.receipts[input.operationId];
      if (receipt) {
        if (receipt !== signature) throw new BaselineError("OPERATION_CONFLICT", "This retry has different answers. Reload saved progress before trying again.");
        return;
      }
      if (envelope?.record.status === "submitted") throw new BaselineError("BASELINE_IMMUTABLE", "The original baseline is already submitted and cannot be replaced. Reload to view it.");
      if (input.expectedRevision !== (envelope?.record.revision ?? 0)) throw new BaselineError("STALE_REVISION", "Your saved baseline changed. Your input is still here. Reload saved progress before reconciling changes.");
      if (!definition.isPublished || input.definitionId !== definition.definitionId || input.definitionVersion !== definition.definitionVersion ||
        !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(input.operationId) ||
        !validBaselineAnswers(definition, input.answers, kind === "submitted")) throw new BaselineError("INVALID_INPUT", "Check the five answer fields and their character limits.");
      const record: BaselineRecordInput = {
        contractVersion: "sprint3-storage/v1", definitionId: input.definitionId, definitionVersion: input.definitionVersion,
        answers: input.answers, status: kind, revision: input.expectedRevision + 1,
        submittedAt: kind === "submitted" ? new Date().toISOString() : null,
      };
      await AsyncStorage.setItem(key, JSON.stringify({ record, receipts: { ...envelope?.receipts, [input.operationId]: signature } }));
    });
    queues.set(key, operation);
    void operation.finally(() => { if (queues.get(key) === operation) queues.delete(key); }).catch(() => undefined);
    return operation;
  }
  return {
    async loadBaseline() { return clone((await read())?.record ?? null); },
    saveBaselineDraft: input => mutate("draft", input),
    submitBaseline: input => mutate("submitted", input),
    async loadOriginalBaseline() {
      const record = (await read())?.record;
      return { contractVersion: "sprint3-storage/v1", original: record?.status === "submitted" ? clone(record) : null,
        definition: record?.status === "submitted" ? clone(definition) : null };
    },
  };
}
