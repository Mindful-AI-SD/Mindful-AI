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

export const aiActivityResponseSchema = z.discriminatedUnion("kind", [
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

export type AiActivityRequest = z.infer<typeof aiActivityRequestSchema>;

export type AiActivityResponse = z.infer<typeof aiActivityResponseSchema>;

// A well-formed response can still answer the wrong question. This checks that
// it is for the same kind and, where a kind echoes its input, the same input.
export function aiActivityResponseMatchesRequest(
  request: AiActivityRequest,
  response: AiActivityResponse,
): boolean {
  if (request.kind !== response.kind) return false;

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
