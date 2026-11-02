import React from "react";
import { Text } from "react-native";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ActivityRouteGate } from "../src/components/activity-route-gate";
import { getActivityWeek, getWeekAccess } from "../lib/week-access";
import { router } from "expo-router";
jest.mock("expo-router", () => ({
  router: { replace: jest.fn() },
  useFocusEffect: effect => require("react").useEffect(effect, [effect]),
}));
jest.mock("../lib/week-access", () => ({ getWeekAccess: jest.fn(), getActivityWeek: jest.fn() }));
jest.mock("../src/components/auth-gate", () => ({ useSignedInUserId: () => "student" }));
jest.mock("../src/components/themed-text", () => ({ ThemedText: ({ children, ...props }) => require("react").createElement(require("react-native").Text, props, children) }));
jest.mock("../src/components/accessibility", () => ({ AccessibleStatus: ({ children }) => require("react").createElement(require("react-native").Text, null, children) }));
afterEach(cleanup);
test("a direct player link cannot start an activity in a locked later week", async () => {
  getActivityWeek.mockResolvedValue(2);
  getWeekAccess.mockResolvedValue({ allowed: false, message: "Complete Week 1 before opening Week 2." });
  const screen = await render(<ActivityRouteGate activityId="activity"><Text>Player persistence mounted</Text></ActivityRouteGate>);
  await waitFor(() => expect(screen.getByText(/Complete Week 1/)).toBeTruthy());
  expect(screen.queryByText("Player persistence mounted")).toBeNull();
});
test("an unlocked wrong-week player link routes to the correct module instead of running Week 1 controls", async () => {
  getActivityWeek.mockResolvedValue(3);
  getWeekAccess.mockResolvedValue({ allowed: true });
  const screen = await render(<ActivityRouteGate activityId="canonical"><Text>Wrong player</Text></ActivityRouteGate>);
  await waitFor(() => expect(screen.getByText("Open saved Week 3")).toBeTruthy());
  expect(screen.queryByText("Wrong player")).toBeNull();
  await fireEvent.press(screen.getByText("Open saved Week 3"));
  expect(router.replace).toHaveBeenCalledWith({ pathname: "/", params: { week: "3", activityId: "canonical" } });
});
