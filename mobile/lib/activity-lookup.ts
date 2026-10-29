import { supabase } from "./supabase";

export type ActivityLookup = { slug: string; expectedWeek: number };
export type CanonicalActivity = {
  slug: string;
  activityId: string;
  weekId: number;
  weekNumber: number;
};
const messages = {
  AUTH_REQUIRED: "Sign in to access this activity.",
  INVALID_INPUT: "The activity lookup is invalid.",
  ACTIVITY_NOT_AVAILABLE: "This activity is unavailable.",
  ACCOUNT_CHANGED: "Your account changed. Reload before retrying.",
  ACTIVITY_LOOKUP_UNAVAILABLE: "Could not load this activity. Please retry.",
} as const;
export class ActivityLookupError extends Error {
  constructor(public readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = "ActivityLookupError";
  }
}
/** Read-only lookup, never an authorization capability for a later write. */
export async function resolveActivity(
  input: ActivityLookup,
): Promise<CanonicalActivity> {
  if (
    !input || Object.keys(input).length !== 2 ||
    typeof input.slug !== "string" || input.slug.length > 100 ||
    !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(input.slug) ||
    !Number.isInteger(input.expectedWeek) || input.expectedWeek < 1 ||
    input.expectedWeek > 8
  ) {
    throw new ActivityLookupError("INVALID_INPUT");
  }
  const request = { slug: input.slug, expectedWeek: input.expectedWeek };
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) throw new ActivityLookupError("AUTH_REQUIRED");
    const { data, error: authError } = await supabase.auth.getUser(
      session.access_token,
    );
    if (authError || data.user?.id !== session.user.id) {
      throw new ActivityLookupError("AUTH_REQUIRED");
    }
    const { data: row, error: queryError } = await supabase.rpc(
      "resolve_curriculum_activity",
      { p_request: request },
    )
      .setHeader("Authorization", `Bearer ${session.access_token}`);
    if (queryError) {
      throw new ActivityLookupError(
        Object.hasOwn(messages, queryError.message)
          ? queryError.message as keyof typeof messages
          : "ACTIVITY_LOOKUP_UNAVAILABLE",
      );
    }
    const { data: current, error: currentError } = await supabase.auth
      .getUser();
    if (currentError || current.user?.id !== session.user.id) {
      throw new ActivityLookupError("ACCOUNT_CHANGED");
    }
    if (
      !row || row.slug !== request.slug ||
      row.weekNumber !== request.expectedWeek ||
      !Number.isSafeInteger(row.weekId) || row.weekId <= 0 ||
      typeof row.activityId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        row.activityId,
      )
    ) {
      throw new ActivityLookupError("ACTIVITY_LOOKUP_UNAVAILABLE");
    }
    return {
      slug: row.slug,
      activityId: row.activityId,
      weekId: row.weekId,
      weekNumber: row.weekNumber,
    };
  } catch (error) {
    if (error instanceof ActivityLookupError) throw error;
    throw new ActivityLookupError("ACTIVITY_LOOKUP_UNAVAILABLE");
  }
}
