import { supabase } from "./supabase";
import { BaselineError as CaptureBaselineError } from "./baseline";
import type { BaselineService, BaselineWrite } from "./baseline";
export type { BaselineWrite } from "./baseline";

export const BASELINE_CONTRACT_VERSION = "sprint3-storage/v1" as const;
export type BaselineDefinition = {
  definitionId: string;
  definitionVersion: number;
  questions: { questionId: string; prompt: string; maxCharacters: number }[];
  isPublished: boolean;
};
export type Baseline = {
  contractVersion: typeof BASELINE_CONTRACT_VERSION;
  definitionId: string;
  definitionVersion: number;
  answers: Record<string, string>;
  status: "draft" | "submitted";
  revision: number;
  submittedOperationId: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type BaselineReceipt = {
  contractVersion: typeof BASELINE_CONTRACT_VERSION;
  outcome: "draft_saved" | "submitted";
  revision: number;
  submittedAt: string | null;
  replayed: boolean;
};
export type OriginalBaseline = {
  contractVersion: typeof BASELINE_CONTRACT_VERSION;
  original: Baseline | null;
  definition: BaselineDefinition | null;
};
const messages = {
  AUTH_REQUIRED: "Sign in to access your baseline.",
  INVALID_INPUT: "The baseline data is invalid.",
  DEFINITION_NOT_AVAILABLE: "The baseline definition is unavailable.",
  DEFINITION_CONFLICT:
    "This baseline uses a different definition. Reload before retrying.",
  STALE_REVISION: "Your baseline changed. Reload before retrying.",
  OPERATION_CONFLICT: "This operation ID was already used for different data.",
  BASELINE_IMMUTABLE: "Your original baseline has already been submitted.",
  ACCOUNT_CHANGED: "Your account changed. Reload before retrying.",
  BASELINE_UNAVAILABLE: "Could not access your baseline. Please retry.",
} as const;
export type BaselinePersistenceErrorCode = keyof typeof messages;
export class BaselinePersistenceError extends Error {
  constructor(public readonly code: BaselinePersistenceErrorCode) {
    super(messages[code]);
    this.name = "BaselinePersistenceError";
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" &&
    Object.prototype.toString.call(value) === "[object Object]";
}
function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function strings(value: unknown): value is Record<string, string> {
  return object(value) &&
    Object.entries(value).every(([key, answer]) =>
      key.trim().length > 0 && Array.from(key).length <= 64 &&
      typeof answer === "string" && Array.from(answer).length <= 20000
    );
}
function baseline(value: unknown): value is Baseline {
  return object(value) && value.contractVersion === BASELINE_CONTRACT_VERSION &&
    typeof value.definitionId === "string" &&
    positive(value.definitionVersion) &&
    strings(value.answers) && positive(value.revision) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    ((value.status === "draft" && value.submittedAt === null &&
      value.submittedOperationId === null) ||
      (value.status === "submitted" && typeof value.submittedAt === "string" &&
        typeof value.submittedOperationId === "string"));
}
async function owner(): Promise<string> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) {
      throw new BaselinePersistenceError("AUTH_REQUIRED");
    }
    return data.user.id;
  } catch {
    throw new BaselinePersistenceError("AUTH_REQUIRED");
  }
}

async function identity(): Promise<{ id: string; token: string }> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.access_token || !session.user?.id) {
      throw new BaselinePersistenceError("AUTH_REQUIRED");
    }
    const { data, error: userError } = await supabase.auth.getUser(
      session.access_token,
    );
    if (userError || data.user?.id !== session.user.id) {
      throw new BaselinePersistenceError("AUTH_REQUIRED");
    }
    return { id: data.user.id, token: session.access_token };
  } catch {
    throw new BaselinePersistenceError("AUTH_REQUIRED");
  }
}

async function sameOwner(id: string) {
  if (await owner() !== id) {
    throw new BaselinePersistenceError("ACCOUNT_CHANGED");
  }
}
async function call(name: string, args: Record<string, unknown> = {}) {
  try {
    const { id, token } = await identity();
    await sameOwner(id);
    // Pin the verified token even if the shared client's active account changes.
    const { data, error } = await supabase.rpc(name, args)
      .setHeader("Authorization", `Bearer ${token}`);
    if (error) {
      const code = error.message;
      throw new BaselinePersistenceError(
        Object.hasOwn(messages, code)
          ? code as BaselinePersistenceErrorCode
          : "BASELINE_UNAVAILABLE",
      );
    }
    await sameOwner(id);
    return data as unknown;
  } catch (error) {
    if (error instanceof BaselinePersistenceError) throw error;
    throw new BaselinePersistenceError("BASELINE_UNAVAILABLE");
  }
}

function request(input: BaselineWrite) {
  const keys = [
    "operationId",
    "expectedRevision",
    "definitionId",
    "definitionVersion",
    "answers",
  ];
  if (
    !object(input) || Object.keys(input).length !== keys.length ||
    Object.keys(input).some((key) => !keys.includes(key)) ||
    typeof input.operationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      input.operationId,
    ) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    input.expectedRevision >= Number.MAX_SAFE_INTEGER ||
    typeof input.definitionId !== "string" || !input.definitionId.trim() ||
    !positive(input.definitionVersion) ||
    input.definitionVersion > 2147483647 || !strings(input.answers)
  ) {
    throw new BaselinePersistenceError("INVALID_INPUT");
  }
  // Snapshot mutable caller objects before the first asynchronous operation.
  const value = {
    ...input,
    answers: { ...input.answers },
    contractVersion: BASELINE_CONTRACT_VERSION,
  };
  let bytes = 0;
  for (const char of JSON.stringify(value)) {
    const code = char.codePointAt(0)!;
    bytes += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
  }
  if (bytes > 524288) throw new BaselinePersistenceError("INVALID_INPUT");
  return value;
}
async function write(
  name: string,
  input: BaselineWrite,
): Promise<BaselineReceipt> {
  const value = request(input);
  const data = await call(name, { p_request: value });
  if (
    !object(data) || data.contractVersion !== BASELINE_CONTRACT_VERSION ||
    !positive(data.revision) || typeof data.replayed !== "boolean" ||
    !((data.outcome === "draft_saved" && data.submittedAt === null) ||
      (data.outcome === "submitted" && typeof data.submittedAt === "string"))
  ) {
    throw new BaselinePersistenceError("BASELINE_UNAVAILABLE");
  }
  return data as BaselineReceipt;
}
export async function loadBaseline(): Promise<Baseline | null> {
  const data = await call("load_baseline");
  if (data !== null && !baseline(data)) {
    throw new BaselinePersistenceError("BASELINE_UNAVAILABLE");
  }
  return data;
}
/** A receipt acknowledges the original save revision; reload to obtain current data. */
export function saveBaselineDraft(
  input: BaselineWrite,
): Promise<BaselineReceipt> {
  return write("save_baseline_draft", input);
}
export function submitBaseline(input: BaselineWrite): Promise<BaselineReceipt> {
  return write("submit_baseline", input);
}
/** Never returns mutable draft answers. No owner parameter is accepted by the RPC. */
export async function loadOriginalBaseline(): Promise<OriginalBaseline> {
  const data = await call("load_original_baseline");
  if (!object(data) || data.contractVersion !== BASELINE_CONTRACT_VERSION) {
    throw new BaselinePersistenceError("BASELINE_UNAVAILABLE");
  }
  if (data.original === null && data.definition === null) {
    return data as OriginalBaseline;
  }
  if (
    !baseline(data.original) || data.original.status !== "submitted" ||
    !object(data.definition)
  ) {
    throw new BaselinePersistenceError("BASELINE_UNAVAILABLE");
  }
  const d = data.definition;
  if (
    d.definitionId !== data.original.definitionId ||
    d.definitionVersion !== data.original.definitionVersion ||
    typeof d.isPublished !== "boolean" || !Array.isArray(d.questions) ||
    d.questions.length !== 5 ||
    !d.questions.every((q: unknown) =>
      object(q) && typeof q.questionId === "string" &&
      typeof q.prompt === "string" && positive(q.maxCharacters) &&
      q.maxCharacters <= 20000
    ) ||
    new Set(d.questions.map((q: { questionId: string }) => q.questionId))
        .size !== 5
  ) {
    throw new BaselinePersistenceError("BASELINE_UNAVAILABLE");
  }
  return data as OriginalBaseline;
}

// UI/fixture contract adapter: preserve its void-write shape and error identity.
async function capture<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof BaselinePersistenceError) {
      const code = error.code;
      if (
        code === "STALE_REVISION" || code === "BASELINE_IMMUTABLE" ||
        code === "OPERATION_CONFLICT" || code === "INVALID_INPUT"
      ) {
        throw new CaptureBaselineError(code, error.message);
      }
      throw new CaptureBaselineError("UNAVAILABLE", error.message);
    }
    throw new CaptureBaselineError(
      "UNAVAILABLE",
      messages.BASELINE_UNAVAILABLE,
    );
  }
}
/** Explicit injection adapter; importing the fixture model does not load this module. */
export const baselineService: BaselineService = {
  loadBaseline: () => capture(loadBaseline),
  loadOriginalBaseline: () => capture(loadOriginalBaseline),
  async saveBaselineDraft(input) {
    await capture(() => saveBaselineDraft(input));
  },
  async submitBaseline(input) {
    await capture(() => submitBaseline(input));
  },
};
