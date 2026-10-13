-- Zeus: optional Anthropic-protocol endpoint URL for OpenAI-compatible
-- providers. Vendors like DeepSeek expose the two protocols under different
-- paths (…/v1 vs …/anthropic), so a single provider row needs a second URL to
-- serve the claude engine while the base_url keeps serving aionrs/opencode.
-- NULL or '' = no Anthropic-protocol endpoint on this provider.
ALTER TABLE providers ADD COLUMN anthropic_base_url TEXT;
