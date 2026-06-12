import React from 'react';

(function(){
  const id='vela-pb-css';
  if(document.getElementById(id))return;
  const s=document.createElement('style');s.id=id;
  s.textContent=`
@keyframes vela-pb-ind{from{transform:translateX(-100%) scaleX(.6)}to{transform:translateX(280%) scaleX(.6)}}
.vpb-wrap{display:flex;flex-direction:column;gap:5px}
.vpb-header{display:flex;justify-content:space-between;align-items:center}
.vpb-label{font:var(--type-sm);color:var(--vela-text-2)}
.vpb-val{font:var(--type-data);color:var(--vela-text-3);font-variant-numeric:tabular-nums;font-size:11px}
.vpb-track{width:100%;background:var(--vela-surface-3);border-radius:var(--radius-full);overflow:hidden}
.vpb-track.vpb-xs{height:3px}
.vpb-track.vpb-sm{height:4px}
.vpb-track.vpb-md{height:6px}
.vpb-track.vpb-lg{height:8px}
.vpb-fill{height:100%;border-radius:var(--radius-full);transition:width 350ms ease-out}
.vpb-fill.vpb-primary{background:var(--vela-primary);box-shadow:0 0 8px oklch(0.72 .12 195/.35)}
.vpb-fill.vpb-secondary{background:var(--vela-secondary);box-shadow:0 0 8px oklch(0.66 .14 275/.35)}
.vpb-fill.vpb-gradient{background:var(--vela-gradient);box-shadow:0 0 10px oklch(0.72 .12 195/.3)}
.vpb-fill.vpb-success{background:var(--vela-success)}
.vpb-fill.vpb-danger{background:var(--vela-danger)}
.vpb-fill.vpb-ind{width:40%!important;animation:vela-pb-ind 1.3s ease-in-out infinite}
  `;
  document.head.appendChild(s);
})();

export function ProgressBar({value=0,label,showValue=false,size='sm',color='primary',indeterminate=false}){
  const pct=Math.min(100,Math.max(0,value));
  return(
    <div className="vpb-wrap">
      {(label||showValue)&&(
        <div className="vpb-header">
          {label&&<span className="vpb-label">{label}</span>}
          {showValue&&!indeterminate&&<span className="vpb-val">{pct}%</span>}
        </div>
      )}
      <div className={'vpb-track vpb-'+size} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={['vpb-fill','vpb-'+color,indeterminate?'vpb-ind':''].filter(Boolean).join(' ')}
          style={indeterminate?{}:{width:pct+'%'}}/>
      </div>
    </div>
  );
}
