export type IntentionRequest = {
  activityId: string;
  activityContext: string;
  userReflection: string;
};

// Provisional frontend shape only, not a confirmed backend response contract.
// Lucas and Dak must confirm the envelope and intention item shape before use.
export type IntentionResponse = {
  intentions: [string, string, string];
};

export type IntentionError = {
  code:
    | "CONTRACT_PENDING"
    | "AUTH_REQUIRED"
    | "NETWORK_ERROR"
    | "REQUEST_FAILED"
    | "INVALID_RESPONSE";
  message: string;
  status: number | null;
};

export type IntentionResult =
  | { data: IntentionResponse; error: null }
  | { data: null; error: IntentionError };

function failure(
  code: IntentionError["code"],
  message: string,
  status: number | null = null,
): IntentionResult {
  return { data: null, error: { code, message, status } };
}

/**
 * Integration is disabled pending Lucas and Dak's endpoint name and contract.
 * guided-reflection is a separate, single-reply API and must not be used here.
 * Once confirmed, add the authenticated request and validate the agreed response.
 * Until then, this function makes no session or network calls.
 */
export async function getIntentions(
  _request: IntentionRequest,
): Promise<IntentionResult> {
  return failure(
    "CONTRACT_PENDING",
    "Intention Mirror is not available yet. Please try again later.",
  );
}
