// UI fixtures based on Lucas's MIN-214 sprint3-storage/v1 examples at
// origin/codex/min-214-baseline-week-three-contracts, reviewed 2026-10-28.
// q1-q5 and their prompts are synthetic, not approved curriculum.
export type BaselineDefinitionInput = {
  definitionId: string;
  definitionVersion: number;
  isPublished: boolean;
  questions: readonly {
    questionId: string;
    prompt: string;
    maxCharacters: number;
  }[];
};

export type BaselineRecordInput = {
  contractVersion: "sprint3-storage/v1";
  definitionId: string;
  definitionVersion: number;
  answers: Record<string, string>;
  status: "draft" | "submitted";
  revision: number;
  submittedAt: string | null;
};

// Presentation input only: MIN-214 does not define a published unlock API.
// Messages are supplied by the caller, never inferred from legacy progress.
export type WeekAccessInput = {
  weekNumber: number;
  locked: boolean;
  prerequisiteMessages: readonly string[];
};

export const BASELINE_DEFINITION_FIXTURE: BaselineDefinitionInput = {
  definitionId: "aim-ya-week-1-guiding-questions",
  definitionVersion: 1,
  isPublished: true,
  questions: [
    { questionId: "q1", prompt: "Who am I?", maxCharacters: 2000 },
    { questionId: "q2", prompt: "What do I really want?", maxCharacters: 2000 },
    { questionId: "q3", prompt: "What's my Purpose in Life?", maxCharacters: 2000 },
    { questionId: "q4", prompt: "What am I grateful for?", maxCharacters: 2000 },
    {
      questionId: "q5",
      prompt: "What are my strengths and unique abilities?",
      maxCharacters: 2000,
    },
  ],
};

export const BASELINE_DRAFT_FIXTURE: BaselineRecordInput = {
  contractVersion: "sprint3-storage/v1",
  definitionId: "aim-ya-week-1-guiding-questions",
  definitionVersion: 1,
  answers: Object.fromEntries(Array.from({ length: 5 }, (_, index) => [
    `q${index + 1}`,
    index === 4 ? "" : `Synthetic answer ${index + 1}; no sponsor question is implied.`,
  ])),
  status: "draft",
  revision: 2,
  submittedAt: null,
};

export const WEEK_ACCESS_FIXTURE: readonly WeekAccessInput[] = [
  { weekNumber: 1, locked: false, prerequisiteMessages: [] },
  { weekNumber: 2, locked: true, prerequisiteMessages: [
    "Example prerequisite: submit all five Guiding Questions answers.",
    "Week 2 prerequisite rules are pending approval; this preview does not change access to existing work.",
  ] },
  { weekNumber: 3, locked: true, prerequisiteMessages: [
    "Example prerequisite: complete the configured prior-week activities.",
    "Week 3 completion policy and prerequisite enforcement are not connected in this preview.",
  ] },
];
