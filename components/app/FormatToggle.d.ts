import React from 'react';
export interface FormatToggleProps {
  value: 'video' | 'audio';
  onChange: (value: 'video' | 'audio') => void;
}
export function FormatToggle(props: FormatToggleProps): JSX.Element;
