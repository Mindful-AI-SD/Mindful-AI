import AsyncStorage from "@react-native-async-storage/async-storage";
import { validResponseFields, validWeekThreeScreenProgress, type WeekThreeContent, type WeekThreeScreenProgress, type WeekThreeScreenService } from "./week-three-screen";
import { WEEK_THREE_PROGRESS_FIXTURE, WEEK_THREE_SLUG_FIXTURE } from "../src/components/week-three-explore-notice.fixtures";

const queues = new Map<string, Promise<unknown>>();
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

/** Local, account/activity-scoped fixture storage only. No RPC, provider call,
 * production completion claim, or changes to Trevor's tap logger/player. */
export function createWeekThreeScreenFixtureService(userId: string, activityId: string, content: WeekThreeContent): WeekThreeScreenService {
  const key = `week-three-screen-fixture:v1:${userId}:${activityId}`;
  type Saved = { progress: WeekThreeScreenProgress; lastOperationId: string | null };
  async function read(): Promise<Saved> {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return { progress: { ...copy(WEEK_THREE_PROGRESS_FIXTURE), activityId }, lastOperationId: null };
    try {
      const saved = JSON.parse(raw) as Saved;
      if (saved.progress.activityId !== activityId || !validWeekThreeScreenProgress(saved.progress, content)) throw new Error();
      return saved;
    } catch { throw new Error("Saved Week 3 progress could not be read. Existing data has not been replaced."); }
  }
  return {
    async loadWeekThreeProgress(slug) {
      if (slug !== WEEK_THREE_SLUG_FIXTURE) throw new Error("Unknown fixture activity.");
      return copy((await read()).progress);
    },
    async saveWeekThreeDraft(input) {
      const request = copy(input);
      let acknowledgement: { contractVersion: "sprint3-storage/v1"; revision: number; replayed: boolean };
      const operation = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
        const saved = await read();
        const previous = saved.progress;
        if (request.slug !== WEEK_THREE_SLUG_FIXTURE || request.contentVersion !== previous.contentVersion ||
          !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(request.operationId) ||
          !["explore", "notice"].includes(request.patch.currentBeat) ||
          Object.keys(request.patch).some(key => !["answers", "currentBeat"].includes(key))) throw new Error("Invalid fixture save.");
        if (saved.lastOperationId === request.operationId) {
          if (JSON.stringify(request.patch.answers) !== JSON.stringify(previous.answers) || request.patch.currentBeat !== previous.currentBeat) throw new Error("The retry payload changed.");
          acknowledgement = { contractVersion: "sprint3-storage/v1", revision: previous.revision, replayed: true }; return;
        }
        if (previous.status === "completed") throw new Error("Completed progress is read-only.");
        if (request.expectedRevision !== previous.revision) throw new Error("Saved progress changed. Reload before reconciling your answers.");
        const fields = [...content.explore.fields, ...content.notice.fields];
        if (!request.patch.answers || !validResponseFields(fields, request.patch.answers, false) ||
          Object.keys(previous.answers).some(key => request.patch.answers[key] === undefined) ||
          Object.keys(request.patch.answers).some(key => !fields.some(field => field.key === key) && request.patch.answers[key] !== previous.answers[key])) throw new Error("Invalid fixture answers.");
        if (request.patch.currentBeat === "notice" && !validResponseFields(content.explore.fields, request.patch.answers, true)) throw new Error("Answer the required Explore fields first.");
        const progress = { ...previous, answers: request.patch.answers, currentBeat: request.patch.currentBeat, revision: previous.revision + 1 };
        await AsyncStorage.setItem(key, JSON.stringify({ progress, lastOperationId: request.operationId }));
        acknowledgement = { contractVersion: "sprint3-storage/v1", revision: progress.revision, replayed: false };
      });
      queues.set(key, operation);
      void operation.finally(() => { if (queues.get(key) === operation) queues.delete(key); }).catch(() => undefined);
      await operation;
      return acknowledgement!;
    },
  };
}
