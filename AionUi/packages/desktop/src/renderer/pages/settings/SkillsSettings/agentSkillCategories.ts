/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Category taxonomy for the Skills page's per-agent view.
 *
 * Zeus's three fixed agents each carry a curated slice of the vendored
 * builtin corpus (see `AionCore/crates/aionui-assistant/src/zeus_mode_presets.rs`).
 * Those names are plugin-prefixed (`engineering-code-review`) or bare
 * (`mermaid`), and a flat 20-40 row list per agent is unusable without
 * grouping — so this module maps a skill NAME to the bucket the page renders
 * it under.
 *
 * The taxonomy is presentation-only: it never decides whether a skill loads
 * (that is the assistant's `enabled_skills` list). An unknown or
 * user-authored name falls into `other` rather than being hidden.
 */

/**
 * Category keys in display order. `custom` holds the user's imported skills
 * and `other` is the catch-all, so both stay last.
 */
export const SKILL_CATEGORY_ORDER = [
  'docs',
  'data',
  'finance',
  'people',
  'outreach',
  'legal',
  'brand',
  'ops',
  'productivity',
  'design',
  'engineering',
  'craft',
  'custom',
  'other',
] as const;

export type SkillCategoryKey = (typeof SKILL_CATEGORY_ORDER)[number];

/** Category key -> i18n key suffix under `settings.skillsHub`. */
export const SKILL_CATEGORY_LABEL_KEYS: Record<SkillCategoryKey, string> = {
  docs: 'categoryDocs',
  data: 'categoryData',
  finance: 'categoryFinance',
  people: 'categoryPeople',
  outreach: 'categoryOutreach',
  legal: 'categoryLegal',
  brand: 'categoryBrand',
  ops: 'categoryOps',
  productivity: 'categoryProductivity',
  design: 'categoryDesign',
  engineering: 'categoryEngineering',
  craft: 'categoryCraft',
  custom: 'categoryCustom',
  other: 'categoryOther',
};

/**
 * Plugin-prefix -> category, matched in order. Prefixes cover the whole
 * vendored corpus (not just the three presets) so a skill a user attaches to
 * an agent through the assistant editor still lands in a sensible bucket.
 */
const PREFIX_CATEGORY: ReadonlyArray<readonly [string, SkillCategoryKey]> = [
  ['officecli-', 'docs'],
  ['morph-', 'docs'],
  ['pdf-viewer-', 'docs'],
  ['enterprise-search-', 'docs'],
  ['data-', 'data'],
  ['bio-research-', 'data'],
  ['finance-', 'finance'],
  ['human-resources-', 'people'],
  ['customer-support-', 'people'],
  ['x-recruiter', 'outreach'],
  ['xiaohongshu-recruiter', 'outreach'],
  ['weixin-file-send', 'outreach'],
  ['apollo-', 'outreach'],
  ['common-room-', 'outreach'],
  ['slack-', 'outreach'],
  ['zoom-plugin-', 'outreach'],
  ['legal-', 'legal'],
  ['brand-voice-', 'brand'],
  ['marketing-', 'brand'],
  ['sales-', 'brand'],
  ['operations-', 'ops'],
  ['product-management-', 'ops'],
  ['small-business-', 'ops'],
  ['productivity-', 'productivity'],
  ['cowork-plugin-management-', 'productivity'],
  ['design-', 'design'],
  ['engineering-', 'engineering'],
  ['aionui-', 'craft'],
];

/**
 * Bare (unprefixed) names -> category. Checked before the prefix table, so
 * `pdf` and `pdf-viewer-view-pdf` never collide.
 */
const BARE_NAME_CATEGORY: Record<string, SkillCategoryKey> = {
  pdf: 'docs',
  officecli: 'docs',
  mermaid: 'docs',
  'multi-agent-orchestration': 'craft',
  'decompose-and-execute': 'craft',
  'diagnosing-bugs': 'craft',
  grilling: 'craft',
  handoff: 'craft',
  'karpathy-guidelines': 'craft',
  'resolving-merge-conflicts': 'craft',
  'skill-security-auditor': 'craft',
  'universal-scraping-architect': 'craft',
  'writing-for-agents': 'craft',
  'skill-creator': 'craft',
};

/** Bucket a skill name belongs to. Unknown names fall through to `other`. */
export const categorizeSkillName = (name: string): SkillCategoryKey => {
  const bare = BARE_NAME_CATEGORY[name];
  if (bare) return bare;

  for (const [prefix, category] of PREFIX_CATEGORY) {
    if (name.startsWith(prefix)) return category;
  }

  return 'other';
};

/** Display position of a category; anything unrecognized sorts last. */
const categoryIndex = (category: SkillCategoryKey): number => {
  const index = SKILL_CATEGORY_ORDER.indexOf(category);
  return index === -1 ? SKILL_CATEGORY_ORDER.length : index;
};

/** Sort helper for category keys, in display order. */
export const compareSkillCategories = (left: SkillCategoryKey, right: SkillCategoryKey): number =>
  categoryIndex(left) - categoryIndex(right);
