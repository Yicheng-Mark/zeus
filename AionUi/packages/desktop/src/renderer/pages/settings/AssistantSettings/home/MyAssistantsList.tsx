/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AssistantListItem } from '../types';
import { type AssistantEnabledFilter, filterByEnabled } from '../assistantUtils';
import MyAssistantCard from './MyAssistantCard';
import { Dropdown, Menu, Button } from '@arco-design/web-react';
import { AllApplication, Down } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type MyAssistantsListProps = {
  assistants: AssistantListItem[];
  localeKey: string;
  onOpenDetail: (assistant: AssistantListItem) => void;
  onDelete: (assistant: AssistantListItem) => void;
  onToggleEnabled: (assistant: AssistantListItem, checked: boolean) => void;
  onStartChat: (assistant: AssistantListItem) => void;
  searchActive?: boolean;
};

const FILTER_OPTIONS: AssistantEnabledFilter[] = ['all', 'enabled', 'disabled'];

const renderGroupHeader = (title: string, count: number, barClass: string) => (
  <div className='mb-10px flex items-center gap-8px px-2px'>
    <span className={`h-13px w-3px rounded-2px ${barClass}`} />
    <span className='text-12px font-600 text-t-secondary'>{title}</span>
    {count > 0 ? (
      <span className='rounded-999px bg-fill-2 px-6px py-1px text-10px font-500 text-t-quaternary'>{count}</span>
    ) : null}
  </div>
);

const MyAssistantsList: React.FC<MyAssistantsListProps> = ({
  assistants,
  localeKey,
  onOpenDetail,
  onDelete,
  onToggleEnabled,
  onStartChat,
  searchActive = false,
}) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<AssistantEnabledFilter>('all');

  // Zeus ships a fixed engine catalog, so this tab lists only the bare CLI
  // assistants generated from those engines.
  const cliAssistants = useMemo(() => {
    const filtered = filterByEnabled(assistants, filter);
    return filtered.filter((assistant) => assistant.source === 'generated');
  }, [assistants, filter]);

  const filterMenu = (
    <Menu onClickMenuItem={(key) => setFilter(key as AssistantEnabledFilter)}>
      {FILTER_OPTIONS.map((option) => (
        <Menu.Item key={option} data-testid={`filter-option-${option}`}>
          {t(`settings.assistantFilter.${option}`, {
            defaultValue: option === 'all' ? 'All' : option === 'enabled' ? 'Enabled' : 'Disabled',
          })}
        </Menu.Item>
      ))}
    </Menu>
  );

  const renderCardGrid = (list: AssistantListItem[]) => (
    <div className='grid grid-cols-1 gap-14px sm:grid-cols-2 lg:grid-cols-3'>
      {list.map((assistant) => (
        <MyAssistantCard
          key={assistant.id}
          assistant={assistant}
          localeKey={localeKey}
          onOpenDetail={onOpenDetail}
          onDelete={onDelete}
          onToggleEnabled={onToggleEnabled}
          onStartChat={onStartChat}
        />
      ))}
    </div>
  );

  return (
    <div data-testid='my-assistants-pane'>
      {/* Compact toolbar: quiet one-line hint (full text on hover) + enabled filter. */}
      <div className='mb-14px flex items-center justify-between gap-12px'>
        <span className='inline-flex min-w-0 items-center gap-6px text-12px text-t-tertiary'>
          <AllApplication
            theme='outline'
            size={14}
            fill='currentColor'
            className='block shrink-0 leading-none text-t-quaternary'
            style={{ lineHeight: 0 }}
          />
          <span className='truncate'>
            {t('settings.myAssistantsHintShort', {
              defaultValue: 'Your own assistants — used wherever you pick one.',
            })}
          </span>
        </span>
        <Dropdown droplist={filterMenu} trigger='click' position='br'>
          <Button
            size='mini'
            data-testid='assistant-enabled-filter'
            className='!flex !shrink-0 !items-center !gap-4px !rounded-8px'
          >
            <span>
              {t(`settings.assistantFilter.${filter}`, {
                defaultValue: filter === 'all' ? 'All' : filter === 'enabled' ? 'Enabled' : 'Disabled',
              })}
            </span>
            <Down theme='outline' size={12} fill='currentColor' />
          </Button>
        </Dropdown>
      </div>

      {searchActive && cliAssistants.length === 0 ? (
        <div className='rounded-14px border border-dashed border-border-2 bg-fill-1/40 px-20px py-28px text-center text-13px text-t-secondary'>
          {t('settings.assistantNoMatch', { defaultValue: 'No assistants match the current filters.' })}
        </div>
      ) : null}

      {/* CLI group. */}
      {cliAssistants.length > 0 ? (
        <div data-testid='group-cli'>
          {renderGroupHeader(
            t('settings.assistantGroupCli', { defaultValue: 'Your CLI' }),
            cliAssistants.length,
            'bg-warning-5'
          )}
          {renderCardGrid(cliAssistants)}
        </div>
      ) : null}
    </div>
  );
};

export default MyAssistantsList;
