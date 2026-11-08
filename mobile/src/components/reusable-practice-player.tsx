
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { usePracticePlayer } from "../hooks/use-practice-player";
import { PracticeMediaPlayer } from "./practice-media-player";

import {
  canCompletePractice,
  canStartPractice,
} from "../../lib/practice-completion";

import {
  clearPracticeSession,
  loadPracticeSession,
  savePracticeSession,
} from "../../lib/practice-session-storage";

import type {
  DistractionTapEvent,
  PracticeConfig,
  PracticeMediaStatus,
  PracticePlayerState,
  PracticeSession,
} from "./practice-player.types";

interface Props {
  config: PracticeConfig;
  userId: string;
  onContinue?: () => Promise<boolean> | boolean | void;
  onExit?: () => void;
  isSaving?: boolean;
}

export function ReusablePracticePlayer({
  config,
  userId,
  onContinue,
  onExit,
  isSaving = false,
}: Props) {
  const hasMedia =
    config.media?.type === "audio" ||
    config.media?.type === "video";

  const requiresMedia =
    hasMedia || config.requiresMedia === true;

  const effectiveConfig: PracticeConfig = useMemo(
    () => ({
      ...config,
      requiresMedia,
    }),
    [config, requiresMedia],
  );

  const durationMs =
    config.timing.type === "timed"
      ? config.timing.durationMs
      : undefined;

  const instructions =
    config.guidance.type === "guided"
      ? config.guidance.instructions
      : [];

  const distractionTapLabels = useMemo(() => {
    const seen = new Set<string>();

    return (config.distractionTapLabels ?? [])
      .map((label) => label.trim())
      .filter((label) => {
        if (!label || label.length > 40 || seen.has(label)) {
          return false;
        }

        seen.add(label);
        return true;
      });
  }, [config.distractionTapLabels]);

  const [distractionEvents, setDistractionEvents] =
    useState<DistractionTapEvent[]>([]);

  const initialMediaStatus: PracticeMediaStatus =
    hasMedia ? "loading" : "not-required";

  const [mediaStatus, setMediaStatus] =
    useState<PracticeMediaStatus>(initialMediaStatus);

  const [hasPlayedMedia, setHasPlayedMedia] =
    useState(false);

  const [mediaFailed, setMediaFailed] = useState(false);
  const mediaFailedRef = useRef(false);

  const [mediaPositionSeconds, setMediaPositionSeconds] =
    useState(0);

  const [restartToken, setRestartToken] = useState(0);
  const [restoring, setRestoring] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaPositionRef = useRef(0);
  const lastSavedMediaPositionRef = useRef(0);
  const distractionEventsRef = useRef<DistractionTapEvent[]>([]);
  const tapSequenceRef = useRef(0);

  const mediaStatusRef =
    useRef<PracticeMediaStatus>(initialMediaStatus);

  const playedRef = useRef(false);
  const loadedRef = useRef(false);
  const advancingRef = useRef(false);
  const mountedRef = useRef(true);

  const sessionStartedAtRef =
    useRef<number | null>(null);

  const lastSavedSecondRef = useRef(-1);

  const storageQueueRef =
    useRef<Promise<void>>(Promise.resolve());

  const playerRef = useRef<{
    state: PracticePlayerState;
    elapsedMs: number;
  }>({
    state: "idle",
    elapsedMs: 0,
  });

  const queueSave = useCallback(
    (operation: () => Promise<void>) => {
      const queued =
        storageQueueRef.current.then(operation);

      storageQueueRef.current =
        queued.catch(() => undefined);

      return queued;
    },
    [],
  );

  const saveSession = useCallback(
    (
      state: PracticePlayerState,
      elapsedActiveMs: number,
      completed = false,
    ) => {
      const session: PracticeSession = {
        practiceId: config.id,
        state,
        elapsedActiveMs,
        startedAt: sessionStartedAtRef.current,
        lastSavedAt: Date.now(),
        completed,
        distractionEvents: distractionEventsRef.current,
        ...(requiresMedia
          ? {
              mediaPositionSeconds:
                mediaPositionRef.current,
            }
          : {}),
      };

      return queueSave(() =>
        savePracticeSession(
          userId,
          session,
          playedRef.current,
        ),
      );
    },
    [config.id, userId, requiresMedia, queueSave],
  );

  const mediaIsUsable = useCallback(() => {
    if (mediaFailedRef.current) {
      return false;
    }

    return canStartPractice(
      effectiveConfig,
      mediaStatusRef.current,
    );
  }, [effectiveConfig]);

  const canStart = useCallback(
    () => loadedRef.current && mediaIsUsable(),
    [mediaIsUsable],
  );

  const canComplete = useCallback(
    (
      elapsedMs: number,
      requestedFinish: boolean,
    ) => {
      if (mediaFailedRef.current) {
        return false;
      }

      return canCompletePractice({
        config: effectiveConfig,
        elapsedActiveMs: elapsedMs,
        mediaStatus: mediaStatusRef.current,
        hasPlayedMedia: playedRef.current,
        requestedFinish,
      });
    },
    [effectiveConfig],
  );

  const handleStateChange = useCallback(
    (
      state: PracticePlayerState,
      elapsedMs: number,
    ) => {
      playerRef.current = {
        state,
        elapsedMs,
      };

      if (!loadedRef.current || state === "exited") {
        return;
      }

      if (state === "running" && elapsedMs === 0) {
        sessionStartedAtRef.current = Date.now();
        lastSavedSecondRef.current = -1;
      }

      void saveSession(
        state,
        elapsedMs,
        state === "completed",
      ).catch(() => {
        if (mountedRef.current) {
          setError("Could not save practice progress.");
        }
      });
    },
    [saveSession],
  );

  const handleTick = useCallback(
    (elapsedMs: number) => {
      playerRef.current.elapsedMs = elapsedMs;

      const second = Math.floor(elapsedMs / 1000);

      if (
        second % 5 === 0 &&
        second !== lastSavedSecondRef.current
      ) {
        lastSavedSecondRef.current = second;

        void saveSession(
          playerRef.current.state,
          elapsedMs,
          playerRef.current.state === "completed",
        ).catch(() => {
          if (mountedRef.current) {
            setError("Could not save practice progress.");
          }
        });
      }
    },
    [saveSession],
  );

  const player = usePracticePlayer({
    durationMs,
    instructions,
    pauseOnBackground: config.pauseOnBackground,
    allowManualFinish:
      config.timing.type === "open-ended",
    canStart,
    canComplete,
    onStateChange: handleStateChange,
    onTick: handleTick,
  });

  const {
    state,
    elapsedMs,
    remainingMs,
    start,
    pause,
    resume,
    restart,
    finish,
    restore,
    getElapsedMs,
  } = player;

  useEffect(() => {
    mountedRef.current = true;
    loadedRef.current = false;

    let cancelled = false;

    setRestoring(true);
    setError(null);

    void loadPracticeSession(userId, config.id)
      .then((saved) => {
        if (cancelled) {
          return;
        }

        if (!saved) {
          mediaPositionRef.current = 0;
          lastSavedMediaPositionRef.current = 0;
          setMediaPositionSeconds(0);
          playedRef.current = false;
          setHasPlayedMedia(false);
          distractionEventsRef.current = [];
          setDistractionEvents([]);
          tapSequenceRef.current = 0;
          restore(null);
          return;
        }

        const elapsed =
          saved.session.elapsedActiveMs;

        const restoredDistractionEvents =
          saved.session.distractionEvents ?? [];
        distractionEventsRef.current = restoredDistractionEvents;
        setDistractionEvents(restoredDistractionEvents);
        tapSequenceRef.current = 0;

        const restoredMediaPosition = Math.max(
          0,
          saved.session.mediaPositionSeconds ?? 0,
        );

        mediaPositionRef.current =
          restoredMediaPosition;

        lastSavedMediaPositionRef.current =
          restoredMediaPosition;

        setMediaPositionSeconds(restoredMediaPosition);

        const validCompletion =
          saved.session.completed &&
          canCompletePractice({
            config: effectiveConfig,
            elapsedActiveMs: elapsed,
            mediaStatus: requiresMedia
              ? saved.mediaVerified
                ? "paused"
                : "error"
              : "not-required",
            hasPlayedMedia: saved.mediaVerified,
            requestedFinish:
              config.timing.type === "open-ended",
          });

        sessionStartedAtRef.current =
          saved.session.startedAt;

        playedRef.current = saved.mediaVerified;
        setHasPlayedMedia(saved.mediaVerified);

        if (requiresMedia && !saved.mediaVerified) {
          mediaStatusRef.current = "loading";
          setMediaStatus("loading");
        } else if (requiresMedia) {
          mediaStatusRef.current = "paused";
          setMediaStatus("paused");
        } else {
          mediaStatusRef.current = "not-required";
          setMediaStatus("not-required");
        }

        restore({
          ...saved.session,
          state: validCompletion ? "completed" : "paused",
          completed: validCompletion,
          mediaPositionSeconds: restoredMediaPosition,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not restore practice progress.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          loadedRef.current = true;
          setRestoring(false);
        }
      });

    return () => {
      cancelled = true;
      loadedRef.current = false;
      mountedRef.current = false;
    };
  }, [
    userId,
    config.id,
    effectiveConfig,
    requiresMedia,
    config.timing.type,
    restore,
  ]);

  const handleMediaStatusChange = useCallback(
    (
      status: PracticeMediaStatus,
      positionSeconds?: number,
    ) => {
      const previousStatus = mediaStatusRef.current;

      mediaStatusRef.current = status;
      setMediaStatus(status);

      let savePosition = false;

      if (
        typeof positionSeconds === "number" &&
        Number.isFinite(positionSeconds) &&
        positionSeconds >= 0
      ) {
        mediaPositionRef.current = positionSeconds;
        setMediaPositionSeconds(positionSeconds);

        if (
          Math.abs(
            positionSeconds -
              lastSavedMediaPositionRef.current,
          ) >= 5 ||
          status === "paused" ||
          status === "completed" ||
          status === "error"
        ) {
          lastSavedMediaPositionRef.current =
            positionSeconds;
          savePosition = true;
        }
      }

      if (status === "error") {
        mediaFailedRef.current = true;
        setMediaFailed(true);

        setError(
          "Media playback failed. Your practice cannot continue using this attempt.",
        );
      }

      if (
        status === "playing" &&
        !mediaFailedRef.current
      ) {
        playedRef.current = true;
        setHasPlayedMedia(true);

        if (playerRef.current.state === "idle") {
          start();
        } else if (playerRef.current.state === "paused") {
          resume();
        }
      }

      const playbackFailed =
        status === "error" || status === "loading";

      const playbackInterrupted =
        status === "paused" &&
        previousStatus === "playing";

      if (
        playerRef.current.state === "running" &&
        (
          playbackFailed ||
          playbackInterrupted ||
          mediaFailedRef.current
        )
      ) {
        pause();
      }

      if (savePosition && loadedRef.current) {
        void saveSession(
          playerRef.current.state,
          playerRef.current.elapsedMs,
          playerRef.current.state === "completed",
        ).catch(() => {
          if (mountedRef.current) {
            setError("Could not save practice progress.");
          }
        });
      }
    },
    [pause, start, resume, saveSession],
  );

  useEffect(() => {
    playerRef.current = {
      state,
      elapsedMs,
    };
  }, [state, elapsedMs]);

  const handleStart = () => {
    if (restoring || saving || isSaving) {
      return;
    }

    if (!canStart()) {
      return;
    }

    setError(null);
    start();
  };

  const handleResume = () => {
    if (restoring || saving || isSaving) {
      return;
    }

    if (!canStart()) {
      return;
    }

    setError(null);
    resume();
  };

  const handleRestart = () => {
    if (restoring || saving || isSaving) {
      return;
    }

    if (!canStart()) {
      return;
    }

    playedRef.current = false;
    setHasPlayedMedia(false);

    mediaFailedRef.current = false;
    setMediaFailed(false);

    mediaPositionRef.current = 0;
    lastSavedMediaPositionRef.current = 0;
    setMediaPositionSeconds(0);

    setError(null);
    sessionStartedAtRef.current = Date.now();
    lastSavedSecondRef.current = -1;

    setRestartToken((value) => value + 1);
    restart();
  };

  const handleFinish = () => {
    if (
      config.timing.type !== "open-ended" ||
      restoring ||
      saving ||
      isSaving
    ) {
      return;
    }

    if (
      !canCompletePractice({
        config: effectiveConfig,
        elapsedActiveMs: playerRef.current.elapsedMs,
        mediaStatus: mediaFailedRef.current
          ? "error"
          : mediaStatusRef.current,
        hasPlayedMedia: playedRef.current,
        requestedFinish: true,
      })
    ) {
      return;
    }

    finish();
  };

  const handleExit = async () => {
    if (restoring || saving || isSaving) {
      return;
    }

    const untouched =
      playerRef.current.state === "idle" &&
      playerRef.current.elapsedMs === 0 &&
      mediaPositionRef.current === 0 &&
      !playedRef.current &&
      sessionStartedAtRef.current === null;

    if (untouched) {
      onExit?.();
      return;
    }

    setSaving(true);

    try {
      const wasCompletedBeforeExit =
        playerRef.current.state === "completed";

      if (playerRef.current.state === "running") {
        pause();
      }

      // Exiting is never itself a completion action. If pause races with the
      // timer boundary, preserve an unfinished session as paused.
      const elapsed = getElapsedMs();
      const savedState: PracticePlayerState =
        wasCompletedBeforeExit ? "completed" : "paused";

      playerRef.current = {
        state: savedState,
        elapsedMs: elapsed,
      };

      await saveSession(
        savedState,
        elapsed,
        wasCompletedBeforeExit,
      );

      await storageQueueRef.current;
      onExit?.();
    } catch {
      setError("Could not save practice progress before exiting.");
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  };

  const handleContinue = async () => {
    if (
      state !== "completed" ||
      restoring ||
      saving ||
      isSaving ||
      advancingRef.current ||
      !onContinue
    ) {
      return;
    }

    if (
      mediaFailedRef.current ||
      (
        requiresMedia &&
        (
          !playedRef.current ||
          !mediaIsUsable()
        )
      )
    ) {
      setError("Required media is unavailable. Cannot continue.");
      return;
    }

    advancingRef.current = true;
    setSaving(true);
    setError(null);

    try {
      await storageQueueRef.current;

      if (
        mediaFailedRef.current ||
        (
          requiresMedia &&
          (
            !playedRef.current ||
            !mediaIsUsable()
          )
        )
      ) {
        setError(
          "Required media became unavailable. Cannot continue.",
        );
        return;
      }

      const result = await onContinue();

      if (result === false) {
        setError("Could not advance practice. Please retry.");
        return;
      }

      await queueSave(() =>
        clearPracticeSession(userId, config.id),
      );
    } catch {
      setError("Could not advance practice. Please retry.");
    } finally {
      advancingRef.current = false;

      if (mountedRef.current) {
        setSaving(false);
      }
    }
  };

  const totalSeconds = Math.ceil(
  (remainingMs ?? elapsedMs) / 1000,
  );

  const formattedTime =
    `${Math.floor(totalSeconds / 60)}:` +
    `${(totalSeconds % 60).toString().padStart(2, "0")}`;

  const mediaBlocked =
    mediaFailed ||
    (
      requiresMedia &&
      !canStartPractice(effectiveConfig, mediaStatus)
    );

  const busy = restoring || saving || isSaving;

  const canContinue =
    state === "completed" &&
    !busy &&
    !!onContinue &&
    !mediaFailed &&
    (
      !requiresMedia ||
      (
        hasPlayedMedia &&
        canStartPractice(effectiveConfig, mediaStatus)
      )
    );

  const canLogDistractionTap =
    distractionTapLabels.length > 0 &&
    state === "running" &&
    !busy &&
    !mediaFailed &&
    distractionEvents.length < 300;

  const handleDistractionTap = (rawLabel: string) => {
    const label = rawLabel.trim();

    if (
      !canLogDistractionTap ||
      playerRef.current.state !== "running" ||
      !loadedRef.current ||
      !distractionTapLabels.includes(label) ||
      label.length < 1 ||
      label.length > 40
    ) {
      return;
    }

    const existingEvents = distractionEventsRef.current;
    if (existingEvents.length >= 300) {
      return;
    }

    const existingIds = new Set(
      existingEvents.map((event) => event.id),
    );
    let id = "";

    do {
      tapSequenceRef.current += 1;
      id = `tap-${Date.now().toString(36)}-${tapSequenceRef.current.toString(36)}`;
    } while (existingIds.has(id));

    const event: DistractionTapEvent = {
      id,
      at: new Date().toISOString(),
      label,
    };
    const nextEvents = [...existingEvents, event];

    // Keep the UI and local ref in sync before queueing durable device storage.
    distractionEventsRef.current = nextEvents;
    setDistractionEvents(nextEvents);

    const elapsed = getElapsedMs();
    playerRef.current = {
      state: "running",
      elapsedMs: elapsed,
    };

    void saveSession("running", elapsed, false).catch(() => {
      if (mountedRef.current) {
        setError(
          "Could not save the latest Practice tap. It is still visible on this screen; retry saving before leaving.",
        );
      }
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        {config.title}
      </Text>

      {!!config.description && (
        <Text style={styles.text}>{config.description}</Text>
      )}

      <Text accessibilityLiveRegion="polite">
        Current State: {state}
      </Text>

      {restoring && <Text>Restoring saved practice…</Text>}

      {instructions.map((instruction, index) => (
        <Text style={styles.text} key={index}>
          {instruction}
        </Text>
      ))}

      {config.media?.type === "audio" && (
        <Image
          accessibilityLabel="AIM-YA logo"
          resizeMode="contain"
          source={require("../../assets/images/aimya-logo.png")}
          style={styles.practiceLogo}
        />
      )}

      {distractionTapLabels.length > 0 && (
        <View style={styles.tapLogger}>
          <Text accessibilityRole="header" style={styles.tapLoggerTitle}>
            Notice a wandering
          </Text>
          <Text style={styles.text}>
            When attention wanders, notice it without judgment and label it.
          </Text>
          <View style={styles.controls}>
            {distractionTapLabels.map((label) => (
              <Control
                key={label}
                label={`Log ${label}`}
                disabled={!canLogDistractionTap}
                onPress={() => handleDistractionTap(label)}
              />
            ))}
          </View>
          <Text accessibilityLiveRegion="polite">
            Distraction taps recorded: {distractionEvents.length} / 300
          </Text>
          {distractionEvents.length > 0 && (
            <Text style={styles.text}>
              {`Most recent tap: ${distractionEvents[distractionEvents.length - 1].label} · ${new Date(distractionEvents[distractionEvents.length - 1].at).toLocaleTimeString()}`}
            </Text>
          )}
          {distractionEvents.length >= 300 && (
            <Text style={styles.error}>
              The local tap log limit of 300 events has been reached.
            </Text>
          )}
        </View>
      )}

      {!restoring && (
        <PracticeMediaPlayer
          media={config.media}
          state={state}
          restartToken={restartToken}
          position={mediaPositionSeconds}
          onMediaStatusChange={handleMediaStatusChange}
          onRestart={handleRestart}
        />
      )}

      {requiresMedia && (
        <Text accessibilityLiveRegion="polite">
          Media: {mediaStatus}
          {hasPlayedMedia ? " · Playback confirmed" : ""}
          {hasMedia ? ` · Position: ${Math.floor(mediaPositionSeconds)}s` : ""}
        </Text>
      )}

      {mediaBlocked && (
        <Text style={styles.error}>
          Required media is not ready. This practice cannot start
          or complete until playback works.
        </Text>
      )}

      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}

      {config.timing.type === "timed" ? (
        <Text accessibilityRole="timer" style={styles.timer}>
          {formattedTime}
        </Text>
      ) : (
        <Text style={styles.timer}>
          {Math.floor(elapsedMs / 1000)} seconds
        </Text>
      )}

      <View style={styles.controls}>
        <Control
          label="Start"
          disabled={busy || state !== "idle" || mediaBlocked}
          onPress={handleStart}
        />

        <Control
          label="Pause"
          disabled={busy || state !== "running"}
          onPress={pause}
        />

        <Control
          label="Resume"
          disabled={busy || state !== "paused" || mediaBlocked}
          onPress={handleResume}
        />

        <Control
          label="Restart"
          disabled={
            busy ||
            mediaBlocked ||
            state === "idle" ||
            state === "exited"
          }
          onPress={handleRestart}
        />

        {mediaFailed && (
          <Control
            label="Retry media"
            disabled={busy}
            onPress={() => {
              mediaFailedRef.current = false;
              setMediaFailed(false);
              setError(null);
              mediaStatusRef.current = "loading";
              setMediaStatus("loading");
              setRestartToken((value) => value + 1);
            }}
          />
        )}

        {config.timing.type === "open-ended" && (
          <Control
            label="Finish"
            disabled={
              busy ||
              mediaBlocked ||
              (state !== "running" && state !== "paused")
            }
            onPress={handleFinish}
          />
        )}

        <Control
          label="Exit"
          disabled={busy || state === "exited"}
          onPress={() => void handleExit()}
        />

        {state === "completed" && !!onContinue && (
          <Control
            label="Continue to check-in"
            disabled={!canContinue}
            onPress={() => void handleContinue()}
          />
        )}
      </View>
    </ScrollView>
  );
}

function Control({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 32,
    paddingBottom: 56,
    gap: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
  },
  text: {
    fontSize: 16,
    lineHeight: 24,
  },
  practiceLogo: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 360,
    height: 280,
  },
  tapLogger: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#b9cbbd",
    borderRadius: 12,
    gap: 12,
  },
  tapLoggerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  timer: {
    fontSize: 44,
    fontWeight: "700",
  },
  controls: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  button: {
    padding: 14,
    minHeight: 48,
    backgroundColor: "#41644a",
    borderRadius: 10,
    minWidth: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.4,
  },
  error: {
    color: "#b42318",
    fontSize: 15,
  },
});

export default ReusablePracticePlayer;
