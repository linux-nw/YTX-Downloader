import React from 'react';

(function(){
  const id='vela-urlbar-css';
  if(document.getElementById(id))return;
  const s=document.createElement('style');s.id=id;
  s.textContent=`
.vurl{display:flex;align-items:center;background:var(--vela-surface-2);border:1px solid var(--vela-border);border-radius:var(--radius-lg);overflow:hidden;transition:border-color 150ms,box-shadow 150ms;height:44px}
.vurl:focus-within{border-color:var(--vela-primary-line);box-shadow:var(--ring-focus)}
.vurl.vurl-filled{border-color:var(--vela-border-strong)}
.vurl-input{flex:1;background:transparent;border:none;outline:none;color:var(--vela-text);font-family:var(--font-mono);font-size:13px;padding:0 14px;min-width:0}
.vurl-input::placeholder{font-family:var(--font-sans);font-size:14px;color:var(--vela-text-3)}
.vurl-clear{width:34px;height:100%;background:transparent;border:none;color:var(--vela-text-3);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:color 100ms;flex-shrink:0}
.vurl-clear:hover{color:var(--vela-danger)}
.vurl-clear svg{width:15px;height:15px}
.vurl-paste{display:flex;align-items:center;gap:6px;height:100%;padding:0 14px;background:var(--vela-surface-3);border:none;border-left:1px solid var(--vela-border);color:var(--vela-text-2);font:var(--type-sm);cursor:pointer;transition:background 120ms,color 120ms;flex-shrink:0;letter-spacing:.01em}
.vurl-paste:hover{background:var(--vela-primary-soft);color:var(--vela-primary)}
.vurl-paste svg{width:15px;height:15px}
  `;
  document.head.appendChild(s);
})();

export function UrlBar({value='',onChange,onPaste,onClear,placeholder='Paste a video or playlist URL…'}){
  const filled=value&&value.length>0;
  async function handlePaste(){
    try{const t=await navigator.clipboard.readText();onChange&&onChange(t);onPaste&&onPaste(t);}
    catch{onPaste&&onPaste('');}
  }
  return(
    <div className={'vurl'+(filled?' vurl-filled':'')}>
      <input className="vurl-input" value={value} onChange={e=>onChange&&onChange(e.target.value)} placeholder={placeholder} spellCheck={false} autoComplete="off"/>
      {filled&&<button className="vurl-clear" onClick={()=>{onChange&&onChange('');onClear&&onClear();}} aria-label="Clear">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>}
      <button className="vurl-paste" onClick={handlePaste}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
        Paste
      </button>
    </div>
  );
}
