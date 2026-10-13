/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { buildAgentRuntimeModelInfo, filterRuntimeModelCatalog } from '@/renderer/utils/model/agentRuntimeCatalog';

describe('filterRuntimeModelCatalog', () => {
  it('keeps only injected zeus-* entries when any exist, hiding the engine built-in catalog', () => {
    const models = [
      { id: 'opencode/big-pickle', label: 'OpenCode/Big Pickle' },
      { id: 'opencode/ling-3.1-flash-free', label: 'OpenCode/Ling 3.1 Flash Free' },
      { id: 'zeus-c9a416ae/deepseek-flash', label: 'DeepSeek/deepseek-flash' },
      { id: 'zeus-c9a416ae/deepseek-v4-pro', label: 'DeepSeek/deepseek-v4-pro' },
    ];

    expect(filterRuntimeModelCatalog(models, 'zeus-c9a416ae/deepseek-flash').map((m) => m.id)).toEqual([
      'zeus-c9a416ae/deepseek-flash',
      'zeus-c9a416ae/deepseek-v4-pro',
    ]);
  });

  it('drops the claude default slot and collapses slots sharing a label', () => {
    const models = [
      { id: 'default', label: 'Default (recommended)' },
      { id: 'opus', label: 'deepseek-flash' },
      { id: 'fable', label: 'deepseek-flash' },
      { id: 'sonnet', label: 'deepseek-v4-pro' },
      { id: 'haiku', label: 'deepseek-flash' },
    ];

    expect(filterRuntimeModelCatalog(models, 'opus').map((m) => m.id)).toEqual(['opus', 'sonnet']);
  });

  it('keeps a lone default entry (nothing else to show)', () => {
    expect(filterRuntimeModelCatalog([{ id: 'default', label: 'Default' }], 'default').map((m) => m.id)).toEqual([
      'default',
    ]);
  });

  it('keeps the current entry even when the filter would drop it', () => {
    const models = [
      { id: 'opencode/big-pickle', label: 'OpenCode/Big Pickle' },
      { id: 'zeus-c9a416ae/deepseek-flash', label: 'DeepSeek/deepseek-flash' },
    ];

    expect(filterRuntimeModelCatalog(models, 'opencode/big-pickle').map((m) => m.id)).toEqual([
      'zeus-c9a416ae/deepseek-flash',
      'opencode/big-pickle',
    ]);
  });

  it('leaves catalogs without injected providers untouched', () => {
    const models = [
      { id: 'sonnet', label: 'Sonnet' },
      { id: 'opus', label: 'Opus' },
    ];

    expect(filterRuntimeModelCatalog(models, null).map((m) => m.id)).toEqual(['sonnet', 'opus']);
  });
});

describe('buildAgentRuntimeModelInfo', () => {
  it('filters the persisted config-options catalog through the runtime filter', () => {
    const info = buildAgentRuntimeModelInfo({
      config_options: {
        config_options: [
          {
            id: 'model',
            category: 'model',
            type: 'select',
            currentValue: 'opus',
            options: [
              { value: 'default', label: 'Default (recommended)' },
              { value: 'opus', label: 'deepseek-flash' },
              { value: 'sonnet', label: 'deepseek-v4-pro' },
            ],
          },
        ],
      },
    });

    expect(info?.available_models.map((m) => m.id)).toEqual(['opus', 'sonnet']);
    expect(info?.current_model_id).toBe('opus');
  });
});
