import { useCallback, useEffect, useState } from "react";
import {
  type ActivityMode,
  getActivityMode,
  MODE_UNAVAILABLE_MESSAGE,
} from "../../lib/ai-activity";

export type ActivityModeState =
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "unavailable"; message: string; retry: () => void }
  | { status: "ready"; mode: ActivityMode; refresh: () => void };

// Asks the server which mode is active before a student begins, because the
// screen's disclosure depends on it. A failed check never assumes a mode. Screens
// pass enabled=false on steps that do not use the mode, to avoid a needless call.
export function useActivityMode(userId: string, enabled = true): ActivityModeState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "unavailable"; message: string }
    | { status: "ready"; mode: ActivityMode }
  >({ status: "loading" });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    void getActivityMode({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.error) {
        setState({ status: "error", message: result.error.message });
      } else if (!result.data.available) {
        setState({ status: "unavailable", message: MODE_UNAVAILABLE_MESSAGE });
      } else {
        setState({ status: "ready", mode: result.data });
      }
    });
    return () => controller.abort();
  }, [userId, attempt, enabled]);

  if (state.status === "ready") return { ...state, refresh: retry };
  return state.status === "loading" ? state : { ...state, retry };
}
