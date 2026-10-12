/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AssistantListItem } from '../types';
import EnabledAssistantsList from './EnabledAssistantsList';
import MyAssistantsList from './MyAssistantsList';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { AionSearchInput } from '@/renderer/components/base';
import SettingsPageHeader from '../../components/SettingsPageHeader';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type AssistantHomeTabsProps = {
  assistants: AssistantListItem[];
  assistantOrder: readonly string[];
  localeKey: string;
  onOpenDetail: (assistant: AssistantListItem) => void;
  onDelete: (assistant: AssistantListItem) => void;
  onToggleEnabled: (assistant: AssistantListItem, checked: boolean) => void;
  onReorderEnabled: (activeId: string, overId: string) => void | Promise<void>;
  onStartChat: (assistant: AssistantListItem) => void;
  /** Tab to show on mount. */
  initialTab?: 'enabled' | 'mine';
  /** Notified whenever the active tab changes, so the parent can remember it. */
  onTabChange?: (tab: 'enabled' | 'mine') => void;
};

type HomeTab = 'enabled' | 'mine';

const AssistantHomeTabs: React.FC<AssistantHomeTabsProps> = ({
  assistants,
  assistantOrder,
  localeKey,
  onOpenDetail,
  onDelete,
  onToggleEnabled,
  onReorderEnabled,
  onStartChat,
  initialTab = 'enabled',
  onTabChange,
}) => {
  const { t, i18n } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const [tab, setTab] = useState<HomeTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');

  const selectTab = (next: HomeTab) => {
    setTab(next);
    onTabChange?.(next);
  };

  const counts = useMemo(() => {
    let enabled = 0;
    let mine = 0;
    for (const assistant of assistants) {
      if (assistant.enabled !== false) enabled += 1;
      mine += 1;
    }
    return { enabled, mine };
  }, [assistants]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredAssistants = useMemo(() => {
    if (!normalizedSearchQuery) return assistants;
    return assistants.filter((assistant) => {
      const searchableText = [
        assistant.name,
        assistant.name_i18n?.[i18n.language],
        assistant.description,
        assistant.description_i18n?.[i18n.language],
        assistant.agent?.type,
        assistant.agent?.acp_backend,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchableText.includes(normalizedSearchQuery);
    });
  }, [assistants, i18n.language, normalizedSearchQuery]);

  return (
    <div data-testid='assistant-home-shell' className='flex h-full min-h-0 flex-col overflow-hidden bg-transparent'>
      <div
        className={`border-b border-border-2 bg-bg-0 ${isMobile ? 'px-16px pt-14px' : 'px-12px pt-24px md:px-40px md:pt-32px'}`}
      >
        <div className='mx-auto w-full max-w-800px'>
          <SettingsPageHeader
            data-testid='assistants-header'
            title={t('settings.assistants', { defaultValue: 'Assistants' })}
            description={t('settings.assistantHomeLeadShort', {
              defaultValue:
                'Ready-to-work AI experts, preloaded with skills. Enable one and it shows up wherever you pick an assistant.',
            })}
            actions={
              <>
                {!isMobile && (
                  <AionSearchInput
                    className='shrink-0 w-[200px] hidden md:flex'
                    data-testid='input-search-assistants'
                    placeholder={t('settings.searchAssistants', {
                      defaultValue: 'Search assistants by name or description',
                    })}
                    value={searchQuery}
                    onChange={setSearchQuery}
                  />
                )}
              </>
            }
            tabs={[
              {
                key: 'enabled',
                label: t('settings.assistantSectionEnabled', { defaultValue: 'Enabled' }),
                count: counts.enabled,
              },
              {
                key: 'mine',
                label: t('settings.assistantTabMine', { defaultValue: 'My Assistants' }),
                count: counts.mine,
              },
            ]}
            activeTab={tab}
            onTabChange={(key) => selectTab(key as HomeTab)}
          />
        </div>
      </div>

      <div
        data-testid='assistant-home-body'
        className={`min-h-0 flex-1 overflow-auto ${isMobile ? 'px-16px pb-14px pt-14px' : 'px-12px pb-24px pt-18px md:px-40px'}`}
      >
        <div className='mx-auto w-full max-w-800px'>
          {tab === 'enabled' ? (
            <EnabledAssistantsList
              assistants={filteredAssistants}
              assistantOrder={assistantOrder}
              localeKey={localeKey}
              searchActive={Boolean(normalizedSearchQuery)}
              onOpenDetail={onOpenDetail}
              onToggleEnabled={onToggleEnabled}
              onReorder={onReorderEnabled}
              onStartChat={onStartChat}
            />
          ) : (
            <MyAssistantsList
              assistants={filteredAssistants}
              localeKey={localeKey}
              onOpenDetail={onOpenDetail}
              onDelete={onDelete}
              onToggleEnabled={onToggleEnabled}
              onStartChat={onStartChat}
              searchActive={Boolean(normalizedSearchQuery)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default AssistantHomeTabs;
