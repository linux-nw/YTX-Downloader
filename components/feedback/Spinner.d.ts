import React from 'react';
export interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  color?: 'primary' | 'secondary' | 'muted' | 'white';
}
export function Spinner(props: SpinnerProps): JSX.Element;
