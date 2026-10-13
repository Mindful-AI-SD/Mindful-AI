import {
  sensationLexiconMatchesRequest,
  sensationLexiconResponseSchema,
  sensationLexiconSchema,
} from "../../schema/sensationLexiconSchema.ts";

type Fixture = {
  version: number;
  requestCases: {
    name: string;
    expectedValidation: "accept" | "reject";
    request: unknown;
  }[];
  responseContract: {
    topLevelKeys: string[];
    itemKeys: string[];
    itemCount: number;
    maximumSuggestionsPerItem: number;
    maximumSuggestionCharacters: number;
  };
  validResponse: unknown;
  invalidResponses: { name: string; response: unknown }[];
  inappropriateContentCases: {
    name: string;
    suggestion: string;
    expectedValidation: "accept" | "reject";
  }[];
};

const fixture = JSON.parse(
  await Deno.readTextFile(
    new URL("../fixtures/sensationLexiconValidation.json", import.meta.url),
  ),
) as Fixture;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

Deno.test("Sensation Lexicon fixture defines a versioned three-sensation contract", () => {
  assert(fixture.version === 1, "fixture version must be stable");
  assert(
    fixture.requestCases.some((testCase) =>
      testCase.expectedValidation === "accept"
    ),
    "fixture must include a valid request",
  );
  assert(
    fixture.requestCases.some((testCase) =>
      testCase.expectedValidation === "reject"
    ),
    "fixture must include invalid requests",
  );
  assert(
    fixture.responseContract.itemCount === 3,
    "contract must have three items",
  );
});

for (const testCase of fixture.requestCases) {
  Deno.test(`Sensation Lexicon request fixture: ${testCase.name}`, () => {
    const result = sensationLexiconSchema.safeParse(testCase.request);
    assert(
      result.success === (testCase.expectedValidation === "accept"),
      `expected ${testCase.expectedValidation}`,
    );
  });
}

Deno.test("Sensation Lexicon valid response fixture has a stable, request-matched shape", () => {
  const parsed = sensationLexiconResponseSchema.safeParse(
    fixture.validResponse,
  );
  assert(parsed.success, "valid fixture must satisfy response schema");
  if (!parsed.success) return;

  assert(
    JSON.stringify(Object.keys(parsed.data).sort()) ===
      JSON.stringify([...fixture.responseContract.topLevelKeys].sort()),
    "response must have only the contracted top-level keys",
  );
  assert(
    parsed.data.items.length === fixture.responseContract.itemCount,
    "response must contain exactly three items",
  );
  for (const item of parsed.data.items) {
    assert(
      JSON.stringify(Object.keys(item).sort()) ===
        JSON.stringify([...fixture.responseContract.itemKeys].sort()),
      "each item must have only the contracted keys",
    );
    assert(
      item.suggestions.length <=
        fixture.responseContract.maximumSuggestionsPerItem,
      "suggestion count must stay within the contract",
    );
    assert(
      item.suggestions.every((suggestion) =>
        suggestion.length <=
          fixture.responseContract.maximumSuggestionCharacters
      ),
      "suggestions must stay within the character limit",
    );
  }

  const request = sensationLexiconSchema.parse(fixture.requestCases[0].request);
  assert(
    sensationLexiconMatchesRequest(request.sensations, parsed.data),
    "response items must echo the three sensations in order",
  );
});

for (const testCase of fixture.invalidResponses) {
  Deno.test(`Sensation Lexicon response fixture: rejects ${testCase.name}`, () => {
    assert(
      !sensationLexiconResponseSchema.safeParse(testCase.response).success,
      "malformed response must be rejected",
    );
  });
}

for (const testCase of fixture.inappropriateContentCases) {
  Deno.test(`Sensation Lexicon content fixture: ${testCase.name}`, () => {
    const candidate = structuredClone(fixture.validResponse) as {
      items: { suggestions: string[] }[];
    };
    candidate.items[1].suggestions[0] = testCase.suggestion;

    assert(
      sensationLexiconResponseSchema.safeParse(candidate).success ===
        (testCase.expectedValidation === "accept"),
      `production response schema should ${testCase.expectedValidation} this candidate`,
    );
  });
}
