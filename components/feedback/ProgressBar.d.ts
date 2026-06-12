import React from 'react';
export interface ProgressBarProps {
  value?: number;
  label?: string;
  showValue?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  color?: 'primary' | 'secondary' | 'gradient' | 'success' | 'danger';
  indeterminate?: boolean;
}
export function ProgressBar(props: ProgressBarProps): JSX.Element;
