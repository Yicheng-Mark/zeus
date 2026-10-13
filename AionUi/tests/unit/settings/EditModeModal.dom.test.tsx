/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { IProvider } from '@/common/config/storage';

const mocks = vi.hoisted(() => ({
  // Capture the AionModal props so tests can drive onOk (form submit).
  modalProps: null as { onOk?: () => Promise<void>; visible?: boolean; children?: React.ReactNode } | null,
}));

// jsdom lacks matchMedia; Arco's responsive observer needs it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Return the key itself so assertions match i18n keys directly.
    t: (key: string) => key,
  }),
}));

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: (props: { onOk?: () => Promise<void>; visible?: boolean; children: React.ReactNode }) => {
    mocks.modalProps = props;
    return props.visible ? <div>{props.children}</div> : null;
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: { mode: { fetchModelList: { invoke: vi.fn() } } },
}));

vi.mock('@renderer/hooks/agent/useModeModeList', () => ({
  default: () => ({ data: undefined, isLoading: false, error: undefined, mutate: vi.fn() }),
}));

import EditModeModal from '@/renderer/pages/settings/components/EditModeModal';

const customProvider = (overrides: Partial<IProvider> = {}): IProvider =>
  ({
    id: 'c9a416ae',
    platform: 'custom',
    name: 'DeepSeek',
    base_url: 'https://api.deepseek.com/v1',
    api_key: 'sk-test',
    models: ['deepseek-flash'],
    agent_scopes: ['aionrs', 'claude', 'opencode'],
    ...overrides,
  }) as IProvider;

function Harness({ data, onChange }: { data: IProvider; onChange: (p: IProvider) => void }) {
  const [ctrl, context] = EditModeModal.useModal({ onChange });
  React.useEffect(() => {
    ctrl.open({ data });
  }, [ctrl, data]);
  return <>{context}</>;
}

const renderEditor = (data: IProvider, onChange: (p: IProvider) => void = () => {}) =>
  render(<Harness data={data} onChange={onChange} />);

describe('EditModeModal claude-scope Anthropic URL handling', () => {
  it('warns when a custom provider scoped to claude lacks the Anthropic-compatible URL', () => {
    renderEditor(customProvider());
    expect(screen.getByText('settings.claudeScopeNeedsAnthropicUrl')).toBeInTheDocument();
    // The field that fixes it is reachable from the edit modal.
    expect(screen.getByText('settings.anthropicBaseUrl')).toBeInTheDocument();
  });

  it('stops warning once the URL is filled in', () => {
    renderEditor(customProvider({ anthropic_base_url: 'https://api.deepseek.com/anthropic' }));
    expect(screen.queryByText('settings.claudeScopeNeedsAnthropicUrl')).not.toBeInTheDocument();
  });

  it('clears the warning reactively when the URL is typed', () => {
    renderEditor(customProvider());
    const input = screen.getByPlaceholderText('https://api.deepseek.com/anthropic');
    fireEvent.change(input, { target: { value: 'https://api.deepseek.com/anthropic' } });
    expect(screen.queryByText('settings.claudeScopeNeedsAnthropicUrl')).not.toBeInTheDocument();
  });

  it('hides the Anthropic URL field for non-custom platforms but keeps the scopes selector', () => {
    renderEditor(customProvider({ platform: 'openai', anthropic_base_url: undefined }));
    expect(screen.queryByText('settings.anthropicBaseUrl')).not.toBeInTheDocument();
    expect(screen.getByText('settings.agentScopes')).toBeInTheDocument();
  });
});

describe('EditModeModal submit normalization', () => {
  it('trims and keeps a filled Anthropic URL, and preserves the scopes selection', async () => {
    const onChange = vi.fn();
    renderEditor(customProvider(), onChange);
    const input = screen.getByPlaceholderText('https://api.deepseek.com/anthropic');
    fireEvent.change(input, { target: { value: '  https://api.deepseek.com/anthropic  ' } });
    await act(async () => {
      await mocks.modalProps?.onOk?.();
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        anthropic_base_url: 'https://api.deepseek.com/anthropic',
        agent_scopes: ['aionrs', 'claude', 'opencode'],
      })
    );
  });

  it("sends an explicit '' so the backend partial-update clears the stored Anthropic URL", async () => {
    const onChange = vi.fn();
    renderEditor(customProvider({ anthropic_base_url: 'https://api.deepseek.com/anthropic' }), onChange);
    const input = screen.getByPlaceholderText('https://api.deepseek.com/anthropic');
    fireEvent.change(input, { target: { value: '' } });
    await act(async () => {
      await mocks.modalProps?.onOk?.();
    });
    // undefined would drop out of the JSON body and the backend would keep the
    // old value — the clear must arrive as an empty string.
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ anthropic_base_url: '' }));
  });
});
