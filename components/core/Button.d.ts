import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. @default "primary" */
  variant?: 'primary' | 'secondary' | 'neutral' | 'ghost' | 'soft' | 'danger';
  /** Control height. @default "md" */
  size?: 'sm' | 'md' | 'lg';
  /** Stretch to fill container width. */
  block?: boolean;
  /** Show a spinner and disable interaction. */
  loading?: boolean;
  /** Icon node rendered before the label (pass a Lucide/SVG element). */
  iconLeft?: React.ReactNode;
  /** Icon node rendered after the label. */
  iconRight?: React.ReactNode;
  /** Render as a square icon-only button (omit children). */
  iconOnly?: boolean;
  children?: React.ReactNode;
}

/**
 * The primary action control for Vela. Teal "primary" for the main download
 * action; "neutral"/"ghost" for secondary actions; "soft" for tinted toolbar
 * actions; "danger" for destructive (remove from queue).
 *
 * @startingPoint section="Core" subtitle="Action button — 6 variants, 3 sizes" viewport="700x220"
 */
export function Button(props: ButtonProps): JSX.Element;
