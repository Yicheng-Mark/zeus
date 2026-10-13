import React, { Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import AppLoader from '@renderer/components/layout/AppLoader';
import DocumentTitle from '@renderer/components/layout/DocumentTitle';
import { useCrossSessionRateLimitNotice } from '@/renderer/hooks/system/useCrossSessionRateLimitNotice';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { TEAM_MODE_ENABLED } from '@/common/config/constants';
const Conversation = React.lazy(() => import('@renderer/pages/conversation'));
const Guid = React.lazy(() => import('@renderer/pages/guid'));
const AgentSettings = React.lazy(() => import('@renderer/pages/settings/AgentSettings'));
const AgentRepairPage = React.lazy(() => import('@renderer/pages/settings/AgentSettings/AgentRepairPage'));
const AssistantSettings = React.lazy(() => import('@renderer/pages/settings/AssistantSettings'));
const SkillsSettings = React.lazy(() => import('@renderer/pages/settings/SkillsSettings/SkillsHubSettings'));
const SkillDetailPage = React.lazy(() => import('@renderer/pages/settings/SkillsSettings/SkillDetailPage'));
const ToolsSettings = React.lazy(() => import('@renderer/pages/settings/ToolsSettings'));
const AppearanceSettings = React.lazy(() => import('@renderer/pages/settings/AppearanceSettings'));
const SystemSettings = React.lazy(() => import('@renderer/pages/settings/SystemSettings'));
const WebuiSettings = React.lazy(() => import('@renderer/pages/settings/WebuiSettings'));
const ArchivedSettings = React.lazy(() => import('@renderer/pages/settings/ArchivedSettings'));
const ExtensionSettingsPage = React.lazy(() => import('@renderer/pages/settings/ExtensionSettingsPage'));
const LoginPage = React.lazy(() => import('@renderer/pages/login'));
const ComponentsShowcase = React.lazy(() => import('@renderer/pages/TestShowcase'));
const ScheduledTasksPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage'));
const TaskDetailPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage/TaskDetailPage'));
const TeamIndex = React.lazy(() => import('@renderer/pages/team'));
const KnowledgePage = React.lazy(() => import('@renderer/pages/knowledge'));

const withRouteFallback = (Component: React.LazyExoticComponent<React.ComponentType>) => (
  <Suspense fallback={<AppLoader />}>
    <Component />
  </Suspense>
);

/**
 * Legacy `/settings/capabilities?tab=tools` deep links now map to the standalone
 * Connectors page; everything else (skills tab or no tab) lands on the Skills page.
 */
const CapabilitiesRedirect: React.FC = () => {
  const { search } = useLocation();
  const tab = new URLSearchParams(search).get('tab');
  return <Navigate to={tab === 'tools' ? '/connectors' : '/skills'} replace />;
};

/** Old skill detail deep links carry a path param, so they need a mapping redirect. */
const SkillDetailRedirect: React.FC = () => {
  const { skillName } = useParams<{ skillName: string }>();
  return <Navigate to={`/skills/detail/${encodeURIComponent(skillName ?? '')}`} replace />;
};

const ProtectedLayout: React.FC<{ layout: React.ReactElement }> = ({ layout }) => {
  const { status, user } = useAuth();
  // Mounted once for every authenticated route: the loop warning has to reach
  // the user even when they are looking at a THIRD conversation, which is the
  // whole reason it is a broadcast rather than an in-conversation banner.
  useCrossSessionRateLimitNotice(user?.id);

  if (status === 'checking') {
    return <AppLoader />;
  }

  if (status !== 'authenticated') {
    return <Navigate to='/login' replace />;
  }

  return React.cloneElement(layout);
};

const PanelRoute: React.FC<{ layout: React.ReactElement }> = ({ layout }) => {
  const { status } = useAuth();

  return (
    <HashRouter>
      <DocumentTitle />
      <Routes>
        <Route
          path='/login'
          element={status === 'authenticated' ? <Navigate to='/guid' replace /> : withRouteFallback(LoginPage)}
        />
        <Route element={<ProtectedLayout layout={layout} />}>
          <Route index element={<Navigate to='/guid' replace />} />
          <Route path='/guid' element={withRouteFallback(Guid)} />
          <Route path='/conversation/:id' element={withRouteFallback(Conversation)} />
          <Route
            path='/team/:id'
            element={TEAM_MODE_ENABLED ? withRouteFallback(TeamIndex) : <Navigate to='/guid' replace />}
          />
          {/* Model settings merged into the Agent tab; keep old deep links working. */}
          <Route path='/settings/model' element={<Navigate to='/settings/agent' replace />} />
          <Route path='/assistants' element={withRouteFallback(AssistantSettings)} />
          {/* Assistants moved out of Settings to a top-level entry; keep a redirect
              so old deep links / back-nav still land on the new page. */}
          <Route path='/settings/assistants' element={<Navigate to='/assistants' replace />} />
          <Route path='/settings/agent' element={withRouteFallback(AgentSettings)} />
          <Route path='/settings/agent/:id/repair' element={withRouteFallback(AgentRepairPage)} />
          {/* Skills / Connectors / Knowledge are top-level sidebar entries; keep
              redirects so old deep links / back-nav still land on the new pages. */}
          <Route path='/skills' element={withRouteFallback(SkillsSettings)} />
          <Route path='/skills/detail/:skillName' element={withRouteFallback(SkillDetailPage)} />
          <Route path='/connectors' element={withRouteFallback(ToolsSettings)} />
          <Route path='/knowledge' element={withRouteFallback(KnowledgePage)} />
          <Route path='/settings/skills' element={<Navigate to='/skills' replace />} />
          <Route path='/settings/skills/detail/:skillName' element={<SkillDetailRedirect />} />
          <Route path='/settings/tools' element={<Navigate to='/connectors' replace />} />
          {/* Legacy routes — the previous combined "Capabilities" page is now two pages. */}
          <Route path='/settings/capabilities' element={<CapabilitiesRedirect />} />
          <Route
            path='/settings/capabilities/skills/import-history'
            element={<Navigate to='/skills' replace />}
          />
          <Route path='/settings/skills/import-history' element={<Navigate to='/skills' replace />} />
          <Route path='/settings/skills-hub' element={<Navigate to='/skills' replace />} />
          <Route path='/settings/appearance' element={withRouteFallback(AppearanceSettings)} />
          <Route path='/settings/display' element={<Navigate to='/settings/appearance' replace />} />
          <Route path='/settings/webui' element={withRouteFallback(WebuiSettings)} />
          <Route path='/settings/archived' element={withRouteFallback(ArchivedSettings)} />
          <Route path='/settings/system' element={withRouteFallback(SystemSettings)} />
          <Route path='/settings/about' element={withRouteFallback(SystemSettings)} />
          <Route path='/settings/ext/:tabId' element={withRouteFallback(ExtensionSettingsPage)} />
          <Route path='/settings' element={<Navigate to='/settings/agent' replace />} />
          <Route path='/test/components' element={withRouteFallback(ComponentsShowcase)} />
          <Route path='/scheduled' element={withRouteFallback(ScheduledTasksPage)} />
          <Route path='/scheduled/:job_id' element={withRouteFallback(TaskDetailPage)} />
        </Route>
        <Route path='*' element={<Navigate to={status === 'authenticated' ? '/guid' : '/login'} replace />} />
      </Routes>
    </HashRouter>
  );
};

export default PanelRoute;
