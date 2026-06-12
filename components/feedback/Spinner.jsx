import React from 'react';

(function(){
  const id='vela-spin-css';
  if(document.getElementById(id))return;
  const s=document.createElement('style');s.id=id;
  s.textContent=`
@keyframes vela-spin{to{transform:rotate(360deg)}}
.vspin{display:inline-flex;align-items:center;justify-content:center;animation:vela-spin .72s linear infinite;flex-shrink:0}
.vspin.vspin-xs svg{width:12px;height:12px}
.vspin.vspin-sm svg{width:16px;height:16px}
.vspin.vspin-md svg{width:22px;height:22px}
.vspin.vspin-lg svg{width:32px;height:32px}
.vspin.vspin-primary{color:var(--vela-primary)}
.vspin.vspin-secondary{color:var(--vela-secondary)}
.vspin.vspin-muted{color:var(--vela-text-3)}
.vspin.vspin-white{color:#fff}
  `;
  document.head.appendChild(s);
})();

export function Spinner({size='md',color='primary'}){
  const r=9,c=2*Math.PI*r;
  return(
    <span className={['vspin','vspin-'+size,'vspin-'+color].join(' ')} role="status" aria-label="Loading">
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r={r} stroke="currentColor" strokeOpacity=".2" strokeWidth="2.5"/>
        <circle cx="12" cy="12" r={r} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c*.75}/>
      </svg>
    </span>
  );
}
