import React from "react";
import { cleanup, render } from "@testing-library/react-native";
import { InstructorProgressScreen } from "../src/components/instructor-progress-screen";
import { INSTRUCTOR_TEST_DATA, activityStatus, weekStatus, progressTotals } from "../lib/instructor-progress";

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }) => require("react").createElement(require("react-native").View, null, children),
}));
jest.mock("../src/components/accessibility", () => ({
  AccessibleHeading: ({ children }) => require("react").createElement(require("react-native").Text, null, children),
}));
jest.mock("../src/components/themed-text", () => ({
  ThemedText: ({ children, ...props }) => require("react").createElement(require("react-native").Text, props, children),
}));
jest.mock("../src/components/themed-view", () => ({
  ThemedView: ({ children, ...props }) => require("react").createElement(require("react-native").View, props, children),
}));
afterEach(async () => { await cleanup(); });

test("totals and week status agree with the roster and activity statuses", () => {
  expect(progressTotals(INSTRUCTOR_TEST_DATA)).toEqual({
    students: 3, weeks: 2, activities: 8, possible: 24,
    completed: 13, inProgress: 1, notStarted: 10, completedWeeks: 3,
  });
  expect(weekStatus(INSTRUCTOR_TEST_DATA, "demo-01", 2)).toBe("completed");
  expect(weekStatus(INSTRUCTOR_TEST_DATA, "demo-02", 2)).toBe("in_progress");
  expect(weekStatus(INSTRUCTOR_TEST_DATA, "demo-03", 1)).toBe("not_started");
  expect(activityStatus({ ...INSTRUCTOR_TEST_DATA, progress: [] }, "demo-01", "w1-arrive")).toBe("not_started");
});

test("renders course content, roster, week and activity statuses, and readable totals", async () => {
  const screen = await render(<InstructorProgressScreen data={INSTRUCTOR_TEST_DATA} />);
  for (const text of ["Instructor progress", "Read-only preview · Test data", "Course content", "Roster and progress",
    "Student 01", "Student 02", "Student 03", "Week 1: Mindful Attention", "Week 2: Body Awareness",
    "13 of 24 student activities completed", "1 in progress · 10 not started", "3 of 6 student weeks completed"]) {
    expect(screen.getByText(text)).toBeTruthy();
  }
  expect(screen.getAllByText("Completed").length).toBe(13);
  expect(screen.getAllByText("In progress").length).toBe(1);
  expect(screen.getAllByText("Not started").length).toBe(10);
});

test("does not render private fields or expose editing or journal-reading controls", async () => {
  const data = { ...INSTRUCTOR_TEST_DATA,
    roster: INSTRUCTOR_TEST_DATA.roster.map(student => ({ ...student, journal: "PRIVATE-JOURNAL-SENTINEL" })),
    progress: INSTRUCTOR_TEST_DATA.progress.map(item => ({ ...item, writing: "PRIVATE-WRITING-SENTINEL", reflection_answers: { answer: "PRIVATE-ANSWER-SENTINEL" } })),
  };
  const screen = await render(<InstructorProgressScreen data={data} />);
  expect(screen.queryAllByText(/PRIVATE-/)).toHaveLength(0);
  expect(screen.queryAllByRole("button")).toHaveLength(0);
  expect(screen.queryAllByRole("link")).toHaveLength(0);
  expect(screen.queryAllByRole("textbox")).toHaveLength(0);
});

test("empty course and roster show zero totals and clear empty states", async () => {
  const data = { ...INSTRUCTOR_TEST_DATA, roster: [], weeks: [], progress: [] };
  const screen = await render(<InstructorProgressScreen data={data} />);
  expect(screen.getByText("No course content is available.")).toBeTruthy();
  expect(screen.getByText("No students are enrolled.")).toBeTruthy();
  expect(screen.getByText("0 of 0 student activities completed")).toBeTruthy();
  expect(weekStatus(data, "demo-01", 1)).toBe("not_started");
});
