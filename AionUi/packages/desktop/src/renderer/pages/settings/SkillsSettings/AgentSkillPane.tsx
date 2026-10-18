/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * AgentSkillPane — one agent's skill list on the Skills page.
 *
 * Rows come from the assistant's own skill fields, never from the whole
 * corpus: `enabled_skills` is what a new conversation of this agent loads
 * (`resolve_assistant_snapshot` reads `default_skill_ids` verbatim when the
 * definition is fixed), and `disabled_builtin_skills` is where a skill the
 * user cancelled is remembered so the row can offer "restore".
 *
 * Cancelling strips the name from `enabled_skills` — that is the only field
 * the conversation snapshot reads, so it is the only thing that actually
 * unloads a skill. Disabled rows stay in place (dimmed) instead of moving to
 * a separate list, so a category reads the same before and after a toggle.
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';
import { Button } from '@arco-design/web-react';
import classNames from 'classnames';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SKILL_CATEGORY_LABEL_KEYS,
  categorizeSkillName,
  compareSkillCategories,
  type SkillCategoryKey,
} from './agentSkillCategories';
import { normalizeSkillTestId } from './skillTestIds';

export type AgentSkillRow = {
  name: string;
  enabled: boolean;
  description: string;
};

type AgentSkillPaneProps = {
  /** The agent whose list is shown. */
  assistant: Assistant;
  /** Skill name -> description from the live catalog; missing names render bare. */
  descriptions: Readonly<Record<string, string>>;
  /** Names the user imported, bucketed under the "imported" category. */
  importedSkills: ReadonlySet<string>;
  /** Active search term; empty shows everything. */
  query: string;
  /** Skill with an update in flight, so its action button locks. */
  pendingSkill: string | null;
  onToggle: (skillName: string, enabled: boolean) => void;
};

/** Rows for one agent: enabled first-class, cancelled ones kept as tombstones. */
export const buildAgentSkillRows = (
  enabledSkills: readonly string[],
  disabledSkills: readonly string[]
): AgentSkillRow[] => {
  const seen = new Set<string>();
  const rows: AgentSkillRow[] = [];

  for (const name of enabledSkills) {
    if (seen.has(name)) continue;
    seen.add(name);
    rows.push({ name, enabled: true, description: '' });
  }
  for (const name of disabledSkills) {
    if (seen.has(name)) continue;
    seen.add(name);
    rows.push({ name, enabled: false, description: '' });
  }

  // Alphabetical inside a category keeps a row's position stable across a
  // toggle, so the row the user just cancelled does not jump.
  return rows.toSorted((left, right) => left.name.localeCompare(right.name));
};

const AgentSkillPane: React.FC<AgentSkillPaneProps> = ({
  assistant,
  descriptions,
  importedSkills,
  query,
  pendingSkill,
  onToggle,
}) => {
  const { t } = useTranslation();

  const groups = useMemo(() => {
    const rows = buildAgentSkillRows(assistant.enabled_skills ?? [], assistant.disabled_builtin_skills ?? []);
    for (const row of rows) {
      row.description = descriptions[row.name] ?? '';
    }

    const normalizedQuery = query.trim().toLowerCase();
    const matching = normalizedQuery
      ? rows.filter(
          (row) =>
            row.name.toLowerCase().includes(normalizedQuery) || row.description.toLowerCase().includes(normalizedQuery)
        )
      : rows;

    const byCategory = new Map<SkillCategoryKey, AgentSkillRow[]>();
    for (const row of matching) {
      const category = importedSkills.has(row.name) ? 'custom' : categorizeSkillName(row.name);
      const bucket = byCategory.get(category);
      if (bucket) {
        bucket.push(row);
      } else {
        byCategory.set(category, [row]);
      }
    }

    return [...byCategory.entries()].toSorted(([left], [right]) => compareSkillCategories(left, right));
  }, [assistant.enabled_skills, assistant.disabled_builtin_skills, descriptions, importedSkills, query]);

  const totalRows = groups.reduce((sum, [, rows]) => sum + rows.length, 0);

  if (totalRows === 0) {
    return (
      <div className='rounded-12px border border-border-2 border-dashed bg-fill-1 px-16px py-40px text-center text-13px text-t-secondary'>
        {query.trim()
          ? t('settings.skillsHub.noSearchResults', { defaultValue: 'No matching skills.' })
          : t('settings.skillsHub.agentSkillsEmpty', { defaultValue: 'This assistant has no skills yet.' })}
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-16px' data-testid='agent-skill-pane'>
      <p className='m-0 text-12px leading-relaxed text-t-tertiary'>
        {t('settings.skillsHub.agentSkillsHint', {
          defaultValue:
            'Cancelling a skill removes it from this assistant’s new conversations. Existing conversations keep working.',
        })}
      </p>
      {groups.map(([category, rows]) => (
        <section key={category} className='flex flex-col gap-8px' data-testid={`skill-category-${category}`}>
          <header className='flex items-center justify-between gap-12px px-2px'>
            <h2 className='m-0 text-12px font-600 tracking-wide text-t-secondary'>
              {t(`settings.skillsHub.${SKILL_CATEGORY_LABEL_KEYS[category]}`)}
            </h2>
            <span className='text-11px text-t-tertiary'>{rows.length}</span>
          </header>
          <div className='flex flex-col rounded-12px border border-border-2 bg-2 p-6px'>
            {rows.map((row) => {
              const isPending = pendingSkill === row.name;
              return (
                <div
                  key={row.name}
                  data-testid={`agent-skill-row-${normalizeSkillTestId(row.name)}`}
                  data-skill-enabled={row.enabled ? 'true' : 'false'}
                  className={classNames(
                    'flex items-start gap-12px rounded-10px px-12px py-10px transition-colors',
                    row.enabled ? 'hover:bg-fill-1' : 'opacity-55 hover:bg-fill-1 hover:opacity-80'
                  )}
                >
                  <div className='flex min-w-0 flex-1 flex-col gap-2px'>
                    <div className='flex min-w-0 items-center gap-8px'>
                      <span className='truncate text-13px font-500 text-t-primary' title={row.name}>
                        {row.name}
                      </span>
                      {!row.enabled && (
                        <span className='shrink-0 rounded-4px bg-fill-3 px-6px py-1px text-10px text-t-secondary'>
                          {t('settings.skillsHub.skillCancelled', { defaultValue: 'Cancelled' })}
                        </span>
                      )}
                    </div>
                    {row.description && (
                      <p
                        className='m-0 line-clamp-2 text-12px leading-relaxed text-t-secondary'
                        title={row.description}
                      >
                        {row.description}
                      </p>
                    )}
                  </div>
                  <Button
                    size='mini'
                    type='text'
                    data-testid={`btn-toggle-skill-${normalizeSkillTestId(row.name)}`}
                    disabled={isPending}
                    onClick={() => onToggle(row.name, !row.enabled)}
                    className={classNames(
                      '!h-24px !shrink-0 !px-8px !text-12px',
                      row.enabled
                        ? '!text-t-tertiary hover:!bg-danger-1 hover:!text-danger-6'
                        : '!text-primary-6 hover:!bg-primary-1'
                    )}
                  >
                    {row.enabled
                      ? t('settings.skillsHub.cancelSkill', { defaultValue: 'Cancel' })
                      : t('settings.skillsHub.restoreSkill', { defaultValue: 'Restore' })}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};

export default AgentSkillPane;
