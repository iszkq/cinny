import React, { useEffect, useRef, useState } from 'react';
import { useNativeBack } from '../../hooks/useNativeBack';
export function NativePrivateMenu({onSettings,onLock}: {onSettings:()=>void;onLock:()=>void}) {
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  useNativeBack(ref,()=>setOpen(false),open);
  useEffect(()=>{
    if(!open)return undefined;
    const close=(event:PointerEvent)=>{if(event.target instanceof Node && !ref.current?.contains(event.target))setOpen(false);};
    document.addEventListener('pointerdown',close,true);
    return ()=>document.removeEventListener('pointerdown',close,true);
  },[open]);
  return <div ref={ref} className="native-private-menu">
    <button type="button" className="native-more-button" aria-label="更多选项" aria-expanded={open} aria-haspopup="menu" onClick={()=>setOpen(!open)}>•••</button>
    {open && <div className="native-private-menu-panel" role="menu" aria-label="应用选项">
      {document.documentElement.dataset.nativeSettingsReady === 'true' && <button role="menuitem" type="button" onClick={()=>{setOpen(false);window.dispatchEvent(new Event('calculator-open-settings'));}}>设置</button>}
      <button role="menuitem" type="button" onClick={()=>{setOpen(false);onSettings();}}>隐私设置</button>
      <button role="menuitem" type="button" onClick={()=>{setOpen(false);onLock();}}>立即锁定</button>
    </div>}
  </div>;
}
