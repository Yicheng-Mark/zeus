/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import GuidActionRow from '@/renderer/pages/guid/components/GuidActionRow';
import { ipcBridge } from '@/common';

const environment = vi.hoisted(() => ({ isMobile: false, isDesktop: true }));

vi.mock('@/common', () => ({
  ipcBridge: {
    dialog: {
      showOpen: { invoke: vi.fn().mockResolvedValue([]) },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: environment.isMobile }),
}));

vi.mock('@/renderer/components/agent/AgentModeSelector', () => ({
  default: () => <div data-testid='agent-mode-selector' />,
}));

vi.mock('@/renderer/components/chat/MobileActionSheet', () => ({
  default: ({ entries }: { entries: Array<{ key: string; label: string; onClick?: () => void }> }) => (
    <div data-testid='mobile-action-sheet'>
      {entries.map((entry) => (
        <button key={entry.key} type='button' data-testid={entry.key} onClick={entry.onClick}>
          {entry.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/renderer/services/FileService', () => ({
  getCleanFileNames: (files: string[]) => files,
  FileService: { processDroppedFiles: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => environment.isDesktop,
}));

vi.mock('@icon-park/react', () => {
  const Icon = () => <span aria-hidden='true' />;
  return {
    ArrowUp: Icon,
    Brain: Icon,
    FolderOpen: Icon,
    FolderUpload: Icon,
    Lightning: Icon,
    Paperclip: Icon,
    Plus: Icon,
    Search: Icon,
    Shield: Icon,
    UploadOne: Icon,
  };
});

vi.mock('@arco-design/web-react', () => {
  const Menu = Object.assign(
    ({ children, className }: { children?: React.ReactNode; className?: string }) => (
      <div data-testid='dropdown-menu' className={className}>
        {children}
      </div>
    ),
    {
      Item: ({
        children,
        className,
        onClick,
      }: {
        children?: React.ReactNode;
        className?: string;
        onClick?: (e: React.MouseEvent) => void;
      }) => (
        <div role='menuitem' className={className} onClick={onClick}>
          {children}
        </div>
      ),
    }
  );
  return {
    Button: ({
      children,
      disabled,
      onClick,
      ...props
    }: {
      children?: React.ReactNode;
      disabled?: boolean;
      onClick?: () => void;
      [key: string]: unknown;
    }) => (
      <button type='button' disabled={disabled} onClick={onClick} {...props}>
        {children}
      </button>
    ),
    Dropdown: ({ children, droplist }: { children?: React.ReactNode; droplist?: React.ReactNode }) => (
      <div>
        {children}
        {droplist}
      </div>
    ),
    Menu,
    Message: { success: vi.fn(), error: vi.fn() },
    Tooltip: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  };
});

const renderActionRow = (overrides: Partial<React.ComponentProps<typeof GuidActionRow>> = {}) =>
  render(
    <GuidActionRow
      files={[]}
      onFilesUploaded={vi.fn()}
      modelSelectorNode={null}
      isGeminiMode={false}
      modelList={[]}
      current_model={undefined}
      setCurrentModel={vi.fn()}
      currentAcpCachedModelInfo={null}
      selectedAcpModel={null}
      setSelectedAcpModel={vi.fn()}
      selectedMode=''
      onModeSelect={vi.fn()}
      loading={false}
      isButtonDisabled={false}
      onSend={vi.fn()}
      {...overrides}
    />
  );

describe('GuidActionRow attach actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    environment.isMobile = false;
    environment.isDesktop = true;
  });

  it('offers both host files and device upload in the mobile WebUI action sheet', () => {
    environment.isMobile = true;
    environment.isDesktop = false;
    renderActionRow();

    expect(screen.getByTestId('attach-host-files')).toHaveTextContent('Add files');
    expect(screen.getByTestId('attach-my-device')).toHaveTextContent('Upload from device');
  });

  it('keeps the mobile sheet free of skill and MCP entries', () => {
    environment.isMobile = true;
    environment.isDesktop = false;
    renderActionRow();

    expect(screen.queryByTestId('skills')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mcp')).not.toBeInTheDocument();
  });

  it('adds files selected from the host picker in mobile WebUI', async () => {
    environment.isMobile = true;
    environment.isDesktop = false;
    const onFilesPicked = vi.fn();
    vi.mocked(ipcBridge.dialog.showOpen.invoke).mockResolvedValue(['/host/project/a.txt']);
    renderActionRow({ onFilesPicked });

    fireEvent.click(screen.getByTestId('attach-host-files'));

    await waitFor(() => expect(onFilesPicked).toHaveBeenCalledWith(['/host/project/a.txt']));
  });

  it('offers only file entries in the desktop "+" dropdown', () => {
    renderActionRow();

    // The mocked t() returns the key when no defaultValue is supplied.
    expect(screen.getByTestId('dropdown-menu')).toHaveTextContent('common.fileAttach.addFiles');
    // Per-conversation skill/MCP selection is gone from the guid flow.
    expect(screen.getByTestId('dropdown-menu')).not.toHaveTextContent('settings.capabilitiesTab.skills');
    expect(screen.getByTestId('dropdown-menu')).not.toHaveTextContent('mcp.label');
  });
});
