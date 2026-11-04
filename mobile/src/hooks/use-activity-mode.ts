import { useCallback, useEffect, useState } from "react";
import { type ActivityMode, getActivityMode } from "../../lib/ai-activity";

export type ActivityModeState =
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "unavailable"; message: string; retry: () => void }
  | { status: "ready"; mode: ActivityMode };

const MODE_UNAVAILABLE =
  "The selected mode is unavailable. Choose another mode or try again.";

// Asks the server which mode is active before a student begins, because the
// screen's disclosure depends on it. A failed check never assumes a mode.
export function useActivityMode(userId: string): ActivityModeState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "unavailable"; message: string }
    | { status: "ready"; mode: ActivityMode }
  >({ status: "loading" });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void getActivityMode({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.error) {
        setState({ status: "error", message: result.error.message });
      } else if (!result.data.available) {
        setState({ status: "unavailable", message: MODE_UNAVAILABLE });
      } else {
        setState({ status: "ready", mode: result.data });
      }
    });
    return () => controller.abort();
  }, [userId, attempt]);

  return state.status === "error" || state.status === "unavailable"
    ? { ...state, retry }
    : state;
}
