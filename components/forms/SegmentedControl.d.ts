import React from 'react';

export interface SegmentedOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

/** @startingPoint section="Forms" subtitle="Tab-style option picker" viewport="320x52" */
export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'md' | 'lg';
  /** 'primary' = teal active, 'secondary' = indigo active */
  color?: 'primary' | 'secondary';
  disabled?: boolean;
}

export function SegmentedControl(props: SegmentedControlProps): JSX.Element;
