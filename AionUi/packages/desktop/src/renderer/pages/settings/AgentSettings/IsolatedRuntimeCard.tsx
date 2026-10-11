/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Health panel for the isolated agent runtime: shows the app-managed
 * claude/opencode binaries, whether the agent overrides were applied, and
 * offers the one-click knowledge-work / document plugin bootstrap.
 */

import { Button, Message, Typography } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type RuntimeBinaryStatus = { present: boolean; version?: string; note?: string };

type IsolatedRuntimeStatus = {
  paths: {
    root: string;
    claudeExe: string;
    opencodeExe: string;
    claudeConfigDir: string;
    opencodeConfigDir: string;
  };
  lastReport: {
    runtime: { claude: RuntimeBinaryStatus; opencode: RuntimeBinaryStatus };
    overrides?: {
      applied: Array<{ backend: string; command: string }>;
      skipped: Array<{ backend: string; reason: string }>;
    };
    openDesign?: string;
    error?: string;
  } | null;
};

function binaryRow(label: string, binary: RuntimeBinaryStatus | undefined, path: string | undefined) {
  return (
    <div className='flex items-center gap-8px text-12px'>
      <span className={binary?.present ? 'text-success-6' : 'text-danger-6'}>{binary?.present ? '●' : '○'}</span>
      <span className='text-t-secondary'>{label}</span>
      <span className='text-t-tertiary truncate' title={path}>
        {binary?.version ?? binary?.note ?? path ?? '—'}
      </span>
    </div>
  );
}

const IsolatedRuntimeCard: React.FC = () => {  const { t } = useTranslation();
  const [status, setStatus] = useState<IsolatedRuntimeStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [pluginLog, setPluginLog] = useState<string[] | null>(null);

  const refresh = useCallback(async () => {
    const electronAPI = typeof window === 'undefined' ? undefined : window.electronAPI;
    if (!electronAPI?.isolatedRuntimeStatus) return;
    setLoading(true);
    try {
      setStatus((await electronAPI.isolatedRuntimeStatus()) as IsolatedRuntimeStatus);
    } catch (err) {
      console.error('isolated runtime status failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const installPlugins = useCallback(async () => {
    const electronAPI = typeof window === 'undefined' ? undefined : window.electronAPI;
    if (!electronAPI?.isolatedRuntimeInstallPlugins) return;
    setInstalling(true);
    setPluginLog(null);
    try {
      const report = await electronAPI.isolatedRuntimeInstallPlugins();
      setPluginLog(report.log);
      if (report.ok) Message.success(t('settings.agentManagement.isolatedRuntime.pluginsDone'));
      else Message.error(t('settings.agentManagement.isolatedRuntime.pluginsFailed'));
    } catch (err) {
      console.error('isolated plugin install failed:', err);
      Message.error(String(err));
    } finally {
      setInstalling(false);
    }
  }, [t]);

  const report = status?.lastReport;

  return (
    <div
      data-testid='isolated-runtime-card'
      className='flex flex-col gap-8px rounded-12px border border-border-2 bg-2 p-12px md:rounded-16px md:p-14px'
    >
      <div className='flex items-center justify-between gap-12px'>
        <div className='flex flex-col gap-2px'>
          <Typography.Text className='text-13px font-medium text-t-secondary'>
            {t('settings.agentManagement.isolatedRuntime.title')}
          </Typography.Text>
          <Typography.Text className='block text-12px text-t-tertiary'>
            {t('settings.agentManagement.isolatedRuntime.description')}
          </Typography.Text>
        </div>
        <div className='flex shrink-0 items-center gap-8px'>
          <Button size='mini' loading={loading} onClick={() => void refresh()}>
            {t('settings.agentManagement.isolatedRuntime.refresh')}
          </Button>
          <Button
            size='mini'
            type='primary'
            loading={installing}
            onClick={() => void installPlugins()}
            data-testid='btn-isolated-install-plugins'
          >
            {t('settings.agentManagement.isolatedRuntime.installPlugins')}
          </Button>
        </div>
      </div>

      {binaryRow(
        t('settings.agentManagement.isolatedRuntime.claude'),
        report?.runtime.claude,
        status?.paths.claudeExe
      )}
      {binaryRow(
        t('settings.agentManagement.isolatedRuntime.opencode'),
        report?.runtime.opencode,
        status?.paths.opencodeExe
      )}
      {report?.overrides && (
        <div className='text-12px text-t-tertiary'>
          {report.overrides.applied.length > 0
            ? t('settings.agentManagement.isolatedRuntime.overridesApplied', {
                count: report.overrides.applied.length,
              })
            : report.overrides.skipped.map((s) => `${s.backend}: ${s.reason}`).join('; ') ||
              t('settings.agentManagement.isolatedRuntime.overridesPending')}
        </div>
      )}
      {report?.openDesign && <div className='text-12px text-t-tertiary truncate'>{report.openDesign}</div>}
      {report?.error && <div className='text-12px text-warning-6'>{report.error}</div>}
      {pluginLog && (
        <pre className='max-h-160px overflow-auto rounded-8px bg-3 p-8px text-11px leading-16px text-t-tertiary'>
          {pluginLog.slice(-12).join('\n')}
        </pre>
      )}
    </div>
  );
};

export default IsolatedRuntimeCard;
