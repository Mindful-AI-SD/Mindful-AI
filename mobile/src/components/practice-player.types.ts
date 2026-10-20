
/**
 * Reusable Practice Player Contract
 *
 * Defines common behavior for guided, timed, and unguided
 * mindfulness practices.
 *
 * This file defines interfaces only. It does not replace
 * the current breathing player implementation.
 */

export type PracticePlayerState =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "exited";

export type PracticeMode =
  | "breathing"
  | "walking"
  | "meditation"
  | "other";

export type PracticeGuidance =
  | {
      type: "guided";
      instructions: string[];
      audioUrl?: string;
    }
  | {
      type: "unguided";
    };

export type PracticeTiming =
  | {
      type: "timed";
      durationMs: number;
    }
  | {
      type: "open-ended";
    };

export interface PracticeConfig {
  id: string;
  title: string;
  mode: PracticeMode;
  description?: string;

  guidance: PracticeGuidance;
  timing: PracticeTiming;

  /**
   * Pause if the app becomes inactive or backgrounded.
   */
  pauseOnBackground: boolean;
}

export interface PracticeSession {
  practiceId: string;

  state: PracticePlayerState;
  elapsedActiveMs: number;

  startedAt: number | null;
  lastSavedAt: number | null;

  /**
   * Only true after the practice's completion
   * requirements have been satisfied.
   */
  completed: boolean;
}

export interface PracticePlayerCallbacks {
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onRestart?: () => void;
  onExit?: () => void;

  /**
   * Invoked after a valid completion.
   * Returning false means progression was not saved.
   */
  onComplete?: () => Promise<boolean> | boolean;
}

export interface PracticePlayerProps
  extends PracticePlayerCallbacks {
  config: PracticeConfig;
  session?: PracticeSession | null;
  isSaving?: boolean;
}

/**
 * Supported state transitions:
 *
 * idle      -> running
 * running   -> paused | completed | exited
 * paused    -> running | exited
 * completed -> running (restart) | exited
 *
 * Restart begins a new attempt with zero elapsed time.
 *
 * Timed practices:
 * - Complete when accumulated active time >= durationMs.
 *
 * Open-ended practices:
 * - Require an explicit Finish action.
 * - May specify a minimum active duration in future.
 *
 * Safety and persistence:
 * - Background time is never counted as active time.
 * - Restored running sessions reopen in paused state.
 * - Early exit must never mark a practice complete.
 * - Completion callbacks must not run more than once
 *   per successful session.
 * - Failed progress saves must remain retryable.
 */
