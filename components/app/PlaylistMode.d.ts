import React from 'react';
export interface PlaylistModeProps {
  mode: 'single' | 'split';
  onChange: (mode: 'single' | 'split') => void;
}
export function PlaylistMode(props: PlaylistModeProps): JSX.Element;
