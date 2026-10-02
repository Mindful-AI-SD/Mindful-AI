const mockQuery = {
  delete: jest.fn(),
  eq: jest.fn(),
  in: jest.fn(),
  select: jest.fn(),
};
mockQuery.delete.mockReturnValue(mockQuery);
mockQuery.eq.mockReturnValue(mockQuery);
mockQuery.in.mockReturnValue(mockQuery);

const mockSupabase = {
  auth: { getSession: jest.fn() },
  from: jest.fn(() => mockQuery),
};
const mockClearBreathingSession = jest.fn();

jest.mock("../lib/supabase", () => ({ supabase: mockSupabase }));
jest.mock("../lib/breathing-session-storage", () => ({
  clearBreathingSession: mockClearBreathingSession,
}));

const {
  resetSignedInWeekOneProgressForDevelopment,
} = require("../lib/dev-progress-reset");

describe("resetSignedInWeekOneProgressForDevelopment", () => {
  const originalDev = global.__DEV__;

  beforeEach(() => {
    jest.clearAllMocks();
    global.__DEV__ = true;
    mockQuery.delete.mockReturnValue(mockQuery);
    mockQuery.eq.mockReturnValue(mockQuery);
    mockQuery.in.mockReturnValue(mockQuery);
    mockClearBreathingSession.mockResolvedValue(undefined);
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "signed-in-user" } } },
      error: null,
    });
    mockQuery.select.mockResolvedValue({
      data: [{ activity_id: "activity-1" }],
      error: null,
    });
  });

  afterAll(() => {
    global.__DEV__ = originalDev;
  });

  test("is unavailable in production", async () => {
    global.__DEV__ = false;

    await expect(resetSignedInWeekOneProgressForDevelopment(["activity-1"]))
      .rejects.toThrow("unavailable in production builds");
    expect(mockSupabase.auth.getSession).not.toHaveBeenCalled();
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  test("requires the active signed-in session", async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(resetSignedInWeekOneProgressForDevelopment(["activity-1"]))
      .rejects.toThrow("Sign in again");
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  test("deletes only the signed-in user's listed Week 1 activities", async () => {
    const deleted = await resetSignedInWeekOneProgressForDevelopment([
      "activity-1",
      "activity-1",
      "activity-2",
    ]);

    expect(deleted).toBe(1);
    expect(mockSupabase.from).toHaveBeenCalledWith("progress");
    expect(mockQuery.eq).toHaveBeenCalledWith("user_id", "signed-in-user");
    expect(mockQuery.in).toHaveBeenCalledWith("activity_id", ["activity-1", "activity-2"]);
    expect(mockClearBreathingSession).toHaveBeenCalledTimes(2);
    expect(mockClearBreathingSession).toHaveBeenCalledWith("signed-in-user", "activity-1");
    expect(mockClearBreathingSession).toHaveBeenCalledWith("signed-in-user", "activity-2");
  });
});
