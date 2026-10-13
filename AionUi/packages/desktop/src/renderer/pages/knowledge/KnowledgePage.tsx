/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Knowledge Base — Obsidian-compatible local vault of markdown notes.
 * Files live under `{data_dir}/knowledge/` and can be opened in Obsidian
 * directly; the backend keeps a derived index ([[wikilink]] graph included)
 * that `reindex` reconciles with external edits.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Message } from '@arco-design/web-react';
import SettingsPageWrapper from '../settings/components/SettingsPageWrapper';
import SettingsPageHeader from '../settings/components/SettingsPageHeader';
import NoteListPane from './components/NoteListPane';
import NoteEditorPane from './components/NoteEditorPane';
import BacklinksPane from './components/BacklinksPane';
import { useKnowledgeActions, useKnowledgeBacklinks, useKnowledgeNote, useKnowledgeNotes } from './hooks/useKnowledgeNotes';

const KnowledgePage: React.FC = () => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { notes, isLoading, mutate: mutateNotes } = useKnowledgeNotes(search.trim());
  const { note, mutate: mutateNote } = useKnowledgeNote(selectedId);
  const { backlinks } = useKnowledgeBacklinks(selectedId);

  const refreshAll = useCallback(() => {
    void mutateNotes();
    void mutateNote();
  }, [mutateNotes, mutateNote]);

  const { createNote, saveNote, deleteNote, reindex } = useKnowledgeActions(refreshAll);

  const handleCreate = useCallback(() => {
    const title = t('knowledge.untitledNote');
    createNote(title)
      .then((created) => {
        setSelectedId(created.id);
        // Focus the title input for immediate renaming.
        requestAnimationFrame(() => {
          document.querySelector<HTMLInputElement>('[data-testid="knowledge-title-input"]')?.focus();
        });
      })
      .catch((error) => {
        console.error('Failed to create note:', error);
        Message.error(t('knowledge.saveFailed'));
      });
  }, [createNote, t]);

  const handleReindex = useCallback(() => {
    reindex()
      .then((report) => {
        Message.success(t('knowledge.reindexedToast', { indexed: String(report.indexed), removed: String(report.removed) }));
      })
      .catch((error) => {
        console.error('Failed to reindex knowledge base:', error);
        Message.error(t('knowledge.saveFailed'));
      });
  }, [reindex, t]);

  const editorNote = useMemo(() => note ?? null, [note]);

  return (
    <SettingsPageWrapper contentClassName='max-w-none !px-0 md:!px-0'>
      <div className='flex flex-col h-full min-h-0'>
        <div className='px-16px md:px-40px pt-14px md:pt-24px'>
          <SettingsPageHeader
            data-testid='knowledge-header'
            title={t('knowledge.title')}
            description={t('knowledge.description')}
          />
        </div>
        <div className='flex-1 min-h-0 flex items-stretch border-t border-border-2 mt-12px'>
          <NoteListPane
            notes={notes}
            loading={isLoading}
            search={search}
            onSearchChange={setSearch}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCreate={handleCreate}
            onReindex={handleReindex}
          />
          <NoteEditorPane
            note={editorNote}
            loading={Boolean(selectedId) && !note}
            onSave={saveNote}
            onDelete={deleteNote}
            onSaved={refreshAll}
            onDeleted={() => setSelectedId(null)}
          />
          <BacklinksPane backlinks={backlinks} onSelect={setSelectedId} />
        </div>
      </div>
    </SettingsPageWrapper>
  );
};

export default KnowledgePage;
