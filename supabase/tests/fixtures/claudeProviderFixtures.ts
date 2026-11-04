// Synthetic student input and recorded-shape Claude API responses, for testing
// the adapter without a network call or a credential. Never real student text.

export const syntheticReflection =
  "I use AI when I want another perspective, and I worry about accepting answers without checking them. " +
  "Pausing helps me notice what is useful and keep my own thinking involved.";

export const syntheticSensations: [string, string, string] = [
  "tight shoulders",
  "a weird feeling in my chest",
  "warm hands",
];

export const syntheticEvents = [
  { id: "tap-1", at: "2026-10-28T16:00:00Z", label: "Instagram" },
  { id: "tap-2", at: "2026-10-28T16:05:00Z", label: "group chat" },
  { id: "tap-3", at: "2026-10-28T16:09:00Z", label: "zzz" },
];

// What the model itself writes, per activity. The adapter adds `original` to
// lexicon items from the request instead of trusting an echo.
export const modelOutput = {
  intention_mirror: {
    intentions: [
      {
        title: "Keep your own thinking involved",
        explanation:
          "When an answer arrives, you might pause and notice which parts fit your own view.",
      },
      {
        title: "Check before you accept",
        explanation:
          "You could choose one claim this week and look at it from another source.",
      },
      {
        title: "Notice what pausing offers",
        explanation:
          "Try noticing one moment when a short pause changes what feels useful.",
      },
    ],
  },
  sensation_lexicon: {
    items: [
      { isVague: false, suggestions: [] },
      { isVague: true, suggestions: ["fluttery", "tingling", "hollow"] },
      { isVague: false, suggestions: [] },
    ],
  },
  distraction_audit: {
    assignments: [
      { eventId: "tap-1", category: "social_media" },
      { eventId: "tap-2", category: "messaging" },
      { eventId: "tap-3", category: null },
    ],
  },
};

// A successful Messages API body. A thinking block comes first, because current
// models can think by default and a reader must select blocks by type.
export function claudeMessage(
  text: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "msg_synthetic",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [
      { type: "thinking", thinking: "", signature: "synthetic" },
      { type: "text", text },
    ],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 321, output_tokens: 123 },
    ...overrides,
  };
}

export function claudeError(status: number, type: string, message: string) {
  return new Response(
    JSON.stringify({ type: "error", error: { type, message } }),
    {
      status,
      headers: {
        "content-type": "application/json",
        "request-id": `req_synthetic_${status}`,
        // Keeps retry tests fast while still exercising the SDK's retry path.
        "retry-after-ms": "1",
      },
    },
  );
}

export function claudeOk(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "request-id": "req_synthetic_ok",
    },
  });
}
