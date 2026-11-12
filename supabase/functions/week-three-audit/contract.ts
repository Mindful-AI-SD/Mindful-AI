import { z } from "zod";
import { WEEK_THREE_AUDIT_CATEGORIES } from "../_shared/providers/types.ts";
// The existing distraction_audit contract deliberately remains unchanged: its
// older category vocabulary and integer percentages are a different version.
// One list, shared with the prompt in _shared/prompts/activityPrompts.ts.
export const category = z.enum(WEEK_THREE_AUDIT_CATEGORIES);
export const requestSchema = z.object({
  activityId: z.uuid(), operationId: z.uuid(),
  events: z.array(z.object({ id: z.uuid(), topic: z.string().min(1).max(2000).refine(text => !!text.trim()), app: z.string().max(200).optional() }).strict()).min(1).max(300),
}).strict().refine(value => new Set(value.events.map(event => event.id)).size === value.events.length);
export const assignmentsSchema = z.object({ assignments: z.array(z.object({ eventId: z.uuid(), category }).strict()).max(300) }).strict();
export type AuditRequest = z.infer<typeof requestSchema>;
export function readAssignments(request: AuditRequest, value: unknown) {
  const result = assignmentsSchema.parse(value);
  if (result.assignments.length !== request.events.length || result.assignments.some((assignment, index) => assignment.eventId !== request.events[index].id)) throw new Error("Invalid category assignments");
  return result;
}
