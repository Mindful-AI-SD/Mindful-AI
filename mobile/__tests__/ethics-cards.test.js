import {
  WEEK_ONE_ETHICS_CARD,
  WEEK_TWO_ETHICS_CARD,
} from "../lib/ethics-cards";

const cards = [WEEK_ONE_ETHICS_CARD, WEEK_TWO_ETHICS_CARD];
const absoluteClaims = /\b(?:always|never|everyone|guarantees?|proves?|completely|fully)\b/i;

test("ethics cards stay concise, bounded, and grounded in their named topics", () => {
  for (const card of cards) {
    expect(card.title.length).toBeLessThanOrEqual(40);
    expect(card.body.length).toBeLessThanOrEqual(400);
    expect(card.body).not.toMatch(absoluteClaims);
  }

  expect(WEEK_ONE_ETHICS_CARD.body).toMatch(/Awareness/);
  expect(WEEK_ONE_ETHICS_CARD.body).toMatch(/Why practice/);
  expect(WEEK_ONE_ETHICS_CARD.body).toMatch(/Why use AI/);
  for (const topic of ["privacy", "accuracy", "autonomy", "equity"]) {
    expect(WEEK_TWO_ETHICS_CARD.body).toContain(`(${topic})`);
  }
});
