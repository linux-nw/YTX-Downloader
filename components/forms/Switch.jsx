import React from 'react';

(function(){
  const id='vela-sw-css';
  if(document.getElementById(id))return;
  const s=document.createElement('style');s.id=id;
  s.textContent=`
.vsw{display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none}
.vsw.vsw-dis{opacity:0.45;pointer-events:none}
.vsw-track{position:relative;border-radius:var(--radius-full);background:var(--vela-surface-3);border:1px solid var(--vela-border);transition:background 150ms,border-color 150ms,box-shadow 150ms;flex-shrink:0}
.vsw-md .vsw-track{width:36px;height:20px}
.vsw-sm .vsw-track{width:28px;height:16px}
.vsw-thumb{position:absolute;top:50%;transform:translateY(-50%);border-radius:50%;background:var(--slate-400);transition:left 150ms cubic-bezier(0.34,1.4,0.64,1),background 150ms}
.vsw-md .vsw-thumb{width:14px;height:14px;left:2px}
.vsw-sm .vsw-thumb{width:10px;height:10px;left:2px}
.vsw.vsw-on .vsw-track{background:var(--vela-primary);border-color:var(--vela-primary)}
.vsw.vsw-on .vsw-thumb{background:#fff;left:calc(100% - 16px)}
.vsw-sm.vsw-on .vsw-thumb{left:calc(100% - 12px)}
.vsw-lbl{font:var(--type-sm);color:var(--vela-text-2)}
.vsw:focus-within .vsw-track{box-shadow:var(--ring-focus)}
.vsw-inp{position:absolute;opacity:0;width:0;height:0}
  `;
  document.head.appendChild(s);
})();

export function Switch({checked=false,onChange,label,size='md',disabled=false}){
  return(
    <label className={['vsw','vsw-'+size,checked?'vsw-on':'',disabled?'vsw-dis':''].filter(Boolean).join(' ')}>
      <input className="vsw-inp" type="checkbox" checked={checked} onChange={e=>onChange&&onChange(e.target.checked)} disabled={disabled}/>
      <span className="vsw-track"><span className="vsw-thumb"/></span>
      {label&&<span className="vsw-lbl">{label}</span>}
    </label>
  );
}
