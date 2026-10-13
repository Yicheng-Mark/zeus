-- Zeus fork: give the three shipped engines their role names and icons.
--
-- 办公 (OpenCode) / 开发 (Claude Code) / 设计 (internal aionrs) — the display
-- name and icon live on the agent_metadata row; the startup reconcile
-- (reconcile_generated_assistant) re-projects them onto the per-agent
-- generated assistant definitions, and the UPDATEs below mirror that sync so
-- the UI is correct even on the first render before reconcile runs. Rows are
-- addressed by their seed ids and guarded by agent_source so a user-created
-- custom agent sharing an id can never be caught.
--
-- Icons ship in aionui-assets under logos/zeus/ (256px PNG, served by
-- /api/assets/logos with immutable caching).

UPDATE agent_metadata
SET name = '设计', icon = '/api/assets/logos/zeus/design.png', updated_at = unixepoch('now','subsec')*1000
WHERE id = '632f31d2' AND agent_source = 'internal';

UPDATE agent_metadata
SET name = '开发', icon = '/api/assets/logos/zeus/dev.png', updated_at = unixepoch('now','subsec')*1000
WHERE id = '2d23ff1c' AND agent_source = 'builtin';

UPDATE agent_metadata
SET name = '办公', icon = '/api/assets/logos/zeus/office.png', updated_at = unixepoch('now','subsec')*1000
WHERE id = '53861a53' AND agent_source = 'builtin';

UPDATE assistant_definitions
SET name = '设计', avatar_type = 'emoji', avatar_value = '/api/assets/logos/zeus/design.png', updated_at = unixepoch('now','subsec')*1000
WHERE source = 'generated' AND agent_id = '632f31d2';

UPDATE assistant_definitions
SET name = '开发', avatar_type = 'emoji', avatar_value = '/api/assets/logos/zeus/dev.png', updated_at = unixepoch('now','subsec')*1000
WHERE source = 'generated' AND agent_id = '2d23ff1c';

UPDATE assistant_definitions
SET name = '办公', avatar_type = 'emoji', avatar_value = '/api/assets/logos/zeus/office.png', updated_at = unixepoch('now','subsec')*1000
WHERE source = 'generated' AND agent_id = '53861a53';
