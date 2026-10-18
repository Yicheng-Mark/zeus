/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the Skills page's per-agent pane: which rows it lists for an
 * assistant, how it groups them, and that toggling reports the intent the
 * caller needs (the pane itself never writes).
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options?.defaultValue as string | undefined) ?? key,
    i18n: { language: 'en' },
  }),
}));

import AgentSkillPane from '@/renderer/pages/settings/SkillsSettings/AgentSkillPane';

const makeAssistant = (overrides: Partial<Assistant> = {}): Assistant => ({
  id: 'bare:agent-claude',
  source: 'generated',
  name: 'Claude',
  name_i18n: {},
  description_i18n: {},
  enabled: true,
  sort_order: 0,
  agent_id: 'agent-claude',
  agent: { type: 'acp', source: 'builtin', acp_backend: 'claude' },
  enabled_skills: [],
  custom_skill_names: [],
  disabled_builtin_skills: [],
  context_i18n: {},
  prompts: [],
  prompts_i18n: {},
  models: [],
  agent_status: 'online',
  team_selectable: false,
  deletable: false,
  ...overrides,
});

const renderPane = (props: Partial<React.ComponentProps<typeof AgentSkillPane>> = {}) => {
  const onToggle = vi.fn();
  render(
    <AgentSkillPane
      assistant={makeAssistant()}
      descriptions={{}}
      importedSkills={new Set<string>()}
      query=''
      pendingSkill={null}
      onToggle={onToggle}
      {...props}
    />
  );
  return { onToggle };
};

describe('AgentSkillPane', () => {
  it('lists cancelled skills next to enabled ones instead of dropping them', () => {
    renderPane({
      assistant: makeAssistant({
        enabled_skills: ['engineering-code-review'],
        disabled_builtin_skills: ['engineering-debug'],
      }),
    });

    expect(screen.getByTestId('agent-skill-row-engineering-code-review')).toHaveAttribute('data-skill-enabled', 'true');
    const cancelled = screen.getByTestId('agent-skill-row-engineering-debug');
    expect(cancelled).toHaveAttribute('data-skill-enabled', 'false');
    // A cancelled skill stays under its own category, not in a separate list.
    expect(screen.getByTestId('skill-category-engineering')).toContainElement(cancelled);
  });

  it('groups rows under their category headings in display order', () => {
    renderPane({
      assistant: makeAssistant({
        enabled_skills: ['engineering-code-review', 'data-sql-queries', 'officecli-docx'],
      }),
    });

    const headingOrder = screen.getAllByTestId(/^skill-category-/).map((node) => node.getAttribute('data-testid'));
    expect(headingOrder).toEqual(['skill-category-docs', 'skill-category-data', 'skill-category-engineering']);
  });

  it('reports a cancel when an enabled skill is toggled', () => {
    const { onToggle } = renderPane({
      assistant: makeAssistant({ enabled_skills: ['engineering-code-review'] }),
    });

    fireEvent.click(screen.getByTestId('btn-toggle-skill-engineering-code-review'));

    expect(onToggle).toHaveBeenCalledWith('engineering-code-review', false);
  });

  it('reports a restore when a cancelled skill is toggled back', () => {
    const { onToggle } = renderPane({
      assistant: makeAssistant({ disabled_builtin_skills: ['engineering-debug'] }),
    });

    fireEvent.click(screen.getByTestId('btn-toggle-skill-engineering-debug'));

    expect(onToggle).toHaveBeenCalledWith('engineering-debug', true);
  });

  it('locks only the row whose update is in flight', () => {
    renderPane({
      assistant: makeAssistant({ enabled_skills: ['engineering-code-review', 'engineering-debug'] }),
      pendingSkill: 'engineering-debug',
    });

    expect(screen.getByTestId('btn-toggle-skill-engineering-debug')).toBeDisabled();
    expect(screen.getByTestId('btn-toggle-skill-engineering-code-review')).toBeEnabled();
  });

  it('filters by name and description', () => {
    renderPane({
      assistant: makeAssistant({ enabled_skills: ['engineering-code-review', 'data-sql-queries'] }),
      descriptions: { 'data-sql-queries': 'Write warehouse queries.' },
      query: 'warehouse',
    });

    expect(screen.getByTestId('agent-skill-row-data-sql-queries')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-skill-row-engineering-code-review')).not.toBeInTheDocument();
  });

  it('tells an empty agent apart from an empty search result', () => {
    const { unmount } = render(
      <AgentSkillPane
        assistant={makeAssistant()}
        descriptions={{}}
        importedSkills={new Set<string>()}
        query=''
        pendingSkill={null}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('This assistant has no skills yet.')).toBeInTheDocument();
    unmount();

    renderPane({ assistant: makeAssistant({ enabled_skills: ['engineering-debug'] }), query: 'nothing-matches' });
    expect(screen.getByText('No matching skills.')).toBeInTheDocument();
  });

  it('buckets imported skills away from the plugin taxonomy', () => {
    renderPane({
      assistant: makeAssistant({ enabled_skills: ['my-own-skill'] }),
      importedSkills: new Set(['my-own-skill']),
    });

    expect(screen.getByTestId('skill-category-custom')).toBeInTheDocument();
    expect(screen.queryByTestId('skill-category-other')).not.toBeInTheDocument();
  });
});
