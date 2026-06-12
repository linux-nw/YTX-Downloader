import React from 'react';

(function(){
  const id='vela-badge-css';
  if(document.getElementById(id))return;
  const s=document.createElement('style');s.id=id;
  s.textContent=`
.vbadge{display:inline-flex;align-items:center;gap:4px;border-radius:var(--radius-full);white-space:nowrap;font-weight:500;letter-spacing:.02em}
.vbadge.vbsm{padding:2px 7px;font-size:10px;line-height:1.4}
.vbadge.vbmd{padding:3px 9px;font-size:11px;line-height:1.4}
.vbadge.vblg{padding:4px 11px;font-size:12px;line-height:1.4}
.vbadge svg{width:10px;height:10px;flex-shrink:0}
.vbadge.vb-default{background:var(--vela-surface-3);color:var(--vela-text-2)}
.vbadge.vb-primary{background:var(--vela-primary-soft);color:var(--teal-300)}
.vbadge.vb-secondary{background:var(--vela-secondary-soft);color:var(--indigo-300)}
.vbadge.vb-success{background:var(--vela-success-soft);color:var(--vela-success)}
.vbadge.vb-warning{background:var(--vela-warning-soft);color:var(--vela-warning)}
.vbadge.vb-danger{background:var(--vela-danger-soft);color:var(--vela-danger)}
.vbadge.vb-info{background:var(--vela-info-soft);color:var(--vela-info)}
.vbadge.vb-video{background:var(--vela-primary-soft);color:var(--vela-video)}
.vbadge.vb-audio{background:var(--vela-secondary-soft);color:var(--vela-audio)}
  `;
  document.head.appendChild(s);
})();

export function Badge({children,variant='default',size='md',icon}){
  return(
    <span className={['vbadge','vb-'+variant,'vb'+size].join(' ')}>
      {icon&&icon}
      {children}
    </span>
  );
}
