import { supabase } from "./supabase";
import type { ReflectionAnswers } from "./progress";

// Client check-in contract, persisted in progress.reflection_answers.
// This location stays in progress and is not sent to the sensation AI endpoint.
export const BODY_REGIONS = [
  { id: "head", label: "Head" },
  { id: "neck_shoulders", label: "Neck and shoulders" },
  { id: "chest", label: "Chest" },
  { id: "upper_back", label: "Upper back" },
  { id: "abdomen", label: "Abdomen" },
  { id: "lower_back", label: "Lower back" },
  { id: "left_arm", label: "Left arm" },
  { id: "right_arm", label: "Right arm" },
  { id: "left_hand", label: "Left hand" },
  { id: "right_hand", label: "Right hand" },
  { id: "left_leg", label: "Left leg" },
  { id: "right_leg", label: "Right leg" },
  { id: "left_foot", label: "Left foot" },
  { id: "right_foot", label: "Right foot" },
] as const;

export type BodyRegion = typeof BODY_REGIONS[number]["id"];
export type WeekTwoArrival = {
  region: BodyRegion | null;
  step: "week_two_arrive" | "week_two_practice";
};

export function isBodyRegion(value: unknown): value is BodyRegion {
  return BODY_REGIONS.some(region => region.id === value);
}

async function owner(userId: string) {
  const { data, error } = await supabase.auth.getUser();
  if (error || data.user?.id !== userId) throw new Error("Sign in again to access your body-map check-in.");
}

async function activity(activityId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activityId)) {
    throw new Error("A valid Week 2 activity is required.");
  }
  const { data, error } = await supabase.from("activities").select("id,weeks!inner(week_number,is_published)")
    .eq("id", activityId).eq("weeks.week_number", 2).eq("is_published", true)
    .eq("weeks.is_published", true).maybeSingle();
  if (error || !data) throw new Error("This Week 2 activity is unavailable. Return to the curriculum and retry.");
}

export type WeekTwoRecord = {
  reflection_answers: ReflectionAnswers;
  current_step: string;
  status: string;
  started_at: string | null;
  updated_at: string;
  completed_at?: string | null;
};

export async function readWeekTwoRecord(userId: string, activityId: string): Promise<WeekTwoRecord | null> {
  await owner(userId);
  await activity(activityId);
  await owner(userId);
  const { data, error } = await supabase.from("progress")
    .select("reflection_answers,current_step,status,started_at,updated_at,completed_at")
    .eq("user_id", userId).eq("activity_id", activityId).maybeSingle();
  if (error) throw new Error("Could not load your body-map check-in. Please retry.");
  await owner(userId);
  return data;
}

function arrival(record: WeekTwoRecord | null): WeekTwoArrival {
  const region = record?.reflection_answers?.arrive_body_region;
  if (region != null && !isBodyRegion(region)) throw new Error("Your saved location could not be read. Please retry loading.");
  return {
    region: region ?? null,
    step: region && record?.current_step === "week_two_practice" ? "week_two_practice" : "week_two_arrive",
  };
}

export async function loadWeekTwoArrival(userId: string, activityId: string): Promise<WeekTwoArrival> {
  return arrival(await readWeekTwoRecord(userId, activityId));
}

export async function saveWeekTwoArrival(
  userId: string, activityId: string, region: BodyRegion, advance = true,
): Promise<WeekTwoArrival> {
  if (!isBodyRegion(region)) throw new Error("Choose a body region before continuing.");
  const existing = await readWeekTwoRecord(userId, activityId);
  if (existing?.status === "completed") throw new Error("This activity is already complete. Return to the curriculum.");
  const values = {
    reflection_answers: { ...existing?.reflection_answers, arrive_body_region: region },
    current_step: advance ? "week_two_practice" : "week_two_arrive",
    status: "in_progress",
    started_at: existing?.started_at ?? new Date().toISOString(),
    completed_at: null,
  };
  await owner(userId);
  const query = existing
    ? supabase.from("progress").update(values).eq("user_id", userId).eq("activity_id", activityId)
      .eq("updated_at", existing.updated_at)
    : supabase.from("progress").upsert({ ...values, user_id: userId, activity_id: activityId },
      { onConflict: "user_id,activity_id", ignoreDuplicates: true });
  const { data, error } = await query.select("reflection_answers,current_step,status,started_at,updated_at").maybeSingle();
  if (error) throw new Error("Could not save your location. Your selection is still here. Please retry.");
  if (!data) throw new Error("Your check-in changed while saving. Reload it before continuing.");
  await owner(userId);
  return arrival(data);
}

export const requireWeekTwoOwner = owner;
