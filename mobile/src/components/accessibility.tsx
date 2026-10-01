import { useEffect, useRef } from "react";
import { AccessibilityInfo, Platform, View } from "react-native";
import { ThemedText } from "./themed-text";

// Keep the visual and reading order identical. On a screen/state change, start
// at its heading; subsequent controls follow their normal document order.
export function AccessibleHeading({ children, focusKey = children, focus = true }: {
  children: string;
  focusKey?: string;
  focus?: boolean;
}) {
  const ref = useRef<View>(null);
  useEffect(() => {
    if (!focus) return;
    const frame = requestAnimationFrame(() => {
      if (!ref.current) return;
      if (Platform.OS === "web") ref.current.focus();
      else AccessibilityInfo.sendAccessibilityEvent(ref.current, "focus");
    });
    return () => cancelAnimationFrame(frame);
  }, [focusKey, focus]);

  return (
    <View ref={ref} accessible accessibilityRole="header"
      accessibilityLabel={children} tabIndex={Platform.OS === "web" ? -1 : undefined}>
      <ThemedText type="title">{children}</ThemedText>
    </View>
  );
}

export function AccessibleStatus({ children, error = false }: {
  children: string;
  error?: boolean;
}) {
  useEffect(() => {
    // Android and web use the live region below; iOS needs an announcement.
    if (Platform.OS === "ios" && children) {
      AccessibilityInfo.announceForAccessibility(children);
    }
  }, [children]);
  return (
    <ThemedText accessibilityRole={error ? "alert" : undefined}
      accessibilityLiveRegion={error ? "assertive" : "polite"}>
      {children}
    </ThemedText>
  );
}
