import { useEffect, useRef } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
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
  const duration = Number.isFinite(status.duration) ? Math.max(0, status.duration) : 0;
  const currentTime = Number.isFinite(status.currentTime) ? Math.max(0, Math.min(status.currentTime, duration || status.currentTime)) : 0;
  const remaining = Math.max(0, duration - currentTime);
  const progress = duration > 0 ? currentTime / duration : 0;
  const progressMaximum = Math.max(1, Math.round(duration));
  return <View style={styles.audioPlayer}>
    <View accessibilityRole="progressbar" accessibilityLabel="Practice audio progress"
      accessibilityValue={{ min: 0, max: progressMaximum, now: Math.min(progressMaximum, Math.round(currentTime)) }}
      style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.min(100, progress * 100)}%` }]} />
    </View>
    <View style={styles.timeRow}>
      <ThemedText accessibilityRole="timer">{formatTime(currentTime)} elapsed</ThemedText>
      <ThemedText accessibilityRole="timer">{duration > 0 ? `${formatTime(remaining)} remaining` : "Loading duration…"}</ThemedText>
    </View>
    <View style={styles.controlRow}>
    <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? "Pause audio" : "Play audio"}
      disabled={!status.isLoaded} style={[styles.control, !status.isLoaded && styles.disabled]} onPress={() => {
      try { if (status.playing) player.pause(); else player.play(); } catch { props.onStatus("error", status.currentTime); }
    }}><ThemedText>{status.playing ? "Pause" : "Play"}</ThemedText></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Restart audio"
      disabled={!status.isLoaded} style={[styles.control, !status.isLoaded && styles.disabled]} onPress={() => {
      props.onRestart(); void player.seekTo(0).then(() => player.play()).catch(() => props.onStatus("error", status.currentTime));
    }}><ThemedText>Restart</ThemedText></Pressable>
    </View>
  </View>;
}

function formatTime(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${String(wholeSeconds % 60).padStart(2, "0")}`;
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

const styles = StyleSheet.create({
  audioPlayer: { gap: 14, padding: 16, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#CAD8CF" },
  progressTrack: { height: 10, overflow: "hidden", borderRadius: 999, backgroundColor: "#DDE7E0" },
  progressFill: { height: "100%", borderRadius: 999, backgroundColor: "#41644A" },
  timeRow: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  controlRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  control: { minHeight: 48, minWidth: 112, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#DDE7E0" },
  disabled: { opacity: 0.45 },
});
