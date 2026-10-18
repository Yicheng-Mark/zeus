/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Category mapping behind the Skills page's per-agent grouping. The names in
 * the first table are the ones the three mode presets actually ship
 * (AionCore/crates/aionui-assistant/src/zeus_mode_presets.rs) — a new preset
 * entry that lands in `other` because nobody taught the taxonomy about it is
 * exactly the regression this file guards.
 */

import { describe, expect, it } from 'vitest';
import {
  SKILL_CATEGORY_LABEL_KEYS,
  SKILL_CATEGORY_ORDER,
  categorizeSkillName,
  compareSkillCategories,
} from '@/renderer/pages/settings/SkillsSettings/agentSkillCategories';

describe('categorizeSkillName', () => {
  it.each([
    ['officecli-docx', 'docs'],
    ['officecli-financial-model', 'docs'],
    ['morph-ppt-3d', 'docs'],
    ['pdf-viewer-view-pdf', 'docs'],
    ['pdf', 'docs'],
    ['mermaid', 'docs'],
    ['data-sql-queries', 'data'],
    ['data-data-visualization', 'data'],
    ['finance-close-management', 'finance'],
    ['human-resources-interview-prep', 'people'],
    ['x-recruiter', 'outreach'],
    ['xiaohongshu-recruiter', 'outreach'],
    ['weixin-file-send', 'outreach'],
    ['legal-legal-risk-assessment', 'legal'],
    ['brand-voice-guideline-generation', 'brand'],
    ['marketing-content-creation', 'brand'],
    ['operations-compliance-tracking', 'ops'],
    ['product-management-product-brainstorming', 'ops'],
    ['productivity-task-management', 'productivity'],
    ['design-design-system', 'design'],
    ['engineering-testing-strategy', 'engineering'],
    ['multi-agent-orchestration', 'craft'],
    ['karpathy-guidelines', 'craft'],
  ])('files %s under %s', (name, expected) => {
    expect(categorizeSkillName(name)).toBe(expected);
  });

  it('keeps the bare pdf skill out of the pdf-viewer bucket', () => {
    // `pdf` is an exact-name entry and `pdf-viewer-` a prefix: a prefix-only
    // table would file both under whichever came first.
    expect(categorizeSkillName('pdf')).toBe('docs');
    expect(categorizeSkillName('pdf-viewer-view-pdf')).toBe('docs');
    expect(categorizeSkillName('pdf-viewer-something-new')).toBe('docs');
  });

  it('falls back to other for a name the taxonomy has never seen', () => {
    // A user-imported or newly vendored skill must still be listed, not hidden.
    expect(categorizeSkillName('my-own-skill')).toBe('other');
    expect(categorizeSkillName('')).toBe('other');
  });

  it('gives every category a label key exactly once', () => {
    const keys = SKILL_CATEGORY_ORDER.map((category) => SKILL_CATEGORY_LABEL_KEYS[category]);
    expect(keys.every((key) => typeof key === 'string' && key.length > 0)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('compareSkillCategories', () => {
  it('orders categories by the display order, not alphabetically', () => {
    expect(compareSkillCategories('docs', 'engineering')).toBeLessThan(0);
    expect(compareSkillCategories('engineering', 'docs')).toBeGreaterThan(0);
    expect(compareSkillCategories('custom', 'other')).toBeLessThan(0);
  });

  it('sorts a category outside the list last instead of first', () => {
    // A plain indexOf diff would put the -1 entry ahead of every known
    // category, silently hoisting an unrecognized bucket to the top.
    expect(compareSkillCategories('other', 'not-a-category' as never)).toBeLessThan(0);
  });
});
