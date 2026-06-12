import React from 'react';
export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'video' | 'audio';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}
export function Badge(props: BadgeProps): JSX.Element;
