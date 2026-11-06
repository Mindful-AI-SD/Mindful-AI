
import type {
  PracticeMediaStatus as ExistingMediaStatus,
} from "./practice-media.types";

export type PracticeMediaStatus =
  | ExistingMediaStatus
  | "not-required";

export type PracticePlayerState =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "exited";

export interface DistractionTapEvent {
  id: string;
  at: string;
  label: string;
}

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

export type PracticePlayerMedia =
  | {
      type: "audio" | "video";
      source: string | number;
    }
  | {
      type: "none";
      source?: never;
    };

export interface PracticeConfig {
  id: string;
  title: string;
  mode: PracticeMode;
  description?: string;
  guidance: PracticeGuidance;
  timing: PracticeTiming;
  pauseOnBackground: boolean;
  media?: PracticePlayerMedia;
  requiresMedia?: boolean;
  /** When supplied, show these tap labels while Practice is actively running. */
  distractionTapLabels?: string[];
  completionAllowed?: boolean;
}

export interface PracticeSession {
  practiceId: string;
  state: PracticePlayerState;
  elapsedActiveMs: number;
  startedAt: number | null;
  lastSavedAt: number | null;
  completed: boolean;

  /** Locally saved Week 3 practice-wandering taps. */
  distractionEvents?: DistractionTapEvent[];

  /** Current recording position in seconds, if this practice uses media. */
  mediaPositionSeconds?: number;
}

export interface PracticePlayerCallbacks {
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onRestart?: () => void;
  onExit?: () => void;
  onComplete?: () => Promise<boolean> | boolean;
}

export interface PracticePlayerProps
  extends PracticePlayerCallbacks {
  config: PracticeConfig;
  session?: PracticeSession | null;
  isSaving?: boolean;
}
