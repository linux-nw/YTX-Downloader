import React from 'react';

(function(){
  const id='vela-input-css';
  if(document.getElementById(id))return;
  const s=document.createElement('style');s.id=id;
  s.textContent=`
.vi-wrap{display:flex;flex-direction:column;gap:5px}
.vi-lbl{font:var(--type-caption);color:var(--vela-text-3);text-transform:uppercase;letter-spacing:var(--tracking-caps)}
.vi-field{display:flex;align-items:center;background:var(--vela-surface-3);border:1px solid var(--vela-border);border-radius:var(--radius-md);transition:border-color 120ms,box-shadow 120ms;position:relative}
.vi-field:focus-within{border-color:var(--vela-primary-line);box-shadow:var(--ring-focus)}
.vi-field.vi-err{border-color:var(--vela-danger)}
.vi-field.vi-err:focus-within{box-shadow:0 0 0 3px oklch(0.67 0.18 22/0.22)}
.vi-field.vi-dis{opacity:0.45;pointer-events:none}
.vi-field.vi-sm{height:var(--control-sm);border-radius:var(--radius-sm)}
.vi-field.vi-md{height:var(--control-md)}
.vi-field.vi-lg{height:var(--control-lg);border-radius:var(--radius-lg)}
.vi-pre,.vi-suf{display:flex;align-items:center;padding:0 10px;color:var(--vela-text-3);flex-shrink:0}
.vi-pre svg,.vi-suf svg{width:15px;height:15px}
.vi-pre+.vi-inp{padding-left:4px}
.vi-inp{flex:1;background:transparent;border:none;outline:none;color:var(--vela-text);font:var(--type-body);padding:0 12px;width:0;min-width:0}
.vi-sm .vi-inp{font:var(--type-sm);padding:0 10px}
.vi-lg .vi-inp{font-size:15px;padding:0 14px}
.vi-inp::placeholder{color:var(--vela-text-3)}
.vi-hint{font:var(--type-caption);color:var(--vela-text-3)}
.vi-errmsg{font:var(--type-caption);color:var(--vela-danger)}
  `;
  document.head.appendChild(s);
})();

export function Input({label,value,onChange,placeholder,error,hint,prefix,suffix,size='md',disabled=false,type='text',...rest}){
  return(
    <div className="vi-wrap">
      {label&&<label className="vi-lbl">{label}</label>}
      <div className={['vi-field','vi-'+size,error?'vi-err':'',disabled?'vi-dis':''].filter(Boolean).join(' ')}>
        {prefix&&<span className="vi-pre">{prefix}</span>}
        <input className="vi-inp" type={type} value={value} onChange={e=>onChange&&onChange(e.target.value)} placeholder={placeholder} disabled={disabled} {...rest}/>
        {suffix&&<span className="vi-suf">{suffix}</span>}
      </div>
      {error&&<span className="vi-errmsg">{error}</span>}
      {hint&&!error&&<span className="vi-hint">{hint}</span>}
    </div>
  );
}
