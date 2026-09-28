import response from "./fixtures/mock-intentions.json";
import type { IntentionRequest } from "./intention";

// Local mock data until an Intention Mirror endpoint is available.
export function requestMockIntentions(
  _request: IntentionRequest,
  signal: AbortSignal,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Request cancelled"));
      return;
    }
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      reject(new Error("Request cancelled"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve(response);
    }, 800);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
