import {
  type AiActivityError,
  type AiActivityTransport,
  getAiActivity,
  type SensationItem,
  type SupportResource,
} from "./ai-activity";

export type { SensationItem, SupportResource };

export type SensationLexiconRequest = {
  activityId: string;
  activityContext: string;
  sensations: [string, string, string];
};

// "words" is the normal result. "support" is the server's fixed response to
// crisis language: show its message and resources and do not continue the lab.
export type SensationLexiconData =
  | {
    kind: "words";
    items: [SensationItem, SensationItem, SensationItem];
    provider: string;
  }
  | { kind: "support"; message: string; resources: SupportResource[] };

export type SensationLexiconResult =
  | { data: SensationLexiconData; error: null }
  | { data: null; error: AiActivityError };

// Week 2 Sensation Lexicon, through the general AI activity endpoint.
export async function getSensationWords(
  request: SensationLexiconRequest,
  options: {
    signal?: AbortSignal;
    transport?: AiActivityTransport;
    timeoutMs?: number;
  } = {},
): Promise<SensationLexiconResult> {
  const { data, error } = await getAiActivity("sensation_lexicon", {
    activityId: request.activityId,
    activityContext: request.activityContext,
    input: { sensations: request.sensations },
  }, options);

  if (error) return { data: null, error };
  if (data.outcome === "support") {
    return {
      data: {
        kind: "support",
        message: data.message,
        resources: data.resources,
      },
      error: null,
    };
  }
  return {
    data: {
      kind: "words",
      items: data.result.items,
      provider: data.provider,
    },
    error: null,
  };
}
