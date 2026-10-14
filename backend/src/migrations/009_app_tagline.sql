-- ===================================
-- Migration 009: Site tagline
-- ===================================
-- A line shown under the site name in the header, part of an instance's branding.

INSERT OR IGNORE INTO system_settings (key, value, data_type, category, description, is_public, default_value, validation_schema)
VALUES
  ('app.tagline', '', 'string', 'app', 'Tagline shown under the site name', 1, '', '{"type":"string","maxLength":120}');
