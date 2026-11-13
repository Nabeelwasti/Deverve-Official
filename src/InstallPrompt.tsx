import { useEffect, useState } from "react";

interface DeferredInstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<DeferredInstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
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
    <aside className="install-app" aria-label="Install De VERVE app">
      <div className="install-app-copy">
        <strong>Take De VERVE with you.</strong>
        <span>Install our app for a quick, app-like experience.</span>
        {helpOpen && <p>Android: open your browser menu and choose “Install app” or “Add to Home screen”. iPhone: tap Share, then “Add to Home Screen”.</p>}
      </div>
      <button type="button" onClick={() => void install()}>{installEvent ? "Install app ↓" : "How to install ↗"}</button>
    </aside>
  );
}
