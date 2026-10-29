import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react-native";
import { GuidingQuestionsPreview } from "../src/components/guiding-questions-preview";
import { BASELINE_DEFINITION_FIXTURE as definition, BASELINE_DRAFT_FIXTURE as record, WEEK_ACCESS_FIXTURE as weeks } from "../src/components/guiding-questions-preview.fixtures";

jest.mock("@/hooks/use-theme", () => ({ useTheme: () => ({ text: "#000", backgroundElement: "#fff" }) }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: ({ children }) => require("react").createElement(require("react-native").View, null, children) }));
jest.mock("../src/components/themed-text", () => ({ ThemedText: ({ children, ...props }) => require("react").createElement(require("react-native").Text, props, children) }));
jest.mock("../src/components/themed-view", () => ({ ThemedView: ({ children }) => require("react").createElement(require("react-native").View, null, children) }));
jest.mock("../src/components/accessibility", () => ({
  AccessibleHeading: ({ children }) => require("react").createElement(require("react-native").Text, null, children),
  AccessibleStatus: ({ children }) => require("react").createElement(require("react-native").Text, null, children),
}));
afterEach(cleanup);
const props = { definition, record, weeks, onBack: jest.fn() };

test("five ordered fields retain separate answers and require all five without a word minimum", async () => {
  const screen = await render(<GuidingQuestionsPreview {...props} />);
  const fields = screen.getAllByLabelText(/^Guiding Question \d:/);
  expect(fields).toHaveLength(5);
  expect(fields[0].props.value).toBe(record.answers.q1);
  expect(screen.getByRole("button", { name: "Review five answers" })).toBeDisabled();
  await fireEvent.changeText(fields[0], "One short answer");
  expect(screen.getAllByLabelText(/^Guiding Question \d:/)[1].props.value).toBe(record.answers.q2);
  await fireEvent.changeText(fields[4], "Fifth answer");
  expect(screen.getByRole("button", { name: "Review five answers" })).not.toBeDisabled();
  await fireEvent.press(screen.getByText("Review five answers"));
  expect(screen.getByText(/Nothing has been submitted or saved/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Return to curriculum for Week 2" })).toBeDisabled();
  expect(record.answers.q5).toBe("");
});

test("definition limits count Unicode code points and invalid input remains editable", async () => {
  const short = { ...definition, questions: definition.questions.map(q => ({ ...q, maxCharacters: 2 })) };
  const blank = { ...record, answers: {} };
  const screen = await render(<GuidingQuestionsPreview {...props} definition={short} record={blank} />);
  for (const field of screen.getAllByLabelText(/^Guiding Question \d:/)) await fireEvent.changeText(field, "😀😀");
  expect(screen.getByRole("button", { name: "Review five answers" })).not.toBeDisabled();
  await fireEvent.changeText(screen.getAllByLabelText(/^Guiding Question \d:/)[0], "😀😀x");
  expect(screen.getByText("Question 1 exceeds its character limit.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Review five answers" })).toBeDisabled();
});

test("submitted originals and retired definitions remain readable without editing", async () => {
  const screen = await render(<GuidingQuestionsPreview {...props} record={{ ...record, status: "submitted" }} />);
  expect(screen.getAllByLabelText(/^Guiding Question \d:/).every(field => !field.props.editable)).toBe(true);
  expect(screen.queryByText("Review five answers")).toBeNull();
  await screen.rerender(<GuidingQuestionsPreview {...props} definition={{ ...definition, isPublished: false }} />);
  expect(screen.getByText(/question set is retired/)).toBeTruthy();
  expect(screen.getAllByLabelText(/^Guiding Question \d:/).every(field => !field.props.editable)).toBe(true);
});

test("unavailable and mismatched definitions offer return navigation instead of incorrect fields", async () => {
  const onBack = jest.fn();
  const screen = await render(<GuidingQuestionsPreview {...props} definition={null} onBack={onBack} />);
  expect(screen.queryAllByLabelText(/^Guiding Question \d:/)).toHaveLength(0);
  await fireEvent.press(screen.getByRole("button", { name: "Back to curriculum" }));
  expect(onBack).toHaveBeenCalledTimes(1);
  await screen.rerender(<GuidingQuestionsPreview {...props} record={{ ...record, definitionVersion: 99 }} />);
  expect(screen.queryAllByLabelText(/^Guiding Question \d:/)).toHaveLength(0);
});

test("supplied lock states show prerequisites and block navigation without affecting available weeks", async () => {
  const onBack = jest.fn();
  const screen = await render(<GuidingQuestionsPreview {...props} onBack={onBack} />);
  expect(screen.getByText("Week 1: Available")).toBeTruthy();
  expect(screen.getByText("Week 2: Locked")).toBeTruthy();
  expect(screen.getByText(/Example prerequisite: submit all five/)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Return to curriculum for Week 2" }));
  expect(onBack).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Return to curriculum for Week 1" }));
  expect(onBack).toHaveBeenCalledTimes(1);
});
