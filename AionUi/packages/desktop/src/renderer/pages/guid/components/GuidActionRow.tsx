/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import MobileActionSheet from '@/renderer/components/chat/MobileActionSheet';
import type {
  MobileActionSheetEntry,
  MobileActionSheetOption,
} from '@/renderer/components/chat/MobileActionSheet/types';
import type { AgentModeOption } from '@/renderer/utils/model/agentTypes';
import type { AgentRuntimeDerivedOption } from '@/renderer/utils/model/agentRuntimeCatalog';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { getCleanFileNames, FileService } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/styles/colors';
import { isElectronDesktop } from '@/renderer/utils/platform';
import type { AcpModelInfo } from '../types';
import { getAvailableModels } from '../utils/modelUtils';
import { Button, Dropdown, Menu, Message, Tooltip } from '@arco-design/web-react';
import { ArrowUp, Brain, FolderOpen, FolderUpload, Paperclip, Plus, Shield, UploadOne } from '@icon-park/react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../index.module.css';

type GuidActionRowProps = {
  // File handling
  files: string[];
  /** Device uploads (browser input → managed dir): sent as `upload` refs. */
  onFilesUploaded: (paths: string[]) => void;
  /** Backend-machine picker (native dialog / server-fs browse): sent as `local` refs. */
  onFilesPicked: (paths: string[]) => void;

  // Model selector node (rendered by parent for the desktop layout)
  modelSelectorNode: React.ReactNode;

  // Flat model data for the mobile action sheet (desktop uses modelSelectorNode).
  isGeminiMode: boolean;
  modelList: IProvider[];
  current_model?: TProviderWithModel;
  setCurrentModel: (model: TProviderWithModel) => Promise<void>;
  currentAcpCachedModelInfo: AcpModelInfo | null;
  selectedAcpModel: string | null;
  setSelectedAcpModel: (model: string | null) => void;

  // Thought level (mobile action sheet; only present for ACP agents)
  thoughtLevelOption?: AgentRuntimeDerivedOption | null;
  onThoughtLevelSelect?: (value: string) => void;

  // Agent mode
  modeBackend?: string;
  selectedMode: string;
  dynamicModes?: AgentModeOption[];
  onModeSelect: (mode: string) => void;

  // Send button
  loading: boolean;
  isButtonDisabled: boolean;
  speechInputNode?: React.ReactNode;
  onSend: () => void;
};

const GuidActionRow: React.FC<GuidActionRowProps> = ({
  files,
  onFilesPicked,
  onFilesUploaded,
  modelSelectorNode,
  isGeminiMode,
  modelList,
  current_model,
  setCurrentModel,
  currentAcpCachedModelInfo,
  selectedAcpModel,
  setSelectedAcpModel,
  thoughtLevelOption,
  onThoughtLevelSelect,
  modeBackend,
  selectedMode,
  dynamicModes = [],
  onModeSelect,
  loading,
  isButtonDisabled,
  speechInputNode,
  onSend,
}) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const [isPlusDropdownOpen, setIsPlusDropdownOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const handlePlusDropdownVisibleChange = useCallback((visible: boolean) => {
    setIsPlusDropdownOpen(visible);
  }, []);
  const showModeSwitch = dynamicModes.length > 0;
  const configOptionCount = (modelSelectorNode ? 1 : 0) + (showModeSwitch ? 1 : 0);

  // Browser file picker ref (WebUI only)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleLocalFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;
      setUploading(true);
      try {
        const processed = await FileService.processDroppedFiles(fileList);
        if (processed.length > 0) {
          onFilesUploaded(processed.map((f) => f.path));
        }
      } catch {
        Message.error(t('common.fileAttach.failed'));
      } finally {
        setUploading(false);
      }
      // Reset so the same file can be re-selected
      e.target.value = '';
    },
    [onFilesUploaded, t]
  );

  const getModeDisplayLabel = (mode: AgentModeOption): string =>
    t(`agentMode.${mode.value}`, { defaultValue: mode.label });

  const isWebUI = !isElectronDesktop();

  const openHostFilePicker = useCallback(() => {
    ipcBridge.dialog.showOpen
      .invoke({ properties: ['openFile', 'multiSelections'] })
      .then((pickedFiles) => {
        if (pickedFiles && pickedFiles.length > 0) onFilesPicked(pickedFiles);
      })
      .catch((error) => console.error('Failed to open file dialog:', error));
  }, [onFilesPicked]);

  // Build the mobile action sheet entries: model / thought level / permission
  // (single-select) and attach actions.
  const sheetEntries = useMemo<MobileActionSheetEntry[]>(() => {
    if (!isMobile) return [];
    const entries: MobileActionSheetEntry[] = [];

    // Model — aionrs is provider-grouped, ACP is a flat cached list.
    let modelOptions: MobileActionSheetOption[] = [];
    let currentModelLabel = '';
    let onModelSelect: (key: string) => void = () => {};
    if (isGeminiMode) {
      const enabled = modelList.filter((p) => p.enabled !== false);
      modelOptions = enabled.flatMap((provider) =>
        getAvailableModels(provider).map((modelName) => ({
          key: `${provider.id}::${modelName}`,
          label: modelName,
          description: provider.name,
          active: current_model?.id === provider.id && current_model?.use_model === modelName,
        }))
      );
      currentModelLabel = current_model?.use_model || '';
      onModelSelect = (key) => {
        const [providerId, modelName] = key.split('::');
        const provider = enabled.find((p) => p.id === providerId);
        if (provider) void setCurrentModel({ ...provider, use_model: modelName } as TProviderWithModel);
      };
    } else {
      const available = currentAcpCachedModelInfo?.available_models ?? [];
      modelOptions = available.map((model) => ({
        key: model.id,
        label: model.label || model.id,
        description: model.description,
        active: model.id === selectedAcpModel,
      }));
      currentModelLabel =
        available.find((m) => m.id === selectedAcpModel)?.label || currentAcpCachedModelInfo?.current_model_label || '';
      onModelSelect = (key) => setSelectedAcpModel(key);
    }
    if (modelOptions.length > 0) {
      entries.push({
        key: 'model',
        icon: <Brain theme='outline' size='16' />,
        label: t('common.model', { defaultValue: 'Model' }),
        meta: currentModelLabel,
        submenu: {
          title: t('common.model', { defaultValue: 'Model' }),
          options: modelOptions,
          onSelect: onModelSelect,
        },
      });
    }

    // Thought level (ACP agents only).
    if (thoughtLevelOption && thoughtLevelOption.options.length > 0 && onThoughtLevelSelect) {
      const currentValue = thoughtLevelOption.currentValue;
      entries.push({
        key: 'thought-level',
        icon: <Brain theme='outline' size='16' />,
        label: t('agent.thoughtLevel.label'),
        meta: thoughtLevelOption.options.find((o) => o.value === currentValue)?.label || currentValue || '',
        submenu: {
          title: t('agent.thoughtLevel.label'),
          options: thoughtLevelOption.options.map((o) => ({
            key: o.value,
            label: o.label,
            description: o.description ?? undefined,
            active: o.value === currentValue,
          })),
          onSelect: (value) => onThoughtLevelSelect(value),
        },
      });
    }

    // Permission / agent mode.
    if (dynamicModes.length > 0) {
      const modeOptions: MobileActionSheetOption[] = dynamicModes.map((mode) => ({
        key: mode.value,
        label: t(`agentMode.${mode.value}`, { defaultValue: mode.label }),
        description: mode.description,
        active: mode.value === selectedMode,
      }));
      entries.push({
        key: 'permission',
        icon: <Shield theme='outline' size='16' />,
        label: t('agentMode.permission', { defaultValue: 'Permission' }),
        meta: modeOptions.find((o) => o.active)?.label,
        submenu: {
          title: t('agentMode.permission', { defaultValue: 'Permission' }),
          options: modeOptions,
          onSelect: onModeSelect,
        },
      });
    }

    // Match the conversation send box: WebUI offers both the backend-machine
    // picker and an upload from the phone/current browser device.
    if (isWebUI) {
      entries.push(
        {
          key: 'attach-host-files',
          icon: <Paperclip theme='outline' size='16' />,
          label: t('common.fileAttach.addFiles', { defaultValue: 'Add files' }),
          variant: 'muted',
          dividerBefore: true,
          onClick: openHostFilePicker,
        },
        {
          key: 'attach-my-device',
          icon: <FolderOpen theme='outline' size='16' />,
          label: t('common.fileAttach.myDevice', { defaultValue: 'Upload from device' }),
          variant: 'muted',
          onClick: () => fileInputRef.current?.click(),
        }
      );
    } else {
      entries.push({
        key: 'attach',
        icon: <FolderUpload theme='outline' size='16' />,
        label: t('common.fileAttach.addFiles', { defaultValue: 'Add files' }),
        variant: 'muted',
        dividerBefore: true,
        onClick: openHostFilePicker,
      });
    }

    return entries;
  }, [
    isMobile,
    isGeminiMode,
    modelList,
    current_model,
    setCurrentModel,
    currentAcpCachedModelInfo,
    selectedAcpModel,
    setSelectedAcpModel,
    thoughtLevelOption,
    onThoughtLevelSelect,
    dynamicModes,
    selectedMode,
    onModeSelect,
    isWebUI,
    openHostFilePicker,
    t,
  ]);

  const menuContent = (
    <Menu
      className='min-w-200px'
      onClickMenuItem={(key) => {
        if (key === 'file') {
          ipcBridge.dialog.showOpen
            .invoke({ properties: ['openFile', 'multiSelections'] })
            .then((pickedFiles) => {
              if (pickedFiles && pickedFiles.length > 0) {
                onFilesPicked(pickedFiles);
              }
            })
            .catch((error) => {
              console.error('Failed to open file dialog:', error);
            });
        } else if (key === 'device') {
          fileInputRef.current?.click();
        }
      }}
    >
      {isWebUI ? (
        <>
          <Menu.Item key='file'>
            <div className='flex items-center gap-8px'>
              <UploadOne theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
              <span>{t('common.fileAttach.addFiles')}</span>
            </div>
          </Menu.Item>
          <Menu.Item key='device'>
            <div className='flex items-center gap-8px'>
              <UploadOne theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
              <span>{t('common.fileAttach.myDevice')}</span>
            </div>
          </Menu.Item>
        </>
      ) : (
        <Menu.Item key='file'>
          <div className='flex items-center gap-8px'>
            <UploadOne theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
            <span>{t('common.fileAttach.addFiles')}</span>
          </div>
        </Menu.Item>
      )}
    </Menu>
  );

  return (
    <div className={styles.actionRow}>
      <div className={styles.actionTools}>
        <div className={styles.actionEntry}>
          {isMobile ? (
            // Mobile: the "+" opens the bottom action sheet holding every control.
            <span className='flex items-center gap-4px lh-[1]'>
              <Button
                type='secondary'
                shape='circle'
                icon={<Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />}
                loading={uploading}
                disabled={uploading}
                data-testid='file-upload-btn'
                onClick={() => setIsSheetOpen(true)}
              />
              {files.length > 0 && (
                <Tooltip
                  className={'!max-w-max'}
                  content={<span className='whitespace-break-spaces'>{getCleanFileNames(files).join('\n')}</span>}
                >
                  <span className='text-t-primary'>File({files.length})</span>
                </Tooltip>
              )}
            </span>
          ) : (
            <Dropdown trigger='hover' onVisibleChange={handlePlusDropdownVisibleChange} droplist={menuContent}>
              <span className='flex items-center gap-4px cursor-pointer lh-[1]'>
                <Button
                  type='secondary'
                  shape='circle'
                  className={isPlusDropdownOpen ? styles.plusButtonRotate : ''}
                  icon={<Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />}
                  loading={uploading}
                  disabled={uploading}
                  data-testid='file-upload-btn'
                />
                {files.length > 0 && (
                  <Tooltip
                    className={'!max-w-max'}
                    content={<span className='whitespace-break-spaces'>{getCleanFileNames(files).join('\n')}</span>}
                  >
                    <span className='text-t-primary'>File({files.length})</span>
                  </Tooltip>
                )}
              </span>
            </Dropdown>
          )}
          {isWebUI && (
            <input
              ref={fileInputRef}
              type='file'
              multiple
              style={{ display: 'none' }}
              onChange={handleLocalFileChange}
            />
          )}
        </div>
      </div>
      {isMobile && (
        <MobileActionSheet
          open={isSheetOpen}
          onClose={() => setIsSheetOpen(false)}
          title={t('common.more')}
          entries={sheetEntries}
        />
      )}
      <div className={styles.actionSubmit}>
        {/* Desktop keeps the inline model/permission selectors; on mobile they move into the sheet. */}
        {!isMobile && configOptionCount > 0 && (
          <div className={styles.actionConfigGroup} data-mobile={isMobile ? 'true' : undefined}>
            {modelSelectorNode}

            {showModeSwitch && (
              <AgentModeSelector
                backend={modeBackend}
                compact
                initialMode={selectedMode}
                onModeSelect={onModeSelect}
                dynamicModes={dynamicModes}
                compactLeadingIcon={<Shield theme='outline' size='14' fill={iconColors.secondary} />}
                modeLabelFormatter={getModeDisplayLabel}
              />
            )}
          </div>
        )}

        {speechInputNode}
        <Button
          shape='circle'
          type='primary'
          loading={loading}
          disabled={isButtonDisabled}
          className='send-button-custom'
          style={{
            backgroundColor: isButtonDisabled ? undefined : '#000000',
            borderColor: isButtonDisabled ? undefined : '#000000',
          }}
          icon={<ArrowUp theme='filled' size='14' fill='white' strokeWidth={5} />}
          onClick={onSend}
          data-testid='guid-send-btn'
        />
      </div>
    </div>
  );
};

export default GuidActionRow;
