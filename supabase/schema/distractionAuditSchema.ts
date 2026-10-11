import { z } from "zod";
import { summarizeDistractionAudit } from "../functions/_shared/providers/distractionAudit.ts";
import { DISTRACTION_CATEGORIES } from "../functions/_shared/providers/types.ts";

const MAX_EVENTS = 300;

const eventId = z.string().trim().min(1).max(64);
const category = z.enum(DISTRACTION_CATEGORIES);
const count = z.number().int().min(0).max(MAX_EVENTS);
const percent = z.number().int().min(0).max(100);

// One quick-tap: when it happened and the short label the student tapped or
// typed. An empty log is a valid request.
export const distractionAuditInputSchema = z.object({
  events: z.array(
    z.object({
      id: eventId,
      at: z.iso.datetime({ offset: true }),
      label: z.string().trim().min(1).max(40),
    }).strict(),
  ).max(MAX_EVENTS),
}).strict().refine(
  // Every event needs its own ID so each one is categorized exactly once.
  (input) =>
    new Set(input.events.map((event) => event.id)).size === input.events.length,
);

export const distractionAuditResultSchema = z.object({
  totalEvents: count,
  categories: z.array(
    z.object({ category, count: count.min(1), percent }).strict(),
  ).max(DISTRACTION_CATEGORIES.length),
  uncategorized: z.object({ count, percent }).strict(),
  assignments: z.array(
    z.object({ eventId, category: category.nullable() }).strict(),
  ).max(MAX_EVENTS),
}).strict();

export type DistractionAuditInput = z.infer<typeof distractionAuditInputSchema>;

export type DistractionAuditResult = z.infer<
  typeof distractionAuditResultSchema
>;

// The shape alone cannot show that the numbers are right. This recomputes the
// audit from the request's events and the result's own assignments and
// requires every count, percentage, and ordering to agree.
export function distractionAuditMatchesRequest(
  events: DistractionAuditInput["events"],
  result: DistractionAuditResult,
): boolean {
  let expected;
  try {
    expected = summarizeDistractionAudit(events, result.assignments);
  } catch {
    return false;
  }

  return result.totalEvents === expected.totalEvents &&
    result.uncategorized.count === expected.uncategorized.count &&
    result.uncategorized.percent === expected.uncategorized.percent &&
    result.categories.length === expected.categories.length &&
    result.categories.every((entry, index) =>
      entry.category === expected.categories[index].category &&
      entry.count === expected.categories[index].count &&
      entry.percent === expected.categories[index].percent
    );
}
