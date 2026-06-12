import React from 'react';
export interface DownloadRowProps {
  filename: string;
  format: 'video' | 'audio';
  status: 'queued' | 'downloading' | 'done' | 'error';
  progress?: number;
  filesize?: string;
  speed?: string;
  onRemove?: () => void;
  onRetry?: () => void;
  onOpenFolder?: () => void;
}
export function DownloadRow(props: DownloadRowProps): JSX.Element;
