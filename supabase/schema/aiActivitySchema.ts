import { z } from "zod";
import {
  distractionAuditInputSchema,
  distractionAuditMatchesRequest,
  distractionAuditResultSchema,
} from "./distractionAuditSchema.ts";
import {
  guidedReflectionResponseSchema,
  guidedReflectionSchema,
} from "./guidedReflectionSchema.ts";
import {
  sensationLexiconMatchesRequest,
  sensationLexiconResponseSchema,
  sensationLexiconSchema,
} from "./sensationLexiconSchema.ts";

// One request and response contract for every AI activity. `kind` selects the
// activity; each kind keeps the field limits of its own schema file.
const common = {
  activityId: z.uuid(),
  activityContext: guidedReflectionSchema.shape.activityContext,
};

export const aiActivityRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("intention_mirror"),
    ...common,
    input: z.object({
      reflection: guidedReflectionSchema.shape.userReflection,
    }).strict(),
  }).strict(),
  z.object({
    kind: z.literal("sensation_lexicon"),
    ...common,
    input: z.object({
      sensations: sensationLexiconSchema.shape.sensations,
    }).strict(),
  }).strict(),
  z.object({
    kind: z.literal("distraction_audit"),
    ...common,
    input: distractionAuditInputSchema,
  }).strict(),
]);

const provider = sensationLexiconResponseSchema.shape.provider;

const generatedResponseSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("intention_mirror"),
    provider,
    result: z.object({
      intentions: guidedReflectionResponseSchema.shape.intentions,
    }).strict(),
  }).strict(),
  z.object({
    kind: z.literal("sensation_lexicon"),
    provider,
    result: z.object({
      items: sensationLexiconResponseSchema.shape.items,
    }).strict(),
  }).strict(),
  z.object({
    kind: z.literal("distraction_audit"),
    provider,
    result: distractionAuditResultSchema,
  }).strict(),
]);

// The non-AI path returns fixed content in its own shape: it never poses as a
// generated answer, and the content version travels with it.
const text = z.string().trim().min(1).max(400);
const prewrittenCommon = {
  provider: z.literal("prewritten"),
  contentVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  labels: z.object({
    modeTitle: text,
    modeDescription: text,
    disclosure: text,
    responseScreen: text,
    resultFooter: text,
  }).strict(),
};

const prewrittenResponseSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("intention_mirror"),
    ...prewrittenCommon,
    result: z.object({
      instruction: text,
      examples: z.array(text).min(1),
      reflectionPrompts: z.array(text).min(1),
    }).strict(),
  }).strict(),
  z.object({
    kind: z.literal("sensation_lexicon"),
    ...prewrittenCommon,
    result: z.object({
      vocabulary: z.array(
        z.object({ area: text, words: z.array(text).min(1) }).strict(),
      ).min(1),
      reflectionPrompts: z.array(text).min(1),
    }).strict(),
  }).strict(),
  z.object({
    kind: z.literal("distraction_audit"),
    ...prewrittenCommon,
    result: z.object({
      categories: z.array(
        z.object({
          key: text,
          name: text,
          definition: text,
          example: text,
        }).strict(),
      ).min(1),
      instructions: z.array(text).min(1),
      requiredReflection: text,
      supportingPrompts: z.array(text),
    }).strict(),
  }).strict(),
]);

export const aiActivityResponseSchema = z.union([
  generatedResponseSchema,
  prewrittenResponseSchema,
]);

export type AiActivityRequest = z.infer<typeof aiActivityRequestSchema>;

export type AiActivityResponse = z.infer<typeof aiActivityResponseSchema>;

// A well-formed response can still answer the wrong question. This checks that
// it is for the same kind and, where a kind echoes its input, the same input.
export function aiActivityResponseMatchesRequest(
  request: AiActivityRequest,
  response: AiActivityResponse,
): boolean {
  if (request.kind !== response.kind) return false;
  // Fixed content does not depend on the input, so there is nothing to compare.
  if ("contentVersion" in response) return true;

  if (
    request.kind === "sensation_lexicon" &&
    response.kind === "sensation_lexicon"
  ) {
    return sensationLexiconMatchesRequest(request.input.sensations, {
      items: response.result.items,
      provider: response.provider,
    });
  }

  if (
    request.kind === "distraction_audit" &&
    response.kind === "distraction_audit"
  ) {
    return distractionAuditMatchesRequest(
      request.input.events,
      response.result,
    );
  }

  return true;
}
