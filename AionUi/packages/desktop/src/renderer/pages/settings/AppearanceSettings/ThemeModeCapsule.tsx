/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { DARK_THEME_ID, LIGHT_THEME_ID, SYSTEM_THEME_ID } from '@/common/theme/constants';
import { Button } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type ThemeModeCapsuleProps = {
  /** Raw persisted theme id — may be the `system` sentinel or a custom theme id. */
  activeId: string;
  onSelect: (id: string) => void;
};

/** Capsule segments in display order: Light / Dark / Follow System. */
const OPTIONS = [
  { id: LIGHT_THEME_ID, labelKey: 'settings.themeLight' },
  { id: DARK_THEME_ID, labelKey: 'settings.themeDark' },
  { id: SYSTEM_THEME_ID, labelKey: 'settings.cssTheme.followSystem' },
] as const;

/**
 * Sliding-capsule selector for the three standard appearance modes. The thumb
 * slides between three equal segments; while a custom CSS theme is active no
 * segment is highlighted (the custom card below shows the selection instead).
 */
const ThemeModeCapsule: React.FC<ThemeModeCapsuleProps> = ({ activeId, onSelect }) => {
  const { t } = useTranslation();
  const activeIndex = OPTIONS.findIndex((option) => option.id === activeId);

  return (
    <div
      className='relative inline-flex w-full max-w-360px items-center rounded-999px p-4px'
      style={{ background: 'var(--bg-3)' }}
      role='radiogroup'
      data-testid='theme-mode-capsule'
    >
      {activeIndex >= 0 && (
        <span
          aria-hidden='true'
          className='absolute top-4px bottom-4px start-4px rounded-999px transition-transform duration-250 ease-out'
          style={{
            width: 'calc((100% - 8px) / 3)',
            background: 'var(--bg-base, #fff)',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.12)',
            transform: `translateX(${activeIndex * 100}%)`,
          }}
        />
      )}
      {OPTIONS.map((option) => {
        const isSelected = option.id === activeId;
        return (
          <Button
            key={option.id}
            type='text'
            role='radio'
            aria-checked={isSelected}
            data-testid={`theme-option-${option.id}`}
            data-active={isSelected ? 'true' : 'false'}
            className={`relative z-10 flex-1 !h-32px !rounded-999px !border-none !bg-transparent !px-0 !text-13px !font-500 transition-colors duration-250 ${
              isSelected ? 'text-t-primary' : 'text-t-secondary hover:text-t-primary'
            }`}
            onClick={() => onSelect(option.id)}
          >
            {t(option.labelKey)}
          </Button>
        );
      })}
    </div>
  );
};

export default ThemeModeCapsule;
