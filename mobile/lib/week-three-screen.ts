import type { BeatId } from "./four-beat-curriculum";

export type WeekThreeEvent = { id: string; at: string; label: string };
export type ResponseField = { key: string; label: string; required: boolean; maxCharacters: number };
export type WeekThreeContent = {
  contentVersion: string;
  source: { kind: "fixture" | "approved"; reference: string };
  explore: { instructions: string; fields: readonly ResponseField[] };
  notice: { instructions: string; fields: readonly ResponseField[] };
};
// Wire projection of Lucas's MIN-214/MIN-226 progress contract. No owner in payloads.
export type WeekThreeScreenProgress = {
  contractVersion: "sprint3-storage/v1";
  activityId: string;
  contentVersion: string;
  revision: number;
  eventsRevision: number;
  currentBeat: BeatId;
  status: "not_started" | "in_progress" | "completed";
  events: WeekThreeEvent[];
  answers: Record<string, string>;
  resumeState: { elapsedActiveMs: number; positionMs: number | null; state: "idle" | "paused" };
  auditResult: unknown;
  completionPolicyVersion: string | null;
  startedAt: string;
  completedAt: string | null;
};
export type WeekThreeScreenWrite = {
  slug: string; operationId: string; expectedRevision: number; contentVersion: string;
  patch: { answers: Record<string, string>; currentBeat: "explore" | "notice" };
};
export type WeekThreeScreenService = {
  loadWeekThreeProgress(slug: string): Promise<WeekThreeScreenProgress | null>;
  saveWeekThreeDraft(input: WeekThreeScreenWrite): Promise<{ contractVersion: "sprint3-storage/v1"; revision: number; replayed: boolean }>;
};

export function validWeekThreeContent(content: WeekThreeContent) {
  const fields = [...content.explore.fields, ...content.notice.fields];
  return !!content.contentVersion.trim() && !!content.source.reference.trim() &&
    ["fixture", "approved"].includes(content.source.kind) &&
    !!content.explore.instructions.trim() && !!content.notice.instructions.trim() &&
    content.explore.fields.length > 0 && content.notice.fields.length > 0 &&
    new Set(fields.map(field => field.key)).size === fields.length && fields.every(field =>
      !!field.key.trim() && !!field.label.trim() && typeof field.required === "boolean" &&
      Number.isInteger(field.maxCharacters) && field.maxCharacters > 0 && field.maxCharacters <= 20000);
}
export function validResponseFields(fields: readonly ResponseField[], answers: Record<string, string>, requireAnswers: boolean) {
  return fields.every(field => {
    const value = answers[field.key] ?? "";
    return typeof value === "string" && Array.from(value).length <= field.maxCharacters &&
      (!requireAnswers || !field.required || !!value.trim());
  });
}
export function validWeekThreeScreenProgress(progress: WeekThreeScreenProgress, content: WeekThreeContent) {
  return progress?.contractVersion === "sprint3-storage/v1" && progress.contentVersion === content.contentVersion &&
    Number.isSafeInteger(progress.revision) && progress.revision > 0 && Number.isSafeInteger(progress.eventsRevision) && progress.eventsRevision >= 0 &&
    ["arrive", "practice", "explore", "notice"].includes(progress.currentBeat) &&
    ["not_started", "in_progress", "completed"].includes(progress.status) &&
    !!progress.resumeState && Number.isSafeInteger(progress.resumeState.elapsedActiveMs) && progress.resumeState.elapsedActiveMs >= 0 &&
    (progress.resumeState.positionMs === null || Number.isSafeInteger(progress.resumeState.positionMs) && progress.resumeState.positionMs >= 0) &&
    ["idle", "paused"].includes(progress.resumeState.state) &&
    !!progress.answers && typeof progress.answers === "object" && !Array.isArray(progress.answers) &&
    Object.values(progress.answers).every(value => typeof value === "string") &&
    Array.isArray(progress.events) && progress.events.length <= 300 &&
    new Set(progress.events.map(event => event.id)).size === progress.events.length &&
    progress.events.every(event => typeof event.id === "string" && !!event.id.trim() && event.id.length <= 64 &&
      typeof event.label === "string" && !!event.label.trim() && event.label.length <= 40 &&
      typeof event.at === "string" && /(Z|[+-]\d\d:\d\d)$/.test(event.at) && Number.isFinite(Date.parse(event.at)));
}
