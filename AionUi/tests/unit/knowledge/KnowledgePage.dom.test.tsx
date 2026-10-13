/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listNotes: vi.fn(),
  getNote: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  backlinks: vi.fn(),
  reindex: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    knowledge: {
      listNotes: { invoke: mocks.listNotes },
      getNote: { invoke: mocks.getNote },
      createNote: { invoke: mocks.createNote },
      updateNote: { invoke: mocks.updateNote },
      deleteNote: { invoke: mocks.deleteNote },
      backlinks: { invoke: mocks.backlinks },
      reindex: { invoke: mocks.reindex },
    },
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/knowledge' }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => {
    if (params?.title) return `${key}:${String(params.title)}`;
    if (params?.count !== undefined) return `${key}:${String(params.count)}`;
    return key;
  }, i18n: { language: 'zh-CN' } }),
}));

import KnowledgePage from '@renderer/pages/knowledge/KnowledgePage';
import { SWRConfig } from 'swr';

const renderPage = async () => {
  // Fresh SWR cache per render: the module-level cache dedupes fetches across
  // tests and would serve the previous test's empty list.
  const view = render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <KnowledgePage />
    </SWRConfig>
  );
  await waitFor(() => expect(screen.getByTestId('knowledge-list-pane')).toBeInTheDocument(), { timeout: 5000 });
  return view;
};

describe('KnowledgePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listNotes.mockResolvedValue([]);
    mocks.backlinks.mockResolvedValue({ notes: [] });
  });

  it('renders the three panes with an empty vault', async () => {
    await renderPage();
    expect(screen.getByTestId('knowledge-header')).toHaveTextContent('knowledge.title');
    expect(screen.getByTestId('knowledge-list-pane')).toBeInTheDocument();
    expect(screen.getByTestId('knowledge-editor-empty')).toBeInTheDocument();
    expect(screen.getByTestId('knowledge-backlinks-pane')).toBeInTheDocument();
  });

  it('creates a note and opens it in the editor when 新建笔记 is clicked', async () => {
    const created = {
      id: 'kn_1',
      title: '无标题笔记',
      file_name: '无标题笔记.md',
      content: '',
      tags: [],
      created_at: 1,
      updated_at: 1,
    };
    mocks.createNote.mockResolvedValue(created);
    mocks.getNote.mockResolvedValue(created);

    await renderPage();
    fireEvent.click(screen.getByTestId('knowledge-new-note'));

    await waitFor(() => expect(mocks.createNote).toHaveBeenCalled());
    await waitFor(() => expect(mocks.getNote).toHaveBeenCalledWith({ id: 'kn_1' }));
    await waitFor(() => expect(screen.getByTestId('knowledge-editor-pane')).toBeInTheDocument());
  });

  it('lists notes from the vault and shows backlinks for the selected one', async () => {
    mocks.listNotes.mockResolvedValue([
      { id: 'kn_a', title: '会议记录', file_name: '会议记录.md', tags: ['工作'], updated_at: 2 },
      { id: 'kn_b', title: '项目A', file_name: '项目A.md', tags: [], updated_at: 1 },
    ]);
    mocks.getNote.mockResolvedValue({
      id: 'kn_a',
      title: '会议记录',
      file_name: '会议记录.md',
      content: '链接 [[项目A]]',
      tags: ['工作'],
      created_at: 1,
      updated_at: 2,
    });
    mocks.backlinks.mockResolvedValue({
      notes: [{ id: 'kn_b', title: '项目B', file_name: '项目B.md', tags: [], updated_at: 1 }],
    });

    await renderPage();
    await waitFor(() => expect(screen.getByText('会议记录')).toBeInTheDocument());
    expect(screen.getByText('项目A')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('knowledge-note-item-kn_a'));
    await waitFor(() => expect(mocks.getNote).toHaveBeenCalledWith({ id: 'kn_a' }));
    await waitFor(() => expect(screen.getByText('项目B')).toBeInTheDocument());
  });
});
