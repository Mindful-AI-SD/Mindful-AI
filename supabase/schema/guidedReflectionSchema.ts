import { z } from "zod";

export const guidedReflectionSchema = z.object({
  activityId: z.string().trim().min(1).max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  activityContext: z.string().trim().min(1).max(4000),
  userReflection: z.string().trim().min(3).max(2000),
}).strict();

export const guidedReflectionResponseSchema = z.object({
  intentions: z.array(z.object({
    title: z.string().trim().min(1).max(120),
    explanation: z.string().trim().min(1).max(1000),
  }).strict()).length(3),
  provider: z.literal("mock"),
}).strict();

export type GuidedReflectionRequest =
  z.infer<typeof guidedReflectionSchema>;

export type GuidedReflectionResponse =
  z.infer<typeof guidedReflectionResponseSchema>;