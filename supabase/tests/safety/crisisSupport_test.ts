// Tests for the shared crisis check. All inputs are synthetic.
import {
  containsCrisisLanguage,
  CRISIS_SUPPORT_RESPONSE,
} from "../../functions/_shared/crisisSupport.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const DIRECT = [
  "I want to hurt myself",
  "I might hurt myself tonight.",
  "I am worried that I might hurt myself tonight.",
  "I plan to harm myself",
  "I'm going to kill myself",
  "I have been thinking about suicide",
  "feeling suicidal",
  "I want to die",
  "I tried to cut myself",
  "I self-harm when it gets bad",
  "My boyfriend hits me",
  "I was raped",
  "I want to hurt someone",
];

const PARAPHRASED = [
  "Lately I keep thinking everyone would be better off without me.",
  "I don't want to be here anymore",
  "I do not want to wake up tomorrow",
  "Sometimes I wish I were dead",
  "There is no point in going on",
  "My life is not worth living",
  "I can't keep going like this",
  "I've been cutting myself again",
  "I keep having thoughts of hurting myself",
  "I feel like ending it all",
  "I thought about taking my own life",
  "My dad still beats me when he drinks",
  "I am being abused at home",
  "I'm not safe at home",
];

const FORMATTING = [
  "I WANT TO HURT MYSELF",
  "I don’t want to live",
  "i   want\tto\nhurt   myself",
  "dont want to exist",
];

// Ordinary sensations and reflections that share words with crisis language.
const ORDINARY = [
  "tight shoulders",
  "a weird feeling in my chest",
  "I'm dead tired",
  "my feet are killing me",
  "I might have hurt myself at the gym",
  "I hurt myself lifting yesterday",
  "I need to cut myself some slack",
  "the stress hits me in the stomach",
  "my knee hurts when I walk",
  "I felt anxious after a private disagreement with a family member.",
  "I noticed my breathing slow down.",
  "I can't go on the trip this weekend",
  "I don't want to be here in this meeting",
  "It was okay, I guess.",
  "I like pizza.",
  "",
];

for (const text of [...DIRECT, ...PARAPHRASED, ...FORMATTING]) {
  Deno.test(`crisis check: detects "${text.replace(/\s+/g, " ")}"`, () => {
    assert(containsCrisisLanguage([text]), "must be detected");
  });
}

for (const text of ORDINARY) {
  Deno.test(`crisis check: does not flag "${text}"`, () => {
    assert(!containsCrisisLanguage([text]), "must not be flagged");
  });
}

Deno.test("crisis check: one crisis entry among several is enough", () => {
  assert(
    containsCrisisLanguage(["tight shoulders", "I want to die", "warm hands"]),
    "any entry may trigger the check",
  );
  assert(
    !containsCrisisLanguage(["tight shoulders", "weird", "warm hands"]),
    "three ordinary entries must not trigger it",
  );
  assert(!containsCrisisLanguage([]), "no text means no match");
});

Deno.test("crisis check: gives the same answer on repeated calls", () => {
  for (let call = 0; call < 3; call++) {
    assert(containsCrisisLanguage(["I want to die"]), "must stay detected");
    assert(!containsCrisisLanguage(["warm hands"]), "must stay unflagged");
  }
});

Deno.test("crisis response: names 988, UCF CAPS, and emergency services", () => {
  const text = JSON.stringify(CRISIS_SUPPORT_RESPONSE);

  assert(CRISIS_SUPPORT_RESPONSE.outcome === "support", "outcome is support");
  assert(CRISIS_SUPPORT_RESPONSE.message.length > 0, "message is present");
  assert(text.includes("988"), "must name the 988 lifeline");
  assert(
    text.includes("UCF Counseling and Psychological Services"),
    "must name UCF CAPS",
  );
  assert(text.includes("407-823-2811"), "must give the CAPS number");
  assert(text.includes("911"), "must name emergency services");
  for (const resource of CRISIS_SUPPORT_RESPONSE.resources) {
    assert(
      resource.name.length > 0 && resource.contact.length > 0,
      "every resource needs a name and a way to reach it",
    );
  }
});

Deno.test("crisis response: is fixed and cannot be changed at runtime", () => {
  assert(Object.isFrozen(CRISIS_SUPPORT_RESPONSE), "response is frozen");
  assert(
    Object.isFrozen(CRISIS_SUPPORT_RESPONSE.resources) &&
      CRISIS_SUPPORT_RESPONSE.resources.every((resource) =>
        Object.isFrozen(resource)
      ),
    "resources are frozen",
  );
  assert(
    !/diagnos|disorder|treatment|therap|symptom/i.test(
      CRISIS_SUPPORT_RESPONSE.message,
    ),
    "message must not use clinical language",
  );
});
