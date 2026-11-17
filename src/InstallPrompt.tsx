import { useEffect, useRef, useState } from "react";
interface DeferredInstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>; }
export default function InstallPrompt() {
 const [installEvent,setInstallEvent]=useState<DeferredInstallPrompt|null>(null);
 const [helpOpen,setHelpOpen]=useState(false);
 const [installed,setInstalled]=useState(false);
 const [position,setPosition]=useState<{x:number;y:number}|null>(null);
 const drag=useRef<{pointerId:number;startX:number;startY:number;left:number;top:number;moved:boolean}|null>(null);
 const suppressClick=useRef(false);
 useEffect(()=>{
  try{const saved=JSON.parse(localStorage.getItem("deverve-install-position")||"null") as {x?:number;y?:number}|null;if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y))setPosition({x:Math.max(8,Math.min(window.innerWidth-56,saved.x!)),y:Math.max(8,Math.min(window.innerHeight-56,saved.y!))});}catch{}
  const displayMode=window.matchMedia("(display-mode: standalone)");
  const updateInstalled=()=>setInstalled(displayMode.matches||(navigator as Navigator&{standalone?:boolean}).standalone===true);
  updateInstalled();displayMode.addEventListener?.("change",updateInstalled);
  const before=(event:Event)=>{event.preventDefault();setInstallEvent(event as DeferredInstallPrompt);};
  const installedHandler=()=>{setInstalled(true);setInstallEvent(null);setHelpOpen(false);};
  window.addEventListener("beforeinstallprompt",before);window.addEventListener("appinstalled",installedHandler);
  return()=>{displayMode.removeEventListener?.("change",updateInstalled);window.removeEventListener("beforeinstallprompt",before);window.removeEventListener("appinstalled",installedHandler);};
 },[]);
 const userAgent=typeof navigator==="undefined"?"":navigator.userAgent;
 const isIOS=/iphone|ipad|ipod/i.test(userAgent)||(typeof navigator!=="undefined"&&navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
 const isAndroid=/android/i.test(userAgent);
 const install=async()=>{
  if(suppressClick.current){suppressClick.current=false;return;}
  if(!installEvent){setHelpOpen(true);return;}
  const current=installEvent;setInstallEvent(null);
  try{await current.prompt();const choice=await current.userChoice;if(choice.outcome==="accepted")setInstalled(true);else setHelpOpen(true);}
  catch{setHelpOpen(true);}
 };
 if(installed)return null;
 return <>
  <button type="button" className="install-app" aria-label="Install or add De VERVE to your home screen" title="Install De VERVE app" style={position?{left:position.x,top:position.y,right:"auto",bottom:"auto"}:undefined}
   onPointerDown={event=>{suppressClick.current=false;if(event.button!==0)return;event.currentTarget.setPointerCapture(event.pointerId);const r=event.currentTarget.getBoundingClientRect();drag.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,left:r.left,top:r.top,moved:false};}}
   onPointerMove={event=>{const d=drag.current;if(!d||d.pointerId!==event.pointerId)return;const dx=event.clientX-d.startX,dy=event.clientY-d.startY;if(Math.abs(dx)+Math.abs(dy)>7)d.moved=true;if(d.moved)setPosition({x:Math.max(8,Math.min(window.innerWidth-56,d.left+dx)),y:Math.max(8,Math.min(window.innerHeight-56,d.top+dy))});}}
   onPointerUp={event=>{const d=drag.current;if(!d||d.pointerId!==event.pointerId)return;drag.current=null;if(d.moved){suppressClick.current=true;const rect=event.currentTarget.getBoundingClientRect();const next={x:Math.max(8,Math.min(window.innerWidth-56,rect.left)),y:Math.max(8,Math.min(window.innerHeight-56,rect.top))};setPosition(next);try{localStorage.setItem("deverve-install-position",JSON.stringify(next));}catch{}}}}
   onPointerCancel={()=>{drag.current=null;}} onClick={()=>void install()}>
   <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
  </button>
  {helpOpen&&<div className="install-help-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setHelpOpen(false);}}>
   <section className="install-help-panel" role="dialog" aria-modal="true" aria-labelledby="install-help-title">
    <div className="install-help-heading"><div><p className="eyebrow">DE VERVE · APP EXPERIENCE</p><h2 id="install-help-title">Add De VERVE to your device</h2></div><button type="button" className="install-help-close" aria-label="Close install instructions" onClick={()=>setHelpOpen(false)}>×</button></div>
    {isIOS?<><p>On iPhone or iPad, open this website in Safari, tap the Share icon, then choose <strong>Add to Home Screen</strong>.</p><ol><li>Open De VERVE in Safari.</li><li>Tap Share (the square with the upward arrow).</li><li>Choose “Add to Home Screen”, then tap Add.</li></ol></>:isAndroid?<><p>Install De VERVE from your browser menu.</p><ol><li>Open this website in Chrome or another supported browser.</li><li>Tap the browser menu (⋮).</li><li>Choose “Install app” or “Add to Home screen”.</li></ol></>:<><p>Install De VERVE from your desktop browser.</p><ol><li>Open this website in Chrome or Edge.</li><li>Use the install icon in the address bar, or open the browser menu.</li><li>Choose “Install De VERVE”.</li></ol></>}
    <p className="install-help-note">If the install option is not shown, update your browser and open the website over its secure HTTPS address.</p>
    <button type="button" className="install-help-done" onClick={()=>setHelpOpen(false)}>Got it</button>
   </section>
  </div>}
 </>;
}
