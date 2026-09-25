import {z} from "zod";

export const guidedReflectionSchema = z.object({
    activityId: z.uuid(),
    activityContext: z.string().trim().min(1).max(4000),
    userReflection: z.string().trim().min(3).max(2000),
    intentions: z.array(z.string().trim().min(1).max(4000)).length(3),
}).strict();

export type GuidedReflectionRequest = z.infer<typeof guidedReflectionSchema>;