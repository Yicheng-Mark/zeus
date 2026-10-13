import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { Button, Checkbox, Message, Modal } from '@arco-design/web-react';
import { Delete } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useSWR from 'swr';
import SkillUsedByStack, { getAssistantsUsingSkill } from './SkillUsedByStack';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import SettingsPageHeader from '../components/SettingsPageHeader';
import { AionSearchInput } from '@/renderer/components/base';
import { buildSkillImportNotice, getSkillImportErrorMessage } from './skillImportMessages';

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

// Normalize skill name for data-testid usage
const normalizeTestId = (name: string): string => {
  return name.replace(/[:/\s<>"'|?*]/g, '-');
};

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
  // Assistant catalog for the "used by" avatar stacks on skill cards.
  const { data: assistantCatalog } = useSWR<Assistant[]>('assistants.list', () => ipcBridge.assistants.list.invoke());

  const openSkillDetail = useCallback(
    (skillName: string) => {
      void navigate(`/skills/detail/${encodeURIComponent(skillName)}`);
    },
    [navigate]
  );

  // Only user-imported skills are managed here; the builtin corpus reaches
  // agents through the fixed per-mode presets instead of this page.
  const mySkills = useMemo(() => availableSkills.filter((s) => s.source === 'custom'), [availableSkills]);

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

  // Scroll to and highlight a skill when navigated with ?highlight=skillName
  useEffect(() => {
    if (!highlightName || loading) return;
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
  }, [highlightName, loading, setSearchParams]);

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
        void fetchData();
      } else if (notice.type !== 'success') {
        void fetchData();
      }
    } catch (error) {
      console.error('Failed to import skill:', error);
      Message.error(getSkillImportErrorMessage(error, t));
    }
  };

  const handleDelete = async (skillName: string) => {
    try {
      await ipcBridge.fs.deleteSkill.invoke({ skill_name: skillName });
      Message.success(t('settings.skillsHub.deleteSuccess', { defaultValue: 'Skill deleted' }));
      void fetchData();
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
      },
    });
  }, [selectedSkillNames, exitBatchMode, fetchData, t]);

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
              data-testid={`my-skill-card-${normalizeTestId(skill.name)}`}
              ref={(el) => {
                skillRefs.current[skill.name] = el;
              }}
              onClick={batchMode ? () => toggleSkillSelected(skill.name) : () => openSkillDetail(skill.name)}
              className={`group flex flex-col sm:flex-row gap-16px p-14px border rd-12px transition-all duration-200 cursor-pointer ${highlightedSkill === skill.name ? 'border-primary-5 bg-primary-1' : selectedSkillNames.has(skill.name) && batchMode ? 'border-transparent bg-[rgba(var(--primary-6),0.06)]' : 'border-transparent bg-base hover:border-border-2'}`}
            >
              {batchMode && (
                <div className='shrink-0 flex items-center sm:self-center'>
                  <Checkbox
                    data-testid={`checkbox-skill-${normalizeTestId(skill.name)}`}
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
                    data-testid={`btn-delete-${normalizeTestId(skill.name)}`}
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

  const mainContent = (
    <div className='flex flex-col gap-16px'>
      <SettingsPageHeader
        data-testid='skills-header'
        title={t('settings.skills', { defaultValue: 'Skills' })}
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
        tabs={[
          {
            key: 'custom',
            label: t('settings.skillsHub.tabCustom', { defaultValue: 'Custom' }),
            count: mySkills.length,
          },
        ]}
        activeTab='custom'
      />
      {customPane}
    </div>
  );

  return withWrapper ? <SettingsPageWrapper>{mainContent}</SettingsPageWrapper> : mainContent;
};

export default SkillsHubSettings;
