-- ===================================
-- Migration 011: Default site name
-- ===================================
-- The project is now Dotcom Arcade. Installs still on the old default take the
-- new one; a name an admin chose is left alone.

UPDATE system_settings
SET
  default_value = 'Dotcom Arcade',
  value = CASE WHEN value = 'Flashpoint Web' THEN 'Dotcom Arcade' ELSE value END
WHERE key = 'app.site_name';
