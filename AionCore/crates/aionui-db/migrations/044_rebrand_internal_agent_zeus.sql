-- Rebrand the internal aionrs agent: display name "Aion CLI" -> "Zeus".
-- Rows are addressed by the seed id from 001; agent_source guards against
-- ever touching a user-created custom agent that happens to share the id.
UPDATE agent_metadata
SET name = 'Zeus', updated_at = unixepoch('now','subsec')*1000
WHERE id = '632f31d2' AND agent_source = 'internal';
