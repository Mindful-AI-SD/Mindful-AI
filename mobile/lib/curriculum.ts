import { supabase } from "./supabase";

export type CurriculumActivity = {
  id: string;
  activity_type: "mindfulness" | "ai_lab" | "ethics" | "reflection";
  title: string;
  content: string | null;
  sequence_number: number;
  duration_minutes: number | null;
};

export type CurriculumWeek = {
  id: number;
  week_number: number;
  title: string;
  theme: string;
  description: string | null;
  activities: CurriculumActivity[];
};

export async function getPublishedWeekOne(): Promise<CurriculumWeek> {
  const { data: week, error: weekError } = await supabase
    .from("weeks")
    .select("id, week_number, title, theme, description")
    .eq("week_number", 1)
    .eq("is_published", true)
    .maybeSingle();

  if (weekError) {
    throw new Error(`Could not load Week 1: ${weekError.message}`);
  }

  if (!week) {
    throw new Error("Published Week 1 was not found.");
  }

  const { data: activities, error: activitiesError } = await supabase
    .from("activities")
    .select(
      "id, activity_type, title, content, sequence_number, duration_minutes",
    )
    .eq("week_id", week.id)
    .eq("is_published", true)
    .order("sequence_number", { ascending: true });

  if (activitiesError) {
    throw new Error(
      `Could not load Week 1 activities: ${activitiesError.message}`,
    );
  }

  return {
    ...week,
    activities: activities ?? [],
  };
}