export type PracticeMediaStatus = "loading" | "ready" | "playing" | "paused" | "completed" | "error";
export type PracticeMediaProps = {
  type: "audio" | "video"; url: string; position: number;
  onStatus: (status: PracticeMediaStatus, position: number) => void;
  onRestart: () => void;
};
