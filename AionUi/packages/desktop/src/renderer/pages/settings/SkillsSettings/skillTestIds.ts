/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Testid helper shared by the Skills page and its per-agent pane. Skill names
 * are user-controlled (imported skills keep their frontmatter name), so they
 * are flattened into a DOM-attribute-safe slug before landing in a testid.
 */

/** Flatten a skill name into a testid-safe slug. */
export const normalizeSkillTestId = (name: string): string => name.replace(/[:/\s<>"'|?*]/g, '-');
