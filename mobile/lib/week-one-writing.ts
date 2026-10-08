export const MIN_WRITING_WORDS = 150;
export const MAX_WRITING_CHARACTERS = 2000;

export function countWritingWords(writing: string): number {
  const text = writing.trim();
  return text ? text.split(/\s+/u).length : 0;
}

export function validWeekOneWriting(writing: string): boolean {
  return countWritingWords(writing) >= MIN_WRITING_WORDS && writing.trim().length <= MAX_WRITING_CHARACTERS;
}
