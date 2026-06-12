import React from 'react';

(function(){
  const id='vela-cb-css';
  if(document.getElementById(id))return;
  const s=document.createElement('style');s.id=id;
  s.textContent=`
.vcb{display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none}
.vcb.vcb-dis{opacity:0.45;pointer-events:none}
.vcb-box{width:16px;height:16px;flex-shrink:0;border-radius:var(--radius-xs);border:1.5px solid var(--vela-border-strong);background:var(--vela-surface-3);display:flex;align-items:center;justify-content:center;transition:background 120ms,border-color 120ms,box-shadow 120ms}
.vcb-hinput{position:absolute;opacity:0;width:0;height:0}
.vcb.vcb-checked .vcb-box,.vcb.vcb-mixed .vcb-box{background:var(--vela-primary);border-color:var(--vela-primary)}
.vcb-mark{color:var(--vela-on-primary);display:none;pointer-events:none}
.vcb.vcb-checked .vcb-mark,.vcb.vcb-mixed .vcb-mark{display:flex}
.vcb:focus-within .vcb-box{box-shadow:var(--ring-focus)}
.vcb-lbl{font:var(--type-sm);color:var(--vela-text-2)}
  `;
  document.head.appendChild(s);
})();

export function Checkbox({checked=false,onChange,indeterminate=false,label,disabled=false}){
  return(
    <label className={['vcb',checked?'vcb-checked':'',indeterminate?'vcb-mixed':'',disabled?'vcb-dis':''].filter(Boolean).join(' ')}>
      <input className="vcb-hinput" type="checkbox" checked={checked} onChange={e=>onChange&&onChange(e.target.checked)} disabled={disabled}/>
      <span className="vcb-box">
        <span className="vcb-mark">
          {indeterminate
            ?<svg width="10" height="2" viewBox="0 0 10 2"><line x1="0" y1="1" x2="10" y2="1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            :<svg width="10" height="8" viewBox="0 0 10 8"><polyline points="1,4 4,7 9,1" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          }
        </span>
      </span>
      {label&&<span className="vcb-lbl">{label}</span>}
    </label>
  );
}
