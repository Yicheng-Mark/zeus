/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AionSearchInput } from '@/renderer/components/base';
import type { KnowledgeNoteSummary } from '@/common/types/knowledge';
import { Button, Empty, Spin, Tag } from '@arco-design/web-react';
import { Plus, Refresh } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';

interface NoteListPaneProps {
  notes: KnowledgeNoteSummary[];
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onReindex: () => void;
}

const formatDate = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const NoteListPane: React.FC<NoteListPaneProps> = ({
  notes,
  loading,
  search,
  onSearchChange,
  selectedId,
  onSelect,
  onCreate,
  onReindex,
}) => {
  const { t } = useTranslation();

  return (
    <div className='w-280px shrink-0 h-full flex flex-col border-r border-border-2' data-testid='knowledge-list-pane'>
      <div className='p-12px flex flex-col gap-8px'>
        <div className='flex items-center gap-8px'>
          <Button size='small' type='primary' onClick={onCreate} data-testid='knowledge-new-note'>
            <span className='inline-flex items-center gap-4px'>
              <Plus theme='outline' size='14' />
              {t('knowledge.newNote')}
            </span>
          </Button>
          <Button size='small' onClick={onReindex} title={t('knowledge.reindexButton')}>
            <Refresh theme='outline' size='14' />
          </Button>
        </div>
        <AionSearchInput value={search} onChange={onSearchChange} placeholder={t('knowledge.searchPlaceholder')} allowClear />
      </div>
      <div className='flex-1 min-h-0 overflow-y-auto px-8px pb-12px'>
        {loading && notes.length === 0 ? (
          <div className='flex justify-center py-24px'>
            <Spin />
          </div>
        ) : notes.length === 0 ? (
          <div className='py-24px'>
            <Empty description={t('knowledge.emptyList')} />
          </div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              data-testid={`knowledge-note-item-${note.id}`}
              className={classNames(
                'px-8px py-8px rd-6px cursor-pointer mb-2px transition-colors',
                note.id === selectedId ? 'bg-fill-3' : 'hover:bg-fill-2'
              )}
              onClick={() => onSelect(note.id)}
            >
              <div className='text-14px text-t-primary truncate font-[500]'>{note.title}</div>
              <div className='flex items-center gap-6px mt-2px'>
                <span className='text-11px text-t-tertiary'>{formatDate(note.updated_at)}</span>
                {note.tags.slice(0, 2).map((tag) => (
                  <Tag key={tag} size='small' color='gray' className='!mr-0'>
                    {tag}
                  </Tag>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NoteListPane;
