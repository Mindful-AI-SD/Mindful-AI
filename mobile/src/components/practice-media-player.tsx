
import { createElement, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { Asset } from "expo-asset";
import { Text, View } from "react-native";

import * as PracticeMediaModule from "./practice-media";
import type { PracticeMediaProps } from "./practice-media.types";
import type {
  PracticeMediaStatus,
  PracticePlayerMedia,
  PracticePlayerState,
} from "./practice-player.types";

interface PracticeMediaPlayerProps {
  media?: PracticePlayerMedia;
  state: PracticePlayerState;
  restartToken: number;
  position: number;
  onMediaStatusChange: (
    status: PracticeMediaStatus,
    positionSeconds?: number,
  ) => void;
  onRestart?: () => void;
}

type MediaComponent = ComponentType<PracticeMediaProps>;
type AdapterComponent = ComponentType<PracticeMediaPlayerProps>;

type MediaModuleShape = {
  default?: MediaComponent;
  PracticeMedia?: MediaComponent;
  PracticeMediaPlayer?: AdapterComponent;
};

const mediaExports =
  PracticeMediaModule as unknown as MediaModuleShape;

const MockedAdapter = mediaExports.PracticeMediaPlayer;
const PlatformMedia =
  mediaExports.default ?? mediaExports.PracticeMedia;

export function PracticeMediaPlayer(props: PracticeMediaPlayerProps) {
  if (MockedAdapter) {
    return createElement(MockedAdapter, props);
  }

  return <ResolvedPracticeMediaPlayer {...props} />;
}

function ResolvedPracticeMediaPlayer({
  media,
  state,
  restartToken,
  position,
  onMediaStatusChange,
  onRestart,
}: PracticeMediaPlayerProps) {
  const [uri, setUri] = useState<string | null>(null);
  const [loadingError, setLoadingError] = useState(false);

  const callbacks = useRef(onMediaStatusChange);
  callbacks.current = onMediaStatusChange;

  const mediaType = media?.type;
  const source =
    media && media.type !== "none"
      ? media.source
      : null;

  useEffect(() => {
    let cancelled = false;

    setUri(null);
    setLoadingError(false);

    if (!media || media.type === "none") {
      callbacks.current("not-required", position);

      return () => {
        cancelled = true;
      };
    }

    callbacks.current("loading", position);

    if (typeof source === "string") {
      if (!source.trim()) {
        setLoadingError(true);
        callbacks.current("error", position);

        return () => {
          cancelled = true;
        };
      }

      setUri(source);

      return () => {
        cancelled = true;
      };
    }

    if (
      typeof source !== "number" ||
      !Number.isFinite(source) ||
      source <= 0
    ) {
      setLoadingError(true);
      callbacks.current("error", position);

      return () => {
        cancelled = true;
      };
    }

    void Asset.fromModule(source)
      .downloadAsync()
      .then((asset) => {
        if (cancelled) {
          return;
        }

        const resolvedUri = asset.localUri ?? asset.uri;

        if (!resolvedUri) {
          setLoadingError(true);
          callbacks.current("error", position);
          return;
        }

        setUri(resolvedUri);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadingError(true);
          callbacks.current("error", position);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mediaType, source]);

  if (!media || media.type === "none") {
    return null;
  }

  if (loadingError) {
    return (
      <View accessibilityLiveRegion="polite">
        <Text>
          The practice recording could not be loaded.
          Your saved position is preserved.
        </Text>
      </View>
    );
  }

  if (!uri) {
    return (
      <View accessibilityLiveRegion="polite">
        <Text>Loading practice media…</Text>
      </View>
    );
  }

  if (!PlatformMedia) {
    return (
      <View accessibilityLiveRegion="polite">
        <Text>
          Practice playback is unavailable. Your progress
          cannot be completed until media playback works.
        </Text>
      </View>
    );
  }

  return (
    <PlatformMedia
      key={uri}
      type={media.type}
      url={uri}
      position={position}
      playbackState={state}
      restartToken={restartToken}
      onStatus={(status, positionSeconds) => {
        callbacks.current(status, positionSeconds);
      }}
      onRestart={() => {
        onRestart?.();
      }}
    />
  );
}

export default PracticeMediaPlayer;
