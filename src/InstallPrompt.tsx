import { useEffect, useRef, useState } from "react";

interface DeferredInstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<DeferredInstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [position,setPosition]=useState<{x:number;y:number}|null>(null);
  const drag=useRef<{pointerId:number;startX:number;startY:number;left:number;top:number}|null>(null);

  useEffect(() => {
    try{const saved=JSON.parse(localStorage.getItem("deverve-install-position")||"null") as {x?:number;y?:number}|null;if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y))setPosition({x:Math.max(8,Math.min(window.innerWidth-280,saved.x!)),y:Math.max(8,Math.min(window.innerHeight-130,saved.y!))});}catch{}
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setInstalled(standalone);
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as DeferredInstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
      setHelpOpen(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const install = async () => {
    if (!installEvent) {
      setHelpOpen((open) => !open);
      return;
    }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallEvent(null);
  };

  return (
    <aside className="install-app" aria-label="Install De VERVE app" style={position?{left:position.x,top:position.y,right:"auto",bottom:"auto"}:undefined}>
      <button type="button" className="install-app-drag" aria-label="Move install prompt" title="Drag to move" onPointerDown={event=>{if(event.button!==0)return;event.currentTarget.setPointerCapture(event.pointerId);const rect=event.currentTarget.parentElement!.getBoundingClientRect();drag.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,left:rect.left,top:rect.top};}} onPointerMove={event=>{const active=drag.current;if(!active||active.pointerId!==event.pointerId)return;const x=Math.max(8,Math.min(window.innerWidth-270,active.left+event.clientX-active.startX));const y=Math.max(8,Math.min(window.innerHeight-120,active.top+event.clientY-active.startY));setPosition({x,y});}} onPointerUp={event=>{if(drag.current?.pointerId!==event.pointerId)return;drag.current=null;setPosition(current=>{if(current)localStorage.setItem("deverve-install-position",JSON.stringify(current));return current;});}} onPointerCancel={()=>{drag.current=null;}}>⠿ Move</button>
      <div className="install-app-copy">
        <strong>Take De VERVE with you.</strong>
        <span>Install our app for a quick, app-like experience.</span>
        {helpOpen && <p>Android: open your browser menu and choose “Install app” or “Add to Home screen”. iPhone: tap Share, then “Add to Home Screen”.</p>}
      </div>
      <button type="button" onClick={() => void install()}>{installEvent ? "Install app ↓" : "How to install ↗"}</button>
    </aside>
  );
}
