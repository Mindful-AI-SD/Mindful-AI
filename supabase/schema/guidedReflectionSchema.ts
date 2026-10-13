import { z } from "zod";

export const guidedReflectionSchema = z.object({
  activityId: z.string().trim().min(1).max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  activityContext: z.string().trim().min(1).max(4000),
  userReflection: z.string().trim().min(3).max(2000),
}).strict();

export const guidedReflectionResponseSchema = z.object({
  intentions: z.array(
    z.object({
      title: z.string().trim().min(1).max(60),
      explanation: z.string().trim().min(1).max(160).refine(
        (value) => value.split(/\s+/u).length <= 24,
      ),
    }).strict(),
  ).length(3).refine((intentions) => {
    const titles = intentions.map(({ title }) => title.toLowerCase());
    return new Set(titles).size === titles.length;
  }),
  provider: z.literal("mock"),
}).strict();

export type GuidedReflectionRequest = z.infer<typeof guidedReflectionSchema>;

export type GuidedReflectionResponse = z.infer<
  typeof guidedReflectionResponseSchema
>;
