-- Zeus fork: append the second wave of vendored skills to the mode presets.
--
-- 办公 gains the officecli document suite, the morph presentation layers,
-- the pdf toolkit, weixin file delivery and the two recruiter skills; 开发
-- gains mermaid. The same names were added to the compile-time presets in
-- aionui-assistant/zeus_mode_presets.rs, so fresh installs seed them via
-- reconcile; this migration tops up databases whose three generated
-- definitions were already created.
--
-- Entries are NAMES resolved against the live catalog at conversation
-- create. The append is string surgery on the JSON array: strip the closing
-- ']' and splice the new names in. Guards keep it idempotent (sentinel name
-- per mode) and skip lists the user deliberately emptied ('[]').

-- office (OpenCode): officecli suite + morph decks + pdf + weixin + recruiters
UPDATE assistant_definitions
SET default_skill_ids = substr(default_skill_ids, 1, length(default_skill_ids) - 1)
  || ',"morph-ppt","morph-ppt-3d","officecli-academic-paper","officecli-data-dashboard","officecli-docx","officecli-financial-model","officecli-pitch-deck","officecli-pptx","officecli-word-form","officecli-xlsx","pdf","weixin-file-send","x-recruiter","xiaohongshu-recruiter"]',
  updated_at = unixepoch('now','subsec')*1000
WHERE source = 'generated' AND owner_type = 'system'
  AND default_skills_mode = 'fixed'
  AND default_skill_ids <> '[]'
  AND default_skill_ids NOT LIKE '%officecli-docx%'
  AND agent_id IN (SELECT id FROM agent_metadata WHERE backend = 'opencode');

-- dev (Claude Code): mermaid
UPDATE assistant_definitions
SET default_skill_ids = substr(default_skill_ids, 1, length(default_skill_ids) - 1)
  || ',"mermaid"]',
  updated_at = unixepoch('now','subsec')*1000
WHERE source = 'generated' AND owner_type = 'system'
  AND default_skills_mode = 'fixed'
  AND default_skill_ids <> '[]'
  AND default_skill_ids NOT LIKE '%"mermaid"%'
  AND agent_id IN (SELECT id FROM agent_metadata WHERE backend = 'claude');
