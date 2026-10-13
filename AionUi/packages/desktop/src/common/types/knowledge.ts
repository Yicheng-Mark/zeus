/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Mirror of aionui-api-types knowledge.rs DTOs. */
export type KnowledgeNoteSummary = {
  id: string;
  title: string;
  file_name: string;
  tags: string[];
  updated_at: number;
};

export type KnowledgeNote = {
  id: string;
  title: string;
  file_name: string;
  content: string;
  tags: string[];
  created_at: number;
  updated_at: number;
};

export type CreateKnowledgeNoteRequest = {
  title: string;
  content?: string;
  tags?: string[];
};

export type UpdateKnowledgeNoteRequest = {
  title?: string;
  content?: string;
  tags?: string[];
};

export type KnowledgeBacklinks = {
  notes: KnowledgeNoteSummary[];
};

export type KnowledgeReindexReport = {
  indexed: number;
  removed: number;
};
