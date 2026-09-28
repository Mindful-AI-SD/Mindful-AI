import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { getProgressWriting, saveProgressWriting } from "../../lib/progress";
import { createWritingDraft, EMPTY_DRAFT } from "../../lib/writing-draft";

export function useWritingDraft(userId: string, activityId: string) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const controller = useRef<ReturnType<typeof createWritingDraft> | null>(null);

  useEffect(() => {
    let active = true;
    setDraft(EMPTY_DRAFT);
    const current = createWritingDraft(
      () => getProgressWriting(userId, activityId),
      (writing) => saveProgressWriting(userId, activityId, writing),
      (state) => {
        if (active) setDraft(state);
      },
    );
    controller.current = current;
    void current.restore();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") void current.flush();
    });

    return () => {
      active = false;
      subscription.remove();
      // Finish pending typing when navigating away. The service checks the
      // captured owner's session, and this controller cannot update a new UI.
      void current.flush().finally(() => current.dispose());
      controller.current = null;
    };
  }, [userId, activityId]);

  return {
    ...draft,
    setWriting: (writing: string) => controller.current?.changeWriting(writing),
    retry: () => controller.current?.retry(),
    flush: async () => (await controller.current?.flush()) ?? false,
  };
}
