import React from 'react';

const CSS = `
.vela-iconbtn{
  --_s: var(--control-md);
  display:inline-flex; align-items:center; justify-content:center;
  width:var(--_s); height:var(--_s); padding:0;
  color:var(--vela-text-2); background:transparent;
  border:1px solid transparent; border-radius:var(--radius-md);
  cursor:pointer; transition:background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out),
    transform var(--dur-instant) var(--ease-out);
}
.vela-iconbtn svg{ width:18px; height:18px; }
.vela-iconbtn:hover:not([disabled]){ background:var(--vela-surface-3); color:var(--vela-text); }
.vela-iconbtn:active:not([disabled]){ transform:scale(0.92); }
.vela-iconbtn:focus-visible{ outline:none; box-shadow:var(--ring-focus); }
.vela-iconbtn[disabled]{ opacity:0.4; cursor:not-allowed; }
.vela-iconbtn--sm{ --_s:var(--control-sm); border-radius:var(--radius-sm); }
.vela-iconbtn--sm svg{ width:16px; height:16px; }
.vela-iconbtn--lg{ --_s:var(--control-lg); }
.vela-iconbtn--lg svg{ width:20px; height:20px; }
.vela-iconbtn--solid{ background:var(--vela-surface-3); border-color:var(--vela-border); color:var(--vela-text); }
.vela-iconbtn--solid:hover:not([disabled]){ background:var(--vela-overlay); }
.vela-iconbtn--active{ background:var(--vela-primary-soft); color:var(--vela-primary); }
.vela-iconbtn--danger:hover:not([disabled]){ background:var(--vela-danger-soft); color:var(--vela-danger); }
`;

if (typeof document !== 'undefined' && !document.getElementById('vela-iconbtn-css')) {
  const el = document.createElement('style');
  el.id = 'vela-iconbtn-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

export function IconButton({
  size = 'md',
  variant = 'ghost',
  active = false,
  danger = false,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  const cls = [
    'vela-iconbtn',
    size !== 'md' ? `vela-iconbtn--${size}` : '',
    variant === 'solid' ? 'vela-iconbtn--solid' : '',
    active ? 'vela-iconbtn--active' : '',
    danger ? 'vela-iconbtn--danger' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}
