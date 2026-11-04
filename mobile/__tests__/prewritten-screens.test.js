import React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";
import { WeekOnePrewrittenChoice, WeekOnePrewrittenReflection } from "../src/components/week-one-prewritten";
import { WeekTwoPrewrittenResults } from "../src/components/week-two-prewritten";
import { WeekTwoExplore, WeekTwoNotice } from "../src/components/week-two-explore-notice";

jest.mock("../lib/supabase", () => ({ supabase: {} }));
jest.mock("@/hooks/use-theme", () => ({ useTheme: () => ({ text: "#000", backgroundElement: "#fff" }) }));
jest.mock("../src/components/accessibility", () => ({
  AccessibleHeading: ({ children }) => require("react").createElement(require("react-native").Text, null, children),
  AccessibleStatus: ({ children }) => require("react").createElement(require("react-native").Text, null, children),
}));
jest.mock("../src/components/themed-text", () => ({
  ThemedText: ({ children, ...props }) => require("react").createElement(require("react-native").Text, props, children),
}));

const labels = {
  modeTitle: "Prewritten activity",
  modeDescription: "Use examples and prompts written in advance. Your response is not analyzed by AI.",
  disclosure: "Prewritten activity. These examples and prompts were written in advance.",
  responseScreen: "Your words are saved as entered. This activity does not interpret your writing.",
  resultFooter: "Source: Prewritten content, version 1.0",
};
const weekOne = {
  kind: "prewritten", provider: "prewritten", contentVersion: "1.0.0", labels,
  result: {
    instruction: "Choose one, adapt it, or write your own.",
    examples: ["Pause before responding.", "Ask what information is missing."],
    reflectionPrompts: ["First prompt?", "Second prompt?", "Third prompt?", "Fourth prompt?"],
  },
};
const weekTwo = {
  kind: "prewritten", provider: "prewritten", contentVersion: "1.0.0", labels,
  result: {
    vocabulary: [{ area: "Breath", words: ["steady", "shallow"] }],
    reflectionPrompts: ["Choose three to five words.", "Where in your body?", "What changed?", "What did you observe?"],
  },
};
const READY = { status: "ready", mode: { mode: "prewritten", available: true, contentVersion: "1.0.0", labels } };

afterEach(async () => { await cleanup(); });

describe("Week 1 choice", () => {
  const setup = (onSave = jest.fn(async () => true), initialIntention = "") => {
    const onContinue = jest.fn();
    return {
      onSave, onContinue,
      screen: render(<WeekOnePrewrittenChoice record={weekOne} initialIntention={initialIntention}
        continueLabel="Continue" onSave={onSave} onContinue={onContinue} />),
    };
  };

  test("identifies its source and offers every example as the student's choice", async () => {
    const { screen } = setup();
    const ui = await screen;
    expect(ui.getByText("Prewritten activity")).toBeTruthy();
    expect(ui.getByText(labels.disclosure)).toBeTruthy();
    expect(ui.getByText("Choose one, adapt it, or write your own.")).toBeTruthy();
    expect(ui.getByText(labels.resultFooter)).toBeTruthy();
    for (const example of weekOne.result.examples) {
      expect(ui.getByRole("radio", { name: example })).toBeTruthy();
    }
    expect(ui.queryByText(/AI generated|personalized|recommended/i)).toBeNull();
  });

  test("saves the adapted words exactly as entered, with the content version", async () => {
    const { screen, onSave, onContinue } = setup();
    const ui = await screen;
    await fireEvent.press(ui.getByRole("radio", { name: "Pause before responding." }));
    const adapted = "  Pause before I reply to messages.  ";
    await fireEvent.changeText(ui.getByLabelText("Your intention"), adapted);
    await fireEvent.press(ui.getByRole("button", { name: "Save my intention" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0];
    expect(saved.week_one_prewritten_intention).toBe(adapted);
    const record = JSON.parse(saved.week_one_prewritten_result);
    expect(record.contentVersion).toBe("1.0.0");
    expect(record.provider).toBe("prewritten");
    expect(record.kind).toBeUndefined();
    expect(JSON.stringify(record)).not.toContain("reply to messages");
    await waitFor(() => expect(ui.getByRole("button", { name: "Continue" })).toBeTruthy());
    await fireEvent.press(ui.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  test("a student can write their own without choosing an example", async () => {
    const { screen, onSave } = setup();
    const ui = await screen;
    expect(ui.getByRole("button", { name: "Save my intention" }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(ui.getByLabelText("Your intention"), "My own words.");
    await fireEvent.press(ui.getByRole("button", { name: "Save my intention" }));
    await waitFor(() => expect(onSave.mock.calls[0][0].week_one_prewritten_intention).toBe("My own words."));
  });

  test("a failed save keeps the words and allows a retry", async () => {
    const onSave = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { screen } = setup(onSave);
    const ui = await screen;
    await fireEvent.changeText(ui.getByLabelText("Your intention"), "Keep these words.");
    await fireEvent.press(ui.getByRole("button", { name: "Save my intention" }));
    await waitFor(() => expect(ui.getByText(/Could not save your intention/)).toBeTruthy());
    expect(ui.getByLabelText("Your intention").props.value).toBe("Keep these words.");
    await fireEvent.press(ui.getByRole("button", { name: "Save my intention" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  });

  test("a restored intention is shown and can continue without saving again", async () => {
    const { screen, onSave } = setup(undefined, "Saved words.");
    const ui = await screen;
    expect(ui.getByLabelText("Your intention").props.value).toBe("Saved words.");
    expect(ui.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("Week 1 reflection", () => {
  test("shows the fixed prompts instead of AI gap questions, and requires all four", async () => {
    const onSave = jest.fn(async () => true);
    const ui = await render(<WeekOnePrewrittenReflection record={weekOne} busy={false} onExit={jest.fn()} onSave={onSave}
      savedAnswers={{ week_one_prewritten_intention: "My intention." }} />);
    expect(ui.getByText("My intention.")).toBeTruthy();
    expect(ui.queryByText(/mock|AI gap|intentions get right/i)).toBeNull();
    const complete = () => ui.getByRole("button", { name: "Complete Week 1" });
    expect(complete().props.accessibilityState.disabled).toBe(true);
    for (const prompt of weekOne.result.reflectionPrompts) {
      await fireEvent.changeText(ui.getByLabelText(prompt), `Answer to ${prompt}`);
    }
    expect(complete().props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(complete());
    expect(onSave.mock.calls[0][1]).toBe(true);
    expect(onSave.mock.calls[0][0].week_one_prewritten_prompt_4).toBe("Answer to Fourth prompt?");
  });
});

describe("Week 2", () => {
  const answers = { week_two_sensation_1: "tight", week_two_sensation_2: "warm", week_two_sensation_3: "calm" };

  test("the student chooses words, which are saved in their own key", async () => {
    const onChange = jest.fn();
    const ui = await render(<WeekTwoPrewrittenResults record={weekTwo} answers={answers} busy={false} onChange={onChange} />);
    expect(ui.getByText(labels.resultFooter)).toBeTruthy();
    await fireEvent.press(ui.getByRole("checkbox", { name: "steady" }));
    expect(onChange).toHaveBeenCalledWith("week_two_prewritten_words", "steady");
    await fireEvent.changeText(ui.getByLabelText("What changed?"), "Slower breathing.");
    expect(onChange).toHaveBeenCalledWith("week_two_prewritten_prompt_3", "Slower breathing.");
  });

  test("a chosen word is shown as checked and can be removed", async () => {
    const onChange = jest.fn();
    const ui = await render(<WeekTwoPrewrittenResults record={weekTwo} busy={false} onChange={onChange}
      answers={{ ...answers, week_two_prewritten_words: "steady\nshallow" }} />);
    expect(ui.getByRole("checkbox", { name: "steady" }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(ui.getByRole("checkbox", { name: "steady" }));
    expect(onChange).toHaveBeenCalledWith("week_two_prewritten_words", "shallow");
  });

  const explore = (mode, data = null) => render(<WeekTwoExplore mode={mode} answers={answers} data={data} support={null}
    busy={false} retry={false} onChange={jest.fn()} onGenerate={jest.fn()} onContinue={jest.fn()} />);

  test("Explore identifies the prewritten mode and drops the AI-processing wording", async () => {
    const ui = await explore(READY);
    expect(ui.getByText("Prewritten activity")).toBeTruthy();
    expect(ui.queryByText(/AI processing/)).toBeNull();
    expect(ui.getByRole("button", { name: "Show the word list" }).props.accessibilityState.disabled).toBe(false);
  });

  test("an unavailable mode says so, keeps the writing, and blocks generation", async () => {
    const retry = jest.fn();
    const ui = await explore({ status: "unavailable", message: "The selected mode is unavailable. Choose another mode or try again.", retry });
    expect(ui.getByText(/selected mode is unavailable/)).toBeTruthy();
    expect(ui.getByLabelText("Sensation 1").props.value).toBe("tight");
    expect(ui.getByRole("button", { name: "Generate sensation words" }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(ui.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  test("Claude results are labeled as AI-generated", async () => {
    const words = { kind: "words", provider: "claude", items: [
      { original: "tight", isVague: false, suggestions: [] },
      { original: "warm", isVague: false, suggestions: [] },
      { original: "calm", isVague: false, suggestions: [] },
    ] };
    const ui = await explore({ status: "ready", mode: { mode: "claude", available: true, contentVersion: null, labels: null } }, words);
    expect(ui.getByText(/AI-generated with Claude/)).toBeTruthy();
  });

  test("Notice keeps the existing completion rule and shows the source", async () => {
    const ui = await render(<WeekTwoNotice answers={answers} data={weekTwo} busy={false} onChange={jest.fn()} onComplete={jest.fn()} />);
    expect(ui.getByText(labels.resultFooter)).toBeTruthy();
    expect(ui.getByRole("button", { name: "Complete Week 2" }).props.accessibilityState.disabled).toBe(true);
  });
});
