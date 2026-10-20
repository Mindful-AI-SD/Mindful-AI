import { useEffect, useRef } from "react";
import { AppState, Pressable, View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useVideoPlayer, VideoView } from "expo-video";
import { ThemedText } from "./themed-text";
import type { PracticeMediaProps } from "./practice-media.types";

function AudioPractice(props: PracticeMediaProps) {
  const player = useAudioPlayer({ uri: props.url }, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const restored = useRef(false);
  const callbacks = useRef(props); callbacks.current = props;
  useEffect(() => {
    if (status.isLoaded && !restored.current) {
      restored.current = true;
      void player.seekTo(Math.min(props.position, status.duration)).catch(() => callbacks.current.onStatus("error", props.position));
    }
    callbacks.current.onStatus(status.playbackState === "error" ? "error" : !status.isLoaded ? "loading" : status.didJustFinish ? "completed" : status.playing ? "playing" : "paused", status.currentTime);
  }, [status.isLoaded, status.playbackState, status.didJustFinish, status.playing, status.currentTime, status.duration, player, props.position]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => { if (state !== "active") player.pause(); });
    return () => { subscription.remove(); };
  }, [player]);
  return <View style={{ gap: 12 }}>
    <Pressable accessibilityRole="button" disabled={!status.isLoaded} style={{ minHeight: 48, padding: 12 }} onPress={() => {
      try { if (status.playing) player.pause(); else player.play(); } catch { props.onStatus("error", status.currentTime); }
    }}><ThemedText>{status.playing ? "Pause media" : "Play media"}</ThemedText></Pressable>
    <Pressable accessibilityRole="button" disabled={!status.isLoaded} style={{ minHeight: 48, padding: 12 }} onPress={() => {
      props.onRestart(); void player.seekTo(0).then(() => player.play()).catch(() => props.onStatus("error", status.currentTime));
    }}><ThemedText>Restart media</ThemedText></Pressable>
  </View>;
}

function VideoPractice(props: PracticeMediaProps) {
  const player = useVideoPlayer({ uri: props.url }, instance => { instance.timeUpdateEventInterval = 0.5; });
  const callbacks = useRef(props); callbacks.current = props;
  const restored = useRef(false);
  useEffect(() => {
    const status = () => {
      if (player.status === "readyToPlay" && !restored.current) { restored.current = true; player.currentTime = Math.min(callbacks.current.position, player.duration); }
      callbacks.current.onStatus(player.status === "error" ? "error" : player.status === "readyToPlay" ? "ready" : "loading", player.currentTime);
    };
    const listeners = [player.addListener("statusChange", status),
      player.addListener("playingChange", ({ isPlaying }) => callbacks.current.onStatus(isPlaying ? "playing" : "paused", player.currentTime)),
      player.addListener("timeUpdate", ({ currentTime }) => callbacks.current.onStatus(player.playing ? "playing" : "paused", currentTime)),
      player.addListener("playToEnd", () => callbacks.current.onStatus("completed", player.currentTime))];
    const app = AppState.addEventListener("change", state => { if (state !== "active") player.pause(); });
    status();
    return () => { listeners.forEach(listener => listener.remove()); app.remove(); };
  }, [player]);
  return <View style={{ gap: 12 }}>
    <VideoView player={player} nativeControls={false} style={{ width: "100%", height: 240 }} accessibilityLabel="Practice video" />
    <Pressable accessibilityRole="button" style={{ minHeight: 48, padding: 12 }} onPress={() => {
      try { if (player.playing) player.pause(); else player.play(); } catch { props.onStatus("error", player.currentTime); }
    }}><ThemedText>Play or pause media</ThemedText></Pressable>
    <Pressable accessibilityRole="button" style={{ minHeight: 48, padding: 12 }} onPress={() => {
      try { props.onRestart(); player.currentTime = 0; player.play(); } catch { props.onStatus("error", player.currentTime); }
    }}><ThemedText>Restart media</ThemedText></Pressable>
  </View>;
}

export default function PracticeMedia(props: PracticeMediaProps) {
  return props.type === "audio" ? <AudioPractice {...props} /> : <VideoPractice {...props} />;
}
