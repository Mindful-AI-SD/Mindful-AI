/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

/** Mindful AI student-facing design tokens. */
export const Palette = {
  canvas: '#F7F6F2', ink: '#23252D', muted: '#686C76',
  surface: '#FFFFFF', surfaceMuted: '#EAE9E5',
  lavender: '#C4C7E0', sage: '#B9D6C3', sageInk: '#365B48',
  border: '#CAD8CF',
} as const;

const studentTheme = {
  text: Palette.ink,
  background: Palette.canvas,
  backgroundElement: Palette.surface,
  backgroundSelected: Palette.lavender,
  textSecondary: Palette.muted,
};

// Keep a single readable visual system regardless of the phone's OS appearance.
export const Colors = { light: studentTheme, dark: studentTheme } as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
