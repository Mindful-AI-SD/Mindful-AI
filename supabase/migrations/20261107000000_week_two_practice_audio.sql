-- Connect the sponsor-supplied Week 2 body-scan recording through the existing
-- Four Beats curriculum contract. The public object is uploaded separately so
-- the large binary is not committed to Git.
update public.weeks
set description = jsonb_build_object(
  'weekNumber', 2,
  'title', 'The Algorithmic Body',
  'beats', jsonb_build_array(
    jsonb_build_object('id', 'arrive', 'title', 'Arrive',
      'description', 'Where do you feel tension right now? Tap the body map.'),
    jsonb_build_object('id', 'practice', 'title', 'Practice',
      'description', 'Body scan, feet to crown. A lying-down option is available.',
      'media', jsonb_build_object(
        'type', 'audio',
        'source', jsonb_build_object('kind', 'url',
          'url', 'https://hfqzbvsftjgvzkixgvdy.supabase.co/storage/v1/object/public/practice-media/week-2-body-scan.mp3'),
        'durationSeconds', 919.118,
        'attribution', 'Guided practice supplied by the AIM-YA sponsor.',
        'alternativeInstructions', 'Move attention slowly from your feet toward the crown of your head. Notice sensations without needing to change or explain them. You may complete the body scan lying down.'
      )),
    jsonb_build_object('id', 'explore', 'title', 'Explore',
      'description', 'List three sensations. The activity can offer more precise words for vague descriptions.'),
    jsonb_build_object('id', 'notice', 'title', 'Notice',
      'description', 'Did precise language change the sensation? Where has a system mis-categorized you?')
  ),
  'contentSource', jsonb_build_object(
    'kind', 'sponsor',
    'reference', 'AIM-YA Four Beats Weekly Map and Week 2 Practice recording, supplied November 7, 2026'
  )
)::text,
updated_at = now()
where week_number = 2;
