import { z } from "zod";

const sensation = z.string().trim().min(2).max(80);
// This phrase screen blocks common violations of the Week 2 response policy;
// it is a guardrail, not a substitute for reviewing provider-generated text.
const disallowedSuggestionLanguage =
  /\b(?:diagnos(?:e|is|ed|ing)?|disorder|clinical|symptom|treatment|caused by|because of|due to|indicates?|proves?|measured|measurement|the correct (?:word|label)|objectively correct|definitely means)\b/i;
const sensationSuggestion = z.string().trim().min(1).max(40).refine(
  (suggestion) => !disallowedSuggestionLanguage.test(suggestion),
);

export const sensationLexiconSchema = z.object({
  activityId: z.uuid(),
  activityContext: z.string().trim().min(1).max(4000),
  sensations: z.tuple([sensation, sensation, sensation]),
}).strict();

const sensationLexiconItemSchema = z.object({
  original: sensation,
  isVague: z.boolean(),
  suggestions: z.array(sensationSuggestion).max(5),
}).strict().refine(
  // Suggestions are offered for vague sensations, and only for those.
  (item) => item.isVague === (item.suggestions.length > 0),
);

export const sensationLexiconResponseSchema = z.object({
  items: z.tuple([
    sensationLexiconItemSchema,
    sensationLexiconItemSchema,
    sensationLexiconItemSchema,
  ]),
  provider: z.string().trim().min(1).max(50),
}).strict();

export type SensationLexiconRequest = z.infer<typeof sensationLexiconSchema>;

export type SensationLexiconResponse = z.infer<
  typeof sensationLexiconResponseSchema
>;

// The shape alone cannot show that a response belongs to its request. This
// checks the parts a schema cannot: each item echoes the student's own words
// in order, and no suggestion repeats that text or another suggestion.
export function sensationLexiconMatchesRequest(
  sensations: SensationLexiconRequest["sensations"],
  response: SensationLexiconResponse,
): boolean {
  return response.items.every((item, index) => {
    const offered = item.suggestions.map((suggestion) =>
      suggestion.toLowerCase()
    );

    return item.original === sensations[index] &&
      !offered.includes(item.original.toLowerCase()) &&
      new Set(offered).size === offered.length;
  });
}
