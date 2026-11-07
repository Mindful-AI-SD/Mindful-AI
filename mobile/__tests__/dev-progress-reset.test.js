const mockQuery = {
  delete: jest.fn(),
  eq: jest.fn(),
  gte: jest.fn(),
  in: jest.fn(),
  lte: jest.fn(),
  select: jest.fn(),
  upsert: jest.fn(),
};
mockQuery.delete.mockReturnValue(mockQuery);
mockQuery.eq.mockReturnValue(mockQuery);
mockQuery.gte.mockReturnValue(mockQuery);
mockQuery.in.mockReturnValue(mockQuery);
mockQuery.upsert.mockReturnValue(mockQuery);

const mockSupabase = {
  auth: { getSession: jest.fn() },
  from: jest.fn(() => mockQuery),
};
const mockClearBreathingSession = jest.fn();
const mockAsyncStorage = {
  getAllKeys: jest.fn(),
  multiRemove: jest.fn(),
};
let mockMutationResult;

jest.mock("../lib/supabase", () => ({ supabase: mockSupabase }));
jest.mock("../lib/breathing-session-storage", () => ({
  clearBreathingSession: mockClearBreathingSession,
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: mockAsyncStorage,
}));

const {
  completeSignedInProgressThroughWeekForDevelopment,
  resetSignedInProgressFromWeekForDevelopment,
  resetSignedInWeekOneProgressForDevelopment,
} = require("../lib/dev-progress-reset");

describe("resetSignedInWeekOneProgressForDevelopment", () => {
  const originalDev = global.__DEV__;

  beforeEach(() => {
    jest.clearAllMocks();
    global.__DEV__ = true;
    mockQuery.delete.mockReturnValue(mockQuery);
    mockQuery.eq.mockReturnValue(mockQuery);
    mockQuery.gte.mockReturnValue(mockQuery);
    mockQuery.in.mockReturnValue(mockQuery);
    mockQuery.upsert.mockReturnValue(mockQuery);
    mockClearBreathingSession.mockResolvedValue(undefined);
    mockAsyncStorage.getAllKeys.mockResolvedValue([]);
    mockAsyncStorage.multiRemove.mockResolvedValue(undefined);
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "signed-in-user" } } },
      error: null,
    });
    mockMutationResult = {
      data: [{ activity_id: "activity-1" }],
      error: null,
    };
    mockQuery.select.mockImplementation((columns) =>
      columns.startsWith("id, weeks!inner")
        ? mockQuery
        : Promise.resolve(mockMutationResult)
    );
  });

  test("resets the selected week and later weeks for only the signed-in user", async () => {
    mockQuery.lte.mockResolvedValueOnce({
      data: [
        { id: "activity-2", weeks: { week_number: 2, is_published: true } },
        { id: "activity-3", weeks: { week_number: 3, is_published: true } },
      ],
      error: null,
    });
    mockMutationResult = {
      data: [{ activity_id: "activity-2" }, { activity_id: "activity-3" }],
      error: null,
    };
    mockAsyncStorage.getAllKeys.mockResolvedValue([
      "week-three-screen-fixture:v1:signed-in-user:activity-3",
      "module-practice:signed-in-user:activity-2:session",
      "module-practice:another-user:activity-2:session",
    ]);

    const deleted = await resetSignedInProgressFromWeekForDevelopment(2);

    expect(deleted).toBe(2);
    expect(mockQuery.gte).toHaveBeenCalledWith("weeks.week_number", 2);
    expect(mockQuery.lte).toHaveBeenCalledWith("weeks.week_number", 3);
    expect(mockQuery.eq).toHaveBeenCalledWith("user_id", "signed-in-user");
    expect(mockQuery.in).toHaveBeenCalledWith("activity_id", ["activity-2", "activity-3"]);
    expect(mockAsyncStorage.multiRemove).toHaveBeenCalledWith([
      "week-three-screen-fixture:v1:signed-in-user:activity-3",
      "module-practice:signed-in-user:activity-2:session",
    ]);
  });

  test("completes every published activity through the selected week", async () => {
    mockQuery.lte.mockResolvedValueOnce({
      data: [
        { id: "activity-1", weeks: { week_number: 1, is_published: true } },
        { id: "activity-2", weeks: { week_number: 2, is_published: true } },
      ],
      error: null,
    });
    mockMutationResult = {
      data: [{ activity_id: "activity-1" }, { activity_id: "activity-2" }],
      error: null,
    };

    const completed = await completeSignedInProgressThroughWeekForDevelopment(2);

    expect(completed).toBe(2);
    expect(mockQuery.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: "signed-in-user",
          activity_id: "activity-1",
          status: "completed",
          current_step: "completed",
        }),
        expect.objectContaining({
          user_id: "signed-in-user",
          activity_id: "activity-2",
          status: "completed",
          current_step: "completed",
        }),
      ]),
      { onConflict: "user_id,activity_id" },
    );
  });

  test("does not invent completion for a missing published week", async () => {
    mockQuery.lte.mockResolvedValueOnce({
      data: [
        { id: "activity-1", weeks: { week_number: 1, is_published: true } },
      ],
      error: null,
    });

    await expect(completeSignedInProgressThroughWeekForDevelopment(2))
      .rejects.toThrow("Published Week 2 has no activities");
    expect(mockQuery.upsert).not.toHaveBeenCalled();
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
