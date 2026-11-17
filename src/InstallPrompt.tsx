import { useEffect, useRef, useState } from "react";
interface DeferredInstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>; }
export default function InstallPrompt() {
 const [installEvent,setInstallEvent]=useState<DeferredInstallPrompt|null>(null);
 const [position,setPosition]=useState<{x:number;y:number}|null>(null);
 const drag=useRef<{pointerId:number;startX:number;startY:number;left:number;top:number;moved:boolean}|null>(null);
 const suppressClick=useRef(false);
 useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem("deverve-install-position")||"null") as {x?:number;y?:number}|null;if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y))setPosition({x:Math.max(8,Math.min(window.innerWidth-56,saved.x!)),y:Math.max(8,Math.min(window.innerHeight-56,saved.y!))});}catch{}
  const before=(event:Event)=>{event.preventDefault();setInstallEvent(event as DeferredInstallPrompt);};
  const installed=()=>setInstallEvent(null);
  window.addEventListener("beforeinstallprompt",before);window.addEventListener("appinstalled",installed);
  return()=>{window.removeEventListener("beforeinstallprompt",before);window.removeEventListener("appinstalled",installed);};
 },[]);
 const install=async()=>{if(suppressClick.current){suppressClick.current=false;return;}if(!installEvent)return;const current=installEvent;setInstallEvent(null);try{await current.prompt();await current.userChoice;}catch{/* Browser controls installation and its confirmation. */}};
 if(!installEvent)return null;
 return <button type="button" className="install-app" aria-label="Install De VERVE app" title="Install De VERVE" style={position?{left:position.x,top:position.y,right:"auto",bottom:"auto"}:undefined}
  onPointerDown={event=>{if(event.button!==0)return;event.currentTarget.setPointerCapture(event.pointerId);const r=event.currentTarget.getBoundingClientRect();drag.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,left:r.left,top:r.top,moved:false};}}
  onPointerMove={event=>{const d=drag.current;if(!d||d.pointerId!==event.pointerId)return;const dx=event.clientX-d.startX,dy=event.clientY-d.startY;if(Math.abs(dx)+Math.abs(dy)>7)d.moved=true;if(d.moved)setPosition({x:Math.max(8,Math.min(window.innerWidth-56,d.left+dx)),y:Math.max(8,Math.min(window.innerHeight-56,d.top+dy))});}}
  onPointerUp={event=>{const d=drag.current;if(!d||d.pointerId!==event.pointerId)return;drag.current=null;if(d.moved){suppressClick.current=true;setPosition(p=>{if(p)localStorage.setItem("deverve-install-position",JSON.stringify(p));return p;});}}}
  onPointerCancel={()=>{drag.current=null;}} onClick={()=>void install()}>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
 </button>;
}
