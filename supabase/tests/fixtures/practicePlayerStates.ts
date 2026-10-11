// Player state a Practice screen holds when the student moves on to Explore,
// one sample per Practice type. Tests attach these to AI requests to prove
// that player state can never reach a provider.
//
// Only `timed` is real: it is the shape the breathing player persists
// (PersistedBreathingSession in mobile/lib/breathing-session-storage.ts).
// PLACEHOLDER: audio, video, and unguided Practice are not built yet, so their
// samples are representative guesses. Replace them with the real shapes when
// the media integration lands.
export const practicePlayerStates: Record<string, Record<string, unknown>> = {
  timed: {
    startedAt: 1791800000000,
    accumulatedActiveMs: 600000,
    state: "paused",
    completed: true,
    savedAt: 1791800600000,
  },
  audio: {
    practiceType: "audio",
    source: "https://media.example/week-1-breathing.mp3",
    positionMs: 600000,
    durationMs: 600000,
    isPlaying: false,
    playbackRate: 1,
    volume: 0.8,
    completed: true,
  },
  video: {
    practiceType: "video",
    source: "https://media.example/week-2-body-scan.mp4",
    positionMs: 598500,
    durationMs: 600000,
    isPlaying: false,
    isMuted: false,
    isFullscreen: false,
    completed: true,
  },
  unguided: {
    practiceType: "unguided",
    startedAt: 1791800000000,
    endedAt: 1791800600000,
    elapsedMs: 600000,
    completed: true,
  },
};
