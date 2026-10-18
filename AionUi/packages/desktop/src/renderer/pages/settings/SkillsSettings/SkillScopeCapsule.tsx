/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * SkillScopeCapsule — the sliding pill switcher on the Skills page.
 *
 * One segmented track, equal-width segments, and a solid thumb that slides
 * under the active one. Segments are counted (not measured), so the thumb
 * width is `(track - padding) / n` and its offset is a whole-thumb translate;
 * that keeps the animation GPU-friendly and correct through resize.
 */

import { Button } from '@arco-design/web-react';
import classNames from 'classnames';
import React from 'react';

export type SkillScopeSegment = {
  key: string;
  label: string;
};

type SkillScopeCapsuleProps = {
  segments: SkillScopeSegment[];
  activeKey: string;
  onChange: (key: string) => void;
  /** Base testid; each pill renders as `${testIdPrefix}-${key}`. */
  testIdPrefix: string;
  ariaLabel: string;
};

/** Track padding on every side, in px — mirrored by the `p-4px` utility. */
const TRACK_PADDING = 4;

const SkillScopeCapsule: React.FC<SkillScopeCapsuleProps> = ({
  segments,
  activeKey,
  onChange,
  testIdPrefix,
  ariaLabel,
}) => {
  if (segments.length === 0) return null;

  const activeIndex = Math.max(
    0,
    segments.findIndex((segment) => segment.key === activeKey)
  );

  return (
    <div
      data-testid={testIdPrefix}
      role='tablist'
      aria-label={ariaLabel}
      className='relative inline-flex w-full max-w-420px items-center rounded-999px bg-fill-2 p-4px'
    >
      <span
        aria-hidden='true'
        data-testid={`${testIdPrefix}-thumb`}
        className='pointer-events-none absolute top-4px bottom-4px left-4px rounded-999px bg-base shadow-sm transition-transform duration-200 ease-out'
        style={{
          width: `calc((100% - ${TRACK_PADDING * 2}px) / ${segments.length})`,
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      />
      {segments.map((segment) => {
        const isActive = segment.key === activeKey;
        return (
          <Button
            key={segment.key}
            type='text'
            role='tab'
            aria-selected={isActive}
            data-testid={`${testIdPrefix}-${segment.key}`}
            data-active={isActive ? 'true' : 'false'}
            onClick={() => onChange(segment.key)}
            className={classNames(
              'relative z-1 !h-32px !min-w-0 !flex-1 !rounded-999px !border-none !px-8px !text-13px !bg-transparent transition-colors',
              isActive ? '!font-600 !text-t-primary' : '!font-400 !text-t-secondary hover:!text-t-primary'
            )}
          >
            <span className='block truncate'>{segment.label}</span>
          </Button>
        );
      })}
    </div>
  );
};

export default SkillScopeCapsule;
