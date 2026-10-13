import React from 'react';
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for SkillsHubSettings component (SK3 in N4a).
 * The page manages only the user's imported skills ("我的技能"): the builtin
 * corpus reaches agents through the fixed per-mode presets and is never
 * listed here, and the import-history secondary view is gone.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listAvailableSkills: vi.fn(),
  getSkillPaths: vi.fn(),
  getSkillImportLimits: vi.fn(),
  importSkills: vi.fn(),
  deleteSkill: vi.fn(),
  showOpen: vi.fn(),
  messageError: vi.fn(),
  messageSuccess: vi.fn(),
  messageWarning: vi.fn(),
  modalConfirm: vi.fn(),
}));

const searchParamsMock = vi.hoisted(() => ({
  current: new URLSearchParams(),
  setSearchParams: vi.fn(),
  pathname: '/skills',
  navigate: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listAvailableSkills: { invoke: mocks.listAvailableSkills },
      getSkillPaths: { invoke: mocks.getSkillPaths },
      getSkillImportLimits: { invoke: mocks.getSkillImportLimits },
      importSkills: { invoke: mocks.importSkills },
      deleteSkill: { invoke: mocks.deleteSkill },
    },
    dialog: {
      showOpen: { invoke: mocks.showOpen },
    },
  },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      error: mocks.messageError,
      success: mocks.messageSuccess,
      warning: mocks.messageWarning,
    },
    Modal: {
      ...actual.Modal,
      confirm: mocks.modalConfirm,
    },
  };
});

vi.mock('react-router-dom', () => ({
  useNavigate: () => searchParamsMock.navigate,
  useSearchParams: () => [searchParamsMock.current, searchParamsMock.setSearchParams],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'settings.skillsHub.importError': 'Error importing skill',
        'settings.skillsHub.importPartialSuccess':
          'Imported {{successCount}} skill(s), {{failureCount}} failed: {{failures}}',
        'settings.skillsHub.importErrors.SKILL_IMPORT_FILE_TOO_LARGE':
          'A file in this skill is over the size limit. Remove the large file and try again.',
      };
      const template = translations[k] ?? (typeof options?.defaultValue === 'string' ? options.defaultValue : k);
      return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(options?.[key] ?? ''));
    },
    i18n: { language: 'en' },
  }),
}));

import SkillsHubSettings from '@/renderer/pages/settings/SkillsSettings/SkillsHubSettings';

describe('SkillsHubSettings', () => {
  // The import action is a plain button that runs the manual import directly.
  const triggerManualImport = async () => {
    fireEvent.click(await screen.findByTestId('btn-add-skill'));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsMock.current = new URLSearchParams();
    mocks.listAvailableSkills.mockResolvedValue([]);
    mocks.getSkillPaths.mockResolvedValue({
      user_skills_dir: '/tmp/user-skills',
      builtin_skills_dir: '/tmp/builtin-skills',
    });
    mocks.getSkillImportLimits.mockResolvedValue({
      max_file_bytes: 12 * 1024 * 1024,
      max_total_bytes: 64 * 1024 * 1024,
    });
  });

  it('exports a component (smoke)', () => {
    expect(SkillsHubSettings).toBeDefined();
    expect(typeof SkillsHubSettings).toBe('function');
  });

  it('has display name or name property (structure check)', () => {
    expect(SkillsHubSettings.displayName || SkillsHubSettings.name).toBeTruthy();
  });

  it('can be instantiated as JSX element (shallow)', () => {
    const element = <SkillsHubSettings />;
    expect(element.type).toBe(SkillsHubSettings);
  });

  it('shows backend import failure detail for manual imports', async () => {
    mocks.showOpen.mockResolvedValue(['/tmp/huge-skill']);
    mocks.importSkills.mockRejectedValue(
      Object.assign(new Error('wrapped import failure'), {
        name: 'BackendHttpError',
        status: 400,
        code: 'SKILL_IMPORT_FILE_TOO_LARGE',
      })
    );

    render(<SkillsHubSettings withWrapper={false} />);

    await waitFor(() => expect(mocks.listAvailableSkills).toHaveBeenCalled());
    await triggerManualImport();

    await waitFor(() =>
      expect(mocks.messageError).toHaveBeenCalledWith(
        'A file in this skill is over the size limit. Remove the large file and try again.'
      )
    );
  });

  it('shows partial import warning and refreshes after batch import partial success', async () => {
    mocks.showOpen.mockResolvedValue(['/tmp/parent-pack']);
    mocks.importSkills.mockResolvedValue({
      skill_name: 'sample-alpha',
      skill_names: ['sample-alpha'],
      failed: [{ source_name: 'beta-skill', code: 'SKILL_IMPORT_FILE_TOO_LARGE' }],
    });

    render(<SkillsHubSettings withWrapper={false} />);

    await waitFor(() => expect(mocks.listAvailableSkills).toHaveBeenCalled());
    const initialFetchCount = mocks.listAvailableSkills.mock.calls.length;
    await triggerManualImport();

    await waitFor(() =>
      expect(mocks.messageWarning).toHaveBeenCalledWith(
        'Imported 1 skill(s), 1 failed: beta-skill: A file in this skill is over the size limit. Remove the large file and try again.'
      )
    );
    await waitFor(() => expect(mocks.listAvailableSkills.mock.calls.length).toBeGreaterThan(initialFetchCount));
  });

  it('does not render an available status tag for imported skills', async () => {
    mocks.listAvailableSkills.mockResolvedValue([
      {
        name: 'sample-single',
        description: 'Single folder import fixture.',
        location: '/tmp/user-skills/sample-single',
        is_custom: true,
        source: 'custom',
      },
    ]);

    render(<SkillsHubSettings withWrapper={false} />);

    const card = await screen.findByTestId('my-skill-card-sample-single');
    // Per-card source badges were removed (the tab/section already conveys origin);
    // the card shows only the name + description, no "Custom" / "Available" tag.
    expect(card.textContent).not.toContain('Custom');
    expect(screen.queryByText('Available')).not.toBeInTheDocument();
  });

  it('lists only the user skills and never the official/auto-injected corpus', async () => {
    mocks.listAvailableSkills.mockResolvedValue([
      {
        name: 'cron',
        description: 'Auto injected cron skill.',
        location: '/tmp/builtin-skills/auto-inject/cron/SKILL.md',
        is_auto_inject: true,
        is_custom: false,
        source: 'builtin',
      },
      {
        name: 'officecli',
        description: 'Official builtin skill.',
        location: '/tmp/builtin-skills/officecli/SKILL.md',
        is_auto_inject: false,
        is_custom: false,
        source: 'builtin',
      },
      {
        name: 'sample-single',
        description: 'Single folder import fixture.',
        location: '/tmp/user-skills/sample-single',
        is_custom: true,
        source: 'custom',
      },
      {
        name: 'job-generated',
        description: 'Generated for a scheduled task.',
        location: '/tmp/cron/skills/job-generated',
        is_custom: false,
        source: 'cron',
      },
    ]);

    render(<SkillsHubSettings withWrapper={false} />);

    await waitFor(() => expect(screen.getByTestId('my-skill-card-sample-single')).toBeInTheDocument());
    expect(screen.queryByText('officecli')).not.toBeInTheDocument();
    expect(screen.queryByText('cron')).not.toBeInTheDocument();
    expect(screen.queryByText('job-generated')).not.toBeInTheDocument();
    // No Official tab and no import-history entry point.
    expect(screen.queryByTestId('settings-tab-official')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn-open-import-history')).not.toBeInTheDocument();
  });

  it('navigates to the skill detail page without tab state', async () => {
    mocks.listAvailableSkills.mockResolvedValue([
      {
        name: 'sample-single',
        description: 'Single folder import fixture.',
        location: '/tmp/user-skills/sample-single',
        is_custom: true,
        source: 'custom',
      },
    ]);

    render(<SkillsHubSettings withWrapper={false} />);

    const card = await screen.findByTestId('my-skill-card-sample-single');
    fireEvent.click(card);
    expect(searchParamsMock.navigate).toHaveBeenCalledWith('/skills/detail/sample-single');
  });

  it('does not expose the local skills directory path on the skills page', async () => {
    render(<SkillsHubSettings withWrapper={false} />);

    await waitFor(() => expect(mocks.listAvailableSkills).toHaveBeenCalled());
    expect(screen.queryByText('/tmp/user-skills')).not.toBeInTheDocument();
  });

  it('surfaces server-provided size limits in the page description', async () => {
    render(<SkillsHubSettings withWrapper={false} />);

    await waitFor(() => expect(mocks.getSkillImportLimits).toHaveBeenCalled());
    expect(screen.getByText(/12 MB per file and 64 MB per skill/)).toBeInTheDocument();
  });

  describe('batch delete (Custom tab)', () => {
    const customSkills = [
      {
        name: 'skill-alpha',
        description: 'First custom skill.',
        location: '/tmp/user-skills/skill-alpha',
        is_auto_inject: false,
        is_custom: true,
        source: 'custom',
      },
      {
        name: 'skill-beta',
        description: 'Second custom skill.',
        location: '/tmp/user-skills/skill-beta',
        is_auto_inject: false,
        is_custom: true,
        source: 'custom',
      },
      {
        name: 'skill-gamma',
        description: 'Third custom skill.',
        location: '/tmp/user-skills/skill-gamma',
        is_auto_inject: false,
        is_custom: true,
        source: 'custom',
      },
    ];

    const confirmBatchDelete = async () => {
      // Modal.confirm is mocked; invoke the onOk callback the component passed in.
      await waitFor(() => expect(mocks.modalConfirm).toHaveBeenCalled());
      const config = mocks.modalConfirm.mock.calls.at(-1)?.[0] as { onOk?: () => Promise<void> };
      await config.onOk?.();
    };

    beforeEach(() => {
      mocks.listAvailableSkills.mockResolvedValue(customSkills);
      mocks.deleteSkill.mockResolvedValue(undefined);
    });

    it('hides batch manage entry when there are no custom skills', async () => {
      mocks.listAvailableSkills.mockResolvedValue([]);
      render(<SkillsHubSettings withWrapper={false} />);

      await waitFor(() => expect(mocks.listAvailableSkills).toHaveBeenCalled());
      expect(screen.queryByTestId('btn-batch-manage')).not.toBeInTheDocument();
    });

    it('enters batch mode: shows checkboxes, hides per-card delete buttons', async () => {
      render(<SkillsHubSettings withWrapper={false} />);

      await screen.findByTestId('my-skill-card-skill-alpha');
      expect(screen.getByTestId('btn-delete-skill-alpha')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('btn-batch-manage'));

      expect(screen.getByTestId('checkbox-skill-skill-alpha')).toBeInTheDocument();
      expect(screen.getByTestId('checkbox-skill-skill-beta')).toBeInTheDocument();
      expect(screen.queryByTestId('btn-delete-skill-alpha')).not.toBeInTheDocument();
      expect(screen.getByTestId('btn-batch-delete')).toBeDisabled();
    });

    it('selects skills and deletes them after confirmation', async () => {
      render(<SkillsHubSettings withWrapper={false} />);

      await screen.findByTestId('my-skill-card-skill-alpha');
      fireEvent.click(screen.getByTestId('btn-batch-manage'));

      fireEvent.click(screen.getByTestId('my-skill-card-skill-alpha'));
      fireEvent.click(screen.getByTestId('my-skill-card-skill-beta'));
      expect(screen.getByText('2 selected')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('btn-batch-delete'));
      await confirmBatchDelete();

      await waitFor(() => expect(mocks.deleteSkill).toHaveBeenCalledTimes(2));
      expect(mocks.deleteSkill).toHaveBeenCalledWith({ skill_name: 'skill-alpha' });
      expect(mocks.deleteSkill).toHaveBeenCalledWith({ skill_name: 'skill-beta' });
      await waitFor(() => expect(mocks.messageSuccess).toHaveBeenCalledWith('Deleted 2 skill(s)'));
      // Batch mode exits after deletion.
      await waitFor(() => expect(screen.queryByTestId('btn-batch-delete')).not.toBeInTheDocument());
    });

    it('select all toggles every visible skill', async () => {
      render(<SkillsHubSettings withWrapper={false} />);

      await screen.findByTestId('my-skill-card-skill-alpha');
      fireEvent.click(screen.getByTestId('btn-batch-manage'));

      const selectAll = screen.getByTestId('checkbox-select-all-skills');
      fireEvent.click(selectAll.querySelector('input') ?? selectAll);
      expect(screen.getByText('3 selected')).toBeInTheDocument();

      fireEvent.click(selectAll.querySelector('input') ?? selectAll);
      expect(screen.getByText('0 selected')).toBeInTheDocument();
    });

    it('shows partial warning when some deletions fail', async () => {
      mocks.deleteSkill.mockImplementation(({ skill_name }: { skill_name: string }) =>
        skill_name === 'skill-beta' ? Promise.reject(new Error('boom')) : Promise.resolve(undefined)
      );

      render(<SkillsHubSettings withWrapper={false} />);

      await screen.findByTestId('my-skill-card-skill-alpha');
      fireEvent.click(screen.getByTestId('btn-batch-manage'));
      fireEvent.click(screen.getByTestId('my-skill-card-skill-alpha'));
      fireEvent.click(screen.getByTestId('my-skill-card-skill-beta'));
      fireEvent.click(screen.getByTestId('btn-batch-delete'));
      await confirmBatchDelete();

      await waitFor(() => expect(mocks.messageWarning).toHaveBeenCalledWith('Deleted 1 skill(s), 1 failed'));
    });

    it('cancel exits batch mode and clears selection', async () => {
      render(<SkillsHubSettings withWrapper={false} />);

      await screen.findByTestId('my-skill-card-skill-alpha');
      fireEvent.click(screen.getByTestId('btn-batch-manage'));
      fireEvent.click(screen.getByTestId('my-skill-card-skill-alpha'));
      fireEvent.click(screen.getByTestId('btn-batch-cancel'));

      expect(screen.queryByTestId('checkbox-skill-skill-alpha')).not.toBeInTheDocument();
      expect(screen.getByTestId('btn-delete-skill-alpha')).toBeInTheDocument();
      expect(mocks.deleteSkill).not.toHaveBeenCalled();

      // Re-entering batch mode starts with a clean selection.
      fireEvent.click(screen.getByTestId('btn-batch-manage'));
      expect(screen.getByText('0 selected')).toBeInTheDocument();
    });
  });
});
