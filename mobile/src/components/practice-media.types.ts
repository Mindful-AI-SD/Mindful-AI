
export type PracticeMediaStatus =
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "completed"
  | "error";

export type ControlledPlaybackState =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "exited";

export type PracticeMediaProps = {
  type: "audio" | "video";
  url: string;

  /** Current saved position, in seconds. */
  position: number;

  /** When provided, playback follows the reusable player's state. */
  playbackState?: ControlledPlaybackState;

  /** Increment to restart the recording from its beginning. */
  restartToken?: number;

  onStatus: (
    status: PracticeMediaStatus,
    position: number,
  ) => void;

  onRestart: () => void;
};
