/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Empty, Input, Message, Modal } from '@arco-design/web-react';
import { Delete } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface NoteEditorPaneProps {
  note: {
    id: string;
    title: string;
    content: string;
    tags: string[];
    updated_at: number;
  } | null;
  loading: boolean;
  onSave: (params: { id: string; title: string; content: string; tags: string[] }) => Promise<unknown>;
  onDelete: (id: string) => Promise<void>;
  onSaved: () => void;
  onDeleted: () => void;
}

const NoteEditorPane: React.FC<NoteEditorPaneProps> = ({ note, loading, onSave, onDelete, onSaved, onDeleted }) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setTitle(note?.title ?? '');
    setContent(note?.content ?? '');
    setTagsText((note?.tags ?? []).join(', '));
    setDirty(false);
  }, [note?.id, note?.title, note?.content, note?.tags, note]);

  if (!note && !loading) {
    return (
      <div className='flex-1 min-w-0 h-full flex items-center justify-center' data-testid='knowledge-editor-empty'>
        <Empty description={t('knowledge.selectNoteHint')} />
      </div>
    );
  }

  const parseTags = (text: string): string[] =>
    text
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean);

  const handleSave = async () => {
    if (!note) return;
    if (!title.trim()) {
      Message.warning(t('knowledge.titleRequired'));
      return;
    }
    setSaving(true);
    try {
      await onSave({ id: note.id, title: title.trim(), content, tags: parseTags(tagsText) });
      setDirty(false);
      Message.success(t('knowledge.saved'));
      onSaved();
    } catch (error) {
      console.error('Failed to save note:', error);
      Message.error(t('knowledge.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!note) return;
    Modal.confirm({
      title: t('knowledge.deleteConfirmTitle'),
      content: t('knowledge.deleteConfirmText', { title: note.title }),
      okButtonProps: { status: 'danger' },
      onOk: async () => {
        await onDelete(note.id);
        onDeleted();
      },
    });
  };

  return (
    <div className='flex-1 min-w-0 h-full flex flex-col' data-testid='knowledge-editor-pane'>
      <div className='px-16px py-12px flex flex-col gap-8px border-b border-border-2'>
        <div className='flex items-center gap-8px'>
          <Input
            value={title}
            onChange={(value) => {
              setTitle(value);
              setDirty(true);
            }}
            placeholder={t('knowledge.titlePlaceholder')}
            className='flex-1'
            size='large'
            data-testid='knowledge-title-input'
          />
          <Button size='small' onClick={handleDelete} status='danger' type='text' title={t('knowledge.deleteButton')}>
            <Delete theme='outline' size='16' />
          </Button>
          <Button size='small' type='primary' loading={saving} disabled={!dirty} onClick={handleSave} data-testid='knowledge-save'>
            {t('knowledge.saveButton')}
          </Button>
        </div>
        <div className='flex items-center gap-8px'>
          <Input
            value={tagsText}
            onChange={(value) => {
              setTagsText(value);
              setDirty(true);
            }}
            placeholder={t('knowledge.tagsPlaceholder')}
            className='max-w-360px'
            size='small'
            data-testid='knowledge-tags-input'
          />
          {dirty && <span className='text-11px text-warning'>{t('knowledge.unsavedHint')}</span>}
        </div>
      </div>
      <textarea
        className='flex-1 min-h-0 w-full resize-none border-none outline-none bg-transparent px-16px py-12px text-14px leading-24px font-mono text-t-primary'
        value={content}
        onChange={(event) => {
          setContent(event.target.value);
          setDirty(true);
        }}
        placeholder={t('knowledge.editorPlaceholder')}
        data-testid='knowledge-content-input'
        spellCheck={false}
      />
    </div>
  );
};

export default NoteEditorPane;
