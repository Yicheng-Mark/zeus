/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import AssistantSelectionArea from '@/renderer/pages/guid/components/AssistantSelectionArea';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue || key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      useMessage: () => [{ warning: vi.fn() }, <div key='message-holder' />],
    },
  };
});

describe('AssistantSelectionArea', () => {
  it('renders exactly the three fixed workspace pills mapped to their engines', () => {
    render(
      <AssistantSelectionArea
        selectedAssistantId='bare-zeus'
        assistants={engines()}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );

    expect(screen.getByTestId('workspace-pill-office')).toHaveTextContent('办公');
    expect(screen.getByTestId('workspace-pill-design')).toHaveTextContent('设计');
    expect(screen.getByTestId('workspace-pill-dev')).toHaveTextContent('开发');
    // The engine rows carry the real agent ids/backends for debugging.
    expect(screen.getByTestId('workspace-pill-office').getAttribute('data-assistant-backend')).toBe('opencode');
    expect(screen.getByTestId('workspace-pill-design').getAttribute('data-assistant-backend')).toBe('aionrs');
    expect(screen.getByTestId('workspace-pill-dev').getAttribute('data-assistant-backend')).toBe('claude');
  });

  it('marks only the selected engine pill as selected', () => {
    render(
      <AssistantSelectionArea
        selectedAssistantId='bare-claude'
        assistants={engines()}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );

    expect(screen.getByTestId('workspace-pill-dev').getAttribute('data-assistant-selected')).toBe('true');
    expect(screen.getByTestId('workspace-pill-office').getAttribute('data-assistant-selected')).toBe('false');
    expect(screen.getByTestId('workspace-pill-design').getAttribute('data-assistant-selected')).toBe('false');
  });

  it('ignores every other catalog entry — other CLI agents and preset assistants', () => {
    render(
      <AssistantSelectionArea
        selectedAssistantId='bare-zeus'
        assistants={[...engines(), ...noise()]}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );

    const pills = screen.getAllByTestId(/^workspace-pill-/);
    expect(pills).toHaveLength(3);
    expect(screen.queryByTestId('workspace-pill-gemini')).not.toBeInTheDocument();
    expect(screen.queryByText('Codex CLI')).not.toBeInTheDocument();
    expect(screen.queryByText('Writer')).not.toBeInTheDocument();
  });

  it('drops a pill whose engine row is missing from the catalog', () => {
    const withoutOpencode = engines().filter((assistant) => assistant.id !== 'bare-opencode');

    render(
      <AssistantSelectionArea
        selectedAssistantId='bare-zeus'
        assistants={withoutOpencode}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );

    expect(screen.queryByTestId('workspace-pill-office')).not.toBeInTheDocument();
    expect(screen.getByTestId('workspace-pill-design')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-pill-dev')).toBeInTheDocument();
  });

  it('reports the real assistant id when a pill is selected', () => {
    const onSelectAssistant = vi.fn();

    render(
      <AssistantSelectionArea
        selectedAssistantId='bare-zeus'
        assistants={engines()}
        localeKey='en-US'
        onSelectAssistant={onSelectAssistant}
      />
    );

    fireEvent.click(screen.getByTestId('workspace-pill-office'));

    expect(onSelectAssistant).toHaveBeenCalledWith('bare-opencode');
  });

  it('renders nothing when no engine row is available', () => {
    const { container } = render(
      <AssistantSelectionArea
        selectedAssistantId={null}
        assistants={[]}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('can re-render from an empty catalog without breaking hook order', () => {
    const { rerender } = render(
      <AssistantSelectionArea
        selectedAssistantId={null}
        assistants={[]}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );

    expect(() =>
      rerender(
        <AssistantSelectionArea
          selectedAssistantId='bare-zeus'
          assistants={engines()}
          localeKey='en-US'
          onSelectAssistant={vi.fn()}
        />
      )
    ).not.toThrow();

    expect(screen.getByTestId('workspace-pill-design')).toBeInTheDocument();
  });
});

function engines(): Assistant[] {
  return [
    mkGenerated('bare-opencode', 'OpenCode', 'opencode', 10),
    mkGenerated('bare-zeus', 'Zeus', 'aionrs', 20),
    mkGenerated('bare-claude', 'Claude Code', 'claude', 30),
  ];
}

function noise(): Assistant[] {
  return [
    mkGenerated('bare-gemini', 'Gemini CLI', 'gemini', 40),
    mkGenerated('bare-codex', 'Codex CLI', 'codex', 50),
    {
      id: 'builtin-writer',
      source: 'builtin',
      name: 'Writer',
      name_i18n: {},
      description_i18n: {},
      enabled: true,
      sort_order: 60,
      agent_id: 'agent-writer',
      agent: { type: 'aionrs', source: 'internal' },
      enabled_skills: [],
      custom_skill_names: [],
      disabled_builtin_skills: [],
      context_i18n: {},
      prompts: [],
      prompts_i18n: {},
      models: [],
      agent_status: 'online',
      team_selectable: true,
      deletable: false,
    },
  ];
}

function mkGenerated(id: string, name: string, backend: string, sort_order: number): Assistant {
  return {
    id,
    source: 'generated',
    name,
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order,
    agent_id: `agent-${backend}`,
    agent: { type: backend === 'aionrs' ? 'aionrs' : 'acp', source: 'builtin', acp_backend: backend },
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: [],
    agent_status: 'online',
    team_selectable: true,
    deletable: false,
  };
}
