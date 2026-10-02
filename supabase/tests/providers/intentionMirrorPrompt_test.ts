type Intention = { title: string; explanation: string };
type IntentionOutput = { intentions: Intention[] };
type PromptCase = {
  name: string;
  userReflection: string;
  expectedValidation: "accept" | "reject";
  expectedOutput?: unknown;
  candidateOutput?: unknown;
  unsupportedClaims?: string[];
};
type PromptFixture = {
  version: number;
  systemPrompt: string;
  outputSchema: Record<string, unknown>;
  cases: PromptCase[];
};

const fixture = JSON.parse(
  await Deno.readTextFile(
    new URL("../fixtures/intentionMirrorPrompt.json", import.meta.url),
  ),
) as PromptFixture;

const CLINICAL_LANGUAGE =
  /\b(?:diagnos(?:e|is|ed|ing)?|disorder|treatment|therap(?:y|ist|ies)|symptoms?|medicat(?:e|ion|ions|ed)|clinical|patient|mental illness)\b/i;
const UNSUPPORTIVE_LANGUAGE =
  /\b(?:you failed|you should have|stop wasting time|control yourself|your fault)\b/i;
const MAX_TITLE_CHARACTERS = 60;
const MAX_EXPLANATION_CHARACTERS = 160;
const MAX_EXPLANATION_WORDS = 24;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  return JSON.stringify(actual) === JSON.stringify([...expected].sort());
}

function validateOutput(
  value: unknown,
  unsupportedClaims: string[] = [],
): string | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["intentions"])) {
    return "output must contain only the intentions field";
  }
  if (!Array.isArray(value.intentions) || value.intentions.length !== 3) {
    return "output must contain exactly three intentions";
  }

  const text: string[] = [];
  for (const item of value.intentions) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["title", "explanation"])) {
      return "each intention must contain only title and explanation";
    }
    if (
      typeof item.title !== "string" || !item.title.trim() ||
      item.title.length > MAX_TITLE_CHARACTERS ||
      typeof item.explanation !== "string" || !item.explanation.trim() ||
      item.explanation.length > MAX_EXPLANATION_CHARACTERS
    ) {
      return "intention text is missing or exceeds its character limit";
    }
    if (item.explanation.trim().split(/\s+/u).length > MAX_EXPLANATION_WORDS) {
      return "explanation exceeds the word limit";
    }
    text.push(item.title, item.explanation);
  }

  const combinedText = text.join(" ");
  if (CLINICAL_LANGUAGE.test(combinedText)) return "clinical language is not allowed";
  if (UNSUPPORTIVE_LANGUAGE.test(combinedText)) {
    return "judgmental or coercive language is not allowed";
  }
  const normalizedText = combinedText.toLowerCase();
  if (unsupportedClaims.some((claim) => normalizedText.includes(claim.toLowerCase()))) {
    return "output contains an unsupported personal fact";
  }
  return null;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

Deno.test("Intention Mirror prompt fixture preserves the provider-neutral contract", () => {
  assert(fixture.version === 1, "fixture version must be stable");
  assert(fixture.systemPrompt.length > 0, "system prompt must be present");
  assert(fixture.systemPrompt.includes("Do not invent or infer personal facts"), "prompt must prohibit invented personal facts");
  assert(fixture.outputSchema.additionalProperties === false, "output must be strict JSON");
  assert(fixture.cases.length >= 5, "fixture must include valid and rejection cases");
});

for (const testCase of fixture.cases) {
  Deno.test(`Intention Mirror: ${testCase.name}`, () => {
    const output = testCase.expectedValidation === "accept"
      ? testCase.expectedOutput
      : testCase.candidateOutput;
    const error = validateOutput(output, testCase.unsupportedClaims);

    assert(
      (error === null) === (testCase.expectedValidation === "accept"),
      `expected validation to ${testCase.expectedValidation}; received ${error ?? "accept"}`,
    );
  });
}