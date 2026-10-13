/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import LocalAgents from './LocalAgents';
import ModelModalContent from '@/renderer/components/settings/SettingsModal/contents/ModelModalContent';
import SettingsPageWrapper from '../components/SettingsPageWrapper';

/** Single "Agents & Models" settings page — agent runtime management on top,
 * LLM provider configuration below (formerly the separate Model tab). */
const AgentSettings: React.FC = () => {
  return (
    <SettingsPageWrapper contentClassName='max-w-1100px'>
      <div className='flex flex-col gap-16px'>
        <LocalAgents />
        <ModelModalContent />
      </div>
    </SettingsPageWrapper>
  );
};

export default AgentSettings;
