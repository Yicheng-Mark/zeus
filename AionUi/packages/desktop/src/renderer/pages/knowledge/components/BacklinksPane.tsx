/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KnowledgeNoteSummary } from '@/common/types/knowledge';
import { Link } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface BacklinksPaneProps {
  backlinks: KnowledgeNoteSummary[];
  onSelect: (id: string) => void;
}

/** Notes whose [[wikilinks]] point at the open note — Obsidian's backlink panel. */
const BacklinksPane: React.FC<BacklinksPaneProps> = ({ backlinks, onSelect }) => {
  const { t } = useTranslation();

  return (
    <div className='w-240px shrink-0 h-full flex flex-col border-l border-border-2' data-testid='knowledge-backlinks-pane'>
      <div className='px-12px py-10px flex items-center gap-6px text-13px font-[500] text-t-secondary border-b border-border-2'>
        <Link theme='outline' size='14' />
        {t('knowledge.backlinks')}
      </div>
      <div className='flex-1 min-h-0 overflow-y-auto px-8px py-8px'>
        {backlinks.length === 0 ? (
          <div className='text-12px text-t-tertiary px-4px py-8px'>{t('knowledge.noBacklinks')}</div>
        ) : (
          backlinks.map((note) => (
            <div
              key={note.id}
              className='px-8px py-6px rd-6px cursor-pointer mb-2px hover:bg-fill-2 text-13px text-t-primary truncate transition-colors'
              onClick={() => onSelect(note.id)}
              data-testid={`knowledge-backlink-${note.id}`}
            >
              {note.title}
            </div>
          ))
        )}
      </div>
      {backlinks.length > 0 && (
        <div className='px-12px py-8px text-11px text-t-tertiary border-t border-border-2'>
          {t('knowledge.backlinksCount', { count: backlinks.length })}
        </div>
      )}
    </div>
  );
};

export default BacklinksPane;
