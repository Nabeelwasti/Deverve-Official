import { useEffect, useState } from "react";

interface DeferredInstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let capturedInstallPrompt: DeferredInstallPrompt | null = null;
const installPromptSubscribers = new Set<(event: DeferredInstallPrompt) => void>();

// Capture the one-shot browser event before React mounts, so slow devices and
// browsers that dispatch it early do not lose the native installation prompt.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event: Event) => {
    event.preventDefault();
    capturedInstallPrompt = event as DeferredInstallPrompt;
    installPromptSubscribers.forEach((subscriber) => subscriber(capturedInstallPrompt!));
  });
  window.addEventListener("appinstalled", () => { capturedInstallPrompt = null; });
}

type BrowserFamily = "ios" | "chrome-android" | "samsung" | "edge-android" | "firefox-android" | "android-other" | "safari-mac" | "chrome-desktop" | "edge-desktop" | "brave" | "firefox-desktop" | "opera" | "other";

function detectBrowser(): BrowserFamily {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return "ios";
  if (/android/i.test(ua)) {
    if (/edg\//i.test(ua)) return "edge-android";
    if (/samsungbrowser/i.test(ua)) return "samsung";
    if (/firefox|fxios/i.test(ua)) return "firefox-android";
    if (/chrome|crios/i.test(ua) && !/edg\//i.test(ua)) return "chrome-android";
    return "android-other";
  }
  if (/macintosh|mac os x/i.test(ua) && /safari/i.test(ua) && !/chrome|chromium|crios|edg|opr/i.test(ua)) return "safari-mac";
  if (/brave/i.test(ua)) return "brave";
  if (/edg\//i.test(ua)) return "edge-desktop";
  if (/opr\//i.test(ua)) return "opera";
  if (/firefox|fxios/i.test(ua)) return "firefox-desktop";
  if (/chrome|chromium/i.test(ua)) return "chrome-desktop";
  return "other";
}

const installGuides: Record<BrowserFamily, { title: string; steps: string[]; note: string }> = {
  ios: {
    title: "Add De VERVE to your iPhone or iPad",
    steps: ["Open this page in Safari.", "Tap the Share button (the square with the upward arrow).", "Choose “Add to Home Screen”. If it is not visible, scroll the share actions and choose “Edit Actions”.", "Keep the name “De VERVE” and tap “Add”."],
    note: "iOS requires you to confirm this from the Share menu. A website cannot open that system sheet automatically."
  },
  "chrome-android": {
    title: "Install De VERVE on Android",
    steps: ["Open De VERVE in Chrome.", "Tap the three-dot menu in the top-right corner.", "Choose “Install app” or “Add to Home screen”.", "Review the confirmation and tap “Install” or “Add”."],
    note: "If Chrome does not show the install option yet, update Chrome, reload this page and try again after the site has finished loading."
  },
  samsung: {
    title: "Add De VERVE with Samsung Internet",
    steps: ["Open De VERVE in Samsung Internet.", "Tap the menu button (☰).", "Choose “Add page to” and then “Home screen” (wording can vary by version).", "Confirm the name and tap “Add”."],
    note: "Samsung Internet may offer Add to Home screen instead of a separate Install app prompt."
  },
  "edge-android": {
    title: "Add De VERVE with Microsoft Edge",
    steps: ["Open De VERVE in Edge.", "Tap the menu button (⋯).", "Choose “Add to phone” or “Add to Home screen”.", "Confirm the shortcut or installation."],
    note: "The exact label depends on your Edge version and device."
  },
  "firefox-android": {
    title: "Add De VERVE with Firefox",
    steps: ["Open De VERVE in Firefox.", "Tap the three-dot menu.", "Choose “Install” or “Add to Home screen” if shown.", "Confirm the action on your device."],
    note: "Firefox versions and Android devices expose different install options. If the option is absent, use Chrome or Samsung Internet for the app-style installation."
  },
  "android-other": {
    title: "Add De VERVE to your Android home screen",
    steps: ["Open the browser menu (usually ⋮ or ☰).", "Look for “Install app”, “Add to Home screen” or “Add page to”.", "Choose the option and confirm."],
    note: "Some browsers only create a home-screen shortcut. That is still a convenient way to open De VERVE."
  },
  "safari-mac": {
    title: "Add De VERVE to your Mac",
    steps: ["Open this page in Safari.", "From the macOS menu bar, choose File.", "Choose “Add to Dock” (available on supported recent macOS versions).", "Confirm the app name and click Add."],
    note: "On older macOS versions, use Bookmarks → Add Bookmark if Add to Dock is unavailable."
  },
  "chrome-desktop": {
    title: "Install De VERVE in Chrome",
    steps: ["Open De VERVE in Chrome.", "Look for the Install icon at the right side of the address bar, or open the three-dot menu.", "Choose “Cast, save and share” → “Install page as app” (menu wording may vary).", "Confirm by clicking Install."],
    note: "If Chrome does not offer installation, update Chrome and reload the site. You can still bookmark this page."
  },
  "edge-desktop": {
    title: "Install De VERVE in Microsoft Edge",
    steps: ["Open De VERVE in Edge.", "Open the Settings and more menu (⋯).", "Choose “Apps” → “Install this site as an app”.", "Confirm the app name and click Install."],
    note: "You may also see an install icon in the address bar when Edge recognises the site as installable."
  },
  brave: {
    title: "Install De VERVE in Brave",
    steps: ["Open De VERVE in Brave.", "Open the main menu.", "Look under “Save and share” or “More tools” for “Install page as app”.", "Confirm the installation if the option is available."],
    note: "Brave menu labels vary by release. If no install option appears, use the browser's Add to Home screen or bookmark option."
  },
  "firefox-desktop": {
    title: "Open De VERVE as an app",
    steps: ["Firefox desktop does not currently provide the same built-in PWA installation flow as Chrome or Edge.", "You can bookmark De VERVE with Ctrl+D (Windows/Linux) or Command+D (Mac).", "For an app window, open the same address in Chrome or Edge and use its Install option."],
    note: "This is a browser limitation, not a problem with your De VERVE account."
  },
  opera: {
    title: "Install or save De VERVE in Opera",
    steps: ["Open De VERVE in Opera.", "Open the browser menu.", "Look for “Install app” or “Create shortcut” if available.", "If the option is not shown, bookmark the page for quick access."],
    note: "Installation options vary between Opera desktop, Opera Android and browser versions."
  },
  other: {
    title: "Save De VERVE for quick access",
    steps: ["Open your browser menu.", "Look for “Install app”, “Add to Home screen”, “Add to Dock” or “Create shortcut”.", "Choose the option shown by your browser and confirm.", "If your browser does not offer an app option, bookmark this page."],
    note: "Not every browser supports web-app installation. The website remains available in the browser either way."
  }
};

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<DeferredInstallPrompt | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [browser, setBrowser] = useState<BrowserFamily>("other");
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const mode = window.matchMedia("(display-mode: standalone)");
    const updateInstalled = () => setInstalled(mode.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    const onPrompt = (event: DeferredInstallPrompt) => setInstallEvent(event);
    const onInstalled = () => { setInstalled(true); setInstallEvent(null); setHelpOpen(false); };
    setBrowser(detectBrowser());
    updateInstalled();
    if (capturedInstallPrompt) setInstallEvent(capturedInstallPrompt);
    installPromptSubscribers.add(onPrompt);
    mode.addEventListener?.("change", updateInstalled);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      installPromptSubscribers.delete(onPrompt);
      mode.removeEventListener?.("change", updateInstalled);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const guide = installGuides[browser];
  const install = async () => {
    if (!installEvent) { setHelpOpen(true); return; }
    const current = installEvent;
    setInstalling(true);
    try {
      await current.prompt();
      const choice = await current.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      else setHelpOpen(true);
    } catch {
      setHelpOpen(true);
    } finally {
      setInstallEvent(null);
      capturedInstallPrompt = null;
      setInstalling(false);
    }
  };

  if (installed) return null;
  return <>
    <button type="button" className="install-app" aria-label="Install De VERVE app" title="Install De VERVE" onClick={() => void install()} disabled={installing}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
      <span>{installing ? "Opening…" : "Install"}</span>
    </button>
    {helpOpen && <div className="install-help-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setHelpOpen(false); }}>
      <section className="install-help-panel" role="dialog" aria-modal="true" aria-labelledby="install-help-title">
        <div className="install-help-heading"><div><p className="eyebrow">DE VERVE · APP EXPERIENCE</p><h2 id="install-help-title">{guide.title}</h2></div><button type="button" className="install-help-close" aria-label="Close installation guide" onClick={() => setHelpOpen(false)}>×</button></div>
        <ol className="install-help-steps">{guide.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
        <p className="install-help-note">{guide.note}</p>
        <button type="button" className="install-help-done" onClick={() => setHelpOpen(false)}>Got it</button>
      </section>
    </div>}
  </>;
}
