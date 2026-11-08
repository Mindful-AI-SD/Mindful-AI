-- Sponsor-approved Week 1 Guiding Questions, version 1.
-- Source: BaselineComparisonv1.0.pdf.
insert into public.baseline_definitions (
  definition_id,
  definition_version,
  questions,
  is_published
) values (
  'aim-ya-week-1-guiding-questions',
  1,
  jsonb_build_array(
    jsonb_build_object('questionId', 'q1', 'prompt', 'Who am I?', 'maxCharacters', 2000),
    jsonb_build_object('questionId', 'q2', 'prompt', 'What do I really want?', 'maxCharacters', 2000),
    jsonb_build_object('questionId', 'q3', 'prompt', 'What''s my Purpose in Life?', 'maxCharacters', 2000),
    jsonb_build_object('questionId', 'q4', 'prompt', 'What am I grateful for?', 'maxCharacters', 2000),
    jsonb_build_object(
      'questionId',
      'q5',
      'prompt',
      'What are my strengths and unique abilities?',
      'maxCharacters',
      2000
    )
  ),
  true
);
