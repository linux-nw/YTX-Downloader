import React from 'react';

const CSS = `
.vela-btn{
  --_h: var(--control-md);
  display:inline-flex; align-items:center; justify-content:center; gap:8px;
  height:var(--_h); padding:0 16px;
  font:var(--weight-semibold) var(--text-base)/1 var(--font-sans);
  letter-spacing:var(--tracking-snug);
  border:1px solid transparent; border-radius:var(--radius-md);
  cursor:pointer; white-space:nowrap; user-select:none;
  transition:background var(--dur-fast) var(--ease-out),
             border-color var(--dur-fast) var(--ease-out),
             color var(--dur-fast) var(--ease-out),
             transform var(--dur-instant) var(--ease-out),
             box-shadow var(--dur-fast) var(--ease-out);
}
.vela-btn:focus-visible{ outline:none; box-shadow:var(--ring-focus); }
.vela-btn:active{ transform:translateY(0.5px) scale(0.985); }
.vela-btn[disabled]{ cursor:not-allowed; opacity:0.45; transform:none; box-shadow:none; }

.vela-btn--sm{ --_h:var(--control-sm); padding:0 12px; font-size:var(--text-sm); border-radius:var(--radius-sm); }
.vela-btn--lg{ --_h:var(--control-lg); padding:0 22px; font-size:var(--text-md); }
.vela-btn--block{ width:100%; }
.vela-btn--icon-only{ padding:0; width:var(--_h); }

.vela-btn__spinner{ width:15px; height:15px; border-radius:50%;
  border:2px solid currentColor; border-right-color:transparent;
  animation:vela-btn-spin 0.7s linear infinite; opacity:0.9; }
@keyframes vela-btn-spin{ to{ transform:rotate(360deg); } }
.vela-btn svg{ width:16px; height:16px; flex:0 0 auto; }
.vela-btn--lg svg{ width:18px; height:18px; }

/* primary */
.vela-btn--primary{ background:var(--vela-primary); color:var(--vela-on-primary); box-shadow:var(--glow-primary), var(--edge-highlight); }
.vela-btn--primary:hover:not([disabled]){ background:var(--vela-primary-hover); }
.vela-btn--primary:active:not([disabled]){ background:var(--vela-primary-press); }

/* secondary (filled indigo) */
.vela-btn--secondary{ background:var(--vela-secondary); color:#fff; box-shadow:var(--glow-secondary), var(--edge-highlight); }
.vela-btn--secondary:hover:not([disabled]){ background:var(--vela-secondary-hover); }

/* neutral / outline */
.vela-btn--neutral{ background:var(--vela-surface-3); color:var(--vela-text); border-color:var(--vela-border); box-shadow:var(--edge-highlight); }
.vela-btn--neutral:hover:not([disabled]){ background:var(--vela-overlay); border-color:var(--vela-border-strong); }

/* ghost */
.vela-btn--ghost{ background:transparent; color:var(--vela-text-2); }
.vela-btn--ghost:hover:not([disabled]){ background:var(--vela-surface-3); color:var(--vela-text); }

/* soft tinted */
.vela-btn--soft{ background:var(--vela-primary-soft); color:var(--vela-primary); }
.vela-btn--soft:hover:not([disabled]){ background:var(--vela-primary-line); color:var(--vela-text); }

/* danger */
.vela-btn--danger{ background:var(--vela-danger-soft); color:var(--vela-danger); }
.vela-btn--danger:hover:not([disabled]){ background:var(--vela-danger); color:#fff; }
`;

if (typeof document !== 'undefined' && !document.getElementById('vela-btn-css')) {
  const el = document.createElement('style');
  el.id = 'vela-btn-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  disabled = false,
  iconLeft = null,
  iconRight = null,
  iconOnly = false,
  type = 'button',
  className = '',
  children,
  ...rest
}) {
  const cls = [
    'vela-btn',
    `vela-btn--${variant}`,
    size !== 'md' ? `vela-btn--${size}` : '',
    block ? 'vela-btn--block' : '',
    iconOnly ? 'vela-btn--icon-only' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button type={type} className={cls} disabled={disabled || loading} {...rest}>
      {loading && <span className="vela-btn__spinner" aria-hidden="true" />}
      {!loading && iconLeft}
      {!iconOnly && children != null && <span>{children}</span>}
      {!loading && iconRight}
    </button>
  );
}
