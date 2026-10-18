-- Zeus fork: drop the mode-preset skills that cannot work in the product they
-- ship in, the second curation pass after 054.
--
-- 054 removed names that needed a connector the user had not configured. This
-- pass removes names that fail for a harder reason: the tooling they call does
-- not exist here, or the environment they assume is not the one they run in.
-- Each drop was verified against the product, not judged by taste:
--
--   pdf-viewer-view-pdf — instructs the agent to call the MCP tools `list_pdfs`
--     / `display_pdf` from "a local PDF server". No server in the repo, in the
--     backend, or in the desktop app declares them, and none of the builtin MCP
--     servers (aionui-browser / chrome-devtools / aionui-image-generation) has
--     them in its tool list. Loaded, it only invites fabricated tool calls.
--     Dropped from all three engines.
--   brand-voice-discover-brand — its workflow is "search your connected
--     platforms (Notion, Confluence, Google Drive, Box, SharePoint, Figma,
--     Gong, Granola, Slack)" and it dispatches a `discover-brand` sub-agent
--     that the corpus does not ship. Dropped from office and design.
--   productivity-memory-management / -start / -task-management / -update —
--     the Claude-plugin task system. `start` and `task-management` copy
--     `${CLAUDE_PLUGIN_ROOT}/skills/dashboard.html`; nothing in the product
--     defines CLAUDE_PLUGIN_ROOT (the name appears only inside skill text) and
--     the corpus ships no dashboard.html, while their `../../CONNECTORS.md`
--     reference resolves to nothing. 054 already dropped them from dev, which
--     left them on exactly the two engines that do not define a plugin root.
--     Dropped from office and design.
--   x-recruiter / xiaohongshu-recruiter — generate images with npm `canvas`
--     and publish through python Playwright plus a phone-scan login. The
--     bundled tool set is python / git / officecli / node, and building
--     `canvas` on Windows needs a compiler, so a clean install cannot run
--     them. Dropped from office.
--   data-create-viz — the same job as data-data-visualization already in the
--     design preset (Python chart output with chart-type selection), and it
--     carries the same missing `../../CONNECTORS.md` reference. Dropped from
--     design only; office keeps data-data-visualization alone already.
--
-- Nothing leaves the corpus: every name here stays in
-- `aionui-app/assets/builtin-skills/` and one toggle away in the assistant
-- editor. The compile-time presets in aionui-assistant/zeus_mode_presets.rs
-- carry the same removals, so fresh installs never see these names at all.
--
-- Guards follow 047/049/051/054: only a row still carrying the untouched preset
-- shape is rewritten, keyed on the sentinel `pdf-viewer-view-pdf` — it sits in
-- all three engine lists before this migration and in none of them after, so a
-- row stops matching once trimmed and re-running is a no-op. Lists the user
-- edited by hand (sentinel gone) and lists deliberately emptied ('[]') are left
-- alone. json_each scans in array order, so survivors keep their original
-- order; an all-removed list collapses to '[]' rather than NULL, because the
-- JSON aggregates return the empty array for zero rows.

-- office (OpenCode): 41 -> 33 names
UPDATE assistant_definitions
SET default_skill_ids = (
      SELECT json_group_array(value)
      FROM json_each(assistant_definitions.default_skill_ids)
      WHERE value NOT IN (
        'brand-voice-discover-brand', 'pdf-viewer-view-pdf', 'productivity-memory-management',
        'productivity-start', 'productivity-task-management', 'productivity-update',
        'x-recruiter', 'xiaohongshu-recruiter'
      )
    ),
    updated_at = unixepoch('now','subsec')*1000
WHERE source = 'generated' AND owner_type = 'system'
  AND default_skills_mode = 'fixed'
  AND default_skill_ids <> '[]'
  AND default_skill_ids LIKE '%"pdf-viewer-view-pdf"%'
  AND agent_id IN (SELECT id FROM agent_metadata WHERE backend = 'opencode');

-- dev (Claude Code): 23 -> 22 names
UPDATE assistant_definitions
SET default_skill_ids = (
      SELECT json_group_array(value)
      FROM json_each(assistant_definitions.default_skill_ids)
      WHERE value NOT IN ('pdf-viewer-view-pdf')
    ),
    updated_at = unixepoch('now','subsec')*1000
WHERE source = 'generated' AND owner_type = 'system'
  AND default_skills_mode = 'fixed'
  AND default_skill_ids <> '[]'
  AND default_skill_ids LIKE '%"pdf-viewer-view-pdf"%'
  AND agent_id IN (SELECT id FROM agent_metadata WHERE backend = 'claude');

-- design (Zeus aionrs): 19 -> 12 names
UPDATE assistant_definitions
SET default_skill_ids = (
      SELECT json_group_array(value)
      FROM json_each(assistant_definitions.default_skill_ids)
      WHERE value NOT IN (
        'brand-voice-discover-brand', 'data-create-viz', 'pdf-viewer-view-pdf',
        'productivity-memory-management', 'productivity-start', 'productivity-task-management',
        'productivity-update'
      )
    ),
    updated_at = unixepoch('now','subsec')*1000
WHERE source = 'generated' AND owner_type = 'system'
  AND default_skills_mode = 'fixed'
  AND default_skill_ids <> '[]'
  AND default_skill_ids LIKE '%"pdf-viewer-view-pdf"%'
  AND agent_id IN (SELECT id FROM agent_metadata WHERE backend IS NULL AND agent_type = 'aionrs');
