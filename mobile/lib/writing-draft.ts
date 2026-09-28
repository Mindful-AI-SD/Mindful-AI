export type DraftState = {
  writing: string;
  status: "loading" | "load-error" | "unsaved" | "saving" | "saved" | "save-error";
};

export const EMPTY_DRAFT: DraftState = { writing: "", status: "loading" };
export const AUTOSAVE_DELAY_MS = 600;

// One controller per mounted user/activity. Saves are serialized so an older
// request can never overwrite newer writing from this editor.
export function createWritingDraft(
  read: () => Promise<string>,
  save: (writing: string) => Promise<void>,
  onChange: (state: DraftState) => void,
) {
  let state = EMPTY_DRAFT;
  let savedWriting = "";
  let loaded = false;
  let restoring = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<boolean> | null = null;

  function publish(status: DraftState["status"], writing = state.writing) {
    state = { writing, status };
    if (!disposed) onChange(state);
  }

  async function restore() {
    if (disposed || loaded || restoring) return;
    restoring = true;
    publish("loading");
    try {
      const writing = await read();
      if (disposed || loaded) return;
      savedWriting = writing;
      loaded = true;
      publish("saved", writing);
    } catch {
      if (!disposed) publish("load-error");
    } finally {
      restoring = false;
    }
  }

  async function saveCurrent(): Promise<boolean> {
    if (disposed || !loaded) return false;
    if (inFlight) return inFlight;
    if (state.writing === savedWriting) {
      publish("saved");
      return true;
    }

    const writing = state.writing;
    publish("saving");
    inFlight = (async () => {
      try {
        await save(writing);
        savedWriting = writing;
        publish(state.writing === savedWriting ? "saved" : "unsaved");
        return true;
      } catch {
        publish("save-error");
        return false;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  async function flush(): Promise<boolean> {
    // Explicit flushes include any edits made while a request is pending.
    do {
      clearTimeout(timer);
      timer = undefined;
      if (!(await saveCurrent()) || disposed) return false;
    } while (state.writing !== savedWriting);
    return true;
  }

  function changeWriting(writing: string) {
    if (disposed || !loaded) return;
    clearTimeout(timer);
    publish("unsaved", writing);
    timer = setTimeout(async () => {
      timer = undefined;
      if (inFlight) await inFlight;
      // More typing while waiting starts a fresh debounce interval.
      if (timer === undefined && !disposed) await saveCurrent();
    }, AUTOSAVE_DELAY_MS);
  }

  return {
    restore,
    changeWriting,
    flush,
    retry: () => (loaded ? flush() : restore()),
    dispose() {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
