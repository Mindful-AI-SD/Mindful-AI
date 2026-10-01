import { supabase } from "./supabase";

export const WEEK_ONE_STEPS = [
  "breathing",
  "post_breathing_check_in",
  "writing",
  "intention_mirror",
  "data_self_portrait",
  "ai_gap_reflection",
  "yellowdig_draft",
  "completed",
] as const;

export type WeekOneStep =
  (typeof WEEK_ONE_STEPS)[number];

export type ProgressStatus =
  | "not_started"
  | "in_progress"
  | "completed";

export type GeneratedIntention = {
  title: string;
  explanation: string;
};

export type ReflectionAnswers = Record<
  string,
  string
>;

export type WeekOneProgress = {
  user_id: string;
  activity_id: string;
  status: ProgressStatus;
  current_step: WeekOneStep;
  writing: string | null;
  generated_intentions: GeneratedIntention[];
  reflection_answers: ReflectionAnswers;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type GapReflectionAnswers = {
  ai_gap_got_right: string;
  ai_gap_missed: string;
  ai_gap_reveals: string;
};

export type GapReflection = {
  intentions: GeneratedIntention[] | null;
  answers: GapReflectionAnswers;
};

export type PostBreathingCheckIn = {
  urge: string;
  note: string;
};

export type DataSelfPortraitAnswers = {
  data_self_portrait_1: string;
  data_self_portrait_2: string;
  data_self_portrait_3: string;
};

async function requireDraftOwner(
  userId: string,
) {
  const { data, error } =
    await supabase.auth.getSession();

  if (
    error ||
    data.session?.user.id !== userId
  ) {
    throw new Error(
      "Sign in again to access your saved progress.",
    );
  }
}

function hasThreeIntentions(
  value: unknown,
): value is GeneratedIntention[] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (item) =>
        item &&
        typeof item.title === "string" &&
        item.title.trim().length > 0 &&
        typeof item.explanation === "string" &&
        item.explanation.trim().length > 0,
    )
  );
}

function readReflectionAnswers(
  value: unknown,
): ReflectionAnswers {
  if (
    value === undefined ||
    value === null
  ) {
    return {};
  }

  if (
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.values(value).some(
      (answer) =>
        typeof answer !== "string",
    )
  ) {
    throw new Error(
      "Could not read your saved reflection. Please retry.",
    );
  }

  return value as ReflectionAnswers;
}

export async function getProgressWriting(
  userId: string,
  activityId: string,
): Promise<string> {
  await requireDraftOwner(userId);

  const { data, error } = await supabase
    .from("progress")
    .select("writing")
    .eq("user_id", userId)
    .eq("activity_id", activityId)
    .maybeSingle();

  if (error) {
    throw new Error(
      "Could not load your saved writing. Please retry.",
    );
  }

  await requireDraftOwner(userId);

  return data?.writing ?? "";
}

export async function saveProgressWriting(
  userId: string,
  activityId: string,
  writing: string,
): Promise<void> {
  await requireDraftOwner(userId);

  const { data, error } = await supabase
    .from("progress")
    .upsert(
      {
        user_id: userId,
        activity_id: activityId,
        writing,
      },
      {
        onConflict:
          "user_id,activity_id",
      },
    )
    .select("user_id")
    .single();

  if (error || !data) {
    throw new Error(
      "Could not save your writing. Please retry.",
    );
  }
}

export async function saveProgressIntentions(
  userId: string,
  activityId: string,
  intentions: GeneratedIntention[],
): Promise<void> {
  if (!hasThreeIntentions(intentions)) {
    throw new Error(
      "Three complete intentions are required.",
    );
  }

  await requireDraftOwner(userId);

  const { data, error } = await supabase
    .from("progress")
    .upsert(
      {
        user_id: userId,
        activity_id: activityId,
        generated_intentions:
          intentions,
      },
      {
        onConflict:
          "user_id,activity_id",
      },
    )
    .select("user_id")
    .single();

  if (error || !data) {
    throw new Error(
      "Could not save your intentions. Please retry.",
    );
  }
}

export async function getGapReflection(
  userId: string,
  activityId: string,
): Promise<GapReflection> {
  await requireDraftOwner(userId);

  const { data, error } = await supabase
    .from("progress")
    .select(
      "generated_intentions, reflection_answers",
    )
    .eq("user_id", userId)
    .eq("activity_id", activityId)
    .maybeSingle();

  if (error) {
    throw new Error(
      "Could not load your saved intentions and reflection. Please retry.",
    );
  }

  await requireDraftOwner(userId);

  const answers =
    readReflectionAnswers(
      data?.reflection_answers,
    );

  return {
    intentions: hasThreeIntentions(
      data?.generated_intentions,
    )
      ? data.generated_intentions
      : null,

    answers: {
      ai_gap_got_right:
        answers.ai_gap_got_right ??
        "",

      ai_gap_missed:
        answers.ai_gap_missed ??
        "",

      ai_gap_reveals:
        answers.ai_gap_reveals ??
        "",
    },
  };
}

export async function saveGapReflection(
  userId: string,
  activityId: string,
  answers: GapReflectionAnswers,
): Promise<void> {
  await requireDraftOwner(userId);

  const {
    data: existing,
    error: readError,
  } = await supabase
    .from("progress")
    .select("reflection_answers")
    .eq("user_id", userId)
    .eq("activity_id", activityId)
    .maybeSingle();

  if (readError) {
    throw new Error(
      "Could not save your reflection. Please retry.",
    );
  }

  const previousAnswers =
    readReflectionAnswers(
      existing?.reflection_answers,
    );

  await requireDraftOwner(userId);

  const { data, error } = await supabase
    .from("progress")
    .upsert(
      {
        user_id: userId,
        activity_id: activityId,

        reflection_answers: {
          ...previousAnswers,
          ...answers,
        },
      },
      {
        onConflict:
          "user_id,activity_id",
      },
    )
    .select("user_id")
    .single();

  if (error || !data) {
    throw new Error(
      "Could not save your reflection. Please retry.",
    );
  }
}

/*
 * Data as Self Portrait
 */

export async function getDataSelfPortrait(
  userId: string,
  activityId: string,
): Promise<DataSelfPortraitAnswers> {
  await requireDraftOwner(userId);

  const { data, error } = await supabase
    .from("progress")
    .select("reflection_answers")
    .eq("user_id", userId)
    .eq("activity_id", activityId)
    .maybeSingle();

  if (error) {
    throw new Error(
      "Could not load your Data as Self Portrait reflection. Please retry.",
    );
  }

  await requireDraftOwner(userId);

  const answers =
    readReflectionAnswers(
      data?.reflection_answers,
    );

  return {
    data_self_portrait_1:
      answers.data_self_portrait_1 ??
      "",

    data_self_portrait_2:
      answers.data_self_portrait_2 ??
      "",

    data_self_portrait_3:
      answers.data_self_portrait_3 ??
      "",
  };
}

export async function saveDataSelfPortrait(
  userId: string,
  activityId: string,
  answers: DataSelfPortraitAnswers,
): Promise<void> {
  const answer1 =
    answers.data_self_portrait_1.trim();

  const answer2 =
    answers.data_self_portrait_2.trim();

  const answer3 =
    answers.data_self_portrait_3.trim();

  if (
    !answer1 ||
    !answer2 ||
    !answer3
  ) {
    throw new Error(
      "Answer all three reflection questions before continuing.",
    );
  }

  await requireDraftOwner(userId);

  const {
    data: existing,
    error: readError,
  } = await supabase
    .from("progress")
    .select(
      "reflection_answers, current_step",
    )
    .eq("user_id", userId)
    .eq("activity_id", activityId)
    .maybeSingle();

  if (readError) {
    throw new Error(
      "Could not save your Data as Self Portrait reflection. Please retry.",
    );
  }

  const previousAnswers =
    readReflectionAnswers(
      existing?.reflection_answers,
    );

  await requireDraftOwner(userId);

  const { data, error } = await supabase
    .from("progress")
    .upsert(
      {
        user_id: userId,
        activity_id: activityId,

        status: "in_progress",

        current_step:
          "ai_gap_reflection",

        reflection_answers: {
          ...previousAnswers,

          data_self_portrait_1:
            answer1,

          data_self_portrait_2:
            answer2,

          data_self_portrait_3:
            answer3,
        },
      },
      {
        onConflict:
          "user_id,activity_id",
      },
    )
    .select("user_id")
    .single();

  if (error || !data) {
    throw new Error(
      "Could not save your Data as Self Portrait reflection. Please retry.",
    );
  }
}

/*
 * Called only after the breathing timer reaches
 * its full duration.
 * This unlocks the post-breathing check-in.
 */
export async function completeBreathingStep(
  userId: string,
  activityId: string,
): Promise<void> {
  await requireDraftOwner(userId);

  const now =
    new Date().toISOString();

  const { data, error } = await supabase
    .from("progress")
    .upsert(
      {
        user_id: userId,
        activity_id: activityId,

        status: "in_progress",

        current_step:
          "post_breathing_check_in",

        started_at: now,
      },
      {
        onConflict:
          "user_id,activity_id",
      },
    )
    .select("user_id")
    .single();

  if (error || !data) {
    throw new Error(
      "Could not save breathing completion. Please retry.",
    );
  }
}

/*
 * The check-in is allowed when breathing
 * has already advanced progress beyond the
 * breathing step.
 */
export async function canOpenPostBreathingCheckIn(
  userId: string,
  activityId: string,
): Promise<boolean> {
  await requireDraftOwner(userId);

  const { data, error } = await supabase
    .from("progress")
    .select("current_step")
    .eq("user_id", userId)
    .eq("activity_id", activityId)
    .maybeSingle();

  if (error) {
    throw new Error(
      "Could not verify breathing completion. Please retry.",
    );
  }

  await requireDraftOwner(userId);

  if (!data?.current_step) {
    return false;
  }

  const currentIndex =
    WEEK_ONE_STEPS.indexOf(
      data.current_step as WeekOneStep,
    );

  const checkInIndex =
    WEEK_ONE_STEPS.indexOf(
      "post_breathing_check_in",
    );

  return (
    currentIndex >= checkInIndex
  );
}

export async function getPostBreathingCheckIn(
  userId: string,
  activityId: string,
): Promise<PostBreathingCheckIn> {
  await requireDraftOwner(userId);

  const { data, error } = await supabase
    .from("progress")
    .select("reflection_answers")
    .eq("user_id", userId)
    .eq("activity_id", activityId)
    .maybeSingle();

  if (error) {
    throw new Error(
      "Could not load your breathing check-in. Please retry.",
    );
  }

  await requireDraftOwner(userId);

  const answers =
    readReflectionAnswers(
      data?.reflection_answers,
    );

  return {
    urge:
      answers.post_breathing_urge ??
      "",

    note:
      answers.post_breathing_note ??
      "",
  };
}

export async function savePostBreathingCheckIn(
  userId: string,
  activityId: string,
  checkIn: PostBreathingCheckIn,
): Promise<void> {
  if (
    checkIn.urge !== "yes" &&
    checkIn.urge !== "no"
  ) {
    throw new Error(
      "Select an answer before continuing.",
    );
  }

  await requireDraftOwner(userId);

  const {
    data: existing,
    error: readError,
  } = await supabase
    .from("progress")
    .select(
      "reflection_answers, current_step",
    )
    .eq("user_id", userId)
    .eq("activity_id", activityId)
    .maybeSingle();

  if (readError) {
    throw new Error(
      "Could not save your breathing check-in. Please retry.",
    );
  }

  if (!existing?.current_step) {
    throw new Error(
      "Complete the breathing activity before submitting the check-in.",
    );
  }

  const currentIndex =
    WEEK_ONE_STEPS.indexOf(
      existing.current_step as WeekOneStep,
    );

  const checkInIndex =
    WEEK_ONE_STEPS.indexOf(
      "post_breathing_check_in",
    );

  if (
    currentIndex < checkInIndex
  ) {
    throw new Error(
      "Complete the breathing activity before submitting the check-in.",
    );
  }

  const previousAnswers =
    readReflectionAnswers(
      existing.reflection_answers,
    );

  await requireDraftOwner(userId);

  const { data, error } = await supabase
    .from("progress")
    .upsert(
      {
        user_id: userId,
        activity_id: activityId,

        status: "in_progress",

        current_step: "writing",

        reflection_answers: {
          ...previousAnswers,

          post_breathing_urge:
            checkIn.urge,

          post_breathing_note:
            checkIn.note,
        },
      },
      {
        onConflict:
          "user_id,activity_id",
      },
    )
    .select("user_id")
    .single();

  if (error || !data) {
    throw new Error(
      "Could not save your breathing check-in. Please retry.",
    );
  }
}