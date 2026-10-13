/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { KnowledgeNote, KnowledgeNoteSummary } from '@/common/types/knowledge';
import { useCallback } from 'react';
import useSWR from 'swr';

const notesKey = (q: string) => (q ? `knowledge.notes.q.${q}` : 'knowledge.notes');
const noteKey = (id: string | null) => (id ? `knowledge.note.${id}` : null);
const backlinksKey = (id: string | null) => (id ? `knowledge.backlinks.${id}` : null);

/** Note list (newest first); `q` filters across title and body. */
export const useKnowledgeNotes = (q: string) => {
  const { data, isLoading, mutate } = useSWR<KnowledgeNoteSummary[]>(notesKey(q), () =>
    ipcBridge.knowledge.listNotes.invoke({ q: q || undefined })
  );
  return { notes: data ?? [], isLoading, mutate };
};

export const useKnowledgeNote = (id: string | null) => {
  const { data, mutate } = useSWR<KnowledgeNote>(noteKey(id), () => (id ? ipcBridge.knowledge.getNote.invoke({ id }) : undefined));
  return { note: data, mutate };
};

export const useKnowledgeBacklinks = (id: string | null) => {
  const { data } = useSWR<KnowledgeNoteSummary[]>(backlinksKey(id), async () =>
    (await ipcBridge.knowledge.backlinks.invoke({ id: id! }))?.notes
  );
  return { backlinks: data ?? [] };
};

export function useKnowledgeActions(refreshList: () => void) {
  const createNote = useCallback(
    async (title: string) => {
      const note = await ipcBridge.knowledge.createNote.invoke({ title });
      refreshList();
      return note;
    },
    [refreshList]
  );

  const saveNote = useCallback(
    async (params: { id: string; title: string; content: string; tags: string[] }) => {
      const { id, ...body } = params;
      const note = await ipcBridge.knowledge.updateNote.invoke({ id, ...body });
      refreshList();
      return note;
    },
    [refreshList]
  );

  const deleteNote = useCallback(
    async (id: string) => {
      await ipcBridge.knowledge.deleteNote.invoke({ id });
      refreshList();
    },
    [refreshList]
  );

  const reindex = useCallback(async () => {
    const report = await ipcBridge.knowledge.reindex.invoke();
    refreshList();
    return report;
  }, [refreshList]);

  return { createNote, saveNote, deleteNote, reindex };
}
