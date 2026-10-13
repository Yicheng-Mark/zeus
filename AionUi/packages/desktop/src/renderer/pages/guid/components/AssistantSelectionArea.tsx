/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import styles from '../index.module.css';
import { assistantRuntimeKey, isAionrsAssistant, type Assistant } from '@/common/types/agent/assistantTypes';
import { Button } from '@arco-design/web-react';
import { useAssistantOrder } from '@/renderer/hooks/assistant/useAssistantOrder';
import React, { useMemo } from 'react';
import { selectableAssistants } from '@/renderer/utils/model/assistantSelection';
import { useTranslation } from 'react-i18next';

/**
 * Fixed workspace pills on the home dialog. Each pill maps to exactly one
 * engine: 办公 → OpenCode, 设计 → Zeus (internal aionrs), 开发 → Claude Code.
 * The rest of the catalog (other CLI agents, preset assistants) is not
 * offered here on purpose.
 */
export type WorkspaceTabKey = 'office' | 'design' | 'dev';

type WorkspaceTabDef = {
  key: WorkspaceTabKey;
  labelKey: string;
  fallbackLabel: string;
  match: (assistant: Assistant) => boolean;
};

const WORKSPACE_TABS: WorkspaceTabDef[] = [
  {
    key: 'office',
    labelKey: 'guid.workspaceTab.office',
    fallbackLabel: '办公',
    match: (assistant) => assistant.source === 'generated' && assistantRuntimeKey(assistant) === 'opencode',
  },
  {
    key: 'design',
    labelKey: 'guid.workspaceTab.design',
    fallbackLabel: '设计',
    match: (assistant) => assistant.source === 'generated' && isAionrsAssistant(assistant),
  },
  {
    key: 'dev',
    labelKey: 'guid.workspaceTab.dev',
    fallbackLabel: '开发',
    match: (assistant) => assistant.source === 'generated' && assistantRuntimeKey(assistant) === 'claude',
  },
];

type AssistantSelectionAreaProps = {
  selectedAssistantId?: string | null;
  assistants: Assistant[];
  localeKey: string;
  onSelectAssistant: (assistantId: string) => void;
};

const AssistantSelectionArea: React.FC<AssistantSelectionAreaProps> = ({
  selectedAssistantId,
  assistants,
  onSelectAssistant,
}) => {
  const { t } = useTranslation();
  const { assistantOrder } = useAssistantOrder();
  const enabledAssistants = useMemo(
    () => selectableAssistants(assistants, assistantOrder),
    [assistantOrder, assistants]
  );

  // Resolve each fixed pill to its engine's generated assistant row. A pill
  // whose engine is not detected (agent missing or offline) is not rendered.
  const tabs = useMemo(() => {
    return WORKSPACE_TABS.map((tab) => ({ tab, assistant: enabledAssistants.find(tab.match) })).filter(
      (entry): entry is { tab: WorkspaceTabDef; assistant: Assistant } => Boolean(entry.assistant)
    );
  }, [enabledAssistants]);

  if (tabs.length === 0) return null;

  const selectedId = selectedAssistantId || undefined;

  return (
    <div className='mt-18px mb-16px w-full'>
      <div className='flex w-full justify-center'>
        <div
          className='relative inline-flex max-w-full items-center rounded-999px px-6px py-6px'
          style={{ background: 'var(--color-guid-agent-bar, var(--aou-2))' }}
        >
          <div className='flex min-w-0 max-w-full items-center gap-6px'>
            {tabs.map(({ tab, assistant }) => {
              const isSelected = selectedId === assistant.id;

              return (
                <Button
                  key={tab.key}
                  data-testid={`workspace-pill-${tab.key}`}
                  data-assistant-id={assistant.id}
                  data-assistant-backend={assistantRuntimeKey(assistant)}
                  data-assistant-selected={isSelected ? 'true' : 'false'}
                  type='text'
                  className={`!inline-flex !min-w-0 !h-auto !items-center !rounded-999px !border-none !px-12px !py-8px !text-13px transition-all ${
                    isSelected
                      ? 'font-600 text-t-primary shadow-sm'
                      : `text-t-secondary opacity-75 hover:opacity-100 ${styles.assistantSelectorInactive}`
                  }`}
                  style={isSelected ? { background: 'var(--bg-base, #fff)' } : { background: 'transparent' }}
                  onClick={() => onSelectAssistant(assistant.id)}
                >
                  <span data-assistant-label='true' className='min-w-0 max-w-180px truncate whitespace-nowrap'>
                    {t(tab.labelKey, { defaultValue: tab.fallbackLabel })}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssistantSelectionArea;
