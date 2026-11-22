import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import InstallPrompt from "./InstallPrompt";
import AIChatWidget from "./AIChatWidget";
import BrandHead from "./BrandHead";
import BrandLogo from "./BrandLogo";
import Policies from "./Policies";
const Admin = lazy(() => import("./Admin"));
const WholesaleQuote = lazy(() => import("./WholesaleQuote"));
const DeliveryFeeApproval = lazy(() => import("./DeliveryFeeApproval"));
const CustomerAccount = lazy(() => import("./CustomerAccount"));
const PublicPage = lazy(() => import("./PublicPage"));
const ProductPage = lazy(() => import("./ProductPage"));
const NotFound = lazy(() => import("./NotFound"));
import ProductGallery from "./ProductGallery";
import ProductVariantPicker from "./ProductVariantPicker";
import FormDraftPersistence from "./FormDraftPersistence";

const categories = [
  { id: "men", name: "Men's fashion", detail: "Everyday essentials, layers and relaxed fits", tag: "01", tone: "men" },
  { id: "women", name: "Women's fashion", detail: "Comfort-led looks for every day", tag: "02", tone: "women" },
  { id: "kids", name: "Kids' fashion", detail: "Easy styles for little personalities", tag: "03", tone: "kids" },
  { id: "essentials", name: "Everyday essentials", detail: "T-shirts, socks, boxers and more", tag: "04", tone: "essentials" },
  { id: "layers", name: "Hoodies & jackets", detail: "Sweatshirts, zippers and outer layers", tag: "05", tone: "layers" },
  { id: "bottoms", name: "Trousers & pants", detail: "Relaxed comfort, made for movement", tag: "06", tone: "bottoms" },
];

const phone = "923197553705";
const whatsapp = (message: string) => `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
const localDateTime = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
};
const pakistanDateTimeMs = (value: string) => Date.parse(value + "+05:00");
const APP_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
function readAppDraft<T extends object>(key: string, fallback: T): T {
  try {
    const storageKey = "deverve:app-draft:v1:" + key;
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as { savedAt?: number; data?: Partial<T> };
    if (!saved || typeof saved.savedAt !== "number" || Date.now() - saved.savedAt > APP_DRAFT_TTL_MS || !saved.data || typeof saved.data !== "object") {
      sessionStorage.removeItem(storageKey);
      return fallback;
    }
    return { ...fallback, ...saved.data };
  } catch { return fallback; }
}
function writeAppDraft(key: string, data: object): void {
  try { sessionStorage.setItem("deverve:app-draft:v1:" + key, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* Storage must never interrupt customer workflows. */ }
}
function clearAppDraft(key: string): void {
  try { sessionStorage.removeItem("deverve:app-draft:v1:" + key); } catch { /* Storage may be unavailable. */ }
}
function clearFormDraft(key: string): void {
  try { sessionStorage.removeItem("deverve:form-draft:v1:" + window.location.pathname + ":" + key); } catch { /* Storage may be unavailable. */ }
}

type StoreVariant = { id: string; sku: string | null; size: string; color: string; available_quantity: number };
type StoreProductMedia = { id: string; media_type: "image" | "video"; mime_type: string; alt_text: string; caption: string; is_primary: number; color?: string; url: string };
type StoreProduct = { id: string; slug: string; name: string; description: string; category: string; audience: string; retail_price_paisa: number | null; image_key: string | null; seo_title: string; seo_description: string; variants: StoreVariant[]; media: StoreProductMedia[] };
type StoreVehicle = { id: string; name: string; vehicle_type: string; transmission: string; seats: number; fuel_type: string; daily_rate_paisa: number | null; with_driver_daily_rate_paisa?: number | null; image_key: string | null; image_url: string | null; description: string; media?: Array<{id:string;url:string;alt_text:string;position:number;is_primary:number}> };
type CartLine = { variant_id: string; product_id: string; name: string; sku: string | null; size: string; color: string; quantity: number; unit_price_paisa: number; available_quantity: number; image_url?: string };

function splitProductOptions(value: string) { return [...new Set(value.split(/[,;|\n]+/).map(item => item.trim()).filter(Boolean))]; }
function matchesStoreCollection(product: StoreProduct, selected: string): boolean {
  const key = selected.trim().toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const audience = String(product.audience || "").trim().toLowerCase();
  const category = String(product.category || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  if (!key || ["all", "all products", "featured", "general"].includes(key)) return true;
  if (["men", "mens", "mens fashion", "male"].includes(key)) return audience === "men" || audience === "unisex";
  if (["women", "womens", "womens fashion", "ladies", "female"].includes(key)) return audience === "women" || audience === "unisex";
  if (["kids", "kids fashion", "children", "childrens", "boys", "girls"].includes(key)) return audience === "kids";
  const groups: Record<string, string[]> = {
    essentials: ["essential", "t shirt", "tshirt", "tee", "sock", "boxer", "underwear", "vest"],
    layers: ["hoodie", "jacket", "sweatshirt", "zipper", "zip up", "outerwear", "coat"],
    bottoms: ["trouser", "pant", "jean", "jogger", "short"],
  };
  const terms = groups[key];
  if (terms) return terms.some(term => category.includes(term));
  return category === key || category.includes(key) || key.includes(category);
}
function productGalleryImages(product: StoreProduct, selectedVariantId?: string, selectedColor?: string) {
  const selected = product.variants.find((variant) => variant.id === selectedVariantId && variant.available_quantity > 0)
    || product.variants.find((variant) => variant.available_quantity > 0)
    || product.variants.find((variant) => variant.id === selectedVariantId);
  const colour = (selectedColor || splitProductOptions(selected?.color || "")[0] || "").trim().toLowerCase();
  const imageMedia = product.media.filter((item) => item.media_type === "image");
  const toImages = (items: StoreProductMedia[]) => items.map((item) => ({ id: item.id, url: item.url, alt_text: item.alt_text || product.name }));
  if (colour) {
    const colourSpecific = imageMedia.filter((item) => item.color?.trim().toLowerCase() === colour);
    if (colourSpecific.length) return toImages(colourSpecific);
    const uncoloured = imageMedia.filter((item) => !item.color?.trim());
    if (uncoloured.length) return toImages(uncoloured);
    const primary = imageMedia.filter((item) => item.is_primary === 1);
    if (primary.length) return primary.map((item) => ({ id: item.id, url: item.url, alt_text: (item.alt_text || product.name) + " — representative image; photos for the selected colour are not available yet" }));
    if (imageMedia.length) return [{ id: imageMedia[0].id, url: imageMedia[0].url, alt_text: (imageMedia[0].alt_text || product.name) + " — representative image; photos for the selected colour are not available yet" }];
  }
  if (imageMedia.length) return toImages(imageMedia);
  return product.image_key ? [{ id: "cover", url: "/media/" + product.image_key, alt_text: product.name }] : [];
}

const cartIdentity = (item: Pick<CartLine,"product_id"|"size"|"color">) => [item.product_id,item.size.trim().toLowerCase(),item.color.trim().toLowerCase()].join("::");

function readStoredCart(): CartLine[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem("deverve-cart") || "[]");
    if (!Array.isArray(value)) return [];
    const valid = value.filter((item): item is CartLine => Boolean(item && typeof item === "object"
      && typeof item.variant_id === "string" && /^[a-f0-9-]{36}$/i.test(item.variant_id)
      && typeof item.product_id === "string" && typeof item.name === "string"
      && (item.sku === null || typeof item.sku === "string")
      && typeof item.size === "string" && typeof item.color === "string"
      && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 10
      && Number.isSafeInteger(item.unit_price_paisa) && item.unit_price_paisa >= 0
      && Number.isInteger(item.available_quantity) && item.available_quantity > 0));
    const merged = new Map<string, CartLine>();
    for (const item of valid) {
      const key = cartIdentity(item);
      const previous = merged.get(key);
      merged.set(key, previous ? { ...previous, quantity: Math.min(10, item.available_quantity, previous.quantity + item.quantity) } : item);
    }
    return [...merged.values()].slice(0, 20);
  } catch { return []; }
}

const socialGlyphs: Record<string, string> = { facebook: "f", instagram: "◎", tiktok: "♪", youtube: "▶", linkedin: "in", pinterest: "p", threads: "@", x: "𝕏" };

type TurnstileApi = {
  render: (container: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": (errorCode?: string) => void; "timeout-callback"?: () => void; "unsupported-callback"?: () => void; theme?: "light" | "dark" | "auto"; size?: "normal" | "flexible" | "compact"; appearance?: "always" | "execute" | "interaction-only" }) => string;
  reset: (widgetId: string) => void;
  remove?: (widgetId: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}
const TURNSTILE_SITEKEY = "0x4AAAAAAGBpVe5Z1cq2CvB5";
let turnstileScriptPromise: Promise<void> | null = null;
function ensureTurnstileLoaded(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      const timeout = window.setTimeout(() => { turnstileScriptPromise = null; script.remove(); reject(new Error("Cloudflare security verification timed out while loading. Check your connection or browser content blockers, then retry.")); }, 12000);
      script.onload = () => { window.clearTimeout(timeout); if (window.turnstile) resolve(); else { turnstileScriptPromise = null; reject(new Error("Cloudflare loaded without its verification API. Please retry.")); } };
      script.onerror = () => { window.clearTimeout(timeout); turnstileScriptPromise = null; script.remove(); reject(new Error("Cloudflare security verification was blocked or could not load. Check your connection, browser content blockers and site access, then retry.")); };
      document.head.appendChild(script);
    });
  }
  return turnstileScriptPromise;
}
function TurnstileWidget({ resetKey, onToken }: { resetKey: number; onToken: (token: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const tokenCallback = useRef(onToken);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "verified" | "error">("loading");
  const [detail, setDetail] = useState("Preparing Cloudflare security verification…");
  tokenCallback.current = onToken;
  useEffect(() => {
    let active = true;
    let widgetState: "loading" | "ready" | "verified" | "error" = "loading";
    let observer: MutationObserver | null = null;
    let renderTimeout: number | null = null;
    const update = (next: typeof widgetState, message: string) => {
      if (!active) return;
      widgetState = next;
      if (next !== "loading") {
        if (renderTimeout !== null) { window.clearTimeout(renderTimeout); renderTimeout = null; }
        observer?.disconnect(); observer = null;
      }
      setStatus(next); setDetail(message);
    };
    setStatus("loading"); setDetail("Loading Cloudflare security verification…"); tokenCallback.current("");
    if (host.current) host.current.replaceChildren();
    void ensureTurnstileLoaded().then(() => {
      if (!active || !host.current || !window.turnstile) throw new Error("Cloudflare verification API is unavailable after loading.");
      const container = host.current;
      const id = window.turnstile.render(container, {
        sitekey: TURNSTILE_SITEKEY, theme: "light", size: "flexible", appearance: "always",
        callback: (token) => { update("verified", "Security check complete. Your request can now be submitted."); tokenCallback.current(token); },
        "expired-callback": () => { update("ready", "Your security check expired. Complete it again to continue."); tokenCallback.current(""); },
        "error-callback": (code) => { update("error", code ? "Cloudflare verification error (" + code + "). Retry the check or contact us if it continues." : "Cloudflare could not complete the security check. Check your connection or browser settings, then retry."); tokenCallback.current(""); },
        "timeout-callback": () => { update("error", "Cloudflare verification timed out. Please retry the security check."); tokenCallback.current(""); },
        "unsupported-callback": () => { update("error", "This browser cannot run Cloudflare security verification. Update your browser or try another browser."); tokenCallback.current(""); },
      });
      if (!id) throw new Error("Cloudflare did not create a verification widget.");
      widgetId.current = id;
      const confirmWidgetMounted = () => {
        if (!active || widgetState !== "loading") return;
        if (container.querySelector("iframe")) {
          update("ready", "Security check loaded. Complete the challenge above before submitting your request.");
        }
      };
      confirmWidgetMounted();
      if (widgetState === "loading") {
        observer = new MutationObserver(confirmWidgetMounted);
        observer.observe(container, { childList: true, subtree: true });
        renderTimeout = window.setTimeout(() => {
          if (widgetState === "loading") {
            update("error", "Cloudflare loaded, but its security challenge did not appear within 12 seconds. Check your connection, disable content blockers for this site, or retry.");
            tokenCallback.current("");
          }
        }, 12000);
      }
    }).catch((caught) => {
      if (active) {
        update("error", caught instanceof Error ? caught.message : "Cloudflare security verification failed to load. Please retry.");
        tokenCallback.current("");
      }
    });
    return () => {
      active = false;
      if (renderTimeout !== null) window.clearTimeout(renderTimeout);
      observer?.disconnect();
      if (widgetId.current) window.turnstile?.remove?.(widgetId.current);
      widgetId.current = null;
    };
  }, [resetKey, attempt]);
  return <div className="turnstile-shell" data-state={status}>
    <div className="turnstile-widget" ref={host} role="group" aria-label="Cloudflare security verification" />
    <p className={status === "verified" ? "turnstile-status is-verified" : status === "error" ? "turnstile-status is-error" : "turnstile-status"} aria-live="polite">{detail}</p>
    {status === "error" && <button type="button" className="turnstile-retry" onClick={() => setAttempt(value => value + 1)}>Retry security check</button>}
  </div>;
}

function playLuxuryChime(type: "add" | "favourite" = "add") {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    osc.addEventListener("ended", () => { void ctx.close().catch(() => undefined); }, { once: true });
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if (type === "add") {
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.3);
    } else {
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch {}
}

const GOLDEN_QUOTES = [
  { text: "Wear confidence. Every day.", author: "DE VERVE" },
  { text: "Style is how you express your story.", author: "DE VERVE" },
  { text: "Everyday comfort. Effortless confidence.", author: "DE VERVE" },
  { text: "Make every day your own.", author: "DE VERVE" },
  { text: "Good style begins with feeling good.", author: "DE VERVE" },
  { text: "Confidence never goes out of style.", author: "DE VERVE" },
  { text: "Find your fit. Own your moment.", author: "DE VERVE" },
  { text: "Made for movement. Chosen by you.", author: "DE VERVE" },
  { text: "Your everyday deserves better.", author: "DE VERVE" },
  { text: "Simple choices. Strong personal style.", author: "DE VERVE" },
  { text: "Wear what moves you forward.", author: "DE VERVE" },
  { text: "Comfort is always in good taste.", author: "DE VERVE" },
] as const;

function selectGoldenQuote() {
  const storageKey = "deverve:golden-quote:last:v1";
  let previous = "";
  try { previous = localStorage.getItem(storageKey) || ""; } catch { /* Storage may be unavailable. */ }
  const choices = GOLDEN_QUOTES.filter((quote) => quote.text !== previous);
  const pool = choices.length ? choices : GOLDEN_QUOTES;
  const selected = pool[Math.floor(Math.random() * pool.length)] || GOLDEN_QUOTES[0];
  return selected;
}

function persistGoldenQuote(quote: { text: string; author: string }) {
  try { localStorage.setItem("deverve:golden-quote:last:v1", quote.text); } catch { /* Quote rotation must never block the storefront. */ }
}

function Storefront() {
  const [menuOpen, setMenuOpen] = useState(false);
  const mainNavRef = useRef<HTMLElement | null>(null);
  const menuToggleRef = useRef<HTMLButtonElement | null>(null);
  const [translationHintOpen, setTranslationHintOpen] = useState(false);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [featuredReviews,setFeaturedReviews]=useState<Array<{id:string;rating:number;title:string;body:string;verified_purchase:number;reviewer_name:string;product_name:string;product_slug:string}>>([]);
  useEffect(()=>{let active=true;void fetch("/api/reviews/featured",{headers:{accept:"application/json"}}).then(async response=>{if(!response.ok)return;const payload=await response.json() as {reviews?:typeof featuredReviews};if(active&&Array.isArray(payload.reviews))setFeaturedReviews(payload.reviews);}).catch(()=>{});return()=>{active=false;};},[]);
  // Select a brand-approved quote on every fresh visit; never repeat the previous visit's quote.
  const [goldenQuote, setGoldenQuote] = useState(selectGoldenQuote);
  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !mainNavRef.current?.contains(event.target) && !menuToggleRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);



  useEffect(() => {
    // Persist only after React commits the selected quote; keep the state initializer side-effect free.
    persistGoldenQuote(goldenQuote);
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setGoldenQuote(selectGoldenQuote());
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [goldenQuote]);
  const validScreens = ["home", "fashion", "wholesale", "mobility", "contact", "favourites", "policies"] as const;
  type StoreScreen = typeof validScreens[number];
  const readScreen = (): StoreScreen => { const url = new URL(window.location.href); const value = url.searchParams.get("screen"); if (validScreens.includes(value as StoreScreen)) return value as StoreScreen; if (url.hash === "#collections" || url.hash === "#fashion") return "fashion"; if (url.hash === "#contact") return "contact"; if (url.hash === "#mobility" || url.hash === "#car-rental") return "mobility"; return "home"; };
  const [activeScreen, setActiveScreen] = useState<StoreScreen>(readScreen);
  const [favourites, setFavourites] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("deverve-favourites") || "[]") as string[]; } catch { return []; } });
  const [activeTab, setActiveTab] = useState<"retail" | "wholesale">("retail");
  const [search, setSearch] = useState("");
  const [siteSearch, setSiteSearch] = useState("");
  const [siteSearchOpen, setSiteSearchOpen] = useState(false);
  const [selectedCategory,setSelectedCategory]=useState(()=>new URLSearchParams(window.location.search).get("category")||"");
  const [sortBy, setSortBy] = useState<"featured" | "price-asc" | "price-desc" | "name">("featured");
  const [showAll, setShowAll] = useState(false);
  const [visibleProductCount,setVisibleProductCount]=useState(8);
  const emptyEnquiry = { name: "", phone: "", email: "", enquiryType: "general", message: "", website: "" };
  const [enquiry, setEnquiry] = useState(() => readAppDraft("enquiry", emptyEnquiry));
  const [sending, setSending] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [checkoutTurnstileToken, setCheckoutTurnstileToken] = useState("");
  const [checkoutTurnstileReset, setCheckoutTurnstileReset] = useState(0);
  const [rentalTurnstileToken, setRentalTurnstileToken] = useState("");
  const [rentalTurnstileReset, setRentalTurnstileReset] = useState(0);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const filteredProducts=useMemo(()=>{
    const term=search.trim().toLowerCase();
    const list=products.filter(product=>{
      if(!matchesStoreCollection(product,selectedCategory))return false;
      if(!term)return true;
      const name=(product.name||"").toLowerCase();
      const desc=(product.description||"").toLowerCase();
      const cat=(product.category||"").toLowerCase();
      const aud=(product.audience||"").toLowerCase();
      const skuMatch=product.variants?.some(v=>(v.sku||"").toLowerCase().includes(term));
      return name.includes(term)||desc.includes(term)||cat.includes(term)||aud.includes(term)||Boolean(skuMatch);
    });
    if(sortBy==="price-asc")return [...list].sort((a,b)=>(a.retail_price_paisa??0)-(b.retail_price_paisa??0));
    if(sortBy==="price-desc")return [...list].sort((a,b)=>(b.retail_price_paisa??0)-(a.retail_price_paisa??0));
    if(sortBy==="name")return [...list].sort((a,b)=>a.name.localeCompare(b.name));
    return list;
  },[products,selectedCategory,search,sortBy]);
  useEffect(()=>{setVisibleProductCount(8);},[selectedCategory,search,sortBy]);

  const [socialLinks,setSocialLinks]=useState<Record<string,string>>({});
  const [brandAssets,setBrandAssets]=useState<{logo_id:string|null;favicon_id:string|null}>({logo_id:null,favicon_id:null});
  const [categoryAssets,setCategoryAssets]=useState<Record<string,string>>({});
  const [siteDesign,setSiteDesign]=useState({preset:"midnight-gold",primary_color:"#102d49",accent_color:"#c8a96d",surface_color:"#fbfaf7",text_color:"#19324b",corner_radius:16,font_family:"dm-sans",density:"comfortable",button_style:"rounded",card_shadow:"soft",hero_title:"Elevate your style.",hero_subtitle:"Everyday fashion for men, women and kids. Explore our garment collections, connect for wholesale enquiries, or talk to our team about your next journey.",section_images:{} as Record<string,string>});
  const [detailProduct, setDetailProduct] = useState<StoreProduct | null>(null);
  const [vehicles, setVehicles] = useState<StoreVehicle[]>([]);
  const siteSearchResults=useMemo(()=>{
    const normalise=(value:string)=>value.normalize("NFKC").toLocaleLowerCase().replace(/\p{M}+/gu,"").replace(/[^\p{L}\p{N}]+/gu," ").trim();
    const query=normalise(siteSearch);
    if(!query)return [];
    const tokens=query.split(/\s+/).filter(Boolean);
    const matches=(value:string)=>{const haystack=normalise(value);return haystack.includes(query)||tokens.every(token=>haystack.includes(token));};
    const results:Array<{label:string;detail:string;href:string;score:number}>=[];
    const add=(label:string,detail:string,href:string,searchable:string)=>{
      if(!matches(searchable))return;
      const name=normalise(label);
      const score=name===query?0:name.startsWith(query)?1:name.includes(query)?2:3;
      results.push({label,detail,href,score});
    };
    for(const item of categories){
      const aliases=item.id==="layers"?"hoodies sweatshirts zippers jackets outerwear":item.id==="bottoms"?"trousers pants jeans joggers shorts":item.id==="essentials"?"t shirts tees socks boxers underwear موزے باکسر":item.id==="kids"?"children boys girls kids clothing clothes bachay bachon بچوں کے کپڑے":item.id==="women"?"ladies womens khawateen خواتین":item.id==="men"?"mens male mardana mard مردانہ": "";
      add(item.name,"Fashion category","/?screen=fashion&category="+encodeURIComponent(item.id),[item.id,item.name,item.detail,aliases].join(" "));
    }
    for(const item of products){
      const variants=(item.variants||[]).map(v=>[v.sku,v.size,v.color].filter(Boolean).join(" ")).join(" ");
      add(item.name,"Product · "+item.category,"/product/"+encodeURIComponent(item.slug),[item.name,item.description,item.category,item.audience,variants].join(" "));
    }
    for(const item of vehicles){
      add(item.name,"Car rental · "+item.vehicle_type,"/?screen=mobility",[item.name,item.vehicle_type,item.transmission,item.seats+" seats",item.fuel_type,item.description].join(" "));
    }
    const pages=[
      {label:"Home",detail:"De VERVE homepage",href:"/",keywords:"home main landing start brand jhelum jhelum pakistan"},
      {label:"Wholesale enquiries",detail:"Bulk garment enquiries",href:"/?screen=wholesale",keywords:"wholesale bulk bulk orders reseller retailer stock lots garments thok kapray تھوک کپڑے"},
      {label:"Car rental",detail:"Explore vehicles and rental requests",href:"/?screen=mobility",keywords:"car cars rental rentals vehicle rent booking driver mobility transport hire kiraya gari gaari کار کرایہ گاڑی"},
      {label:"Contact De VERVE",detail:"Contact details and enquiry form",href:"/?screen=contact",keywords:"contact phone whatsapp address location enquiry help support rabta رابطہ فون واٹس ایپ"},
      {label:"Policies & FAQs",detail:"Delivery, returns and customer policies",href:"/?screen=policies",keywords:"policies faq shipping delivery returns refund exchange privacy terms conditions wapsi ترسیل واپسی پالیسی"},
      {label:"My account",detail:"Orders and customer account",href:"/account",keywords:"account orders profile sign in login customer"},
    ];
    for(const item of pages)add(item.label,item.detail,item.href,[item.label,item.detail,item.keywords].join(" "));
    return results.sort((a,b)=>a.score-b.score||a.label.localeCompare(b.label)).slice(0,8).map(({score,...item})=>item);
  },[siteSearch,products,vehicles]);
  const [vehicleDetail, setVehicleDetail] = useState<StoreVehicle | null>(null);
  const [rentalOpen, setRentalOpen] = useState(() => { try { return sessionStorage.getItem("deverve:ui:rental-open") === "1"; } catch { return false; } });
  const [rentalBusy, setRentalBusy] = useState(false);
  const initialRentalResult = readAppDraft("rental-result", { reference: "", message: "", estimate: null as number | null });
  const [rentalMessage, setRentalMessage] = useState(initialRentalResult.message);
  const [rentalNotice, setRentalNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  useEffect(() => {
    if (!rentalNotice) return;
    const timeout = window.setTimeout(() => setRentalNotice(null), rentalNotice.kind === "success" ? 5500 : 8000);
    return () => window.clearTimeout(timeout);
  }, [rentalNotice]);
  const [rentalReference, setRentalReference] = useState(initialRentalResult.reference);
  const [rentalSubmittedEstimatePaisa, setRentalSubmittedEstimatePaisa] = useState<number | null>(initialRentalResult.estimate);
  const [rentalFrontFile, setRentalFrontFile] = useState<File | null>(null);
  const [rentalBackFile, setRentalBackFile] = useState<File | null>(null);
  const [rentalDocsConsent, setRentalDocsConsent] = useState(false);
  const [rentalDocsMessage, setRentalDocsMessage] = useState("");
  const [rentalCnicUploadsEnabled, setRentalCnicUploadsEnabled] = useState(false);
  const [rentalSettingsLoading, setRentalSettingsLoading] = useState(true);
  const [rentalSettingsError, setRentalSettingsError] = useState("");
  const rentalSettingsRequest = useRef(0);
  const emptyRentalForm = { vehicle_id: "", customer_name: "", phone: "", email: "", pickup_city: "Jhelum", pickup_address: "", destination_city: "Jhelum", destination_address: "", pickup_at: localDateTime(new Date(Date.now() + 86400000)), return_at: localDateTime(new Date(Date.now() + 2 * 86400000)), driver_option: "with_driver", customer_note: "", website: "" };
  const [rentalForm, setRentalForm] = useState(() => readAppDraft("rental", emptyRentalForm));
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [selectedVariantOptions, setSelectedVariantOptions] = useState<Record<string, {size:string;color:string}>>({});
  const [cart, setCart] = useState<CartLine[]>(readStoredCart);
  useEffect(()=>{if(!products.length)return;setCart(current=>{let changed=false;const next=current.map(line=>{if(line.image_url)return line;const product=products.find(item=>item.id===line.product_id);if(!product)return line;const imageUrl=productGalleryImages(product,line.variant_id,line.color)[0]?.url||(product.image_key?"/media/"+product.image_key:undefined);if(!imageUrl)return line;changed=true;return {...line,image_url:imageUrl};});return changed?next:current;});},[products]);
  const [cartOpen, setCartOpen] = useState(() => { try { return sessionStorage.getItem("deverve:ui:cart-open") === "1"; } catch { return false; } });
  const [checkoutOpen, setCheckoutOpen] = useState(() => { try { return sessionStorage.getItem("deverve:ui:checkout-open") === "1"; } catch { return false; } });
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [couponPreview,setCouponPreview]=useState<{code:string;label:string;discount_amount_paisa:number;free_delivery:boolean;subtotal:number}|null>(null);
  const initialCheckoutResult = readAppDraft("checkout-result", { result: "", message: "" });
  const [checkoutMessage, setCheckoutMessage] = useState(initialCheckoutResult.message);
  const [checkoutResult, setCheckoutResult] = useState(initialCheckoutResult.result);
  const [checkoutToken, setCheckoutToken] = useState(() => { try { return sessionStorage.getItem("deverve:checkout-token") || crypto.randomUUID(); } catch { return crypto.randomUUID(); } });
  const [onlinePaymentAvailable, setOnlinePaymentAvailable] = useState(false);
  const [onlinePaymentEnvironment, setOnlinePaymentEnvironment] = useState<"sandbox" | "production" | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<"manual" | "safepay">("manual");
  const [paymentMethods,setPaymentMethods]=useState<Array<{id:string;label:string;kind:string;provider:string;account_title:string;bank_name:string;account_number:string;iban:string;payment_url:string;instructions:string;qr_media_id:string|null}>>([{id:"cod",label:"Cash on delivery",kind:"cod",provider:"",account_title:"",bank_name:"",account_number:"",iban:"",payment_url:"",instructions:"Pay when your order is delivered.",qr_media_id:null}]);
  const [selectedPaymentMethod,setSelectedPaymentMethod]=useState("cod");
  const emptyCheckoutForm = { customer_name: "", phone: "", email: "", delivery_address: "", city: "Jhelum", customer_note: "", website: "", coupon_code: "" };
  const [checkoutForm, setCheckoutForm] = useState(() => ({ ...readAppDraft("checkout", emptyCheckoutForm), coupon_code: "" }));
  const [catalogueState, setCatalogueState] = useState<"loading" | "ready" | "empty" | "error">("loading");

  useEffect(() => { const url = new URL(window.location.href); if (url.searchParams.get("cart") === "open") setCartOpen(true); if (url.searchParams.get("checkout") === "open") { setCartOpen(true); setCheckoutOpen(true); } if (url.searchParams.get("rental") === "open" || rentalOpen) { const vehicle = url.searchParams.get("vehicle") || rentalForm.vehicle_id || ""; void openRentalRequest(vehicle, true); } }, []);
  useEffect(() => { const onPopState = () => { setActiveScreen(readScreen()); setSelectedCategory(new URL(window.location.href).searchParams.get("category")||""); }; window.addEventListener("popstate", onPopState); return () => window.removeEventListener("popstate", onPopState); }, []);
  useEffect(() => { try { sessionStorage.setItem("deverve:ui:cart-open", cartOpen ? "1" : "0"); sessionStorage.setItem("deverve:ui:checkout-open", checkoutOpen ? "1" : "0"); sessionStorage.setItem("deverve:ui:rental-open", rentalOpen ? "1" : "0"); } catch { /* Storage restrictions must not interrupt the storefront. */ } }, [cartOpen, checkoutOpen, rentalOpen]);
  useEffect(() => { writeAppDraft("enquiry", enquiry); }, [enquiry]);
  useEffect(() => { writeAppDraft("rental", rentalForm); }, [rentalForm]);
  useEffect(() => { writeAppDraft("checkout", checkoutForm); }, [checkoutForm]);
  useEffect(() => { writeAppDraft("rental-result", { reference: rentalReference, message: rentalMessage, estimate: rentalSubmittedEstimatePaisa }); }, [rentalReference, rentalMessage, rentalSubmittedEstimatePaisa]);
  useEffect(() => { writeAppDraft("checkout-result", { result: checkoutResult, message: checkoutMessage }); }, [checkoutResult, checkoutMessage]);
  useEffect(() => { try { sessionStorage.setItem("deverve:checkout-token", checkoutToken); } catch { /* Storage may be unavailable. */ } }, [checkoutToken]);
  const updateEnquiry = (next: typeof emptyEnquiry) => { setEnquiry(next); writeAppDraft("enquiry", next); };
  const updateRentalForm = (next: typeof emptyRentalForm) => { setRentalForm(next); writeAppDraft("rental", next); };
  const updateCheckoutForm = (next: typeof emptyCheckoutForm) => { setCheckoutForm(next); writeAppDraft("checkout", { ...next, coupon_code: "" }); };

  useEffect(() => { localStorage.setItem("deverve-favourites", JSON.stringify(favourites)); }, [favourites]);
  useEffect(() => { localStorage.setItem("deverve-cart", JSON.stringify(cart)); }, [cart]);
  useEffect(() => { void fetch("/api/storefront/payment-options", { headers: { accept: "application/json" } }).then(async (response) => { if (!response.ok) return; const payload = await response.json() as { online_payment_available?: boolean; environment?: "sandbox" | "production" | null; methods?: typeof paymentMethods }; setOnlinePaymentAvailable(payload.online_payment_available === true); setOnlinePaymentEnvironment(payload.online_payment_available === true ? payload.environment ?? null : null); if(Array.isArray(payload.methods)&&payload.methods.length){setPaymentMethods(payload.methods);setSelectedPaymentMethod(current=>payload.methods!.some(method=>method.id===current)?current:(payload.methods!.find(method=>method.kind==="cod")?.id??payload.methods![0].id));} }).catch(() => { setOnlinePaymentAvailable(false); setOnlinePaymentEnvironment(null); }); }, []);

  useEffect(() => {
    let active = true;
    const loadProducts = async () => {
      try {
        const response = await fetch("/api/products?limit=60", { headers: { accept: "application/json" } });
        if (!response.ok) throw new Error("Catalogue unavailable");
        const payload = await response.json() as { products?: typeof products };
        if (!Array.isArray(payload.products)) throw new Error("Invalid catalogue response");
        if (!active) return;
        setProducts(payload.products);
        setSelectedVariants(Object.fromEntries(payload.products.map((product) => [product.id, product.variants[0]?.id ?? ""])));
        setCart((current) => current.map((line) => {
          const product = payload.products!.find((item) => item.id === line.product_id);
          if (!product) return line;
          const variant = product.variants.find((item) => item.id === line.variant_id);
          if (!variant || product.retail_price_paisa === null || variant.available_quantity < 1) return line;
          return { ...line, name: product.name, sku: variant.sku, size: line.size || variant.size, color: line.color || variant.color, unit_price_paisa: product.retail_price_paisa, available_quantity: variant.available_quantity, quantity: Math.min(line.quantity, variant.available_quantity) };
        }));
        setCatalogueState(payload.products.length ? "ready" : "empty");
      } catch {
        if (active) setCatalogueState("error");
      }
    };
    void loadProducts();
    void fetch("/api/storefront/settings",{headers:{accept:"application/json"}}).then(async(response)=>{if(!response.ok)return;const payload=await response.json() as {social_links?:Record<string,string>;brand_assets?:{logo_id?:string|null;favicon_id?:string|null};category_assets?:Record<string,string>;site_design?:Partial<typeof siteDesign>};if(!active)return;if(payload.social_links&&typeof payload.social_links==="object")setSocialLinks(payload.social_links);if(payload.brand_assets&&typeof payload.brand_assets==="object")setBrandAssets({logo_id:payload.brand_assets.logo_id??null,favicon_id:payload.brand_assets.favicon_id??null});if(payload.category_assets&&typeof payload.category_assets==="object")setCategoryAssets(payload.category_assets);if(payload.site_design&&typeof payload.site_design==="object")setSiteDesign(current=>({...current,...payload.site_design,section_images:{...current.section_images,...(payload.site_design?.section_images||{})}}));}).catch(()=>undefined);
    const loadVehicles = async () => {
      try {
        const response = await fetch("/api/vehicles", { headers: { accept: "application/json" } });
        if (!response.ok) return;
        const payload = await response.json() as { vehicles?: StoreVehicle[] };
        if (active && Array.isArray(payload.vehicles)) setVehicles(payload.vehicles);
      } catch { /* Rental enquiry remains available if fleet data is offline. */ }
    };
    void loadVehicles();
    return () => { active = false; };
  }, []);

  useEffect(()=>{
    const root=document.documentElement;
    root.style.setProperty("--dv-site-primary",siteDesign.primary_color);
    root.style.setProperty("--dv-site-accent",siteDesign.accent_color);
    root.style.setProperty("--dv-site-surface",siteDesign.surface_color);
    root.style.setProperty("--dv-site-text",siteDesign.text_color);
    root.style.setProperty("--dv-site-radius",siteDesign.corner_radius+"px");
    root.style.setProperty("--dv-site-font",siteDesign.font_family==="inter"?"Inter,Arial,sans-serif":siteDesign.font_family==="serif"?"Georgia,'Times New Roman',serif":"'DM Sans',Arial,sans-serif");
    root.style.setProperty("--dv-site-density",siteDesign.density==="compact"?"0.9":siteDesign.density==="airy"?"1.12":"1");
    root.style.setProperty("--dv-site-button-radius",siteDesign.button_style==="pill"?"999px":siteDesign.button_style==="square"?"4px":"12px");
    root.style.setProperty("--dv-site-shadow",siteDesign.card_shadow==="flat"?"none":siteDesign.card_shadow==="bold"?"0 14px 38px rgba(12,37,64,.16)":"0 8px 24px rgba(12,37,64,.06)");
    for(const [key,id] of Object.entries(siteDesign.section_images))root.style.setProperty("--dv-section-"+key+"-image",id?"url('/media/"+id+"')":"none");
  },[siteDesign]);
  const formatPrice = (paisa: number | null) => paisa === null
    ? "Ask for price"
    : new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(paisa / 100);

  const cartSubtotal = cart.reduce((sum, item) => sum + item.unit_price_paisa * item.quantity, 0);
  const promotionPreview = couponPreview && couponPreview.subtotal === cartSubtotal && couponPreview.code === checkoutForm.coupon_code.trim().toUpperCase()
    ? { label: couponPreview.label, amount: couponPreview.discount_amount_paisa, freeDelivery: couponPreview.free_delivery }
    : null;
  useEffect(()=>{if(couponPreview&&couponPreview.subtotal!==cartSubtotal){setCouponPreview(null);setCheckoutForm(current=>current.coupon_code?{...current,coupon_code:""}:current);setCheckoutMessage("Your cart changed. Reapply the voucher to confirm it for the updated order.");}},[cartSubtotal,couponPreview]);
  const applyCheckoutCoupon = async () => {
    const code=checkoutForm.coupon_code.trim().toUpperCase();
    if(!code){setCouponPreview(null);setCheckoutMessage("Enter a voucher code first.");return;}
    if(!cart.length){setCheckoutMessage("Add an item before applying a voucher.");return;}
    setCheckoutBusy(true);setCheckoutMessage("");setCouponPreview(null);
    try{
      const response=await fetch("/api/coupons/validate",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify({code,subtotal_paisa:cartSubtotal})});
      const result=await response.json() as {valid?:boolean;label?:string;discount_amount_paisa?:number;free_delivery?:boolean;error?:string};
      if(!response.ok||!result.valid)throw new Error(result.error||"This voucher cannot be applied.");
      setCouponPreview({code,label:result.label||"Voucher discount",discount_amount_paisa:result.discount_amount_paisa||0,free_delivery:result.free_delivery===true,subtotal:cartSubtotal});
      setCheckoutMessage("Voucher applied. The server will verify it again when you place your order.");
    }catch(error){setCheckoutMessage(error instanceof Error?error.message:"Voucher could not be checked.");}
    finally{setCheckoutBusy(false);}
  };
  const cartLineKey = cartIdentity;
  const addToCart = (product: StoreProduct) => {
    playLuxuryChime("add");
    const selectedId = selectedVariants[product.id];
    const variant = product.variants.find((item) => item.id === selectedId && item.available_quantity > 0)
      || product.variants.find((item) => item.available_quantity > 0);
    if (!variant || product.retail_price_paisa === null) { setCheckoutMessage("Please choose an available size and colour before adding this item."); return; }
    const option=selectedVariantOptions[product.id];
    const selectedColor=option?.color||splitProductOptions(variant.color)[0]||variant.color;const imageUrl=productGalleryImages(product,variant.id,selectedColor)[0]?.url||(product.image_key?"/media/"+product.image_key:undefined);const line:CartLine={variant_id:variant.id,product_id:product.id,name:product.name,sku:variant.sku,size:option?.size||splitProductOptions(variant.size)[0]||variant.size,color:selectedColor,quantity:1,unit_price_paisa:product.retail_price_paisa,available_quantity:variant.available_quantity,image_url:imageUrl};
    setCart((current) => {
      const key=cartLineKey(line),existing=current.find((item) => cartLineKey(item)===key);
      if (existing) return current.map((item) => cartLineKey(item)===key ? { ...item, variant_id:line.variant_id, sku:line.sku, name:line.name, size:line.size, color:line.color, image_url:line.image_url, unit_price_paisa:line.unit_price_paisa, available_quantity:line.available_quantity, quantity: Math.min(item.quantity + 1, line.available_quantity,10) } : item);
      return [...current, line].slice(0,20);
    });
  };
  const changeCartQuantity = (line: CartLine, quantity: number) => setCart((current) => current.map((item) => cartLineKey(item)===cartLineKey(line) ? { ...item, quantity: Math.max(1, Math.min(item.available_quantity,10,quantity)) } : item));
  const removeCartItem = (line: CartLine) => setCart((current) => current.filter((item) => cartLineKey(item)!==cartLineKey(line)));
  const submitCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!checkoutTurnstileToken) { setCheckoutMessage("Please complete the security check first."); return; }
    setCheckoutBusy(true); setCheckoutMessage(""); setCheckoutResult("");
    try {
      const response = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ ...checkoutForm, turnstile_token: checkoutTurnstileToken, checkout_token: checkoutToken, payment_provider: paymentProvider, payment_method: selectedPaymentMethod, items: cart.map((item) => ({ variant_id: item.variant_id, size: item.size, color: item.color, quantity: item.quantity })) }) });
      const result = await response.json() as { accepted?: boolean; error?: string; order_number?: string };
      if (!response.ok || !result.accepted || !result.order_number) throw new Error(result.error || "Your order could not be placed.");
      setCheckoutResult(result.order_number); setCart([]); setCheckoutToken(crypto.randomUUID()); setPaymentProvider("manual"); setCouponPreview(null);
      clearAppDraft("checkout");
      clearFormDraft("storefront-checkout");
      setCheckoutForm({ ...emptyCheckoutForm });
      setCheckoutMessage(paymentProvider === "safepay" ? (onlinePaymentEnvironment === "production" ? "Your order request has been received. Our team will confirm the delivery fee. Once you approve the final total, sign in to your account to complete secure online payment." : "Your order request has been received. Our team will confirm the delivery fee. Once you approve the final total, you can complete the sandbox payment in your account.") : selectedPaymentMethod==="cod" ? "Your cash-on-delivery order request has been received. Our team will confirm the delivery fee and final payable total before processing." : "Your order request has been received with your selected direct payment method. Please follow the payment instructions shown at checkout and include your order number in the transfer reference. Your payment remains pending until the De VERVE owner verifies it.");
    } catch (error) { setCheckoutMessage(error instanceof Error ? error.message : "Checkout is unavailable. Please try again."); }
    finally { setCheckoutBusy(false); setCheckoutTurnstileToken(""); setCheckoutTurnstileReset((value) => value + 1); }
  };

  const loadRentalSettings = async () => {
    const requestId = ++rentalSettingsRequest.current;
    setRentalSettingsLoading(true); setRentalSettingsError(""); setRentalCnicUploadsEnabled(false);
    try {
      const response = await fetch("/api/rentals/settings", { headers: { accept: "application/json" } });
      const settings = await response.json() as { cnic_uploads_enabled?: boolean; error?: string };
      if (!response.ok) throw new Error(settings.error || "Rental settings returned HTTP " + response.status + ".");
      if (requestId !== rentalSettingsRequest.current) return;
      if (settings.cnic_uploads_enabled !== true) {
        setRentalSettingsError("The owner has not enabled secure CNIC uploads for rental requests. Please contact De VERVE.");
        return;
      }
      setRentalCnicUploadsEnabled(true);
    } catch (error) {
      if (requestId !== rentalSettingsRequest.current) return;
      setRentalSettingsError(error instanceof Error ? "We could not confirm rental security settings: " + error.message : "We could not confirm rental security settings. Please retry.");
    } finally {
      if (requestId === rentalSettingsRequest.current) setRentalSettingsLoading(false);
    }
  };
  const openRentalRequest = async (vehicleId = "", preserveDraft = false) => {
    try { const account = await fetch("/api/customer/me", { credentials: "same-origin", headers: { accept: "application/json" } }); if (!account.ok) { window.location.href = "/account?next=" + encodeURIComponent("/?rental=open" + (vehicleId ? "&vehicle=" + encodeURIComponent(vehicleId) : "")); return; } } catch { window.location.href = "/account?next=" + encodeURIComponent("/?rental=open"); return; }
    if (!preserveDraft) {
      clearFormDraft("storefront-rental-request");
      clearAppDraft("rental");
      setRentalForm({ ...emptyRentalForm, vehicle_id: vehicleId });
      setRentalMessage(""); setRentalReference(""); setRentalSubmittedEstimatePaisa(null); clearAppDraft("rental-result");
      setRentalFrontFile(null); setRentalBackFile(null); setRentalDocsConsent(false); setRentalDocsMessage("");
    }
    setRentalCnicUploadsEnabled(false); setRentalSettingsError(""); setRentalSettingsLoading(true); setRentalOpen(true);
    void loadRentalSettings();
  };
  const rentalSelectedVehicle = vehicles.find((vehicle) => vehicle.id === rentalForm.vehicle_id) ?? null;
  const rentalDurationDays = (() => { const start = pakistanDateTimeMs(rentalForm.pickup_at); const end = pakistanDateTimeMs(rentalForm.return_at); return Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.ceil((end - start) / 86400000) : 0; })();
  const rentalDailyRatePaisa = rentalSelectedVehicle ? (rentalForm.driver_option === "with_driver" ? rentalSelectedVehicle.with_driver_daily_rate_paisa ?? null : rentalSelectedVehicle.daily_rate_paisa) : null;
  const rentalEstimatedTotalPaisa = rentalDailyRatePaisa !== null && rentalDailyRatePaisa !== undefined && rentalDurationDays > 0 ? rentalDailyRatePaisa * rentalDurationDays : null;

  const submitRentalRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const rejectRental = (message: string) => { setRentalMessage(message); setRentalNotice({ kind: "error", message }); };
    if (!rentalCnicUploadsEnabled) { rejectRental("Secure CNIC upload is not enabled. Please contact De VERVE."); return; }
    if (!rentalFrontFile || !rentalBackFile) { rejectRental("Both front and back CNIC images are required."); return; }
    if (!rentalDocsConsent) { rejectRental("Please confirm consent for secure CNIC storage."); return; }
    if (!rentalTurnstileToken) { rejectRental("Security verification is not complete. Complete the Cloudflare check above. If it is missing or shows an error, use Retry security check or try another browser/network. Your request has not been sent."); return; }
    setRentalBusy(true); setRentalMessage(""); setRentalReference("");
    try {
      const data = new FormData();
      Object.entries(rentalForm).forEach(([key, value]) => data.append(key, value));
      // Keep datetime-local values timezone-less: the Worker interprets them as Asia/Karachi (UTC+05:00).
      // Converting with the visitor's device timezone would silently shift rental times for overseas customers.
      data.set("pickup_at", rentalForm.pickup_at);
      data.set("return_at", rentalForm.return_at);
      data.append("turnstile_token", rentalTurnstileToken);
      data.append("cnic_front", rentalFrontFile);
      data.append("cnic_back", rentalBackFile);
      data.append("cnic_consent", "true");
      data.append("cnic_consent_version", "rental-cnic-2026-11-21-v1");
      const response = await fetch("/api/rentals", { method: "POST", headers: { accept: "application/json" }, body: data });
      const result = await response.json() as { accepted?: boolean; reference_code?: string; rental_days?: number; estimated_daily_rate_paisa?: number | null; estimated_total_paisa?: number | null; message?: string; error?: string };
      if (!response.ok || !result.accepted) throw new Error(result.error || "Your rental request could not be submitted.");
      setRentalReference(result.reference_code ?? "");
      setRentalSubmittedEstimatePaisa(result.estimated_total_paisa ?? null);
      const successMessage = result.message || "Your rental request and both CNIC images have been received securely.";
      clearAppDraft("rental");
      clearFormDraft("storefront-rental-request");
      setRentalMessage(successMessage); setRentalDocsMessage("Both CNIC images were uploaded securely with your rental request.");
      setRentalNotice({ kind: "success", message: result.reference_code ? "Rental request received. Reference: " + result.reference_code : "Rental request received successfully." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Rental request unavailable. Please contact us on WhatsApp.";
      setRentalMessage(message); setRentalNotice({ kind: "error", message });
    }
    finally { setRentalBusy(false); setRentalTurnstileToken(""); setRentalTurnstileReset((value) => value + 1); }
  };

  const submitEnquiry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setSubmitMessage("");
    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(enquiry),
      });
      const result = await response.json() as { accepted?: boolean; error?: string };
      if (!response.ok || !result.accepted) throw new Error(result.error || "Your enquiry could not be sent.");
      setSubmitMessage("Thank you. Your enquiry has been received.");
      setEnquiry({ ...emptyEnquiry });
      clearAppDraft("enquiry");
      clearFormDraft("storefront-enquiry");
    } catch (error) {
      setSubmitMessage(error instanceof Error ? error.message : "The enquiry service is not available yet. Please contact us on WhatsApp.");
    } finally {
      setSending(false);
    }
  };

  const visibleCategories = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? categories.filter((item) => `${item.name} ${item.detail}`.toLowerCase().includes(term))
      : categories;
    return showAll || term ? filtered : filtered.slice(0, 4);
  }, [search, showAll]);

  const closeMenu = () => setMenuOpen(false);
  const navigate = (screen: StoreScreen) => { if(screen==="home"){window.location.assign("/");return;} setActiveScreen(screen); const url = new URL(window.location.href); url.searchParams.set("screen", screen); if(screen!=="fashion")url.searchParams.delete("category"); url.hash = ""; setSelectedCategory(screen==="fashion"?url.searchParams.get("category")||"": ""); window.history.pushState({ screen }, "", url.pathname + url.search); closeMenu(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const toggleFavourite = (productId: string) => {
    playLuxuryChime("favourite");
    setFavourites((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]);
  };

  return (
    <div className="site-shell">
      <div className="announcement">
        <span className="announcement-location">JHELUM, PAKISTAN</span>
        <span className="announcement-services">FASHION · WHOLESALE · CAR RENTALS</span>
        <div className="announcement-actions">
          <div className="announcement-translate"><span aria-hidden="true">文</span>
            <button type="button" className="announcement-translate-button" aria-label="How to translate this page" aria-expanded={translationHintOpen} onClick={() => setTranslationHintOpen(value => !value)}>How to translate</button>
            {translationHintOpen && <span className="translation-hint" role="status">Use your browser’s built-in page translation (in Chrome, open ⋮ and choose Translate). You will stay on the De VERVE website; availability depends on your browser.</span>}
          </div>
          <a href={whatsapp("Assalamu Alaikum De VERVE, I would like to enquire.")} target="_blank" rel="noreferrer">WhatsApp us ↗</a>
        </div>
      </div>
      <div className="top-quote-strip" aria-label="Inspirational quote">
        <span className="top-quote-mark" aria-hidden="true">“</span>
        <p>{goldenQuote.text}</p>
        <cite>— {goldenQuote.author}</cite>
      </div>

      <header className="site-header">
        <button className="brand-lockup brand-home-button" type="button" aria-label="De VERVE home" onClick={() => navigate("home")}>
          <img className="brand-logo-image" src={brandAssets.logo_id ? "/media/"+brandAssets.logo_id : "/api/brand/logo"} alt="De VERVE" />
          <span className="brand-type"><strong>De VERVE</strong><small>ELEVATE YOUR STYLE</small></span>
        </button>
        <button ref={menuToggleRef} className="menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          <span /><span />
        </button>
        {menuOpen && <button type="button" className="menu-dismiss" aria-label="Close navigation menu" onClick={closeMenu} />}
        <nav ref={mainNavRef} className={menuOpen ? "main-nav is-open" : "main-nav"} aria-label="Main navigation"><button type="button" onClick={() => navigate("home")}>Home</button><button type="button" onClick={() => navigate("fashion")}>Fashion</button><button type="button" onClick={() => navigate("wholesale")}>Wholesale</button><button type="button" onClick={() => navigate("mobility")}>Car rental</button><button type="button" onClick={() => navigate("favourites")}>Saved ({favourites.length})</button><button type="button" onClick={() => navigate("contact")}>Contact</button><button type="button" onClick={() => navigate("policies")}>Policies</button><button type="button" onClick={() => { window.location.href = "/account"; }}>My account</button></nav>
        <div className="header-actions">
          <form className="site-search" role="search" onSubmit={event=>{event.preventDefault();const first=siteSearchResults[0];if(first)window.location.href=first.href;else if(siteSearch.trim())setSiteSearchOpen(true);}}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
            <input type="search" value={siteSearch} onChange={event=>{setSiteSearch(event.target.value);setSiteSearchOpen(true);}} onFocus={()=>setSiteSearchOpen(true)} onBlur={()=>window.setTimeout(()=>setSiteSearchOpen(false),160)} placeholder="Search the website" aria-label="Search products, categories, vehicles and pages" aria-expanded={siteSearchOpen&&!!siteSearch.trim()} aria-controls="site-search-results" />
            {siteSearch&&<button type="button" className="site-search-clear" aria-label="Clear search" onMouseDown={event=>event.preventDefault()} onClick={()=>{setSiteSearch("");setSiteSearchOpen(false);}}>×</button>}
            {siteSearchOpen&&siteSearch.trim()&&<div className="site-search-results" id="site-search-results" role="listbox" aria-label="Search results">
              {siteSearchResults.length?siteSearchResults.map((item,index)=><a key={item.href+"-"+index} role="option" href={item.href}><strong>{item.label}</strong><small>{item.detail}</small></a>):<p>No matches found. Try another word or contact our team.</p>}
            </div>}
          </form>
          <InstallPrompt /><button className="header-cart" type="button" onClick={() => { setCartOpen(true); setCheckoutMessage(""); setCheckoutResult(""); }}>Cart <span>{cart.reduce((sum, item) => sum + item.quantity, 0)}</span></button><a className="header-cta" href={whatsapp("Assalamu Alaikum, I would like to contact De VERVE.")} target="_blank" rel="noreferrer">Contact <span>↗</span></a>
        </div>
      </header>

      <main id="home" className="store-main" data-screen={activeScreen}>
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-status-beacon" role="status">
              <span className="beacon-pulse" />
              <span>De VERVE · Jhelum, Pakistan · Fashion / Wholesale / Mobility</span>
            </div>
            <p className="eyebrow"><span className="eyebrow-line" /> FASHION · LIFESTYLE · MOBILITY</p>
            <h1>{siteDesign.hero_title}</h1>
            <p className="hero-description">{siteDesign.hero_subtitle}</p>
            <div className="hero-actions">
              <button className="button button-primary" type="button" onClick={() => navigate("fashion")}>Explore fashion <span>↗</span></button>
              <button className="text-link" type="button" onClick={() => navigate("wholesale")}>Wholesale enquiries →</button>
            </div>
            <div className="hero-stats-strip" aria-label="De VERVE services">
              <div><strong>Jhelum</strong><small>Based in Pakistan</small></div>
              <div className="stat-separator" />
              <div><strong>Retail</strong><small>Fashion</small></div>
              <div className="stat-separator" />
              <div><strong>Wholesale</strong><small>Enquiries</small></div>
              <div className="stat-separator" />
              <div><strong>Mobility</strong><small>Rental requests</small></div>
            </div>
            <div className="hero-footnote"><span className="blue-dot" /> YOUR EVERYDAY VERVE · JHELUM, PAKISTAN</div>
          </div>
          <div className={"hero-art"+(siteDesign.section_images.hero?" has-owner-art":"")} aria-label="De VERVE apparel collection artwork">
            <div className="hero-art-glow" />
            <div className="hero-art-word">VERVE<span>.</span></div>
            <div className="hero-garment hero-garment-one"><i /></div>
            <div className="hero-garment hero-garment-two"><i /></div>
            <div className="hero-garment hero-garment-three"><i /></div>
            <div className="hero-art-label"><strong>THE EVERYDAY EDIT</strong><span>FASHION / COMFORT / CONFIDENCE</span></div>
            <div className="hero-art-index">DV — 001</div>
          </div>
          <div className="hero-bottom"><span>DE VERVE / 001</span><span>FASHION · WHOLESALE · MOBILITY</span><button type="button" onClick={() => navigate("fashion")}>EXPLORE COLLECTIONS ↗</button></div>
        </section>

        {activeScreen==="home"&&<>
          <section className="intro-strip" aria-label="De VERVE services introduction">
            <p>One local team.<br/><strong>Three ways to connect.</strong></p>
            <p>Explore garments for everyday wear, request a wholesale quotation, or enquire about vehicle rental. <strong>Orders and rental requests are confirmed by our team before fulfilment.</strong></p>
            <div className="intro-mark" aria-hidden="true">DV<span>.</span></div>
          </section>
          <section className="trust-pillars-section" aria-label="Explore De VERVE services">
            <a className={"trust-pillar-card"+(siteDesign.section_images.feature_fashion?" has-owner-art feature-fashion":"")} href="/?screen=fashion"><span className="trust-pillar-icon" aria-hidden="true">◇</span><div><h4>Find your fit</h4><p>Explore garments, product details and available size–colour combinations.</p><small>Explore fashion ↗</small></div></a>
            <a className={"trust-pillar-card"+(siteDesign.section_images.feature_account?" has-owner-art feature-account":"")} href="/account"><span className="trust-pillar-icon" aria-hidden="true">▣</span><div><h4>Your orders, together</h4><p>Sign in to follow order updates and manage eligible exchange requests.</p><small>Open your account ↗</small></div></a>
            <a className={"trust-pillar-card"+(siteDesign.section_images.feature_wholesale?" has-owner-art feature-wholesale":"")} href="/?screen=wholesale"><span className="trust-pillar-icon" aria-hidden="true">▤</span><div><h4>Wholesale made clear</h4><p>Share product requirements and quantities for a tailored quotation.</p><small>Request a quote ↗</small></div></a>
            <a className={"trust-pillar-card"+(siteDesign.section_images.feature_mobility?" has-owner-art feature-mobility":"")} href="/?screen=mobility"><span className="trust-pillar-icon" aria-hidden="true">↗</span><div><h4>Plan your journey</h4><p>Explore vehicle options and send a rental enquiry to our team.</p><small>Explore rentals ↗</small></div></a>
          </section>
        </>}

        <section className="section collections-section" id="collections">
          {!selectedCategory && <>
          <div className="section-heading">
            <div><p className="eyebrow">01 — THE FASHION EDIT</p><h2>Find your<br /><em>everyday favourite.</em></h2></div>
            <div className="catalogue-tools">
              <p className="section-aside">Explore our garment categories.<br />Ask our team for current stock and sizes.</p>
              <label className="catalogue-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a category..." aria-label="Search fashion categories" /></label>
            </div>
          </div>
          <div className="collection-grid">
            {visibleCategories.map((item) => (
              <article className={`collection-card ${item.tone}`} key={item.id}>
                <a className="collection-art" data-testid={`collection-${item.id}-art`} href={"/?screen=fashion&category=" + encodeURIComponent(item.id)} aria-label={`Shop ${item.name} collection`}>
                  <span className="category-tag">{item.tag} / DE VERVE</span>
                  {categoryAssets[item.id]&&<img className="category-custom-art" src={"/media/"+categoryAssets[item.id]} alt={item.name+" collection"} loading="lazy"/>}
                  {!categoryAssets[item.id]&&<span className="category-garment"><i /></span>}
                  <span className="category-art-word">{item.id === "essentials" ? "DAILY" : item.id.toUpperCase()}</span>
                  <span className="category-arrow">↗</span>
                </a>
                <div className="collection-meta"><div><span className="category-number">{item.tag} / 06</span><h3>{item.name}</h3><p>{item.detail}</p></div><a href={"/?screen=fashion&category=" + encodeURIComponent(item.id)} aria-label={`Shop ${item.name} collection`}>↗</a></div>
              </article>
            ))}
            {visibleCategories.length === 0 && <p className="empty-search">No matching category. Try “hoodies”, “kids” or “trousers”.</p>}
          </div>
          {!search && <button className="catalogue-more" type="button" onClick={() => setShowAll(!showAll)}>{showAll ? "Show less ↑" : "Explore all categories ↓"}</button>}
          <p className="catalogue-note">Select a product to review its listed price, available sizes, colours and stock. Contact our team if you need help confirming a particular variant.</p>
          </>}
          <div className="live-catalogue" aria-live="polite">
            <div className="live-catalogue-heading">
              <div><p className="eyebrow">LIVE FROM OUR CATALOGUE</p><h3>{selectedCategory?selectedCategory+" collection":"Featured pieces"}</h3>{selectedCategory&&<button type="button" className="text-link" onClick={()=>{const url=new URL(window.location.href);url.searchParams.delete("category");window.history.replaceState({screen:"fashion"},"",url.pathname+url.search);setSelectedCategory("");}}>Clear category ×</button>}</div>
              <div className="live-catalogue-actions"><span>REAL LISTINGS · UPDATED BY OUR TEAM</span><button type="button" className="cart-open-button" disabled={!cart.length} onClick={() => { setCartOpen(true); setCheckoutMessage(""); setCheckoutResult(""); }}>Cart ({cart.reduce((sum, item) => sum + item.quantity, 0)}) · {formatPrice(cartSubtotal)}</button></div>
            </div>
            <div className="live-catalogue-toolbar">
              <div className="live-catalogue-meta-chips" role="group" aria-label="Filter catalogue by collection">
                <button type="button" className={`category-filter-chip ${!selectedCategory ? "is-active" : ""}`} onClick={() => { setSelectedCategory(""); const url = new URL(window.location.href); url.searchParams.delete("category"); window.history.replaceState({ screen: "fashion" }, "", url.pathname + url.search); }}>All pieces ({products.length})</button>
                {categories.map((cat) => {
                  const count = products.filter((p) => matchesStoreCollection(p, cat.id)).length;
                  return (
                    <button key={cat.id} type="button" className={`category-filter-chip ${selectedCategory === cat.id ? "is-active" : ""}`} onClick={() => { setSelectedCategory(cat.id); const url = new URL(window.location.href); url.searchParams.set("category", cat.id); window.history.replaceState({ screen: "fashion" }, "", url.pathname + url.search); }}>
                      {cat.name.split(" ")[0]} ({count})
                    </button>
                  );
                })}
              </div>
              <div className="catalogue-sort-row">
                <label htmlFor="catalogue-sort-select" className="catalogue-sort-label">Sort by:</label>
                <select id="catalogue-sort-select" className="catalogue-sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                  <option value="featured">Featured listings</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="name">Product Name (A-Z)</option>
                </select>
              </div>
            </div>
            {catalogueState === "loading" && <p className="catalogue-feedback">Loading available listings…</p>}
            {catalogueState === "error" && <p className="catalogue-feedback">The live catalogue is not connected yet. Please contact our team for current collections.</p>}
            {catalogueState === "empty" && <p className="catalogue-feedback">New pieces are being added. Contact us to ask about current arrivals and availability.</p>}
            {catalogueState === "ready" && <div className="product-grid">
              {filteredProducts.slice(0,visibleProductCount).map((product) => {
                const totalAvail = product.variants.reduce((sum, v) => sum + (v.available_quantity || 0), 0);
                return (
                <article className="product-card" key={product.id} role="link" tabIndex={0} aria-label={"View "+product.name} onClick={(event)=>{if((event.target as HTMLElement).closest("a,button,input,select,textarea,label"))return;window.location.href="/product/"+encodeURIComponent(product.slug);}} onKeyDown={(event)=>{if((event.target as HTMLElement).closest("a,button,input,select,textarea,label"))return;if(event.key==="Enter"||event.key===" "){event.preventDefault();window.location.href="/product/"+encodeURIComponent(product.slug);}}}>
                  {productGalleryImages(product, selectedVariants[product.id]).length ? <ProductGallery className="product-visual product-photo dv-gallery-card" detailsHref={"/product/" + encodeURIComponent(product.slug)} images={productGalleryImages(product, selectedVariants[product.id], selectedVariantOptions[product.id]?.color)} /> : <div className="product-visual" aria-hidden="true"><span>DE VERVE</span><div className="product-garment"><i /></div><small>{product.category}</small></div>}
                  <div className="product-info">
                    <button type="button" className={favourites.includes(product.id) ? "favourite-toggle is-saved" : "favourite-toggle"} aria-label={favourites.includes(product.id) ? "Remove from favourites" : "Add to favourites"} aria-pressed={favourites.includes(product.id)} onClick={() => toggleFavourite(product.id)}>{favourites.includes(product.id) ? "♥ Saved" : "♡ Save"}</button>
                    <span className="product-audience">{product.audience} · {product.category}</span>
                    <h4><a className="product-title-link" href={"/product/" + encodeURIComponent(product.slug)}>{product.name}</a></h4>
                    <p>{product.description || "Contact our team for product details and available options."}</p>
                    {totalAvail > 0 && totalAvail <= 3 ? <span className="product-urgency-badge">🔥 Only {totalAvail} left</span> : totalAvail > 3 ? <span className="product-stock-badge">✓ In stock ({totalAvail})</span> : null}
                    {product.variants.length ? <ProductVariantPicker variants={product.variants} selectedVariantId={selectedVariants[product.id] || product.variants[0].id} selectedSize={selectedVariantOptions[product.id]?.size} selectedColor={selectedVariantOptions[product.id]?.color} onChange={(variantId,size,color) => {setSelectedVariants((current) => ({ ...current, [product.id]: variantId }));setSelectedVariantOptions((current)=>({...current,[product.id]:{size:size||"",color:color||""}}));}} compact /> : <span className="product-stock-note">Contact us for current availability</span>}
                    <div className="product-card-quick-actions">
                      <button type="button" className="product-quick-preview-btn" onClick={() => setDetailProduct(product)}>Quick view 👁</button>
                      <button type="button" className="product-size-guide-btn" onClick={() => setSizeGuideOpen(true)}>Size guide 📏</button>
                    </div>
                    <div className="product-buy-row"><strong>{formatPrice(product.retail_price_paisa)}</strong><button type="button" className="product-details-button" onClick={() => { window.location.href = "/product/" + encodeURIComponent(product.slug); }}>View details</button>{product.variants.length > 0 && product.retail_price_paisa !== null && <button type="button" disabled={!product.variants.some((variant) => variant.available_quantity > 0)} onClick={() => addToCart(product)}>{product.variants.some((variant) => variant.available_quantity > 0) ? "Add to cart +" : "Sold out"}</button>}</div>
                  </div>
                </article>
              );})}
            </div>}
            {catalogueState === "ready" && filteredProducts.length===0 && <p className="catalogue-feedback">No published products matched your criteria{search?` ("${search}")`:""}{selectedCategory?` in “${selectedCategory}”`:""}. Browse all products or contact our team for availability.</p>}{catalogueState === "ready" && filteredProducts.length > visibleProductCount && <div className="catalogue-pagination"><span>Showing {Math.min(visibleProductCount,filteredProducts.length)} of {filteredProducts.length} listings</span><button type="button" className="button button-outline" onClick={() => setVisibleProductCount((count)=>Math.min(count+8,filteredProducts.length))}>Load more products</button></div>}
          </div>
        </section>

        {detailProduct && <div className="checkout-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailProduct(null); }}><section className="checkout-modal product-detail-modal" role="dialog" aria-modal="true" aria-labelledby="product-detail-title">
          <div className="checkout-modal-heading"><div><p className="eyebrow">PRODUCT DETAILS</p><h2 id="product-detail-title">{detailProduct.name}</h2><p>{detailProduct.audience} · {detailProduct.category}</p></div><button type="button" className="checkout-close" onClick={() => setDetailProduct(null)} aria-label="Close product details">×</button></div>
          {productGalleryImages(detailProduct, selectedVariants[detailProduct.id]).length ? <ProductGallery className="product-detail-gallery" images={productGalleryImages(detailProduct, selectedVariants[detailProduct.id], selectedVariantOptions[detailProduct.id]?.color)} /> : <div className="product-detail-image product-visual"><span>DE VERVE</span></div>}
          <p>{detailProduct.description || "Please contact our team for more product information."}</p>
          <div className="product-detail-price">{formatPrice(detailProduct.retail_price_paisa)}</div>
          {detailProduct.variants.length > 0 ? <ProductVariantPicker variants={detailProduct.variants} selectedVariantId={selectedVariants[detailProduct.id] || detailProduct.variants[0].id} selectedSize={selectedVariantOptions[detailProduct.id]?.size} selectedColor={selectedVariantOptions[detailProduct.id]?.color} onChange={(variantId,size,color) => {setSelectedVariants((current) => ({ ...current, [detailProduct.id]: variantId }));setSelectedVariantOptions((current)=>({...current,[detailProduct.id]:{size:size||"",color:color||""}}));}} /> : <p className="product-stock-note">No purchasable size or colour option is currently listed. Ask our team to confirm availability.</p>}
          <div className="product-detail-actions">{detailProduct.variants.length > 0 && detailProduct.retail_price_paisa !== null && <button type="button" className="button button-primary" disabled={!detailProduct.variants.some((variant) => variant.available_quantity > 0)} onClick={() => { addToCart(detailProduct); setDetailProduct(null); }}>Add to cart</button>}<button type="button" className="button button-outline" onClick={() => setSizeGuideOpen(true)}>Size guide 📏</button><a className="button button-outline" href={whatsapp(`Assalamu Alaikum, I am interested in ${detailProduct.name}. Please confirm current sizes, colours, price and availability.`)} target="_blank" rel="noreferrer">WhatsApp enquiry</a><a className="button button-outline" href="mailto:deverve61@gmail.com?subject=Product%20Enquiry">Email enquiry</a></div>
        </section></div>}
        {sizeGuideOpen && <div className="checkout-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSizeGuideOpen(false); }}><section className="checkout-modal size-guide-modal" role="dialog" aria-modal="true" aria-labelledby="size-guide-title">
          <div className="checkout-modal-heading">
            <div>
              <p className="eyebrow">FIT & MEASUREMENTS</p>
              <h2 id="size-guide-title">Garment Size Guide</h2>
              <p>Product-specific measurements are confirmed with our team.</p>
            </div>
            <button type="button" className="checkout-close" onClick={() => setSizeGuideOpen(false)} aria-label="Close size guide">×</button>
          </div>
          <div className="size-guide-note">
            <strong>There is no single measurement chart for every garment.</strong>
            <p>Fit and measurements can vary by product, fabric, cut and manufacturer. We are not publishing a universal size chart until verified measurements are available for each item. Please check the selected product details or contact our team with the product name and your usual measurements before ordering.</p>
          </div>
          <div className="size-guide-actions">
            <button type="button" className="button button-outline" onClick={() => setSizeGuideOpen(false)}>Back to shopping</button>
            <a className="button button-primary" href={whatsapp("Assalamu Alaikum, I would like sizing assistance for my order.")} target="_blank" rel="noreferrer">Ask on WhatsApp ↗</a>
          </div>
        </section></div>}
        {vehicleDetail && <div className="checkout-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)setVehicleDetail(null);}}><section className="checkout-modal vehicle-detail-modal" role="dialog" aria-modal="true" aria-labelledby="vehicle-detail-title"><div className="checkout-modal-heading"><div><p className="eyebrow">DE VERVE MOBILITY · VEHICLE DETAILS</p><h2 id="vehicle-detail-title">{vehicleDetail.name}</h2><p>{vehicleDetail.vehicle_type} · {vehicleDetail.transmission} · {vehicleDetail.seats} seats</p></div><button type="button" className="checkout-close" onClick={()=>setVehicleDetail(null)} aria-label="Close vehicle details">×</button></div><div className="vehicle-detail-layout">{vehicleDetail.media?.length ? <ProductGallery className="vehicle-detail-gallery" images={vehicleDetail.media.map(item=>({id:item.id,url:item.url,alt_text:item.alt_text||vehicleDetail.name}))}/> : vehicleDetail.image_url ? <img className="vehicle-detail-image" src={vehicleDetail.image_url} alt={vehicleDetail.name}/> : <div className="vehicle-detail-image vehicle-detail-placeholder">DE VERVE</div>}<div className="vehicle-detail-copy"><p>{vehicleDetail.description||"Contact our rental team for availability and vehicle details."}</p><dl><div><dt>Vehicle type</dt><dd>{vehicleDetail.vehicle_type||"Not specified"}</dd></div><div><dt>Transmission</dt><dd>{vehicleDetail.transmission||"Not specified"}</dd></div><div><dt>Seats</dt><dd>{vehicleDetail.seats}</dd></div><div><dt>Fuel</dt><dd>{vehicleDetail.fuel_type||"Not specified"}</dd></div></dl><div className="vehicle-detail-rates"><div><span>Self drive</span><strong>{vehicleDetail.daily_rate_paisa===null?"Rate on request":formatPrice(vehicleDetail.daily_rate_paisa)+" / day"}</strong></div><div><span>With driver</span><strong>{vehicleDetail.with_driver_daily_rate_paisa==null?"Rate on request":formatPrice(vehicleDetail.with_driver_daily_rate_paisa)+" / day"}</strong></div></div><p className="checkout-disclaimer">Your request is subject to vehicle availability, document verification and confirmation of the final rental terms.</p><button type="button" className="button button-primary" onClick={()=>{const id=vehicleDetail.id;setVehicleDetail(null);void openRentalRequest(id);}}>Request this vehicle ↗</button></div></div></section></div>}
        {activeScreen === "favourites" ? (
          <section className="section favourites-section">
            <div className="section-heading"><div><p className="eyebrow">YOUR SAVED EDIT</p><h2>Favourites</h2></div><button type="button" className="text-link" onClick={() => navigate("fashion")}>Continue shopping →</button></div>
            {products.filter((product) => favourites.includes(product.id)).length === 0 ? <div className="catalogue-feedback">You have not saved any products yet. Browse the collection and tap Save on anything you like.</div> : <div className="product-grid">{products.filter((product) => favourites.includes(product.id)).map((product) => <article className="product-card" key={product.id}><div className="product-visual product-photo">{product.image_key ? <img src={"/media/" + product.image_key} alt={product.name} loading="lazy"/> : <span>DE VERVE</span>}</div><div className="product-info"><span className="product-audience">{product.audience} · {product.category}</span><h4>{product.name}</h4><strong>{formatPrice(product.retail_price_paisa)}</strong><div className="product-buy-row"><button type="button" onClick={() => setDetailProduct(product)}>View details</button><button type="button" className="favourite-toggle is-saved" onClick={() => toggleFavourite(product.id)}>♥ Remove</button></div></div></article>)}</div>}
          </section>
        ) : null}
        {cartOpen && <div className="checkout-backdrop cart-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}><section className="checkout-panel cart-panel" role="dialog" aria-modal="true" aria-labelledby="cart-title">
          <div className="checkout-heading"><div><p className="eyebrow">YOUR SHOPPING BAG</p><h2 id="cart-title">Your cart ({cart.reduce((sum,item)=>sum+item.quantity,0)})</h2><p>Review your selected products before continuing.</p></div><button type="button" aria-label="Close cart" onClick={() => setCartOpen(false)}>×</button></div>
          {cart.length===0 ? <div className="cart-empty-state"><strong>Your cart is waiting for something you love.</strong><p>Explore the collection and add a product to get started.</p><button type="button" className="button button-primary" onClick={()=>{setCartOpen(false);navigate("fashion");}}>Continue shopping <span>↗</span></button></div> : <>
            <div className="cart-shipping-tracker">
              {promotionPreview?.freeDelivery ? (
                <div className="cart-shipping-unlocked">
                  <span>✨</span> You qualify for the <strong>free-delivery offer</strong>. Delivery coverage is confirmed before dispatch.
                </div>
              ) : promotionPreview ? (
                <div className="cart-shipping-unlocked">
                  <span>✨</span> <strong>{promotionPreview.label}</strong> is selected for this order. Promotions cannot be combined.
                </div>
              ) : (
                <div className="cart-shipping-info">
                  <strong>Delivery charges are confirmed separately</strong>
                  <small>Our team will confirm the delivery area, fee and estimated timeline before dispatch. No free-delivery offer is applied unless a valid voucher is shown at checkout.</small>
                </div>
              )}
            </div>
            <div className="cart-line-list">{cart.map((item)=> <article className="cart-line-item" key={cartLineKey(item)}>
              <div className="cart-line-image" aria-hidden="true">{item.image_url?<img src={item.image_url} alt="" loading="lazy"/>:<span>DV</span>}</div>
              <div className="cart-line-main"><strong>{item.name}</strong><small>{[item.size,item.color].filter(Boolean).join(" · ")||"Standard option"}{item.sku?" · "+item.sku:""}</small><b>{formatPrice(item.unit_price_paisa)}</b>
                <div className="cart-line-controls"><button type="button" aria-label={"Decrease quantity of "+item.name} disabled={item.quantity<=1} onClick={()=>changeCartQuantity(item,item.quantity-1)}>−</button><output>{item.quantity}</output><button type="button" aria-label={"Increase quantity of "+item.name} disabled={item.quantity>=Math.min(10,item.available_quantity)} onClick={()=>changeCartQuantity(item,item.quantity+1)}>+</button><button type="button" className="cart-line-remove" onClick={()=>removeCartItem(item)}>Remove</button></div>
              </div><strong className="cart-line-total">{formatPrice(item.unit_price_paisa*item.quantity)}</strong>
            </article>)}</div>
            <div className="cart-summary"><div><span>Subtotal</span><strong>{formatPrice(cartSubtotal)}</strong></div>{promotionPreview&&<div><span>{promotionPreview.label}</span><strong>{promotionPreview.freeDelivery?"FREE":"−"+formatPrice(promotionPreview.amount)}</strong></div>}<div className="cart-summary-total"><span>Estimated total</span><strong>{formatPrice(cartSubtotal-(promotionPreview?.amount??0))}</strong></div><small>Delivery charges are confirmed before dispatch. Any eligible promotion is applied once; offers cannot be combined.</small></div>
            <div className="cart-actions"><button type="button" className="button button-outline" onClick={()=>setCartOpen(false)}>Continue shopping</button><button type="button" className="button button-primary" onClick={async()=>{try{const account=await fetch("/api/customer/me",{credentials:"same-origin",headers:{accept:"application/json"}});if(!account.ok){window.location.href="/account?next="+encodeURIComponent("/?checkout=open");return;}setCartOpen(false);setCheckoutMessage("");setCheckoutResult("");setCheckoutOpen(true);}catch{window.location.href="/account?next="+encodeURIComponent("/?checkout=open");}}}>Proceed to checkout <span>↗</span></button></div>
          </>}
        </section></div>}
        {checkoutOpen && <div className="checkout-backdrop"><section className="checkout-panel" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
          <div className="checkout-heading"><div><p className="eyebrow">SECURE ORDER REQUEST</p><h2 id="checkout-title">Choose how to pay</h2><p>Review your items and enter your delivery details.</p></div><button type="button" aria-label="Close checkout" onClick={() => setCheckoutOpen(false)}>×</button></div>
          {checkoutResult ? <div className="checkout-success"><strong>Order received</strong><span>{checkoutResult}</span><p>{checkoutMessage}</p>{selectedPaymentMethod!=="cod"&&paymentProvider!=="safepay"&&paymentMethods.find(method=>method.id===selectedPaymentMethod)&&<div className="checkout-payment-instructions"><strong>{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.label}</strong><p><b>Important:</b> Wait until De VERVE confirms the final payable amount, including delivery, before transferring money. Use the order number above as your payment reference.</p>{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.account_title&&<p>Account title: {paymentMethods.find(method=>method.id===selectedPaymentMethod)?.account_title}</p>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.bank_name&&<p>Bank: {paymentMethods.find(method=>method.id===selectedPaymentMethod)?.bank_name}</p>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.account_number&&<p>Account / wallet: {paymentMethods.find(method=>method.id===selectedPaymentMethod)?.account_number}</p>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.iban&&<p>IBAN: {paymentMethods.find(method=>method.id===selectedPaymentMethod)?.iban}</p>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.instructions&&<p>{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.instructions}</p>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.payment_url&&<a href={paymentMethods.find(method=>method.id===selectedPaymentMethod)?.payment_url} target="_blank" rel="noreferrer">Open payment link ↗</a>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.qr_media_id&&<img src={"/media/"+paymentMethods.find(method=>method.id===selectedPaymentMethod)?.qr_media_id} alt="Payment QR code" loading="lazy"/>}<small>Your order remains unpaid until the owner verifies the transfer. Keep your transaction receipt.</small></div>}<button type="button" className="button button-primary" onClick={() => setCheckoutOpen(false)}>Continue shopping</button></div> : <form className="checkout-form" data-draft-key="storefront-checkout" onSubmit={submitCheckout}>
            <div className="checkout-items">{cart.map((item) => <div className="checkout-item" key={cartLineKey(item)}><div><strong>{item.name}</strong><span>{[item.size, item.color].filter(Boolean).join(" / ") || item.sku || "Standard"}</span><small>{formatPrice(item.unit_price_paisa)} each</small></div><div className="checkout-quantity"><button type="button" aria-label="Decrease quantity" onClick={() => item.quantity === 1 ? removeCartItem(item) : changeCartQuantity(item, item.quantity - 1)}>−</button><span>{item.quantity}</span><button type="button" aria-label="Increase quantity" disabled={item.quantity >= item.available_quantity} onClick={() => changeCartQuantity(item, item.quantity + 1)}>+</button></div><strong>{formatPrice(item.unit_price_paisa * item.quantity)}</strong></div>)}</div>
            <div className="checkout-coupon-field"><label htmlFor="checkout-coupon-code">Voucher code (optional)</label><div><input id="checkout-coupon-code" autoComplete="off" maxLength={64} value={checkoutForm.coupon_code} onChange={(event)=>{updateCheckoutForm({...checkoutForm,coupon_code:event.target.value.toUpperCase()});setCouponPreview(null);}} placeholder="Enter your De VERVE voucher"/><button type="button" className="button button-secondary" disabled={checkoutBusy||!checkoutForm.coupon_code.trim()} onClick={()=>void applyCheckoutCoupon()}>Apply voucher</button></div><small>Vouchers are customer-specific where applicable and cannot be combined.</small></div>
            <div className="checkout-total"><span>Subtotal</span><strong>{formatPrice(cartSubtotal)}</strong>{promotionPreview && <><span>{promotionPreview.label}</span><strong>{promotionPreview.freeDelivery ? "FREE" : "−"+formatPrice(promotionPreview.amount)}</strong></>}<span>Estimated total before delivery</span><strong>{formatPrice(cartSubtotal-(promotionPreview?.amount??0))}</strong><span>Delivery</span><strong>{promotionPreview?.freeDelivery ? "FREE" : "Confirmed before dispatch"}</strong><span>Payment</span><strong>{paymentProvider === "safepay" ? (onlinePaymentEnvironment === "production" ? "Card / online payment" : "Card / online payment (sandbox)") : (paymentMethods.find(method=>method.id===selectedPaymentMethod)?.label??"Cash on delivery")}</strong></div>
            <fieldset className="checkout-payment-options"><legend>Payment method</legend>{paymentMethods.map(method=><label key={method.id}><input type="radio" name="payment_method" checked={paymentProvider==="manual"&&selectedPaymentMethod===method.id} onChange={()=>{setPaymentProvider("manual");setSelectedPaymentMethod(method.id);}}/> {method.label}{method.provider&&<small> · {method.provider}</small>}</label>)}{onlinePaymentAvailable&&<label><input type="radio" name="payment_method" checked={paymentProvider==="safepay"} onChange={()=>{setPaymentProvider("safepay");setSelectedPaymentMethod(paymentMethods.find(method=>method.kind==="cod")?.id??"cod");}}/> Safepay secure checkout <small>{onlinePaymentEnvironment==="production"?"Live gateway":"Sandbox"}</small></label>}{paymentProvider==="safepay"&&<p className="checkout-policy-note">Safepay checkout requires a De VERVE customer account. <a href="/account">Sign in or create an account</a>.</p>}{paymentProvider==="manual"&&paymentMethods.find(method=>method.id===selectedPaymentMethod&&method.kind!=="cod")&&<div className="checkout-payment-instructions"><strong>{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.label}</strong>{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.account_title&&<p>Account title: {paymentMethods.find(method=>method.id===selectedPaymentMethod)?.account_title}</p>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.bank_name&&<p>Bank: {paymentMethods.find(method=>method.id===selectedPaymentMethod)?.bank_name}</p>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.account_number&&<p>Account / wallet: {paymentMethods.find(method=>method.id===selectedPaymentMethod)?.account_number}</p>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.iban&&<p>IBAN: {paymentMethods.find(method=>method.id===selectedPaymentMethod)?.iban}</p>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.instructions&&<p>{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.instructions}</p>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.payment_url&&<a href={paymentMethods.find(method=>method.id===selectedPaymentMethod)?.payment_url} target="_blank" rel="noreferrer">Open payment link ↗</a>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.qr_media_id&&<img src={"/media/"+paymentMethods.find(method=>method.id===selectedPaymentMethod)?.qr_media_id} alt="Payment QR code" loading="lazy"/>}<small>Orders paid by direct transfer remain pending until De VERVE verifies the payment. Include your order number in the transfer reference.</small></div>}</fieldset><div className="checkout-fields">
              <label>Full name<input required minLength={2} maxLength={100} autoComplete="name" value={checkoutForm.customer_name} onChange={(event) => updateCheckoutForm({ ...checkoutForm, customer_name: event.target.value })} /></label>
              <label>Phone / WhatsApp<input required type="tel" minLength={8} maxLength={24} autoComplete="tel" value={checkoutForm.phone} onChange={(event) => updateCheckoutForm({ ...checkoutForm, phone: event.target.value })} /></label>
              <label>Email (optional)<input type="email" maxLength={160} autoComplete="email" value={checkoutForm.email} onChange={(event) => updateCheckoutForm({ ...checkoutForm, email: event.target.value })} /></label>
              <label>City<input required minLength={2} maxLength={80} autoComplete="address-level2" value={checkoutForm.city} onChange={(event) => updateCheckoutForm({ ...checkoutForm, city: event.target.value })} /></label>
              <label className="checkout-address">Complete delivery address<textarea required minLength={8} maxLength={300} rows={3} autoComplete="street-address" value={checkoutForm.delivery_address} onChange={(event) => updateCheckoutForm({ ...checkoutForm, delivery_address: event.target.value })} /></label>
              <label className="checkout-address">Order note (optional)<textarea maxLength={500} rows={2} value={checkoutForm.customer_note} onChange={(event) => updateCheckoutForm({ ...checkoutForm, customer_note: event.target.value })} /></label>
              <label className="form-trap" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={checkoutForm.website} onChange={(event) => updateCheckoutForm({ ...checkoutForm, website: event.target.value })} /></label>
            </div>
            <p className="checkout-disclaimer">{paymentProvider === "safepay" ? (onlinePaymentEnvironment === "production" ? "You will be redirected to Safepay's secure checkout after the final delivery fee is approved." : "This is a sandbox payment request. The final delivery fee must be approved before any test payment can begin.") : "No online payment is collected. De VERVE will send a secure link to confirm delivery charges and your final COD total before dispatch."}</p>
            {checkoutMessage && <p className="checkout-message" role="alert">{checkoutMessage}</p>}
            <p className="checkout-policy-note">Before placing your order, please review the <button type="button" onClick={() => { setCheckoutOpen(false); navigate("policies"); }}>exchange and privacy policies</button>. You can return to your cart to continue.</p>
             <TurnstileWidget resetKey={checkoutTurnstileReset} onToken={setCheckoutTurnstileToken} />
             <button type="submit" className="button button-primary checkout-submit" disabled={checkoutBusy || !cart.length || !checkoutTurnstileToken}>{checkoutBusy ? "Placing order…" : "Place order"} <span>↗</span></button>
          </form>}
        </section></div>}

        <section className="wholesale-section" id="wholesale">
          <div className={"wholesale-art"+(siteDesign.section_images.wholesale?" has-owner-art":"")}>
            <div className="wholesale-art-mark">DV<span>.</span></div>
            <span className="wholesale-caption">YOUR STORE. YOUR STYLE.<br />YOUR BUSINESS PARTNER.</span>
          </div>
          <div className="wholesale-copy">
            <p className="eyebrow">02 — RETAIL & WHOLESALE</p>
            <h2>Shop your way.<br /><em>Grow your business.</em></h2>
            <div className="shopping-tabs" role="tablist" aria-label="Shopping options">
              <button type="button" role="tab" aria-selected={activeTab === "retail"} className={activeTab === "retail" ? "active" : ""} onClick={() => setActiveTab("retail")}>Retail</button>
              <button type="button" role="tab" aria-selected={activeTab === "wholesale"} className={activeTab === "wholesale" ? "active" : ""} onClick={() => setActiveTab("wholesale")}>Wholesale</button>
            </div>
            {activeTab === "retail" ? (
              <div className="tab-panel"><h3>Find the right look.</h3><p>Tell us what you are looking for and our team will help with available styles, sizes and pricing. Product details are confirmed before an order is accepted.</p><a className="text-link" href={whatsapp("Assalamu Alaikum, I have a retail product enquiry.")} target="_blank" rel="noreferrer">Ask about a product ↗</a></div>
            ) : (
              <div className="tab-panel"><h3>Buying for your business?</h3><p>Share the garment types and quantities you need. Our team can discuss available lots, wholesale options and a quotation.</p><a className="text-link" href={whatsapp("Assalamu Alaikum, I am interested in wholesale garments. Please guide me about available lots and rates.")} target="_blank" rel="noreferrer">Request a wholesale quote ↗</a></div>
            )}
          </div>
        </section>

        <section className={"mobility-section"+(siteDesign.section_images.mobility?" has-owner-art":"")} id="mobility">
          <div><p className="eyebrow">03 — DE VERVE MOBILITY</p><h2>Make room for<br /><em>the journey.</em></h2></div>
          <div className="mobility-copy"><span className="mobility-icon">↗</span><p>Browse the available fleet or send a date-based rental request. Availability, rates, documents and rental terms are confirmed by our team before any booking is accepted.</p><button type="button" className="button button-light" onClick={() => openRentalRequest()}>Request a rental <span>↗</span></button></div>
          {vehicles.length > 0 && <div className="mobility-fleet"><div className="mobility-fleet-heading"><span>AVAILABLE FLEET</span><p>Choose a vehicle to start your request.</p></div><div className="mobility-vehicle-grid">{vehicles.map((vehicle) => <article className="mobility-vehicle-card" key={vehicle.id} role="link" tabIndex={0} aria-label={"View " + vehicle.name + " details"} onClick={(event)=>{if((event.target as HTMLElement).closest("button,a,input,select,textarea,label"))return;setVehicleDetail(vehicle);}} onKeyDown={(event)=>{if((event.target as HTMLElement).closest("button,a,input,select,textarea,label"))return;if(event.key==="Enter"||event.key===" "){event.preventDefault();setVehicleDetail(vehicle);}}}>
            {vehicle.media?.length ? <ProductGallery className="mobility-vehicle-gallery" onActivate={()=>setVehicleDetail(vehicle)} images={vehicle.media.map((item) => ({ id: item.id, url: item.url, alt_text: item.alt_text || vehicle.name }))} /> : vehicle.image_url ? <img src={vehicle.image_url} alt={vehicle.name} loading="lazy" /> : <div className="mobility-vehicle-placeholder">DV<span>.</span></div>}
            <div><small>{vehicle.vehicle_type} · {vehicle.seats} seats</small><h3>{vehicle.name}</h3><p>{vehicle.description || [vehicle.transmission, vehicle.fuel_type].filter(Boolean).join(" · ")}</p><strong>{vehicle.daily_rate_paisa === null ? "Rate on request" : formatPrice(vehicle.daily_rate_paisa) + " / day"}</strong><button type="button" onClick={() => openRentalRequest(vehicle.id)}>Request this vehicle ↗</button></div>
          </article>)}</div></div>}
        </section>

        <section className="faq-section" id="faq" aria-label="Frequently Asked Questions">
          <div className="section-heading">
            <div>
              <p className="eyebrow">COMMON QUESTIONS</p>
              <h2>Frequently asked<br /><em>questions.</em></h2>
            </div>
            <p className="section-aside">Clear answers to help you shop and rent with complete confidence.</p>
          </div>
          <div className="faq-list">
            {[
              { q: "How do I place an order and what payment options are accepted?", a: "Choose an available product variant, add it to your cart and submit your order request. The payment methods currently enabled by De VERVE are shown at checkout; available methods can change. A direct bank or wallet transfer remains pending until the owner verifies the payment. Online gateway checkout is offered only when it is enabled for the current environment." },
              { q: "How fast is shipping and what are the delivery charges?", a: "Delivery areas, charges and estimated timelines are confirmed by our team before dispatch. Timelines may vary by destination, courier operations, weather and public holidays. Any promotion or free-delivery offer is applied only when the checkout shows it for your order." },
              { q: "What is the De VERVE exchange policy?", a: "Eligible items may be submitted for exchange within 7 calendar days of delivery if unused, unworn, unwashed and unaltered, with original tags and packaging. Requests are subject to inspection, approval and replacement stock. Hygiene-sensitive items such as opened or used socks and boxers are excluded except where applicable law requires otherwise. Start an eligible request from your Customer Account." },
              { q: "How does car rental with De VERVE Mobility work?", a: "Submit a rental request with your preferred vehicle and dates. A request is not a confirmed booking. Vehicle availability, driver arrangement, rates, deposit and other terms are confirmed in a written rental agreement before handover. The secure form requests both sides of a valid CNIC for rental verification." },
              { q: "Can I visit your showroom in Jhelum?", a: "Our listed location is the basement of Ali Plaza, Kachahri Road, near Khawateen College and opposite Ali Mobile, Jhelum. Please contact our team before travelling to confirm current opening hours and availability." }
            ].map((faq, idx) => (
              <div key={idx} className={`faq-item ${openFaq === idx ? "is-open" : ""}`}>
                <button type="button" className="faq-question" onClick={() => setOpenFaq(openFaq === idx ? null : idx)} aria-expanded={openFaq === idx}>
                  <span>{faq.q}</span>
                  <span className="faq-toggle-icon">{openFaq === idx ? "−" : "+"}</span>
                </button>
                {openFaq === idx && <div className="faq-answer"><p>{faq.a}</p></div>}
              </div>
            ))}
          </div>
        </section>

        <section className="contact-section" id="contact">
          <p className="eyebrow">04 — VISIT OR CONTACT</p>
          <h2>Let's make it<br /><em>happen.</em></h2>
          <p>For fashion, wholesale or car rental enquiries, connect with De VERVE in Jhelum.</p>
          <div className="contact-details">
            <div><span>VISIT OUR STORE</span><strong>Kachahri Road, near Khawateen College,<br />opposite Ali Mobile, basement of Ali Plaza,<br />Jhelum, Pakistan</strong></div>
            <div><span>CALL / WHATSAPP</span><strong>+92 319 7553705</strong></div>
            <div><span>EMAIL</span><strong><a href="mailto:deverve61@gmail.com">deverve61@gmail.com</a></strong></div>
            <div><span>OUR SERVICES</span><strong>Fashion retail · Wholesale · Car rentals</strong></div>
          </div>
          <div className="contact-actions">
            <a className="button button-primary" href={whatsapp("Assalamu Alaikum De VERVE, I would like to enquire.")} target="_blank" rel="noreferrer">Chat on WhatsApp <span>↗</span></a>
            <a className="button button-outline" href="mailto:deverve61@gmail.com?subject=De%20VERVE%20Enquiry">Email De VERVE <span>↗</span></a>
            <a className="button button-outline" href="https://www.google.com/maps/search/?api=1&query=Ali+Plaza+Kachahri+Road+Jhelum+Pakistan" target="_blank" rel="noreferrer">Find our location <span>↗</span></a>
          </div>
          <form className="enquiry-form" data-draft-key="storefront-enquiry" onSubmit={submitEnquiry}>
            <h3>Send us an enquiry</h3>
            <div className="enquiry-fields">
              <label>Your name<input required minLength={2} maxLength={100} autoComplete="name" value={enquiry.name} onChange={(event) => updateEnquiry({ ...enquiry, name: event.target.value })} /></label>
              <label>Phone / WhatsApp<input required type="tel" minLength={8} maxLength={24} autoComplete="tel" value={enquiry.phone} onChange={(event) => updateEnquiry({ ...enquiry, phone: event.target.value })} /></label>
              <label>Email (optional)<input type="email" maxLength={160} autoComplete="email" value={enquiry.email} onChange={(event) => updateEnquiry({ ...enquiry, email: event.target.value })} /></label>
              <label>Enquiry type<select value={enquiry.enquiryType} onChange={(event) => updateEnquiry({ ...enquiry, enquiryType: event.target.value })}><option value="general">General</option><option value="retail">Retail fashion</option><option value="wholesale">Wholesale / bulk order</option><option value="rental">Car rental</option><option value="complaint">Complaint / service issue</option><option value="dmca">DMCA / copyright notice</option><option value="legal">Legal / compliance matter</option><option value="business">Business / partnership</option><option value="other">Other important matter</option></select></label>
              <label className="enquiry-message">How can we help?<textarea required minLength={5} maxLength={3000} rows={4} value={enquiry.message} onChange={(event) => updateEnquiry({ ...enquiry, message: event.target.value })} /></label>
              <label className="form-trap" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={enquiry.website} onChange={(event) => updateEnquiry({ ...enquiry, website: event.target.value })} /></label>
            </div>
            <div className="enquiry-submit"><button className="button button-primary" type="submit" disabled={sending}>{sending ? "Sending..." : "Send enquiry"} <span>↗</span></button><p role="status" aria-live="polite">{submitMessage}</p></div>
          </form>
          <small>Prices, product availability, delivery, payment and rental terms are confirmed directly by the De VERVE team.</small>
        </section>
        {activeScreen === "policies" && <Policies />}
      </main>

      {rentalOpen && <div className="checkout-backdrop rental-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !rentalBusy) setRentalOpen(false); }}><section className="checkout-modal rental-modal" role="dialog" aria-modal="true" aria-labelledby="rental-modal-title" aria-describedby="rental-modal-description">
        <div className="checkout-modal-heading"><div><p className="eyebrow">DE VERVE MOBILITY</p><h2 id="rental-modal-title">Request a rental.</h2><p id="rental-modal-description">Complete the details and identity verification. Your booking is not confirmed until De VERVE approves it.</p></div><button type="button" className="checkout-close" onClick={() => setRentalOpen(false)} aria-label="Close rental request">×</button></div>
        {rentalReference ? <div className="rental-success"><strong>Rental request submitted successfully</strong><span>Reference: {rentalReference}</span><p>{rentalMessage}</p><p>{rentalDocsMessage}</p><p>{rentalSubmittedEstimatePaisa !== null ? "Your confirmed estimate: " + formatPrice(rentalSubmittedEstimatePaisa) : "Our team will confirm the final rental price."}</p><button type="button" className="button button-primary" onClick={() => setRentalOpen(false)}>Close</button></div> : <form className="checkout-form" data-draft-key="storefront-rental-request" onSubmit={submitRentalRequest} onInvalidCapture={(event) => { const field = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement; const label = field.labels?.[0]?.textContent?.replace(/\*/g, "").trim(); const message = (label ? label + ": " : "") + (field.validationMessage || "Please complete all required fields before submitting."); setRentalNotice({ kind: "error", message }); field.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
          <p className="required-fields-note"><span className="required-star">*</span> Required fields. Email and additional details are optional.</p>
          <section className="rental-security-block" aria-label="Required security verification"><p className="required-fields-note">Complete this security check to protect your rental request. You can finish the form first and return here before submitting.</p><TurnstileWidget resetKey={rentalTurnstileReset} onToken={setRentalTurnstileToken} /></section>
          <div className="checkout-fields">
            <label>Vehicle{vehicles.length > 0 && <span className="required-star" aria-hidden="true"> *</span>}<select required={vehicles.length > 0} value={rentalForm.vehicle_id} onChange={(e) => updateRentalForm({ ...rentalForm, vehicle_id: e.target.value })}><option value="">{vehicles.length > 0 ? "Select a vehicle" : "Any available vehicle"}</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name} · {vehicle.vehicle_type}</option>)}</select></label>
            {vehicles.length === 0 && <p className="checkout-disclaimer">No vehicles are currently listed. You may still request a rental, but the automatic estimate will be unavailable until the De VERVE team adds vehicles and daily rates.</p>}
            <label>Your name<span className="required-star" aria-hidden="true"> *</span><input required minLength={2} maxLength={100} autoComplete="name" value={rentalForm.customer_name} onChange={(e) => updateRentalForm({ ...rentalForm, customer_name: e.target.value })} /></label>
            <label>Phone / WhatsApp<span className="required-star" aria-hidden="true"> *</span><input required type="tel" maxLength={24} autoComplete="tel" value={rentalForm.phone} onChange={(e) => updateRentalForm({ ...rentalForm, phone: e.target.value })} /></label>
            <label>Email (optional)<input type="email" maxLength={160} value={rentalForm.email} onChange={(e) => updateRentalForm({ ...rentalForm, email: e.target.value })} /></label>
            <label>Pickup city<span className="required-star" aria-hidden="true"> *</span><input required minLength={2} maxLength={80} value={rentalForm.pickup_city} onChange={(e) => updateRentalForm({ ...rentalForm, pickup_city: e.target.value })} /></label>
            <label>Pickup complete address<span className="required-star" aria-hidden="true"> *</span><input required minLength={8} maxLength={300} autoComplete="street-address" placeholder="House, street, area or landmark" value={rentalForm.pickup_address} onChange={(e) => updateRentalForm({ ...rentalForm, pickup_address: e.target.value })} /></label>
            <label>Destination city<span className="required-star" aria-hidden="true"> *</span><input required minLength={2} maxLength={80} value={rentalForm.destination_city} onChange={(e) => updateRentalForm({ ...rentalForm, destination_city: e.target.value })} /></label>
            <label>Destination complete address<span className="required-star" aria-hidden="true"> *</span><input required minLength={5} maxLength={300} placeholder="Area, street or drop-off point" value={rentalForm.destination_address} onChange={(e) => updateRentalForm({ ...rentalForm, destination_address: e.target.value })} /></label>
            <label>Pickup date & time<span className="required-star" aria-hidden="true"> *</span><input type="datetime-local" required min={localDateTime(new Date())} value={rentalForm.pickup_at} onChange={(e) => updateRentalForm({ ...rentalForm, pickup_at: e.target.value })} /></label>
            <label>Return date & time<span className="required-star" aria-hidden="true"> *</span><input type="datetime-local" required min={rentalForm.pickup_at} value={rentalForm.return_at} onChange={(e) => updateRentalForm({ ...rentalForm, return_at: e.target.value })} /></label>
            <label>Driver option<span className="required-star" aria-hidden="true"> *</span><select required value={rentalForm.driver_option} onChange={(e) => updateRentalForm({ ...rentalForm, driver_option: e.target.value })}><option value="with_driver">With driver</option><option value="self_drive">Self drive (subject to approval)</option></select></label>
            <label className="checkout-address">Additional details (optional)<textarea rows={2} maxLength={500} value={rentalForm.customer_note} onChange={(e) => updateRentalForm({ ...rentalForm, customer_note: e.target.value })} /></label>
            <div className="rental-documents-upload rental-documents-preupload"><h3>Mandatory CNIC verification<span className="required-star" aria-hidden="true"> *</span></h3><p>Both sides of your valid CNIC are required for identity matching, rental approval, fraud prevention, vehicle security and relevant rental-history checks. Images are stored in private, access-controlled storage linked to your rental record. Only the owner and specifically authorised rental managers or staff may view them; access is logged.</p><p><strong>Retention:</strong> CNIC images are scheduled for deletion 90 days after all rental payments, damages, charges, fees, challans (if any) and related obligations have been fully cleared. The 90-day period does not begin while a relevant amount, damage assessment, challan, dispute or claim remains unresolved. You may request deletion by contacting De VERVE with your rental reference. Staff review the request and the owner or an authorised manager records the decision. A documented legal hold or other applicable legal requirement may affect the timing. Read the full <button type="button" className="text-link" onClick={() => { setRentalOpen(false); navigate("policies"); }}>privacy and rental policy</button>.</p><p>JPG, PNG or WebP; maximum 4 MB per image. Do not upload another person's CNIC unless you are authorised to act for them.</p><label>CNIC front image<span className="required-star" aria-hidden="true"> *</span><input type="file" accept="image/jpeg,image/png,image/webp" required onChange={(e)=>setRentalFrontFile(e.target.files?.[0]??null)}/></label>{rentalFrontFile && <small>Selected: {rentalFrontFile.name}</small>}<label>CNIC back image<span className="required-star" aria-hidden="true"> *</span><input type="file" accept="image/jpeg,image/png,image/webp" required onChange={(e)=>setRentalBackFile(e.target.files?.[0]??null)}/></label>{rentalBackFile && <small>Selected: {rentalBackFile.name}</small>}<label className="rental-consent"><input type="checkbox" required checked={rentalDocsConsent} onChange={(e)=>setRentalDocsConsent(e.target.checked)}/> I confirm that I am authorised to submit these documents and acknowledge the CNIC purposes, restricted access, 90-day post-clearance retention rule and deletion-request process explained above and in the De VERVE privacy policy.<span className="required-star" aria-hidden="true"> *</span></label></div>
            <section className="rental-price-estimate" aria-live="polite"><strong>Rental price estimate</strong>{rentalDurationDays > 0 ? <p>{rentalDurationDays} rental day{rentalDurationDays===1?"":"s"} · {rentalForm.driver_option==="with_driver"?"With driver":"Self drive"} · {rentalDailyRatePaisa!==null&&rentalDailyRatePaisa!==undefined?formatPrice(rentalDailyRatePaisa)+" / day":"Rate to be confirmed"}</p> : <p>Select valid pickup and return dates to calculate the duration.</p>}<strong className="rental-estimate-total">{rentalEstimatedTotalPaisa!==null?formatPrice(rentalEstimatedTotalPaisa):"Final price will be confirmed by De VERVE"}</strong><small>Full 24-hour rental periods are rounded up to the next day. Fuel, tolls, deposits, extra hours and route charges are confirmed separately before booking.</small></section>
            <label className="form-trap" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={rentalForm.website} onChange={(e) => updateRentalForm({ ...rentalForm, website: e.target.value })} /></label>
          </div>
          {rentalMessage && <p className="checkout-message" role="alert">{rentalMessage}</p>}
          <p className="checkout-disclaimer">This is a request, not a confirmed booking. De VERVE will verify documents, vehicle availability, final price and rental terms before confirmation.</p>
          <p className="checkout-policy-note">Please review the rental and privacy policies before submitting. <button type="button" onClick={() => { setRentalOpen(false); navigate("policies"); }}>Read rental terms</button>.</p>
          {rentalSettingsLoading && <p className="checkout-message" role="status">Checking secure rental settings…</p>}
          {!rentalCnicUploadsEnabled && !rentalSettingsLoading && <div className="checkout-message" role="alert"><p>{rentalSettingsError || "Secure CNIC uploads are not enabled. Your rental request cannot be submitted until this is resolved."}</p><button type="button" className="turnstile-retry" onClick={() => void loadRentalSettings()}>Retry rental security settings</button></div>}
          <button type="submit" className="button button-primary checkout-submit" disabled={rentalBusy || rentalSettingsLoading || !rentalCnicUploadsEnabled}>{rentalBusy ? "Submitting securely…" : "Submit rental request"} <span>↗</span></button>
        </form>}
      </section></div>}
      {rentalNotice && <div className={`dv-toast ${rentalNotice.kind === "success" ? "is-success" : "is-error"}`} role={rentalNotice.kind === "error" ? "alert" : "status"} aria-live={rentalNotice.kind === "error" ? "assertive" : "polite"}><span aria-hidden="true">{rentalNotice.kind === "success" ? "✓" : "!"}</span><p>{rentalNotice.message}</p><button type="button" onClick={() => setRentalNotice(null)} aria-label="Dismiss notification">×</button></div>}
      {activeScreen==="home"&&featuredReviews.length>0&&<section className={"testimonials-section"+(siteDesign.section_images.testimonials?" has-owner-art":"")} aria-label="Published customer feedback">
        <div className="section-heading"><div><p className="eyebrow">PUBLISHED CUSTOMER FEEDBACK</p><h2>Words from our<br/><em>customers.</em></h2></div><p className="section-aside">Customer experiences, shared in their own words.</p></div>
        <div className="testimonials-grid">{featuredReviews.map(review=><article className="testimonial-card" key={review.id}><div><div className="testimonial-rating" aria-label={review.rating+" out of 5 stars"}>{"★".repeat(Math.max(0,Math.min(5,review.rating)))}</div><p>{review.body}</p></div><div className="testimonial-author"><strong>{review.reviewer_name||"Customer"}</strong><small>{review.product_name} · {review.verified_purchase===1?"Verified purchase":"Customer feedback"}</small></div></article>)}</div>
      </section>}
      <footer className={"site-footer"+(siteDesign.section_images.footer?" has-owner-art":"")}>
        <a className="footer-wordmark" href="#home"><img className="brand-logo-image" src={brandAssets.logo_id?"/media/"+brandAssets.logo_id:"/api/brand/logo"} alt="De VERVE"/></a>
        <p>Elevate Your Style · Jhelum, Pakistan</p>
        <nav className="footer-policy-links" aria-label="Customer policies"><button type="button" onClick={() => navigate("policies")}>Policies / پالیسیاں</button></nav>
        {Object.entries(socialLinks).filter(([,url])=>Boolean(url)).length>0 && <nav className="footer-social-links" aria-label="De VERVE social accounts">{Object.entries(socialLinks).filter(([,url])=>Boolean(url)).map(([platform,url])=><a key={platform} href={url} target="_blank" rel="noreferrer" aria-label={"Visit De VERVE on "+platform}><span className="footer-social-icon" aria-hidden="true">{socialGlyphs[platform] ?? "↗"}</span><span className="footer-social-label">{platform}</span></a>)}</nav>}
        <span>© 2026 DE VERVE. ALL RIGHTS RESERVED.</span>
        <small className="site-credit">Website Design &amp; Development: <strong>Syed Nabeel Wasti</strong></small>
      </footer>
      <nav className="mobile-dock" aria-label="Quick navigation"><button type="button" className={activeScreen === "home" ? "active" : ""} onClick={() => navigate("home")}><span>⌂</span>Home</button><button type="button" className={activeScreen === "fashion" ? "active" : ""} onClick={() => navigate("fashion")}><span>◇</span>Shop</button><button type="button" onClick={() => { setCartOpen(true); setCheckoutMessage(""); setCheckoutResult(""); }}><span>▣</span>Cart <i>{cart.reduce((sum,item)=>sum+item.quantity,0)}</i></button><button type="button" className={activeScreen === "favourites" ? "active" : ""} onClick={() => navigate("favourites")}><span>♡</span>Saved</button><button type="button" className={activeScreen === "mobility" ? "active" : ""} onClick={() => navigate("mobility")}><span>↗</span>Rent</button></nav>
    </div>
  );
}

function BrandLoadingScreen(){
  return <main className="brand-loading-screen" role="status" aria-live="polite" aria-label="Loading De VERVE"><div className="brand-loader-orbit brand-loader-orbit-one"/><div className="brand-loader-orbit brand-loader-orbit-two"/><BrandLogo className="brand-loader-logo"/><div className="brand-loader-wordmark">DE VERVE</div><div className="brand-loader-caption">ELEVATE YOUR EVERYDAY</div><div className="brand-loader-track"><i/></div></main>
}

function HomePageRoute() {
  const requestedScreen=new URLSearchParams(window.location.search).get("screen");
  const [hasCmsHome,setHasCmsHome]=useState<boolean|null>(null);
  useEffect(()=>{let active=true;void fetch("/api/pages/home",{headers:{accept:"application/json"}}).then(response=>{if(active)setHasCmsHome(response.ok);}).catch(()=>{if(active)setHasCmsHome(false);});return()=>{active=false;};},[]);
  if(requestedScreen&&["fashion","wholesale","mobility","contact","favourites","policies"].includes(requestedScreen))return <Storefront/>;
  if(hasCmsHome===null)return <BrandLoadingScreen/>;
  return hasCmsHome?<PublicPage homeMode/>:<Storefront/>;
}

export default function App() {
  const path=window.location.pathname;
  const isAdmin=path.startsWith("/admin");
  return <><BrandHead /><FormDraftPersistence />{!isAdmin&&<AIChatWidget />}<Suspense fallback={<BrandLoadingScreen/>}>{path.startsWith("/product/") ? <ProductPage /> : path.startsWith("/pages/") ? <PublicPage /> : path.startsWith("/account") ? <CustomerAccount /> : isAdmin ? <Admin /> : path.startsWith("/wholesale/quote/") ? <WholesaleQuote /> : path === "/delivery-confirmation" ? <DeliveryFeeApproval /> : path === "/" || path === "/index.html" ? <HomePageRoute /> : <NotFound />}</Suspense></>;
}

