import React from 'react';

(function(){
  const id='vela-pm-css';
  if(document.getElementById(id))return;
  const s=document.createElement('style');s.id=id;
  s.textContent=`
.vpm{display:flex;flex-direction:column;gap:6px}
.vpm-lbl{font:var(--type-caption);color:var(--vela-text-3);text-transform:uppercase;letter-spacing:var(--tracking-caps)}
.vpm-opts{display:flex;gap:6px}
.vpm-opt{flex:1;display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--vela-surface-2);border:1.5px solid var(--vela-border);border-radius:var(--radius-md);cursor:pointer;transition:border-color 150ms,background 150ms;user-select:none}
.vpm-opt:hover:not(.vpm-active){border-color:var(--vela-border-strong)}
.vpm-opt.vpm-active{border-color:var(--vela-primary-line);background:var(--vela-primary-soft)}
.vpm-icon{width:32px;height:32px;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;background:var(--vela-surface-3);flex-shrink:0;color:var(--vela-text-3);transition:background 150ms,color 150ms}
.vpm-opt.vpm-active .vpm-icon{background:var(--vela-primary);color:var(--vela-on-primary)}
.vpm-icon svg{width:16px;height:16px}
.vpm-name{font:var(--type-sm);color:var(--vela-text);line-height:1.3}
.vpm-desc{font:var(--type-xs);color:var(--vela-text-3);margin-top:2px}
.vpm-dot{width:16px;height:16px;border-radius:50%;border:1.5px solid var(--vela-border-strong);flex-shrink:0;margin-left:auto;display:flex;align-items:center;justify-content:center;transition:border-color 150ms}
.vpm-opt.vpm-active .vpm-dot{border-color:var(--vela-primary)}
.vpm-dot-inner{width:8px;height:8px;border-radius:50%;background:var(--vela-primary);opacity:0;transition:opacity 150ms}
.vpm-opt.vpm-active .vpm-dot-inner{opacity:1}
  `;
  document.head.appendChild(s);
})();

const IconSingle = ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>;
const IconSplit = ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="4" rx="1"/><rect x="2" y="10" width="20" height="4" rx="1"/><rect x="2" y="17" width="20" height="4" rx="1"/></svg>;

export function PlaylistMode({mode='split',onChange}){
  const opts=[
    {value:'single',icon:<IconSingle/>,name:'Full playlist',desc:'One merged file'},
    {value:'split',icon:<IconSplit/>,name:'Individual tracks',desc:'Separate files'},
  ];
  return(
    <div className="vpm">
      <span className="vpm-lbl">Playlist mode</span>
      <div className="vpm-opts">
        {opts.map(o=>(
          <div key={o.value} className={['vpm-opt',mode===o.value?'vpm-active':''].filter(Boolean).join(' ')}
            onClick={()=>onChange&&onChange(o.value)} role="radio" aria-checked={mode===o.value}>
            <div className="vpm-icon">{o.icon}</div>
            <div><div className="vpm-name">{o.name}</div><div className="vpm-desc">{o.desc}</div></div>
            <div className="vpm-dot"><div className="vpm-dot-inner"/></div>
          </div>
        ))}
      </div>
    </div>
  );
}
