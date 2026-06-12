import React from 'react';
export interface UrlBarProps {
  value?: string;
  onChange?: (value: string) => void;
  onPaste?: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
}
export function UrlBar(props: UrlBarProps): JSX.Element;
