// The non-AI Week 3 summary: counts and percentages calculated only from the
// categories a student chose. It never classifies free text or infers a category.
// Percentages have one decimal place, as the content pack's worked example shows,
// so displayed values may total 100.1 or 99.9.

export type SelectionSummaryEntry = {
  category: string;
  count: number;
  percent: number;
};

export function summarizeStudentSelections(
  categories: readonly string[],
  selections: readonly string[],
): SelectionSummaryEntry[] {
  if (selections.some((selection) => !categories.includes(selection))) {
    throw new Error("A selection is not one of the listed categories.");
  }
  return categories.map((category) => {
    const count = selections.filter((selection) => selection === category).length;
    return {
      category,
      count,
      percent: selections.length === 0
        ? 0
        : Math.round((count * 1000) / selections.length) / 10,
    };
  });
}
