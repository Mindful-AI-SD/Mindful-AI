export function isPublishableKey(value: string): boolean {
  return /^sb_publishable_[A-Za-z0-9_-]+$/.test(value);
}

export function isPublicSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
  } catch {
    return false;
  }
}

export function validateClientConfig(url: string, key: string): void {
  if (!isPublicSupabaseUrl(url) || !isPublishableKey(key)) {
    // Never echo configuration values, which could contain a misplaced secret.
    throw new Error("Use a public Supabase URL and an sb_publishable_ client key in the Expo configuration.");
  }
}
