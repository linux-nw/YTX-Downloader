import React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** @default "md" */
  size?: 'sm' | 'md' | 'lg';
  /** "ghost" (default, transparent) or "solid" (filled surface). */
  variant?: 'ghost' | 'solid';
  /** Active/toggled state — tints with primary. */
  active?: boolean;
  /** Use danger hover treatment (e.g. delete). */
  danger?: boolean;
  /** A single icon node (Lucide/SVG). Always pass an aria-label. */
  children: React.ReactNode;
}

/**
 * Square, icon-only control for toolbars and titlebars — settings, more,
 * folder, pause, remove. Always provide an aria-label.
 */
export function IconButton(props: IconButtonProps): JSX.Element;
