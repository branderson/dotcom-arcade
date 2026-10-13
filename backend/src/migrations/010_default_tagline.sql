-- ===================================
-- Migration 010: Default site tagline
-- ===================================
-- Give the tagline a default, applied where it was still empty. Clearing it in
-- the admin settings afterwards still hides it.

UPDATE system_settings
SET
  default_value = 'The Flash arcade that never closed',
  value = CASE WHEN value = '' THEN 'The Flash arcade that never closed' ELSE value END
WHERE key = 'app.tagline';
