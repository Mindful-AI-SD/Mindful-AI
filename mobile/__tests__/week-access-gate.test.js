import React from "react";
import { AppState, Text, TextInput } from "react-native";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";
import { WeekAccessGate } from "../src/components/week-access-gate";
import { getWeekAccess } from "../lib/week-access";
jest.mock("expo-router", () => ({ useFocusEffect: effect => require("react").useEffect(effect, [effect]) }));
jest.mock("../lib/week-access", () => ({ getWeekAccess: jest.fn() }));
jest.mock("../src/components/auth-gate", () => ({ useSignedInUserId: () => "student" }));
jest.mock("../src/components/themed-text", () => ({ ThemedText: ({ children, ...props }) => require("react").createElement(require("react-native").Text, props, children) }));
jest.mock("../src/components/accessibility", () => ({ AccessibleStatus: ({ children }) => require("react").createElement(require("react-native").Text, null, children) }));
afterEach(() => { cleanup(); jest.restoreAllMocks(); });

test("an explicit revoked prerequisite removes the previously accessible form", async () => {
  let listener;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, callback) => { listener = callback; return { remove: jest.fn() }; });
  const unmounted = jest.fn();
  function PrivateForm() {
    React.useEffect(() => () => unmounted(), []);
    return <Text>Private response</Text>;
  }
  getWeekAccess.mockResolvedValueOnce({ weekNumber: 3, allowed: true, requiredWeek: null, message: "Available" });
  const screen = await render(<WeekAccessGate weekNumber={3} onBack={jest.fn()}><PrivateForm /></WeekAccessGate>);
  await waitFor(() => expect(screen.getByText("Private response")).toBeTruthy());
  getWeekAccess.mockResolvedValueOnce({ weekNumber: 3, allowed: false, requiredWeek: 2, message: "Complete Week 2 first." });
  await act(async () => listener("active"));
  expect(screen.queryByText("Private response", { includeHiddenElements: true })).toBeNull();
  expect(unmounted).toHaveBeenCalledTimes(1);
});

test("a failed prerequisite recheck retains the mounted draft while hiding it until retry", async () => {
  let listener;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, callback) => { listener = callback; return { remove: jest.fn() }; });
  function Draft() {
    const [value, setValue] = React.useState("");
    return <TextInput accessibilityLabel="Unsaved draft" value={value} onChangeText={setValue} />;
  }
  getWeekAccess.mockResolvedValue({ weekNumber: 3, allowed: true, requiredWeek: null, message: "Available" });
  const screen = await render(<WeekAccessGate weekNumber={3} onBack={jest.fn()}><Draft /></WeekAccessGate>);
  await waitFor(() => expect(screen.getByLabelText("Unsaved draft")).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText("Unsaved draft"), "Keep this unsaved response");
  await act(async () => listener("background"));
  getWeekAccess.mockRejectedValueOnce(new Error("Offline"));
  await act(async () => listener("active"));
  expect(screen.queryByLabelText("Unsaved draft")).toBeNull();
  await fireEvent.press(screen.getByText("Check week access again"));
  await waitFor(() => expect(screen.getByLabelText("Unsaved draft").props.value).toBe("Keep this unsaved response"));
});
test("locked and loading states cannot mount the activity; retry uses fresh saved completion", async () => {
  let resolve;
  getWeekAccess.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const screen = await render(<WeekAccessGate weekNumber={2} onBack={jest.fn()}><Text>Private activity</Text></WeekAccessGate>);
  expect(screen.queryByText("Private activity")).toBeNull();
  await act(async () => resolve({ weekNumber: 2, allowed: false, requiredWeek: 1, message: "Complete Week 1 first." }));
  expect(screen.getByText("Complete Week 1 first.")).toBeTruthy();
  expect(screen.queryByText("Private activity")).toBeNull();
  getWeekAccess.mockResolvedValue({ weekNumber: 2, allowed: true, requiredWeek: null, message: "Available" });
  await fireEvent.press(screen.getByText("Check week access again"));
  await waitFor(() => expect(screen.getByText("Private activity")).toBeTruthy());
});
test("background return rechecks stale completion; a failed check hides the activity and is retryable", async () => {
  let listener;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, callback) => { listener = callback; return { remove: jest.fn() }; });
  getWeekAccess.mockResolvedValue({ weekNumber: 3, allowed: true, requiredWeek: null, message: "Available" });
  const screen = await render(<WeekAccessGate weekNumber={3} onBack={jest.fn()}><Text>Week 3 content</Text></WeekAccessGate>);
  await waitFor(() => expect(screen.getByText("Week 3 content")).toBeTruthy());
  await act(async () => listener("background"));
  expect(screen.queryByText("Week 3 content")).toBeNull();
  getWeekAccess.mockRejectedValue(new Error("Offline"));
  await act(async () => listener("active"));
  expect(screen.getByText(/Could not verify saved completion/)).toBeTruthy();
  expect(screen.queryByText("Week 3 content")).toBeNull();
});
