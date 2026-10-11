import {
  DISTRACTION_CATEGORIES,
  type DistractionAssignment,
  type DistractionAuditSummary,
  type DistractionEvent,
  ProviderError,
} from "./types.ts";

// Turns a provider's per-event category assignments into the audit a student
// sees. All arithmetic happens here, with whole numbers, so the result always
// reconciles with the log:
//
// - The denominator is every logged event (`totalEvents`), including the ones
//   no category fits (`uncategorized`).
// - Counts for all categories plus uncategorized add up to `totalEvents`.
// - Percentages are whole numbers that add up to exactly 100 (largest-remainder
//   rounding), or are all 0 when the log is empty.
// - Categories are ordered by count, highest first; ties keep the order of
//   DISTRACTION_CATEGORIES. Categories with no events are left out.
//
// Throws ProviderError when the assignments do not cover the events exactly
// once each, in order, so a provider can never invent or drop an event.
export function summarizeDistractionAudit(
  events: readonly DistractionEvent[],
  assignments: readonly DistractionAssignment[],
): DistractionAuditSummary {
  if (
    assignments.length !== events.length ||
    assignments.some((assignment, index) =>
      assignment.eventId !== events[index].id ||
      (assignment.category !== null &&
        !DISTRACTION_CATEGORIES.includes(assignment.category))
    )
  ) {
    throw new ProviderError("Assignments do not match the logged events");
  }

  const totalEvents = events.length;
  const counted = DISTRACTION_CATEGORIES
    .map((category) => ({
      category,
      count:
        assignments.filter((assignment) => assignment.category === category)
          .length,
    }))
    .filter((entry) => entry.count > 0)
    // Array.prototype.sort is stable, so ties keep the category order.
    .sort((a, b) => b.count - a.count);
  const uncategorizedCount =
    assignments.filter((assignment) => assignment.category === null).length;

  const counts = [...counted.map((entry) => entry.count), uncategorizedCount];
  const percents = wholePercents(counts, totalEvents);

  return {
    totalEvents,
    categories: counted.map((entry, index) => ({
      ...entry,
      percent: percents[index],
    })),
    uncategorized: {
      count: uncategorizedCount,
      percent: percents[percents.length - 1],
    },
    assignments: assignments.map(({ eventId, category }) => ({
      eventId,
      category,
    })),
  };
}

// Largest-remainder rounding: round every share down, then hand the leftover
// points to the shares that lost the most, earlier entries first on a tie.
function wholePercents(counts: number[], total: number): number[] {
  if (total === 0) return counts.map(() => 0);

  const percents = counts.map((count) => Math.floor(count * 100 / total));
  const leftover = 100 - percents.reduce((sum, percent) => sum + percent, 0);
  const byRemainder = counts
    .map((count, index) => ({ index, remainder: (count * 100) % total }))
    .sort((a, b) => b.remainder - a.remainder);

  for (const { index } of byRemainder.slice(0, leftover)) percents[index]++;
  return percents;
}
