import React from 'react';

(function(){
  const id='vela-seg-css';
  if(document.getElementById(id))return;
  const s=document.createElement('style');s.id=id;
  s.textContent=`
.vseg{display:inline-flex;background:var(--vela-surface-3);border-radius:var(--radius-md);padding:3px;gap:2px;border:1px solid var(--vela-border-subtle)}
.vseg-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;border:none;background:transparent;color:var(--vela-text-3);cursor:pointer;border-radius:calc(var(--radius-md) - 2px);transition:background 120ms,color 120ms;font:var(--type-sm);white-space:nowrap;padding:0 12px}
.vseg.vseg-sm .vseg-btn{height:calc(var(--control-sm) - 6px);font:var(--type-xs);padding:0 8px}
.vseg.vseg-md .vseg-btn{height:calc(var(--control-md) - 6px)}
.vseg.vseg-lg .vseg-btn{height:calc(var(--control-lg) - 6px);font-size:15px;padding:0 16px}
.vseg-btn svg{width:14px;height:14px;flex-shrink:0}
.vseg-btn:hover:not(.vseg-active):not(:disabled){background:var(--vela-surface-2);color:var(--vela-text-2)}
.vseg-btn.vseg-active{background:var(--vela-primary);color:var(--vela-on-primary);box-shadow:var(--shadow-xs)}
.vseg-btn.vseg-active.vseg-secondary{background:var(--vela-secondary);color:#fff}
.vseg-btn:disabled{opacity:0.45;cursor:not-allowed}
  `;
  document.head.appendChild(s);
})();

export function SegmentedControl({options=[],value,onChange,size='md',color='primary',disabled=false}){
  return(
    <div className={'vseg vseg-'+size} role="group">
      {options.map(opt=>(
        <button key={opt.value}
          className={['vseg-btn',value===opt.value?'vseg-active':'',value===opt.value&&color==='secondary'?'vseg-secondary':''].filter(Boolean).join(' ')}
          onClick={()=>!disabled&&onChange&&onChange(opt.value)}
          disabled={disabled}
          aria-pressed={value===opt.value}
        >
          {opt.icon&&opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
