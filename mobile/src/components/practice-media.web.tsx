import { createElement, useEffect, useRef, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import { ThemedText } from "./themed-text";
import type { PracticeMediaProps } from "./practice-media.types";

export default function PracticeMedia(props: PracticeMediaProps) {
  const media = useRef<HTMLMediaElement>(null);
  const callbacks = useRef(props); callbacks.current = props;
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  function report(status: Parameters<PracticeMediaProps["onStatus"]>[0]) {
    callbacks.current.onStatus(status, media.current?.currentTime ?? callbacks.current.position);
  }
  useEffect(() => {
    const element = media.current;
    const pause = () => element?.pause();
    const subscription = AppState.addEventListener("change", state => { if (state !== "active") pause(); });
    const visibility = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { pause(); subscription.remove(); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  async function play() { try { await media.current?.play(); } catch { report("error"); } }
  return <View style={{ gap: 12 }}>
    {createElement(props.type, {
      ref: media, src: props.url, preload: "metadata", playsInline: true,
      "aria-label": `Practice ${props.type}`, style: { width: "100%", maxHeight: 360 },
      onLoadedMetadata: () => {
        if (media.current) media.current.currentTime = Math.min(props.position, Math.max(0, media.current.duration || 0));
        setReady(true); report("ready");
      },
      onPlay: () => { setPlaying(true); report("playing"); },
      onPause: () => { setPlaying(false); report("paused"); },
      onTimeUpdate: () => report(playing ? "playing" : "paused"),
      onEnded: () => { setPlaying(false); report("completed"); },
      onError: () => { media.current?.pause(); setReady(false); report("error"); },
    })}
    <Pressable accessibilityRole="button" disabled={!ready} style={{ minHeight: 48, padding: 12 }}
      onPress={() => { if (playing) media.current?.pause(); else void play(); }}>
      <ThemedText>{playing ? "Pause media" : "Play media"}</ThemedText>
    </Pressable>
    <Pressable accessibilityRole="button" disabled={!ready} style={{ minHeight: 48, padding: 12 }} onPress={() => {
      props.onRestart(); if (media.current) media.current.currentTime = 0; void play();
    }}><ThemedText>Restart media</ThemedText></Pressable>
  </View>;
}
