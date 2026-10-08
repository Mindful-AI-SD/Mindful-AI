const mockQuery = {};
for (const method of ["select", "update", "eq", "is"]) {
  mockQuery[method] = jest.fn(() => mockQuery);
}
mockQuery.maybeSingle = jest.fn();

const mockSupabase = {
  auth: { getSession: jest.fn() },
  from: jest.fn(() => mockQuery),
};

jest.mock("../lib/supabase", () => ({ supabase: mockSupabase }));

const { completeWeekOne, getWeekOneCompletionIssue } = require("../lib/week-one");

const intentions = ["One", "Two", "Three"].map(title => ({ title, explanation: title }));

function progress(overrides = {}) {
  return {
    user_id: "user-1",
    activity_id: "activity-1",
    status: "in_progress",
    current_step: "yellowdig_draft",
    writing: "notice ".repeat(150).trim(),
    generated_intentions: intentions,
    reflection_answers: { arrive_mood: "3", arrive_energy: "4",
      post_breathing_urge: "Less urgent",
      data_self_portrait_visible: "What is visible",
      data_self_portrait_missing: "What is missing",
      ai_gap_got_right: "What it got right",
      ai_gap_missed: "What it missed",
      ai_gap_reveals: "What that reveals",
      yellowdig_draft: "My discussion draft",
    },
    started_at: "2026-10-02T12:00:00.000Z",
    completed_at: null,
    updated_at: "2026-10-02T12:15:00.000Z",
    ...overrides,
  };
}

describe("getWeekOneCompletionIssue", () => {
  test("returns the first missing step with a specific message", () => {
    const issue = getWeekOneCompletionIssue(progress({ writing: "" }));
    expect(issue).toEqual({
      missingStep: "writing",
      message: "Save at least 150 words (up to 2,000 characters) before finishing Week 1.",
    });
  });

  test("requires exactly three saved intentions", () => {
    expect(getWeekOneCompletionIssue(progress({ generated_intentions: intentions.slice(0, 2) })))
      .toEqual({
        missingStep: "writing",
        message: "Generate and save three intentions before finishing Week 1.",
      });
  });

  test("requires every reflection and the discussion draft", () => {
    const reflection_answers = { ...progress().reflection_answers };
    delete reflection_answers.ai_gap_missed;
    expect(getWeekOneCompletionIssue(progress({ reflection_answers }))).toEqual({
      missingStep: "ai_gap_reflection",
      message: "Complete all AI gap reflections before finishing Week 1.",
    });
  });

  test("allows a fully eligible Week 1 completion", () => {
    expect(getWeekOneCompletionIssue(progress())).toBeNull();
  });

  test("treats an existing completion as complete", () => {
    expect(getWeekOneCompletionIssue(progress({
      status: "completed",
      current_step: "completed",
      completed_at: "2026-10-02T12:30:00.000Z",
    }))).toBeNull();
  });
});

describe("completeWeekOne", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
      error: null,
    });
  });

  test("writes the final answers and one completion timestamp", async () => {
    const before = progress();
    const after = {
      ...before,
      status: "completed",
      current_step: "completed",
      completed_at: "2026-10-02T12:30:00.000Z",
    };
    mockQuery.maybeSingle
      .mockResolvedValueOnce({ data: before, error: null })
      .mockResolvedValueOnce({ data: after, error: null });

    const result = await completeWeekOne("user-1", "activity-1");

    expect(result.completed).toBe(true);
    expect(result.alreadyCompleted).toBe(false);
    expect(mockQuery.update).toHaveBeenCalledTimes(1);
    expect(mockQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "completed",
      current_step: "completed",
      completed_at: expect.any(String),
    }));
  });

  test("repeated completion returns the original timestamp without another write", async () => {
    const completed = progress({
      status: "completed",
      current_step: "completed",
      completed_at: "2026-10-02T12:30:00.000Z",
    });
    mockQuery.maybeSingle.mockResolvedValue({ data: completed, error: null });

    const first = await completeWeekOne("user-1", "activity-1");
    const second = await completeWeekOne("user-1", "activity-1");

    expect(first.completedAt).toBe("2026-10-02T12:30:00.000Z");
    expect(second.completedAt).toBe(first.completedAt);
    expect(first.alreadyCompleted).toBe(true);
    expect(second.alreadyCompleted).toBe(true);
    expect(mockQuery.update).not.toHaveBeenCalled();
  });

  test("a racing request reuses the timestamp written by the winner", async () => {
    const before = progress();
    const winner = progress({
      status: "completed",
      current_step: "completed",
      completed_at: "2026-10-02T12:31:00.000Z",
    });
    mockQuery.maybeSingle
      .mockResolvedValueOnce({ data: before, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: winner, error: null });

    const result = await completeWeekOne("user-1", "activity-1");

    expect(result.completed).toBe(true);
    expect(result.alreadyCompleted).toBe(true);
    expect(result.completedAt).toBe("2026-10-02T12:31:00.000Z");
  });
});
