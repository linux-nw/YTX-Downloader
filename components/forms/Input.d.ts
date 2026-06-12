import React from 'react';

export interface InputProps {
  /** Visible label above the field */
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Error message — shown below field; turns border red */
  error?: string;
  /** Hint text — shown below field when no error */
  hint?: string;
  /** Leading icon/element inside the field */
  prefix?: React.ReactNode;
  /** Trailing icon/element inside the field */
  suffix?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  type?: string;
}

export function Input(props: InputProps): JSX.Element;
