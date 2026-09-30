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

export type WeekOneStep = (typeof WEEK_ONE_STEPS)[number];

export type ProgressStatus =
  | "not_started"
  | "in_progress"
  | "completed";

export type GeneratedIntention = {
  title: string;
  explanation: string;
};

export type ReflectionAnswers = Record<string, string>;

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

export type PostBreathingCheckIn = {
  urge: "yes" | "no" | "";
  note: string;
};

async function requireDraftOwner(userId: string) {
  const { data, error } = await supabase.auth.getSession();

  if (error || data.session?.user.id !== userId) {
    throw new Error("Sign in again to access your saved writing.");
  }
}

function readReflectionAnswers(value: unknown): ReflectionAnswers {
  if (value === undefined || value === null) {
    return {};
  }

  if (
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.values(value).some(
      (answer) => typeof answer !== "string",
    )
  ) {
    throw new Error(
      "Could not read your saved reflection. Please retry.",
    );
  }

  return value as ReflectionAnswers;
}

export async function completeBreathingStep(
  userId: string,
  activityId: string,
): Promise<void> {
  await requireDraftOwner(userId);

  const { data: existing, error: readError } = await supabase
    .from("progress")
    .select("status, current_step, started_at")
    .eq("user_id", userId)
    .eq("activity_id", activityId)
    .maybeSingle();

  if (readError) {
    throw new Error(
      "Could not update your breathing progress. Please retry.",
    );
  }

  if (
    existing &&
    existing.current_step !== "breathing" &&
    existing.current_step !== "post_breathing_check_in"
  ) {
    return;
  }

  await requireDraftOwner(userId);

  const { data, error } = await supabase
    .from("progress")
    .upsert(
      {
        user_id: userId,
        activity_id: activityId,
        status: "in_progress",
        current_step: "post_breathing_check_in",
        started_at:
          existing?.started_at ?? new Date().toISOString(),
        completed_at: null,
      },
      {
        onConflict: "user_id,activity_id",
      },
    )
    .select("user_id")
    .single();

  if (error || !data) {
    throw new Error(
      "Could not update your breathing progress. Please retry.",
    );
  }
}

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
      "Could not verify your breathing progress. Please retry.",
    );
  }

  if (!data) {
    return false;
  }

  const currentStepIndex = WEEK_ONE_STEPS.indexOf(
    data.current_step as WeekOneStep,
  );

  const checkInStepIndex = WEEK_ONE_STEPS.indexOf(
    "post_breathing_check_in",
  );

  return currentStepIndex >= checkInStepIndex;
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
      "Could not load your saved check-in. Please retry.",
    );
  }

  const answers = readReflectionAnswers(
    data?.reflection_answers,
  );

  const savedUrge = answers.post_breathing_urge;

  return {
    urge:
      savedUrge === "yes" || savedUrge === "no"
        ? savedUrge
        : "",
    note: answers.post_breathing_note ?? "",
  };
}

export async function savePostBreathingCheckIn(
  userId: string,
  activityId: string,
  checkIn: {
    urge: "yes" | "no";
    note: string;
  },
): Promise<void> {
  await requireDraftOwner(userId);

  const { data: existing, error: readError } = await supabase
    .from("progress")
    .select(
      "current_step, reflection_answers, started_at",
    )
    .eq("user_id", userId)
    .eq("activity_id", activityId)
    .maybeSingle();

  if (readError) {
    throw new Error(
      "Could not save your check-in. Please retry.",
    );
  }

  if (!existing) {
    throw new Error(
      "Complete the breathing activity before submitting this check-in.",
    );
  }

  const currentStepIndex = WEEK_ONE_STEPS.indexOf(
    existing.current_step as WeekOneStep,
  );

  const checkInStepIndex = WEEK_ONE_STEPS.indexOf(
    "post_breathing_check_in",
  );

  if (currentStepIndex < checkInStepIndex) {
    throw new Error(
      "Complete the breathing activity before submitting this check-in.",
    );
  }

  const previousAnswers = readReflectionAnswers(
    existing.reflection_answers,
  );

  const nextStep =
    existing.current_step === "post_breathing_check_in"
      ? "writing"
      : existing.current_step;

  await requireDraftOwner(userId);

  const { data, error } = await supabase
    .from("progress")
    .upsert(
      {
        user_id: userId,
        activity_id: activityId,
        status: "in_progress",
        current_step: nextStep,
        reflection_answers: {
          ...previousAnswers,
          post_breathing_urge: checkIn.urge,
          post_breathing_note: checkIn.note,
        },
        started_at:
          existing.started_at ?? new Date().toISOString(),
        completed_at: null,
      },
      {
        onConflict: "user_id,activity_id",
      },
    )
    .select("user_id")
    .single();

  if (error || !data) {
    throw new Error(
      "Could not save your check-in. Please retry.",
    );
  }
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
        onConflict: "user_id,activity_id",
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

export type GapReflectionAnswers = {
  ai_gap_got_right: string;
  ai_gap_missed: string;
  ai_gap_reveals: string;
};

export type GapReflection = {
  intentions: GeneratedIntention[] | null;
  answers: GapReflectionAnswers;
};

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
        generated_intentions: intentions,
      },
      {
        onConflict: "user_id,activity_id",
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

  const answers = readReflectionAnswers(
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
        answers.ai_gap_got_right ?? "",
      ai_gap_missed:
        answers.ai_gap_missed ?? "",
      ai_gap_reveals:
        answers.ai_gap_reveals ?? "",
    },
  };
}

export async function saveGapReflection(
  userId: string,
  activityId: string,
  answers: GapReflectionAnswers,
): Promise<void> {
  await requireDraftOwner(userId);

  const { data: existing, error: readError } =
    await supabase
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

  const previousAnswers = readReflectionAnswers(
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
        onConflict: "user_id,activity_id",
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