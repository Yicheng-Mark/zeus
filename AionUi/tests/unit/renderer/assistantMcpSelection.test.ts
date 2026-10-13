/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { IMcpServer } from '@/common/config/storage';
import { resolveMcpSelectionIds } from '@/renderer/pages/settings/AssistantSettings/assistantUtils';

const server = (id: string, name: string): IMcpServer => ({ id, name }) as IMcpServer;

describe('resolveMcpSelectionIds', () => {
  const catalog = [server('row-1', 'context7'), server('row-2', 'playwright')];

  it('keeps entries that already match a catalog id exactly', () => {
    expect(resolveMcpSelectionIds(['row-1'], catalog)).toEqual(['row-1']);
  });

  it('maps persisted server names to the matching catalog id', () => {
    // Generated assistants persist NAMES in defaults.mcps.value.
    expect(resolveMcpSelectionIds(['context7', 'playwright'], catalog)).toEqual(['row-1', 'row-2']);
  });

  it('prefers an exact id match over a name match', () => {
    // A server literally named like another row's id must not be substituted.
    const tricky = [...catalog, server('row-3', 'row-1')];
    expect(resolveMcpSelectionIds(['row-1'], tricky)).toEqual(['row-1']);
  });

  it('drops entries that match no installed server instead of writing them back', () => {
    expect(resolveMcpSelectionIds(['context7', 'missing-server', 'row-2'], catalog)).toEqual(['row-1', 'row-2']);
  });

  it('maps the first catalog row when names collide', () => {
    const duplicated = [...catalog, server('row-3', 'context7')];
    expect(resolveMcpSelectionIds(['context7'], duplicated)).toEqual(['row-1']);
  });

  it('returns an empty selection for missing or empty entries', () => {
    expect(resolveMcpSelectionIds(undefined, catalog)).toEqual([]);
    expect(resolveMcpSelectionIds([], catalog)).toEqual([]);
    expect(resolveMcpSelectionIds(['context7'], [])).toEqual([]);
  });
});
