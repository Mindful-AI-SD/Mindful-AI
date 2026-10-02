jest.mock("../lib/supabase", () => ({ supabase: {} }));

const { deriveNextAllowedStep } = require("../lib/week-one");

function progress(overrides = {}) {
  return {
    user_id: "user-1",
    activity_id: "activity-1",
    status: "in_progress",
    current_step: "breathing",
    writing: null,
    generated_intentions: [],
    reflection_answers: {},
    started_at: "2026-10-02T12:00:00.000Z",
    completed_at: null,
    updated_at: "2026-10-02T12:00:00.000Z",
    ...overrides,
  };
}

describe("deriveNextAllowedStep", () => {
  test("starts a new user at breathing", () => {
    expect(deriveNextAllowedStep(null)).toBe("breathing");
  });

  test("does not allow a later saved step when the check-in is missing", () => {
    expect(deriveNextAllowedStep(progress({ current_step: "ai_gap_reflection" })))
      .toBe("post_breathing_check_in");
  });

  test("requires writing and exactly three intentions", () => {
    expect(deriveNextAllowedStep(progress({
      current_step: "data_self_portrait",
      reflection_answers: { post_breathing_urge: "Yes" },
      writing: "My reflection",
      generated_intentions: [{ title: "One", explanation: "First" }],
    }))).toBe("writing");
  });

  test("restores the first unfinished reflection step", () => {
    expect(deriveNextAllowedStep(progress({
      current_step: "yellowdig_draft",
      reflection_answers: {
        post_breathing_urge: "No",
        data_self_portrait_visible: "Visible answer",
        data_self_portrait_missing: "Missing answer",
      },
      writing: "My reflection",
      generated_intentions: [
        { title: "One", explanation: "First" },
        { title: "Two", explanation: "Second" },
        { title: "Three", explanation: "Third" },
      ],
    }))).toBe("ai_gap_reflection");
  });

  test("keeps a completed week viewable", () => {
    expect(deriveNextAllowedStep(progress({
      status: "completed",
      current_step: "completed",
      completed_at: "2026-10-02T12:30:00.000Z",
    }))).toBe("completed");
  });
});
