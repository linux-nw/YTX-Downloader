import React from 'react';

(function(){
  const id='vela-ft-css';
  if(document.getElementById(id))return;
  const s=document.createElement('style');s.id=id;
  s.textContent=`
.vft{display:inline-flex;background:var(--vela-surface-3);border-radius:var(--radius-md);padding:3px;gap:2px;border:1px solid var(--vela-border-subtle)}
.vft-btn{display:flex;align-items:center;gap:7px;border:none;background:transparent;cursor:pointer;border-radius:calc(var(--radius-md) - 2px);transition:background 120ms,color 120ms,box-shadow 120ms;padding:0 16px;height:32px;font:var(--type-sm);font-weight:500;color:var(--vela-text-3)}
.vft-btn:hover:not(.vft-active){background:var(--vela-surface-2);color:var(--vela-text-2)}
.vft-btn.vft-active.vft-video{background:var(--vela-video);color:var(--vela-on-primary);box-shadow:var(--shadow-sm),var(--glow-primary)}
.vft-btn.vft-active.vft-audio{background:var(--vela-audio);color:oklch(0.17 .02 280);box-shadow:var(--shadow-sm),var(--glow-secondary)}
.vft-btn svg{width:15px;height:15px;flex-shrink:0}
.vft-tag{font-size:9px;font-weight:700;letter-spacing:.07em;background:oklch(0 0 0/.22);padding:1px 4px;border-radius:3px}
  `;
  document.head.appendChild(s);
})();

export function FormatToggle({value='video',onChange}){
  return(
    <div className="vft" role="group" aria-label="Output format">
      <button className={['vft-btn vft-video',value==='video'?'vft-active':''].join(' ')} onClick={()=>onChange&&onChange('video')} aria-pressed={value==='video'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>
        Video <span className="vft-tag">MP4</span>
      </button>
      <button className={['vft-btn vft-audio',value==='audio'?'vft-active':''].join(' ')} onClick={()=>onChange&&onChange('audio')} aria-pressed={value==='audio'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        Audio <span className="vft-tag">MP3</span>
      </button>
    </div>
  );
}
