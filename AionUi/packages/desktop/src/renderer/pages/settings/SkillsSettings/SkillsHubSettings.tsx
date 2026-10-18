import { ipcBridge } from '@/common';
import { AGENT_SCOPE_LABEL_KEYS, type AgentScopeBackend } from '@/common/utils/agentScopes';
import { assistantRuntimeKey, type Assistant } from '@/common/types/agent/assistantTypes';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { Button, Checkbox, Message, Modal } from '@arco-design/web-react';
import { Delete } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useSWR from 'swr';
import AgentSkillPane from './AgentSkillPane';
import SkillScopeCapsule, { type SkillScopeSegment } from './SkillScopeCapsule';
import SkillUsedByStack, { getAssistantsUsingSkill } from './SkillUsedByStack';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import SettingsPageHeader from '../components/SettingsPageHeader';
import { AionSearchInput } from '@/renderer/components/base';
import { buildSkillImportNotice, getSkillImportErrorMessage } from './skillImportMessages';
import { normalizeSkillTestId } from './skillTestIds';

// Skill 信息类型 / Skill info type
interface SkillInfo {
  name: string;
  description: string;
  location: string;
  /**
   * Relative location under the builtin-skills corpus (e.g.
   * `auto-inject/cron/SKILL.md`). Present only for built-in sources; the
   * export-to-external-source flow still uses absolute `location` paths.
   */
  relative_location?: string;
  is_auto_inject: boolean;
  is_custom: boolean;
  source?: 'builtin' | 'custom' | 'cron' | 'extension';
}

interface SkillImportLimits {
  max_file_bytes: number;
  max_total_bytes: number;
}

/**
 * The three fixed Zeus agents, in capsule order. Each one is the generated
 * assistant bound to that engine (`source: 'generated'`), the same identity
 * the home page's workspace pills resolve — see `AGENT_SCOPE_LABEL_KEYS` for
 * the shared backend -> label mapping.
 */
const AGENT_SCOPE_ORDER: AgentScopeBackend[] = ['opencode', 'aionrs', 'claude'];

/** Capsule key of the user's imported skills, which are not tied to an engine. */
const CUSTOM_SCOPE_KEY = 'custom';

const getAvatarColorClass = (name: string) => {
  if (!name) return 'bg-[#165DFF] text-white';
  const colors = [
    'bg-[#165DFF] text-white', // Blue
    'bg-[#00B42A] text-white', // Green
    'bg-[#722ED1] text-white', // Purple
    'bg-[#F5319D] text-white', // Pink
    'bg-[#F77234] text-white', // Orange
    'bg-[#14C9C9] text-white', // Cyan
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const formatBytes = (bytes?: number): string | null => {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
};

/**
 * Resolve the three engine-bound agents from the live catalog, in capsule
 * order. Engines whose agent row is missing (not installed, not detected) are
 * simply absent — their capsule segment is not rendered.
 */
export const resolveAgentScopes = (
  assistants: Assistant[]
): Array<{ backend: AgentScopeBackend; assistant: Assistant }> =>
  AGENT_SCOPE_ORDER.flatMap((backend) => {
    const assistant = assistants.find(
      (candidate) => candidate.source === 'generated' && assistantRuntimeKey(candidate) === backend
    );
    return assistant ? [{ backend, assistant }] : [];
  });

interface SkillsHubSettingsProps {
  /** When false, renders without SettingsPageWrapper — useful for embedding in a tab */
  withWrapper?: boolean;
}

const SkillsHubSettings: React.FC<SkillsHubSettingsProps> = ({ withWrapper = true }) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightName = searchParams.get('highlight');
  const [highlightedSkill, setHighlightedSkill] = useState<string | null>(null);
  const skillRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [loading, setLoading] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>([]);
  const [search_query, setSearchQuery] = useState('');
  const [importLimits, setImportLimits] = useState<SkillImportLimits | null>(null);
  // Batch management: multi-select skills for bulk deletion.
  const [batchMode, setBatchMode] = useState(false);
  const [selectedSkillNames, setSelectedSkillNames] = useState<Set<string>>(new Set());
  // Which capsule segment is showing. Empty means "no explicit choice yet",
  // which resolves to the first segment — the first detected engine agent, or
  // the imported skills when no engine agent exists.
  const [scope, setScope] = useState('');
  // Skill of the agent toggle currently in flight.
  const [pendingSkill, setPendingSkill] = useState<string | null>(null);
  // Assistant catalog drives both the capsule and the "used by" avatar stacks.
  const { data: assistantCatalog, mutate: mutateAssistants } = useSWR<Assistant[]>('assistants.list', () =>
    ipcBridge.assistants.list.invoke()
  );

  const openSkillDetail = useCallback(
    (skillName: string) => {
      void navigate(`/skills/detail/${encodeURIComponent(skillName)}`);
    },
    [navigate]
  );

  // Only user-imported skills are managed in the Custom segment; the builtin
  // corpus reaches agents through the fixed per-mode presets instead.
  const mySkills = useMemo(() => availableSkills.filter((s) => s.source === 'custom'), [availableSkills]);

  // Skill name -> description for every catalog entry an agent can carry.
  const skillDescriptions = useMemo(() => {
    const map: Record<string, string> = {};
    for (const skill of availableSkills) map[skill.name] = skill.description;
    return map;
  }, [availableSkills]);

  const agentScopes = useMemo(() => resolveAgentScopes(assistantCatalog ?? []), [assistantCatalog]);

  const segments = useMemo<SkillScopeSegment[]>(() => {
    const agentSegments = agentScopes.map(({ backend }) => ({
      key: backend,
      label: t(AGENT_SCOPE_LABEL_KEYS[backend], { defaultValue: backend }),
    }));
    return [
      ...agentSegments,
      { key: CUSTOM_SCOPE_KEY, label: t('settings.skillsHub.tabCustom', { defaultValue: 'My Skills' }) },
    ];
  }, [agentScopes, t]);

  const activeScope = segments.some((segment) => segment.key === scope)
    ? scope
    : (segments[0]?.key ?? CUSTOM_SCOPE_KEY);
  const activeAgent = agentScopes.find(({ backend }) => backend === activeScope)?.assistant;

  const matchesQuery = useCallback(
    (list: SkillInfo[]) => {
      if (!search_query.trim()) return list;
      const lowerQuery = search_query.toLowerCase();
      return list.filter(
        (s) =>
          s.name.toLowerCase().includes(lowerQuery) ||
          (s.description && s.description.toLowerCase().includes(lowerQuery))
      );
    },
    [search_query]
  );

  const filteredSkills = useMemo(() => matchesQuery(mySkills), [matchesQuery, mySkills]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const skills = await ipcBridge.fs.listAvailableSkills.invoke();
      setAvailableSkills(skills);

      const limits = await ipcBridge.fs.getSkillImportLimits.invoke();
      setImportLimits(limits);
    } catch (error) {
      console.error('Failed to fetch skills:', error);
      Message.error(t('settings.skillsHub.fetchError', { defaultValue: 'Failed to fetch skills' }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Scroll to and highlight a skill when navigated with ?highlight=skillName.
  // Only imported skills carry a ref (the detail page links back here), so the
  // Custom segment is selected first and the scroll retried on the next pass.
  useEffect(() => {
    if (!highlightName || loading) return;
    if (mySkills.some((skill) => skill.name === highlightName) && activeScope !== CUSTOM_SCOPE_KEY) {
      setScope(CUSTOM_SCOPE_KEY);
      return;
    }
    const el = skillRefs.current[highlightName];
    if (el) {
      // Small delay to ensure layout is settled
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedSkill(highlightName);
        // Clear highlight after animation
        const timer = setTimeout(() => setHighlightedSkill(null), 2000);
        // Clean up the search param so refreshing won't re-highlight
        setSearchParams({}, { replace: true });
        return () => clearTimeout(timer);
      });
    }
  }, [highlightName, loading, mySkills, activeScope, setSearchParams]);

  const handleImport = async (skillPath: string) => {
    try {
      const result = await ipcBridge.fs.importSkills.invoke({ skill_path: skillPath });
      const notice = buildSkillImportNotice(result, t);
      if (notice.type === 'error') {
        Message.error(notice.message);
      } else if (notice.type === 'warning') {
        Message.warning(notice.message);
      } else {
        Message.success(notice.message);
      }
      if (notice.importedNames.length > 0) {
        setSearchQuery('');
        setScope(CUSTOM_SCOPE_KEY);
        void fetchData();
      } else if (notice.type !== 'success') {
        void fetchData();
      }
    } catch (error) {
      console.error('Failed to import skill:', error);
      Message.error(getSkillImportErrorMessage(error, t));
    }
  };

  /**
   * Drop deleted skill names from every assistant still listing them.
   *
   * Deleting takes the skill off disk; an assistant whose `enabled_skills`
   * still holds the name would keep a row the catalog can no longer describe.
   * Built-in assistants reject skill edits on the backend, so they are
   * skipped. Best-effort — the skill is gone either way, and a stale name only
   * costs a nameless row until the next delete.
   */
  const detachDeletedSkills = useCallback(
    async (deletedNames: string[]) => {
      const deleted = new Set(deletedNames);
      const affected = (assistantCatalog ?? []).filter(
        (assistant) =>
          assistant.source !== 'builtin' &&
          [
            ...(assistant.enabled_skills ?? []),
            ...(assistant.custom_skill_names ?? []),
            ...(assistant.disabled_builtin_skills ?? []),
          ].some((name) => deleted.has(name))
      );
      if (affected.length === 0) return;

      await Promise.allSettled(
        affected.map((assistant) =>
          ipcBridge.assistants.update.invoke({
            id: assistant.id,
            enabled_skills: (assistant.enabled_skills ?? []).filter((name) => !deleted.has(name)),
            custom_skill_names: (assistant.custom_skill_names ?? []).filter((name) => !deleted.has(name)),
            disabled_builtin_skills: (assistant.disabled_builtin_skills ?? []).filter((name) => !deleted.has(name)),
          })
        )
      );
      await mutateAssistants();
    },
    [assistantCatalog, mutateAssistants]
  );

  const handleDelete = async (skillName: string) => {
    try {
      await ipcBridge.fs.deleteSkill.invoke({ skill_name: skillName });
      Message.success(t('settings.skillsHub.deleteSuccess', { defaultValue: 'Skill deleted' }));
      void fetchData();
      void detachDeletedSkills([skillName]);
    } catch (error) {
      console.error('Failed to delete skill:', error);
      Message.error(t('settings.skillsHub.deleteError', { defaultValue: 'Error deleting skill' }));
    }
  };

  const exitBatchMode = useCallback(() => {
    setBatchMode(false);
    setSelectedSkillNames(new Set());
  }, []);

  const toggleSkillSelected = useCallback((skillName: string) => {
    setSelectedSkillNames((prev) => {
      const next = new Set(prev);
      if (next.has(skillName)) {
        next.delete(skillName);
      } else {
        next.add(skillName);
      }
      return next;
    });
  }, []);

  const handleBatchDelete = useCallback(() => {
    if (selectedSkillNames.size === 0) return;
    Modal.confirm({
      title: t('settings.skillsHub.batchDeleteConfirmTitle', { defaultValue: 'Delete Skills' }),
      content: (
        <div>
          <div>
            {t('settings.skillsHub.batchDeleteConfirmContent', {
              count: selectedSkillNames.size,
              defaultValue: `Are you sure you want to delete the ${selectedSkillNames.size} selected skill(s)?`,
            })}
          </div>
          <div className='text-12px text-t-tertiary mt-8px'>
            {t('settings.skillsHub.deleteAffectsNewOnlyHint', {
              defaultValue:
                'Deleting only affects new conversations. Skills already selected in existing conversations keep working.',
            })}
          </div>
        </div>
      ),
      okButtonProps: { status: 'warning' },
      okText: t('common.delete', { defaultValue: 'Delete' }),
      wrapClassName: 'modal-delete-skill',
      onOk: async () => {
        const names = Array.from(selectedSkillNames);
        const results = await Promise.allSettled(
          names.map((name) => ipcBridge.fs.deleteSkill.invoke({ skill_name: name }))
        );
        const successCount = results.filter((r) => r.status === 'fulfilled').length;
        const failedCount = results.length - successCount;
        const deletedNames = names.filter((_, index) => results[index].status === 'fulfilled');
        if (failedCount === 0) {
          Message.success(
            t('settings.skillsHub.batchDeleteSuccess', {
              count: successCount,
              defaultValue: `Deleted ${successCount} skill(s)`,
            })
          );
        } else if (successCount > 0) {
          Message.warning(
            t('settings.skillsHub.batchDeletePartial', {
              successCount,
              failedCount,
              defaultValue: `Deleted ${successCount} skill(s), ${failedCount} failed`,
            })
          );
        } else {
          Message.error(t('settings.skillsHub.deleteError', { defaultValue: 'Error deleting skill' }));
        }
        exitBatchMode();
        void fetchData();
        void detachDeletedSkills(deletedNames);
      },
    });
  }, [selectedSkillNames, exitBatchMode, fetchData, detachDeletedSkills, t]);

  const handleManualImport = async () => {
    try {
      const result = await ipcBridge.dialog.showOpen.invoke({
        properties: ['openFile', 'openDirectory'],
        filters: [{ name: 'Skill folders or zip archives', extensions: ['zip'] }],
      });
      if (result && result.length > 0) {
        await handleImport(result[0]);
      }
    } catch (error) {
      console.error('Failed to open directory dialog:', error);
    }
  };

  /**
   * Cancel/restore one skill on one agent.
   *
   * `enabled_skills` is the only field a new conversation reads
   * (`resolve_assistant_snapshot` -> `default_skill_ids`), so cancelling means
   * removing the name there; `disabled_builtin_skills` keeps the name so the
   * row can offer "restore" instead of vanishing.
   */
  const handleToggleAgentSkill = useCallback(
    async (assistant: Assistant, skillName: string, enabled: boolean) => {
      const currentEnabled = assistant.enabled_skills ?? [];
      const currentDisabled = assistant.disabled_builtin_skills ?? [];
      const nextEnabled = enabled
        ? [...currentEnabled, skillName]
        : currentEnabled.filter((name) => name !== skillName);
      const nextDisabled = enabled
        ? currentDisabled.filter((name) => name !== skillName)
        : [...currentDisabled, skillName];

      setPendingSkill(skillName);
      try {
        await ipcBridge.assistants.update.invoke({
          id: assistant.id,
          enabled_skills: Array.from(new Set(nextEnabled)),
          disabled_builtin_skills: Array.from(new Set(nextDisabled)),
        });
        await mutateAssistants();
      } catch (error) {
        console.error('Failed to update assistant skills:', error);
        Message.error(t('settings.skillsHub.skillToggleError', { defaultValue: 'Failed to update the skill' }));
      } finally {
        setPendingSkill(null);
      }
    },
    [mutateAssistants, t]
  );

  // Batch selection helpers scoped to the visible (filtered) custom skills.
  const allVisibleSelected = filteredSkills.length > 0 && filteredSkills.every((s) => selectedSkillNames.has(s.name));
  const toggleSelectAllVisible = () => {
    setSelectedSkillNames((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredSkills.forEach((s) => next.delete(s.name));
      } else {
        filteredSkills.forEach((s) => next.add(s.name));
      }
      return next;
    });
  };

  // ======== My skills ========
  const customPane = (
    <div data-testid='my-skills-section' className='flex flex-col gap-12px'>
      <div className='flex items-start justify-between gap-12px'>
        <p className='m-0 flex-1 min-w-0 text-12px leading-relaxed text-t-tertiary'>
          {t('settings.skillsHub.customHint', {
            maxFileSize:
              formatBytes(importLimits?.max_file_bytes) ??
              t('settings.skillsHub.importHelpConfiguredLimit', { defaultValue: 'configured limit' }),
            maxTotalSize:
              formatBytes(importLimits?.max_total_bytes) ??
              t('settings.skillsHub.importHelpConfiguredLimit', { defaultValue: 'configured limit' }),
            defaultValue:
              'Import a skill folder, parent folder, or zip; up to {{maxFileSize}} per file and {{maxTotalSize}} per skill; importing the same name overwrites the existing skill.',
          })}
        </p>
        {mySkills.length > 0 && (
          <div className='flex shrink-0 items-center gap-8px'>
            {batchMode ? (
              <>
                <Button
                  size='mini'
                  type='text'
                  className='!h-24px !px-8px !text-12px'
                  data-testid='btn-batch-cancel'
                  onClick={exitBatchMode}
                >
                  {t('common.cancel', { defaultValue: 'Cancel' })}
                </Button>
                <Button
                  size='mini'
                  status='warning'
                  className='!h-24px !px-8px !text-12px'
                  data-testid='btn-batch-delete'
                  disabled={selectedSkillNames.size === 0}
                  onClick={handleBatchDelete}
                >
                  {t('settings.skillsHub.batchDeleteAction', {
                    count: selectedSkillNames.size,
                    defaultValue: `Delete (${selectedSkillNames.size})`,
                  })}
                </Button>
              </>
            ) : (
              <Button
                size='mini'
                type='text'
                className='!h-24px !px-8px !text-12px !text-t-secondary hover:!text-t-primary'
                data-testid='btn-batch-manage'
                onClick={() => setBatchMode(true)}
              >
                {t('settings.skillsHub.batchManage', { defaultValue: 'Batch manage' })}
              </Button>
            )}
          </div>
        )}
      </div>
      {batchMode && mySkills.length > 0 && (
        <div className='flex items-center justify-between gap-12px text-12px text-t-secondary'>
          <Checkbox
            data-testid='checkbox-select-all-skills'
            checked={allVisibleSelected}
            onChange={toggleSelectAllVisible}
          >
            <span className='text-12px text-t-secondary'>
              {t('conversation.history.selectAll', { defaultValue: 'Select All' })}
            </span>
          </Checkbox>
          <span>
            {t('settings.skillsHub.batchSelectedCount', {
              count: selectedSkillNames.size,
              defaultValue: `${selectedSkillNames.size} selected`,
            })}
          </span>
        </div>
      )}
      {mySkills.length > 0 ? (
        <div className='flex flex-col gap-8px rounded-12px border border-border-2 bg-2 p-8px md:rounded-16px md:p-10px'>
          {filteredSkills.length === 0 && (
            <div className='text-center text-t-secondary text-13px py-32px bg-fill-1 rd-12px border border-border-2 border-dashed'>
              {t('settings.skillsHub.noSearchResults', { defaultValue: 'No matching skills.' })}
            </div>
          )}
          {filteredSkills.map((skill) => (
            <div
              key={skill.name}
              data-testid={`my-skill-card-${normalizeSkillTestId(skill.name)}`}
              ref={(el) => {
                skillRefs.current[skill.name] = el;
              }}
              onClick={batchMode ? () => toggleSkillSelected(skill.name) : () => openSkillDetail(skill.name)}
              className={`group flex flex-col sm:flex-row gap-16px p-14px border rd-12px transition-all duration-200 cursor-pointer ${highlightedSkill === skill.name ? 'border-primary-5 bg-primary-1' : selectedSkillNames.has(skill.name) && batchMode ? 'border-transparent bg-[rgba(var(--primary-6),0.06)]' : 'border-transparent bg-base hover:border-border-2'}`}
            >
              {batchMode && (
                <div className='shrink-0 flex items-center sm:self-center'>
                  <Checkbox
                    data-testid={`checkbox-skill-${normalizeSkillTestId(skill.name)}`}
                    checked={selectedSkillNames.has(skill.name)}
                    onChange={() => toggleSkillSelected(skill.name)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
              <div className='shrink-0 flex items-start sm:mt-2px'>
                <div
                  className={`w-40px h-40px rd-10px flex items-center justify-center font-bold text-16px shadow-sm text-transform-uppercase ${getAvatarColorClass(skill.name)}`}
                >
                  {skill.name.charAt(0).toUpperCase()}
                </div>
              </div>

              <div className='flex-1 min-w-0 flex flex-col justify-center gap-4px'>
                <h3 className='text-14px font-semibold text-t-primary/90 truncate m-0'>{skill.name}</h3>
                {skill.description && (
                  <p className='text-13px text-t-secondary leading-relaxed line-clamp-2 m-0' title={skill.description}>
                    {skill.description}
                  </p>
                )}
              </div>

              {!batchMode && (
                <div className='shrink-0 sm:self-center flex items-center justify-end gap-10px mt-12px sm:mt-0 ps-4px'>
                  <SkillUsedByStack assistants={getAssistantsUsingSkill(skill.name, assistantCatalog ?? [])} />
                  <button
                    data-testid={`btn-delete-${normalizeSkillTestId(skill.name)}`}
                    className='p-8px hover:bg-danger-1 hover:text-danger-6 text-t-tertiary rd-6px outline-none flex items-center justify-center border border-transparent cursor-pointer transition-colors shadow-sm bg-base sm:bg-transparent sm:shadow-none opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity'
                    onClick={(e) => {
                      e.stopPropagation();
                      Modal.confirm({
                        title: t('settings.skillsHub.deleteConfirmTitle', { defaultValue: 'Delete Skill' }),
                        content: (
                          <div>
                            <div>
                              {t('settings.skillsHub.deleteConfirmContent', {
                                name: skill.name,
                                defaultValue: `Are you sure you want to delete "${skill.name}"?`,
                              })}
                            </div>
                            <div className='text-12px text-t-tertiary mt-8px'>
                              {t('settings.skillsHub.deleteAffectsNewOnlyHint', {
                                defaultValue:
                                  'Deleting only affects new conversations. Skills already selected in existing conversations keep working.',
                              })}
                            </div>
                          </div>
                        ),
                        okButtonProps: { status: 'danger' },
                        okText: t('common.delete', { defaultValue: 'Delete' }),
                        onOk: () => void handleDelete(skill.name),
                        wrapClassName: 'modal-delete-skill',
                      });
                    }}
                    title={t('common.delete', { defaultValue: 'Delete' })}
                  >
                    <Delete size={16} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className='text-center text-t-secondary text-13px py-40px bg-fill-1 rd-12px border border-border-2 border-dashed'>
          {loading
            ? t('common.loading', { defaultValue: 'Please wait...' })
            : t('settings.skillsHub.noSkills', {
                defaultValue: 'No skills found. Import some to get started.',
              })}
        </div>
      )}
    </div>
  );

  const enabledSkillCount = activeAgent ? new Set(activeAgent.enabled_skills ?? []).size : mySkills.length;
  const importedSkillNames = useMemo(
    () => new Set(activeAgent?.custom_skill_names ?? []),
    [activeAgent?.custom_skill_names]
  );

  const mainContent = (
    <div className='flex flex-col gap-16px'>
      <SettingsPageHeader
        data-testid='skills-header'
        centered
        title={
          <span className='inline-flex items-center justify-center gap-8px'>
            <span>{t('settings.skillsHub.tabCustom', { defaultValue: 'My Skills' })}</span>
            <span className='inline-flex h-20px min-w-20px items-center justify-center rounded-999px bg-fill-2 px-8px text-12px font-500 leading-none text-t-secondary'>
              {enabledSkillCount}
            </span>
          </span>
        }
        description={t('settings.skillsHub.description', {
          defaultValue: 'Centrally manage AI skill packs — install once, use across all assistants.',
        })}
        actions={
          <>
            {/* Mobile: the actions row is too crowded — drop the search box entirely. */}
            {!isMobile && (
              <AionSearchInput
                className='shrink-0 w-[200px] hidden md:flex'
                data-testid='input-search-my-skills'
                placeholder={t('settings.skillsHub.searchPlaceholder', { defaultValue: 'Search skills...' })}
                value={search_query}
                onChange={setSearchQuery}
              />
            )}
            <Button
              type='primary'
              size='small'
              className='!h-32px !rounded-8px !px-14px'
              onClick={handleManualImport}
              data-testid='btn-add-skill'
            >
              {t('settings.skillsHub.addSkill', { defaultValue: 'Add Skill' })}
            </Button>
          </>
        }
      />
      <div className='flex justify-center'>
        <SkillScopeCapsule
          segments={segments}
          activeKey={activeScope}
          onChange={setScope}
          testIdPrefix='skill-scope'
          ariaLabel={t('settings.skillsHub.scopeLabel', { defaultValue: 'Skill scope' })}
        />
      </div>
      {activeAgent ? (
        <AgentSkillPane
          assistant={activeAgent}
          descriptions={skillDescriptions}
          importedSkills={importedSkillNames}
          query={search_query}
          pendingSkill={pendingSkill}
          onToggle={(skillName, enabled) => void handleToggleAgentSkill(activeAgent, skillName, enabled)}
        />
      ) : (
        customPane
      )}
    </div>
  );

  return withWrapper ? <SettingsPageWrapper>{mainContent}</SettingsPageWrapper> : mainContent;
};

export default SkillsHubSettings;
