import React from 'react';

(function(){
  const id='vela-dlrow-css';
  if(document.getElementById(id))return;
  const s=document.createElement('style');s.id=id;
  s.textContent=`
@keyframes vela-dl-sweep{from{transform:translateX(-100%)}to{transform:translateX(220%)}}
.vdlrow{display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--vela-surface-2);border-radius:var(--radius-md);border:1px solid var(--vela-border-subtle);transition:background 150ms}
.vdlrow:hover{background:oklch(0.25 .018 257)}
.vdlrow-icon{width:36px;height:36px;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.vdlrow-icon.vdli-video{background:var(--vela-primary-soft);color:var(--vela-video)}
.vdlrow-icon.vdli-audio{background:var(--vela-secondary-soft);color:var(--vela-audio)}
.vdlrow-icon svg{width:17px;height:17px}
.vdlrow-body{flex:1;min-width:0}
.vdlrow-name{font:var(--type-sm);color:var(--vela-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px}
.vdlrow-meta{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.vdlrow-size{font-family:var(--font-mono);font-size:11px;color:var(--vela-text-3);font-variant-numeric:tabular-nums}
.vdlrow-status{font:var(--type-xs);color:var(--vela-text-3)}
.vdlrow-status.st-done{color:var(--vela-success)}
.vdlrow-status.st-error{color:var(--vela-danger)}
.vdlrow-status.st-downloading{color:var(--teal-400)}
.vdlrow-track{width:100%;height:3px;background:var(--vela-surface-3);border-radius:var(--radius-full);overflow:hidden}
.vdlrow-fill{height:100%;border-radius:var(--radius-full);transition:width 400ms ease-out;position:relative}
.vdlrow-fill.fv{background:var(--vela-gradient)}
.vdlrow-fill.fa{background:var(--vela-secondary)}
.vdlrow-fill.fd{background:var(--vela-success)}
.vdlrow-fill.fe{background:var(--vela-danger)}
.vdlrow-fill.fq{background:var(--vela-surface-3);overflow:hidden}
.vdlrow-fill.fq::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,var(--vela-primary),transparent);animation:vela-dl-sweep 1.4s ease-in-out infinite}
.vdlrow-actions{display:flex;gap:3px;flex-shrink:0}
.vdlrow-btn{width:28px;height:28px;border-radius:var(--radius-sm);border:none;background:transparent;color:var(--vela-text-3);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 100ms,color 100ms}
.vdlrow-btn:hover{background:var(--vela-surface-3);color:var(--vela-text)}
.vdlrow-btn.vdlb-danger:hover{background:var(--vela-danger-soft);color:var(--vela-danger)}
.vdlrow-btn svg{width:14px;height:14px}
  `;
  document.head.appendChild(s);
})();

const IFolder=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
const IRetry=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>;
const ITrash=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
const IVid=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>;
const IAud=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>;

export function DownloadRow({filename='Untitled',format='video',status='queued',progress=0,filesize,speed,onRemove,onRetry,onOpenFolder}){
  const pct=Math.min(100,Math.max(0,progress));
  const statusLabel={queued:'In queue',downloading:speed?speed+' /s':(pct+'%'),done:'Complete',error:'Failed — click retry'}[status]||status;
  const fillCls={video:'fv',audio:'fa',done:'fd',error:'fe',queued:'fq'}[status==='done'?'done':status==='error'?'error':status==='queued'?'queued':format]||'fv';
  return(
    <div className="vdlrow">
      <div className={`vdlrow-icon vdli-${format}`}>{format==='audio'?<IAud/>:<IVid/>}</div>
      <div className="vdlrow-body">
        <div className="vdlrow-name" title={filename}>{filename}</div>
        <div className="vdlrow-meta">
          {filesize&&<span className="vdlrow-size">{filesize}</span>}
          <span className={`vdlrow-status st-${status}`}>{statusLabel}</span>
        </div>
        <div className="vdlrow-track">
          <div className={`vdlrow-fill ${fillCls}`} style={status==='queued'?{width:'100%'}:{width:(status==='done'?100:pct)+'%'}}/>
        </div>
      </div>
      <div className="vdlrow-actions">
        {status==='error'&&onRetry&&<button className="vdlrow-btn" onClick={onRetry} title="Retry"><IRetry/></button>}
        {status==='done'&&onOpenFolder&&<button className="vdlrow-btn" onClick={onOpenFolder} title="Open folder"><IFolder/></button>}
        <button className="vdlrow-btn vdlb-danger" onClick={onRemove} title="Remove"><ITrash/></button>
      </div>
    </div>
  );
}
