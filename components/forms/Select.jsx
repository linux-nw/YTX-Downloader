import React from 'react';

(function(){
  const id='vela-sel-css';
  if(document.getElementById(id))return;
  const s=document.createElement('style');s.id=id;
  s.textContent=`
.vsel-wrap{display:flex;flex-direction:column;gap:5px}
.vsel-lbl{font:var(--type-caption);color:var(--vela-text-3);text-transform:uppercase;letter-spacing:var(--tracking-caps)}
.vsel-field{position:relative}
.vsel{appearance:none;-webkit-appearance:none;width:100%;background:var(--vela-surface-3);border:1px solid var(--vela-border);border-radius:var(--radius-md);color:var(--vela-text);font:var(--type-body);padding:0 32px 0 12px;height:var(--control-md);cursor:pointer;outline:none;transition:border-color 120ms,box-shadow 120ms}
.vsel:hover{border-color:var(--vela-border-strong)}
.vsel:focus{border-color:var(--vela-primary-line);box-shadow:var(--ring-focus)}
.vsel:disabled{opacity:0.45;cursor:not-allowed}
.vsel option{background:var(--vela-overlay,#2a2d38);color:var(--vela-text)}
.vsel-arrow{position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--vela-text-3)}
.vsel-arrow svg{width:12px;height:12px}
  `;
  document.head.appendChild(s);
})();

export function Select({label,value,onChange,options=[],placeholder,disabled=false,...rest}){
  return(
    <div className="vsel-wrap">
      {label&&<label className="vsel-lbl">{label}</label>}
      <div className="vsel-field">
        <select className="vsel" value={value} onChange={e=>onChange&&onChange(e.target.value)} disabled={disabled} {...rest}>
          {placeholder&&<option value="">{placeholder}</option>}
          {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="vsel-arrow">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="2,4 6,8 10,4"/></svg>
        </span>
      </div>
    </div>
  );
}
