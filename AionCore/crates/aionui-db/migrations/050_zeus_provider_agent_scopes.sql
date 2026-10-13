-- Zeus: per-agent model lineup. A provider row can be scoped to specific
-- engines so "添加模型" assigns models to 办公(opencode)/开发(claude)/设计(aionrs).
-- NULL or '[]' means the provider is available to every agent (legacy rows).
-- Values are a JSON array of agent backends, e.g. '["aionrs","claude"]'.
ALTER TABLE providers ADD COLUMN agent_scopes TEXT;
