import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import InstallPrompt from "./InstallPrompt";
import Admin from "./Admin";
import WholesaleQuote from "./WholesaleQuote";
import DeliveryFeeApproval from "./DeliveryFeeApproval";
import Policies from "./Policies";
import CustomerAccount from "./CustomerAccount";
import PublicPage from "./PublicPage";
import ProductPage from "./ProductPage";
import ProductGallery from "./ProductGallery";
import ProductVariantPicker from "./ProductVariantPicker";

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

type StoreVariant = { id: string; sku: string | null; size: string; color: string; available_quantity: number };
type StoreProductMedia = { id: string; media_type: "image" | "video"; mime_type: string; alt_text: string; caption: string; is_primary: number; color?: string; url: string };
type StoreProduct = { id: string; slug: string; name: string; description: string; category: string; audience: string; retail_price_paisa: number | null; image_key: string | null; seo_title: string; seo_description: string; variants: StoreVariant[]; media: StoreProductMedia[] };
type StoreVehicle = { id: string; name: string; vehicle_type: string; transmission: string; seats: number; fuel_type: string; daily_rate_paisa: number | null; with_driver_daily_rate_paisa?: number | null; image_key: string | null; image_url: string | null; description: string; media?: Array<{id:string;url:string;alt_text:string;position:number;is_primary:number}> };
type CartLine = { variant_id: string; product_id: string; name: string; sku: string | null; size: string; color: string; quantity: number; unit_price_paisa: number; available_quantity: number };

function splitProductOptions(value: string) { return [...new Set(value.split(/[,;|\n]+/).map(item => item.trim()).filter(Boolean))]; }
function productGalleryImages(product: StoreProduct, selectedVariantId?: string, selectedColor?: string) {
  const selected = product.variants.find((variant) => variant.id === selectedVariantId && variant.available_quantity > 0)
    || product.variants.find((variant) => variant.available_quantity > 0)
    || product.variants.find((variant) => variant.id === selectedVariantId);
  const colour = (selectedColor || splitProductOptions(selected?.color || "")[0] || "").trim().toLowerCase();
  const relevant = product.media.filter((item) => item.media_type === "image" && (!item.color || !item.color.trim() || !colour || item.color.trim().toLowerCase() === colour));
  if (relevant.length) return relevant.map((item) => ({ id: item.id, url: item.url, alt_text: item.alt_text || product.name }));
  if (product.media.some((item) => item.color?.trim())) return [];
  return product.image_key ? [{ id: "cover", url: "/media/" + product.image_key, alt_text: product.name }] : [];
}

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
      const key = item.product_id + "|" + item.size.trim().toLowerCase() + "|" + item.color.trim().toLowerCase();
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
declare global { interface Window { turnstile?: TurnstileApi } }
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

function Storefront() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeScreen, setActiveScreen] = useState<"home" | "fashion" | "wholesale" | "mobility" | "contact" | "favourites" | "policies">("home");
  const [favourites, setFavourites] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("deverve-favourites") || "[]") as string[]; } catch { return []; } });
  const [activeTab, setActiveTab] = useState<"retail" | "wholesale">("retail");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [visibleProductCount,setVisibleProductCount]=useState(8);
  const [enquiry, setEnquiry] = useState({ name: "", phone: "", email: "", enquiryType: "general", message: "", website: "" });
  const [sending, setSending] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [enquiryTurnstileToken, setEnquiryTurnstileToken] = useState("");
  const [enquiryTurnstileReset, setEnquiryTurnstileReset] = useState(0);
  const [checkoutTurnstileToken, setCheckoutTurnstileToken] = useState("");
  const [checkoutTurnstileReset, setCheckoutTurnstileReset] = useState(0);
  const [rentalTurnstileToken, setRentalTurnstileToken] = useState("");
  const [rentalTurnstileReset, setRentalTurnstileReset] = useState(0);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [socialLinks,setSocialLinks]=useState<Record<string,string>>({});
  const [brandAssets,setBrandAssets]=useState<{logo_id:string|null;favicon_id:string|null}>({logo_id:null,favicon_id:null});
  const [detailProduct, setDetailProduct] = useState<StoreProduct | null>(null);
  const [vehicles, setVehicles] = useState<StoreVehicle[]>([]);
  const [rentalOpen, setRentalOpen] = useState(false);
  const [rentalBusy, setRentalBusy] = useState(false);
  const [rentalMessage, setRentalMessage] = useState("");
  const [rentalNotice, setRentalNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  useEffect(() => {
    if (!rentalNotice) return;
    const timeout = window.setTimeout(() => setRentalNotice(null), rentalNotice.kind === "success" ? 5500 : 8000);
    return () => window.clearTimeout(timeout);
  }, [rentalNotice]);
  const [rentalReference, setRentalReference] = useState("");
  const [rentalSubmittedEstimatePaisa, setRentalSubmittedEstimatePaisa] = useState<number | null>(null);
  const [rentalFrontFile, setRentalFrontFile] = useState<File | null>(null);
  const [rentalBackFile, setRentalBackFile] = useState<File | null>(null);
  const [rentalDocsConsent, setRentalDocsConsent] = useState(false);
  const [rentalDocsMessage, setRentalDocsMessage] = useState("");
  const [rentalCnicUploadsEnabled, setRentalCnicUploadsEnabled] = useState(false);
  const [rentalSettingsLoading, setRentalSettingsLoading] = useState(true);
  const [rentalSettingsError, setRentalSettingsError] = useState("");
  const rentalSettingsRequest = useRef(0);
  const [rentalForm, setRentalForm] = useState({ vehicle_id: "", customer_name: "", phone: "", email: "", pickup_city: "Jhelum", pickup_address: "", destination_city: "Jhelum", destination_address: "", pickup_at: localDateTime(new Date(Date.now() + 86400000)), return_at: localDateTime(new Date(Date.now() + 2 * 86400000)), driver_option: "with_driver", customer_note: "", website: "" });
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [selectedVariantOptions, setSelectedVariantOptions] = useState<Record<string, {size:string;color:string}>>({});
  const [cart, setCart] = useState<CartLine[]>(readStoredCart);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [checkoutResult, setCheckoutResult] = useState("");
  const [checkoutToken, setCheckoutToken] = useState(() => crypto.randomUUID());
  const [onlinePaymentAvailable, setOnlinePaymentAvailable] = useState(false);
  const [onlinePaymentEnvironment, setOnlinePaymentEnvironment] = useState<"sandbox" | "production" | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<"manual" | "safepay">("manual");
  const [paymentMethods,setPaymentMethods]=useState<Array<{id:string;label:string;kind:string;provider:string;account_title:string;bank_name:string;account_number:string;iban:string;payment_url:string;instructions:string;qr_media_id:string|null}>>([{id:"cod",label:"Cash on delivery",kind:"cod",provider:"",account_title:"",bank_name:"",account_number:"",iban:"",payment_url:"",instructions:"Pay when your order is delivered.",qr_media_id:null}]);
  const [selectedPaymentMethod,setSelectedPaymentMethod]=useState("cod");
  const [checkoutForm, setCheckoutForm] = useState({ customer_name: "", phone: "", email: "", delivery_address: "", city: "Jhelum", customer_note: "", website: "" });
  const [catalogueState, setCatalogueState] = useState<"loading" | "ready" | "empty" | "error">("loading");

  useEffect(() => { const url = new URL(window.location.href); if (url.searchParams.get("cart") === "open") { setCartOpen(true); url.searchParams.delete("cart"); window.history.replaceState({}, "", url.pathname + url.search + url.hash); } if (url.searchParams.get("checkout") === "open") { setCheckoutOpen(true); url.searchParams.delete("checkout"); window.history.replaceState({}, "", url.pathname + url.search + url.hash); } if (url.searchParams.get("rental") === "open") { const vehicle = url.searchParams.get("vehicle") || ""; url.searchParams.delete("rental"); url.searchParams.delete("vehicle"); window.history.replaceState({}, "", url.pathname + url.search + url.hash); void openRentalRequest(vehicle); } }, []);
  useEffect(() => { localStorage.setItem("deverve-favourites", JSON.stringify(favourites)); }, [favourites]);
  useEffect(() => { localStorage.setItem("deverve-cart", JSON.stringify(cart)); }, [cart]);
  useEffect(() => {
    if(!brandAssets.favicon_id)return;
    const icon=document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if(icon){icon.href="/media/"+brandAssets.favicon_id;icon.type="";}
    const touchIcon=document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if(touchIcon)touchIcon.href="/media/"+brandAssets.favicon_id;
  },[brandAssets.favicon_id]);

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
    void fetch("/api/storefront/settings",{headers:{accept:"application/json"}}).then(async(response)=>{if(!response.ok)return;const payload=await response.json() as {social_links?:Record<string,string>;brand_assets?:{logo_id?:string|null;favicon_id?:string|null}};if(!active)return;if(payload.social_links&&typeof payload.social_links==="object")setSocialLinks(payload.social_links);if(payload.brand_assets&&typeof payload.brand_assets==="object")setBrandAssets({logo_id:payload.brand_assets.logo_id??null,favicon_id:payload.brand_assets.favicon_id??null});}).catch(()=>undefined);
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

  const formatPrice = (paisa: number | null) => paisa === null
    ? "Ask for price"
    : new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(paisa / 100);

  const cartSubtotal = cart.reduce((sum, item) => sum + item.unit_price_paisa * item.quantity, 0);
  const promotionPreview = cartSubtotal > 4_000_000
    ? { label: "45% order discount", amount: Math.floor(cartSubtotal * 0.45), freeDelivery: false }
    : paymentProvider === "safepay" && onlinePaymentEnvironment === "production"
      ? { label: "40% advance payment discount", amount: Math.floor(cartSubtotal * 0.40), freeDelivery: false }
      : cartSubtotal > 2_000_000
        ? { label: "30% order discount", amount: Math.floor(cartSubtotal * 0.30), freeDelivery: false }
        : cartSubtotal > 500_000
          ? { label: "Free delivery", amount: 0, freeDelivery: true }
          : null;
  const cartLineKey = (item: Pick<CartLine,"product_id"|"size"|"color">) => item.product_id+"|"+item.size.trim().toLowerCase()+"|"+item.color.trim().toLowerCase();
  const addToCart = (product: StoreProduct) => {
    const selectedId = selectedVariants[product.id];
    const variant = product.variants.find((item) => item.id === selectedId && item.available_quantity > 0)
      || product.variants.find((item) => item.available_quantity > 0);
    if (!variant || product.retail_price_paisa === null) { setCheckoutMessage("Please choose an available size and colour before adding this item."); return; }
    const option=selectedVariantOptions[product.id];
    const line:CartLine={variant_id:variant.id,product_id:product.id,name:product.name,sku:variant.sku,size:option?.size||splitProductOptions(variant.size)[0]||variant.size,color:option?.color||splitProductOptions(variant.color)[0]||variant.color,quantity:1,unit_price_paisa:product.retail_price_paisa,available_quantity:variant.available_quantity};
    setCart((current) => {
      const key=cartLineKey(line),existing=current.find((item) => cartLineKey(item)===key);
      if (existing) return current.map((item) => cartLineKey(item)===key ? { ...item, variant_id:line.variant_id, sku:line.sku, quantity: Math.min(item.quantity + 1, variant.available_quantity,10) } : item);
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
      setCheckoutResult(result.order_number); setCart([]); setCheckoutToken(crypto.randomUUID()); setPaymentProvider("manual");
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
  const openRentalRequest = async (vehicleId = "") => {
    try { const account = await fetch("/api/customer/me", { credentials: "same-origin", headers: { accept: "application/json" } }); if (!account.ok) { window.location.href = "/account?next=" + encodeURIComponent("/?rental=open" + (vehicleId ? "&vehicle=" + encodeURIComponent(vehicleId) : "")); return; } } catch { window.location.href = "/account?next=" + encodeURIComponent("/?rental=open"); return; }
    setRentalForm((current) => ({ ...current, vehicle_id: vehicleId, customer_name: "", phone: "", email: "", pickup_city: "Jhelum", pickup_address: "", destination_city: "Jhelum", destination_address: "", pickup_at: localDateTime(new Date(Date.now() + 86400000)), return_at: localDateTime(new Date(Date.now() + 2 * 86400000)), customer_note: "", website: "" }));
    setRentalMessage(""); setRentalReference(""); setRentalSubmittedEstimatePaisa(null); setRentalFrontFile(null); setRentalBackFile(null); setRentalDocsConsent(false); setRentalDocsMessage(""); setRentalCnicUploadsEnabled(false); setRentalSettingsError(""); setRentalSettingsLoading(true); setRentalOpen(true);
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
      const response = await fetch("/api/rentals", { method: "POST", headers: { accept: "application/json" }, body: data });
      const result = await response.json() as { accepted?: boolean; reference_code?: string; rental_days?: number; estimated_daily_rate_paisa?: number | null; estimated_total_paisa?: number | null; message?: string; error?: string };
      if (!response.ok || !result.accepted) throw new Error(result.error || "Your rental request could not be submitted.");
      setRentalReference(result.reference_code ?? "");
      setRentalSubmittedEstimatePaisa(result.estimated_total_paisa ?? null);
      const successMessage = result.message || "Your rental request and both CNIC images have been received securely.";
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
    if (!enquiryTurnstileToken) { setSubmitMessage("Please complete the security check first."); return; }
    setSending(true);
    setSubmitMessage("");
    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...enquiry, turnstile_token: enquiryTurnstileToken }),
      });
      const result = await response.json() as { accepted?: boolean; error?: string };
      if (!response.ok || !result.accepted) throw new Error(result.error || "Your enquiry could not be sent.");
      setSubmitMessage("Thank you. Your enquiry has been received.");
      setEnquiry({ name: "", phone: "", email: "", enquiryType: "general", message: "", website: "" });
    } catch (error) {
      setSubmitMessage(error instanceof Error ? error.message : "The enquiry service is not available yet. Please contact us on WhatsApp.");
    } finally {
      setSending(false);
      setEnquiryTurnstileToken("");
      setEnquiryTurnstileReset((value) => value + 1);
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
  const navigate = (screen: typeof activeScreen) => { setActiveScreen(screen); closeMenu(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const toggleFavourite = (productId: string) => setFavourites((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]);

  return (
    <div className="site-shell">
      <div className="announcement">
        <span>JHELUM, PAKISTAN</span>
        <span>FASHION · WHOLESALE · CAR RENTALS</span>
        <a href={whatsapp("Assalamu Alaikum De VERVE, I would like to enquire.")} target="_blank" rel="noreferrer">WhatsApp us ↗</a>
      </div>

      <header className="site-header">
        <button className="brand-lockup brand-home-button" type="button" aria-label="De VERVE home" onClick={() => navigate("home")}>
          {brandAssets.logo_id ? <img className="brand-logo-image" src={"/media/"+brandAssets.logo_id} alt="De VERVE" /> : <span className="brand-symbol">DV</span>}
          <span className="brand-type"><strong>De VERVE</strong><small>ELEVATE YOUR STYLE</small></span>
        </button>
        <button className="menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          <span /><span />
        </button>
        {menuOpen && <button type="button" className="menu-dismiss" aria-label="Close navigation menu" onClick={closeMenu} />}
        <nav className={menuOpen ? "main-nav is-open" : "main-nav"} aria-label="Main navigation"><button type="button" onClick={() => navigate("home")}>Home</button><button type="button" onClick={() => navigate("fashion")}>Fashion</button><button type="button" onClick={() => navigate("wholesale")}>Wholesale</button><button type="button" onClick={() => navigate("mobility")}>Car rental</button><button type="button" onClick={() => navigate("favourites")}>Saved ({favourites.length})</button><button type="button" onClick={() => navigate("contact")}>Contact</button><button type="button" onClick={() => navigate("policies")}>Policies</button><button type="button" onClick={() => { window.location.href = "/account"; }}>My account</button></nav>
        <div className="header-actions"><button className="header-cart" type="button" onClick={() => { setCartOpen(true); setCheckoutMessage(""); setCheckoutResult(""); }}>Cart <span>{cart.reduce((sum, item) => sum + item.quantity, 0)}</span></button><a className="header-cta" href={whatsapp("Assalamu Alaikum, I would like to contact De VERVE.")} target="_blank" rel="noreferrer">Contact <span>↗</span></a></div>
      </header>

      <main id="home" className="store-main" data-screen={activeScreen}>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> FASHION · LIFESTYLE · MOBILITY</p>
            <h1>Elevate<br /><em>your style.</em></h1>
            <p className="hero-description">Everyday fashion for men, women and kids. Explore our garment collections, connect for wholesale enquiries, or talk to our team about your next journey.</p>
            <div className="hero-actions">
              <button className="button button-primary" type="button" onClick={() => navigate("fashion")}>Explore fashion <span>↗</span></button>
              <button className="text-link" type="button" onClick={() => navigate("wholesale")}>Wholesale enquiries →</button>
            </div>
            <div className="hero-footnote"><span className="blue-dot" /> YOUR EVERYDAY VERVE · JHELUM, PAKISTAN</div>
          </div>
          <div className="hero-art" aria-label="De VERVE apparel collection artwork">
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

        <section className="intro-strip" id="about">
          <p>MORE THAN A LOOK.<br /><strong>YOUR EVERYDAY VERVE.</strong></p>
          <p>We bring fashion and mobility together with a simple promise: clear communication, considered choices and a better everyday experience.</p>
          <span className="intro-mark">DV<span>.</span></span>
        </section>

        <section className="section collections-section" id="collections">
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
                <a className="collection-art" href={whatsapp(`Assalamu Alaikum, please share available ${item.name} at De VERVE.`)} target="_blank" rel="noreferrer" aria-label={`Enquire about ${item.name}`}>
                  <span className="category-tag">{item.tag} / DE VERVE</span>
                  <span className="category-garment"><i /></span>
                  <span className="category-art-word">{item.id === "essentials" ? "DAILY" : item.id.toUpperCase()}</span>
                  <span className="category-arrow">↗</span>
                </a>
                <div className="collection-meta"><div><span className="category-number">{item.tag} / 06</span><h3>{item.name}</h3><p>{item.detail}</p></div><a href={whatsapp(`I am interested in ${item.name}. Please share availability.`)} target="_blank" rel="noreferrer" aria-label={`Ask about ${item.name}`}>↗</a></div>
              </article>
            ))}
            {visibleCategories.length === 0 && <p className="empty-search">No matching category. Try “hoodies”, “kids” or “trousers”.</p>}
          </div>
          {!search && <button className="catalogue-more" type="button" onClick={() => setShowAll(!showAll)}>{showAll ? "Show less ↑" : "Explore all categories ↓"}</button>}
          <p className="catalogue-note">Category artwork is illustrative. Product photographs, prices, sizes and live stock will be added to the catalogue after the inventory is entered.</p>
          <div className="live-catalogue" aria-live="polite">
            <div className="live-catalogue-heading">
              <div><p className="eyebrow">LIVE FROM OUR CATALOGUE</p><h3>Featured pieces</h3></div>
              <div className="live-catalogue-actions"><span>REAL LISTINGS · UPDATED BY OUR TEAM</span><button type="button" className="cart-open-button" disabled={!cart.length} onClick={() => { setCartOpen(true); setCheckoutMessage(""); setCheckoutResult(""); }}>Cart ({cart.reduce((sum, item) => sum + item.quantity, 0)}) · {formatPrice(cartSubtotal)}</button></div>
            </div>
            {catalogueState === "loading" && <p className="catalogue-feedback">Loading available listings…</p>}
            {catalogueState === "error" && <p className="catalogue-feedback">The live catalogue is not connected yet. Please contact our team for current collections.</p>}
            {catalogueState === "empty" && <p className="catalogue-feedback">New pieces are being added. Contact us to ask about current arrivals and availability.</p>}
            {catalogueState === "ready" && <div className="product-grid">
              {products.slice(0,visibleProductCount).map((product) => (
                <article className="product-card" key={product.id} role="link" tabIndex={0} aria-label={"View "+product.name} onClick={(event)=>{if((event.target as HTMLElement).closest("a,button,input,select,textarea,label"))return;window.location.href="/product/"+encodeURIComponent(product.slug);}} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();window.location.href="/product/"+encodeURIComponent(product.slug);}}}>
                  {productGalleryImages(product, selectedVariants[product.id]).length ? <ProductGallery className="product-visual product-photo dv-gallery-card" detailsHref={"/product/" + encodeURIComponent(product.slug)} images={productGalleryImages(product, selectedVariants[product.id], selectedVariantOptions[product.id]?.color)} /> : <div className="product-visual" aria-hidden="true"><span>DE VERVE</span><div className="product-garment"><i /></div><small>{product.category}</small></div>}
                  <div className="product-info">
                    <button type="button" className={favourites.includes(product.id) ? "favourite-toggle is-saved" : "favourite-toggle"} aria-label={favourites.includes(product.id) ? "Remove from favourites" : "Add to favourites"} aria-pressed={favourites.includes(product.id)} onClick={() => toggleFavourite(product.id)}>{favourites.includes(product.id) ? "♥ Saved" : "♡ Save"}</button>
                    <span className="product-audience">{product.audience} · {product.category}</span>
                    <h4><a className="product-title-link" href={"/product/" + encodeURIComponent(product.slug)}>{product.name}</a></h4>
                    <p>{product.description || "Contact our team for product details and available options."}</p>
                    {product.variants.length ? <ProductVariantPicker variants={product.variants} selectedVariantId={selectedVariants[product.id] || product.variants[0].id} selectedSize={selectedVariantOptions[product.id]?.size} selectedColor={selectedVariantOptions[product.id]?.color} onChange={(variantId,size,color) => {setSelectedVariants((current) => ({ ...current, [product.id]: variantId }));setSelectedVariantOptions((current)=>({...current,[product.id]:{size:size||"",color:color||""}}));}} compact /> : <span className="product-stock-note">Contact us for current availability</span>}
                    <div className="product-buy-row"><strong>{formatPrice(product.retail_price_paisa)}</strong><button type="button" className="product-details-button" onClick={() => { window.location.href = "/product/" + encodeURIComponent(product.slug); }}>View details</button>{product.variants.length > 0 && product.retail_price_paisa !== null && <button type="button" disabled={!product.variants.some((variant) => variant.available_quantity > 0)} onClick={() => addToCart(product)}>{product.variants.some((variant) => variant.available_quantity > 0) ? "Add to cart +" : "Sold out"}</button>}</div>
                  </div>
                </article>
              ))}
            </div>}
            {catalogueState === "ready" && products.length > visibleProductCount && <div className="catalogue-pagination"><span>Showing {Math.min(visibleProductCount,products.length)} of {products.length} listings</span><button type="button" className="button button-outline" onClick={() => setVisibleProductCount((count)=>Math.min(count+8,products.length))}>Load more products</button></div>}
          </div>
        </section>

        {detailProduct && <div className="checkout-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailProduct(null); }}><section className="checkout-modal product-detail-modal" role="dialog" aria-modal="true" aria-labelledby="product-detail-title">
          <div className="checkout-modal-heading"><div><p className="eyebrow">PRODUCT DETAILS</p><h2 id="product-detail-title">{detailProduct.name}</h2><p>{detailProduct.audience} · {detailProduct.category}</p></div><button type="button" className="checkout-close" onClick={() => setDetailProduct(null)} aria-label="Close product details">×</button></div>
          {productGalleryImages(detailProduct, selectedVariants[detailProduct.id]).length ? <ProductGallery className="product-detail-gallery" images={productGalleryImages(detailProduct, selectedVariants[detailProduct.id], selectedVariantOptions[detailProduct.id]?.color)} /> : <div className="product-detail-image product-visual"><span>DE VERVE</span></div>}
          <p>{detailProduct.description || "Please contact our team for more product information."}</p>
          <div className="product-detail-price">{formatPrice(detailProduct.retail_price_paisa)}</div>
          {detailProduct.variants.length > 0 ? <ProductVariantPicker variants={detailProduct.variants} selectedVariantId={selectedVariants[detailProduct.id] || detailProduct.variants[0].id} selectedSize={selectedVariantOptions[detailProduct.id]?.size} selectedColor={selectedVariantOptions[detailProduct.id]?.color} onChange={(variantId,size,color) => {setSelectedVariants((current) => ({ ...current, [detailProduct.id]: variantId }));setSelectedVariantOptions((current)=>({...current,[detailProduct.id]:{size:size||"",color:color||""}}));}} /> : <p className="product-stock-note">No purchasable size or colour option is currently listed. Ask our team to confirm availability.</p>}
          <div className="product-detail-actions">{detailProduct.variants.length > 0 && detailProduct.retail_price_paisa !== null && <button type="button" className="button button-primary" disabled={!detailProduct.variants.some((variant) => variant.available_quantity > 0)} onClick={() => { addToCart(detailProduct); setDetailProduct(null); }}>Add to cart</button>}<a className="button button-outline" href={whatsapp(`Assalamu Alaikum, I am interested in ${detailProduct.name}. Please confirm current sizes, colours, price and availability.`)} target="_blank" rel="noreferrer">WhatsApp enquiry</a><a className="button button-outline" href="mailto:deverve61@gmail.com?subject=Product%20Enquiry">Email enquiry</a></div>
        </section></div>}
        {activeScreen === "favourites" ? (
          <section className="section favourites-section">
            <div className="section-heading"><div><p className="eyebrow">YOUR SAVED EDIT</p><h2>Favourites</h2></div><button type="button" className="text-link" onClick={() => navigate("fashion")}>Continue shopping →</button></div>
            {products.filter((product) => favourites.includes(product.id)).length === 0 ? <div className="catalogue-feedback">You have not saved any products yet. Browse the collection and tap Save on anything you like.</div> : <div className="product-grid">{products.filter((product) => favourites.includes(product.id)).map((product) => <article className="product-card" key={product.id}><div className="product-visual product-photo">{product.image_key ? <img src={"/media/" + product.image_key} alt={product.name} loading="lazy"/> : <span>DE VERVE</span>}</div><div className="product-info"><span className="product-audience">{product.audience} · {product.category}</span><h4>{product.name}</h4><strong>{formatPrice(product.retail_price_paisa)}</strong><div className="product-buy-row"><button type="button" onClick={() => setDetailProduct(product)}>View details</button><button type="button" className="favourite-toggle is-saved" onClick={() => toggleFavourite(product.id)}>♥ Remove</button></div></div></article>)}</div>}
          </section>
        ) : null}
        {cartOpen && <div className="checkout-backdrop cart-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}><section className="checkout-panel cart-panel" role="dialog" aria-modal="true" aria-labelledby="cart-title">
          <div className="checkout-heading"><div><p className="eyebrow">YOUR SHOPPING BAG</p><h2 id="cart-title">Your cart ({cart.reduce((sum,item)=>sum+item.quantity,0)})</h2><p>Review your selected products before continuing.</p></div><button type="button" aria-label="Close cart" onClick={() => setCartOpen(false)}>×</button></div>
          {cart.length===0 ? <div className="cart-empty-state"><strong>Your cart is waiting for something you love.</strong><p>Explore the collection and add a product to get started.</p><button type="button" className="button button-primary" onClick={()=>{setCartOpen(false);navigate("fashion");}}>Continue shopping <span>↗</span></button></div> : <>
            <div className="cart-line-list">{cart.map((item)=> <article className="cart-line-item" key={cartLineKey(item)}>
              <div className="cart-line-image" aria-hidden="true"><span>DV</span></div>
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
          {checkoutResult ? <div className="checkout-success"><strong>Order received</strong><span>{checkoutResult}</span><p>{checkoutMessage}</p>{selectedPaymentMethod!=="cod"&&paymentProvider!=="safepay"&&paymentMethods.find(method=>method.id===selectedPaymentMethod)&&<div className="checkout-payment-instructions"><strong>{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.label}</strong><p><b>Important:</b> Wait until De VERVE confirms the final payable amount, including delivery, before transferring money. Use the order number above as your payment reference.</p>{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.account_title&&<p>Account title: {paymentMethods.find(method=>method.id===selectedPaymentMethod)?.account_title}</p>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.bank_name&&<p>Bank: {paymentMethods.find(method=>method.id===selectedPaymentMethod)?.bank_name}</p>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.account_number&&<p>Account / wallet: {paymentMethods.find(method=>method.id===selectedPaymentMethod)?.account_number}</p>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.iban&&<p>IBAN: {paymentMethods.find(method=>method.id===selectedPaymentMethod)?.iban}</p>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.instructions&&<p>{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.instructions}</p>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.payment_url&&<a href={paymentMethods.find(method=>method.id===selectedPaymentMethod)?.payment_url} target="_blank" rel="noreferrer">Open payment link ↗</a>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.qr_media_id&&<img src={"/media/"+paymentMethods.find(method=>method.id===selectedPaymentMethod)?.qr_media_id} alt="Payment QR code" loading="lazy"/>}<small>Your order remains unpaid until the owner verifies the transfer. Keep your transaction receipt.</small></div>}<button type="button" className="button button-primary" onClick={() => setCheckoutOpen(false)}>Continue shopping</button></div> : <form className="checkout-form" onSubmit={submitCheckout}>
            <div className="checkout-items">{cart.map((item) => <div className="checkout-item" key={cartLineKey(item)}><div><strong>{item.name}</strong><span>{[item.size, item.color].filter(Boolean).join(" / ") || item.sku || "Standard"}</span><small>{formatPrice(item.unit_price_paisa)} each</small></div><div className="checkout-quantity"><button type="button" aria-label="Decrease quantity" onClick={() => item.quantity === 1 ? removeCartItem(item) : changeCartQuantity(item, item.quantity - 1)}>−</button><span>{item.quantity}</span><button type="button" aria-label="Increase quantity" disabled={item.quantity >= item.available_quantity} onClick={() => changeCartQuantity(item, item.quantity + 1)}>+</button></div><strong>{formatPrice(item.unit_price_paisa * item.quantity)}</strong></div>)}</div>
            <div className="checkout-total"><span>Subtotal</span><strong>{formatPrice(cartSubtotal)}</strong>{promotionPreview && <><span>{promotionPreview.label}</span><strong>{promotionPreview.freeDelivery ? "FREE" : "−"+formatPrice(promotionPreview.amount)}</strong></>}<span>Estimated total before delivery</span><strong>{formatPrice(cartSubtotal-(promotionPreview?.amount??0))}</strong><span>Delivery</span><strong>{promotionPreview?.freeDelivery ? "FREE" : "Confirmed before dispatch"}</strong><span>Payment</span><strong>{paymentProvider === "safepay" ? (onlinePaymentEnvironment === "production" ? "Card / online payment" : "Card / online payment (sandbox)") : (paymentMethods.find(method=>method.id===selectedPaymentMethod)?.label??"Cash on delivery")}</strong></div>
            <fieldset className="checkout-payment-options"><legend>Payment method</legend>{paymentMethods.map(method=><label key={method.id}><input type="radio" name="payment_method" checked={paymentProvider==="manual"&&selectedPaymentMethod===method.id} onChange={()=>{setPaymentProvider("manual");setSelectedPaymentMethod(method.id);}}/> {method.label}{method.provider&&<small> · {method.provider}</small>}</label>)}{onlinePaymentAvailable&&<label><input type="radio" name="payment_method" checked={paymentProvider==="safepay"} onChange={()=>{setPaymentProvider("safepay");setSelectedPaymentMethod(paymentMethods.find(method=>method.kind==="cod")?.id??"cod");}}/> Safepay secure checkout <small>{onlinePaymentEnvironment==="production"?"Live gateway":"Sandbox"}</small></label>}{paymentProvider==="safepay"&&<p className="checkout-policy-note">Safepay checkout requires a De VERVE customer account. <a href="/account">Sign in or create an account</a>.</p>}{paymentProvider==="manual"&&paymentMethods.find(method=>method.id===selectedPaymentMethod&&method.kind!=="cod")&&<div className="checkout-payment-instructions"><strong>{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.label}</strong>{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.account_title&&<p>Account title: {paymentMethods.find(method=>method.id===selectedPaymentMethod)?.account_title}</p>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.bank_name&&<p>Bank: {paymentMethods.find(method=>method.id===selectedPaymentMethod)?.bank_name}</p>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.account_number&&<p>Account / wallet: {paymentMethods.find(method=>method.id===selectedPaymentMethod)?.account_number}</p>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.iban&&<p>IBAN: {paymentMethods.find(method=>method.id===selectedPaymentMethod)?.iban}</p>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.instructions&&<p>{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.instructions}</p>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.payment_url&&<a href={paymentMethods.find(method=>method.id===selectedPaymentMethod)?.payment_url} target="_blank" rel="noreferrer">Open payment link ↗</a>}{paymentMethods.find(method=>method.id===selectedPaymentMethod)?.qr_media_id&&<img src={"/media/"+paymentMethods.find(method=>method.id===selectedPaymentMethod)?.qr_media_id} alt="Payment QR code" loading="lazy"/>}<small>Orders paid by direct transfer remain pending until De VERVE verifies the payment. Include your order number in the transfer reference.</small></div>}</fieldset><div className="checkout-fields">
              <label>Full name<input required minLength={2} maxLength={100} autoComplete="name" value={checkoutForm.customer_name} onChange={(event) => setCheckoutForm({ ...checkoutForm, customer_name: event.target.value })} /></label>
              <label>Phone / WhatsApp<input required type="tel" minLength={8} maxLength={24} autoComplete="tel" value={checkoutForm.phone} onChange={(event) => setCheckoutForm({ ...checkoutForm, phone: event.target.value })} /></label>
              <label>Email (optional)<input type="email" maxLength={160} autoComplete="email" value={checkoutForm.email} onChange={(event) => setCheckoutForm({ ...checkoutForm, email: event.target.value })} /></label>
              <label>City<input required minLength={2} maxLength={80} autoComplete="address-level2" value={checkoutForm.city} onChange={(event) => setCheckoutForm({ ...checkoutForm, city: event.target.value })} /></label>
              <label className="checkout-address">Complete delivery address<textarea required minLength={8} maxLength={300} rows={3} autoComplete="street-address" value={checkoutForm.delivery_address} onChange={(event) => setCheckoutForm({ ...checkoutForm, delivery_address: event.target.value })} /></label>
              <label className="checkout-address">Order note (optional)<textarea maxLength={500} rows={2} value={checkoutForm.customer_note} onChange={(event) => setCheckoutForm({ ...checkoutForm, customer_note: event.target.value })} /></label>
              <label className="form-trap" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={checkoutForm.website} onChange={(event) => setCheckoutForm({ ...checkoutForm, website: event.target.value })} /></label>
            </div>
            <p className="checkout-disclaimer">{paymentProvider === "safepay" ? (onlinePaymentEnvironment === "production" ? "You will be redirected to Safepay's secure checkout after the final delivery fee is approved." : "This is a sandbox payment request. The final delivery fee must be approved before any test payment can begin.") : "No online payment is collected. De VERVE will send a secure link to confirm delivery charges and your final COD total before dispatch."}</p>
            {checkoutMessage && <p className="checkout-message" role="alert">{checkoutMessage}</p>}
            <p className="checkout-policy-note">Before placing your order, please review the <button type="button" onClick={() => { setCheckoutOpen(false); navigate("policies"); }}>exchange and privacy policies</button>. You can return to your cart to continue.</p>
             <TurnstileWidget resetKey={checkoutTurnstileReset} onToken={setCheckoutTurnstileToken} />
             <button type="submit" className="button button-primary checkout-submit" disabled={checkoutBusy || !cart.length || !checkoutTurnstileToken}>{checkoutBusy ? "Placing order…" : "Place order"} <span>↗</span></button>
          </form>}
        </section></div>}

        <section className="wholesale-section" id="wholesale">
          <div className="wholesale-art">
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

        <section className="mobility-section" id="mobility">
          <div><p className="eyebrow">03 — DE VERVE MOBILITY</p><h2>Make room for<br /><em>the journey.</em></h2></div>
          <div className="mobility-copy"><span className="mobility-icon">↗</span><p>Browse the available fleet or send a date-based rental request. Availability, rates, documents and rental terms are confirmed by our team before any booking is accepted.</p><button type="button" className="button button-light" onClick={() => openRentalRequest()}>Request a rental <span>↗</span></button></div>
          {vehicles.length > 0 && <div className="mobility-fleet"><div className="mobility-fleet-heading"><span>AVAILABLE FLEET</span><p>Choose a vehicle to start your request.</p></div><div className="mobility-vehicle-grid">{vehicles.map((vehicle) => <article className="mobility-vehicle-card" key={vehicle.id}>
            {vehicle.media?.length ? <ProductGallery className="mobility-vehicle-gallery" images={vehicle.media.map((item) => ({ id: item.id, url: item.url, alt_text: item.alt_text || vehicle.name }))} /> : vehicle.image_url ? <img src={vehicle.image_url} alt={vehicle.name} loading="lazy" /> : <div className="mobility-vehicle-placeholder">DV<span>.</span></div>}
            <div><small>{vehicle.vehicle_type} · {vehicle.seats} seats</small><h3>{vehicle.name}</h3><p>{vehicle.description || [vehicle.transmission, vehicle.fuel_type].filter(Boolean).join(" · ")}</p><strong>{vehicle.daily_rate_paisa === null ? "Rate on request" : formatPrice(vehicle.daily_rate_paisa) + " / day"}</strong><button type="button" onClick={() => openRentalRequest(vehicle.id)}>Request this vehicle ↗</button></div>
          </article>)}</div></div>}
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
          <form className="enquiry-form" onSubmit={submitEnquiry}>
            <h3>Send us an enquiry</h3>
            <div className="enquiry-fields">
              <label>Your name<input required minLength={2} maxLength={100} autoComplete="name" value={enquiry.name} onChange={(event) => setEnquiry({ ...enquiry, name: event.target.value })} /></label>
              <label>Phone / WhatsApp<input required type="tel" minLength={8} maxLength={24} autoComplete="tel" value={enquiry.phone} onChange={(event) => setEnquiry({ ...enquiry, phone: event.target.value })} /></label>
              <label>Email (optional)<input type="email" maxLength={160} autoComplete="email" value={enquiry.email} onChange={(event) => setEnquiry({ ...enquiry, email: event.target.value })} /></label>
              <label>Enquiry type<select value={enquiry.enquiryType} onChange={(event) => setEnquiry({ ...enquiry, enquiryType: event.target.value })}><option value="general">General</option><option value="retail">Retail fashion</option><option value="wholesale">Wholesale</option><option value="rental">Car rental</option></select></label>
              <label className="enquiry-message">How can we help?<textarea required minLength={5} maxLength={3000} rows={4} value={enquiry.message} onChange={(event) => setEnquiry({ ...enquiry, message: event.target.value })} /></label>
              <label className="form-trap" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={enquiry.website} onChange={(event) => setEnquiry({ ...enquiry, website: event.target.value })} /></label>
            </div>
            <div className="enquiry-submit">{activeScreen === "contact" && <TurnstileWidget resetKey={enquiryTurnstileReset} onToken={setEnquiryTurnstileToken} />}<button className="button button-primary" type="submit" disabled={sending || !enquiryTurnstileToken}>{sending ? "Sending..." : "Send enquiry"} <span>↗</span></button><p role="status" aria-live="polite">{submitMessage}</p></div>
          </form>
          <small>Prices, product availability, delivery, payment and rental terms are confirmed directly by the De VERVE team.</small>
        </section>
        {activeScreen === "policies" && <Policies />}
      </main>

      {rentalOpen && <div className="checkout-backdrop rental-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !rentalBusy) setRentalOpen(false); }}><section className="checkout-modal rental-modal" role="dialog" aria-modal="true" aria-labelledby="rental-modal-title" aria-describedby="rental-modal-description">
        <div className="checkout-modal-heading"><div><p className="eyebrow">DE VERVE MOBILITY</p><h2 id="rental-modal-title">Request a rental.</h2><p id="rental-modal-description">Complete the details and identity verification. Your booking is not confirmed until De VERVE approves it.</p></div><button type="button" className="checkout-close" onClick={() => setRentalOpen(false)} aria-label="Close rental request">×</button></div>
        {rentalReference ? <div className="rental-success"><strong>Rental request submitted successfully</strong><span>Reference: {rentalReference}</span><p>{rentalMessage}</p><p>{rentalDocsMessage}</p><p>{rentalSubmittedEstimatePaisa !== null ? "Your confirmed estimate: " + formatPrice(rentalSubmittedEstimatePaisa) : "Our team will confirm the final rental price."}</p><button type="button" className="button button-primary" onClick={() => setRentalOpen(false)}>Close</button></div> : <form className="checkout-form" onSubmit={submitRentalRequest} onInvalidCapture={(event) => { const field = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement; const label = field.labels?.[0]?.textContent?.replace(/\*/g, "").trim(); const message = (label ? label + ": " : "") + (field.validationMessage || "Please complete all required fields before submitting."); setRentalNotice({ kind: "error", message }); field.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
          <p className="required-fields-note"><span className="required-star">*</span> Required fields. Email and additional details are optional.</p>
          <section className="rental-security-block" aria-label="Required security verification"><p className="required-fields-note">Complete this security check to protect your rental request. You can finish the form first and return here before submitting.</p><TurnstileWidget resetKey={rentalTurnstileReset} onToken={setRentalTurnstileToken} /></section>
          <div className="checkout-fields">
            <label>Vehicle{vehicles.length > 0 && <span className="required-star" aria-hidden="true"> *</span>}<select required={vehicles.length > 0} value={rentalForm.vehicle_id} onChange={(e) => setRentalForm({ ...rentalForm, vehicle_id: e.target.value })}><option value="">{vehicles.length > 0 ? "Select a vehicle" : "Any available vehicle"}</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name} · {vehicle.vehicle_type}</option>)}</select></label>
            {vehicles.length === 0 && <p className="checkout-disclaimer">No vehicles are currently listed. You may still request a rental, but the automatic estimate will be unavailable until the De VERVE team adds vehicles and daily rates.</p>}
            <label>Your name<span className="required-star" aria-hidden="true"> *</span><input required minLength={2} maxLength={100} autoComplete="name" value={rentalForm.customer_name} onChange={(e) => setRentalForm({ ...rentalForm, customer_name: e.target.value })} /></label>
            <label>Phone / WhatsApp<span className="required-star" aria-hidden="true"> *</span><input required type="tel" maxLength={24} autoComplete="tel" value={rentalForm.phone} onChange={(e) => setRentalForm({ ...rentalForm, phone: e.target.value })} /></label>
            <label>Email (optional)<input type="email" maxLength={160} value={rentalForm.email} onChange={(e) => setRentalForm({ ...rentalForm, email: e.target.value })} /></label>
            <label>Pickup city<span className="required-star" aria-hidden="true"> *</span><input required minLength={2} maxLength={80} value={rentalForm.pickup_city} onChange={(e) => setRentalForm({ ...rentalForm, pickup_city: e.target.value })} /></label>
            <label>Pickup complete address<span className="required-star" aria-hidden="true"> *</span><input required minLength={8} maxLength={300} autoComplete="street-address" placeholder="House, street, area or landmark" value={rentalForm.pickup_address} onChange={(e) => setRentalForm({ ...rentalForm, pickup_address: e.target.value })} /></label>
            <label>Destination city<span className="required-star" aria-hidden="true"> *</span><input required minLength={2} maxLength={80} value={rentalForm.destination_city} onChange={(e) => setRentalForm({ ...rentalForm, destination_city: e.target.value })} /></label>
            <label>Destination complete address<span className="required-star" aria-hidden="true"> *</span><input required minLength={5} maxLength={300} placeholder="Area, street or drop-off point" value={rentalForm.destination_address} onChange={(e) => setRentalForm({ ...rentalForm, destination_address: e.target.value })} /></label>
            <label>Pickup date & time<span className="required-star" aria-hidden="true"> *</span><input type="datetime-local" required min={localDateTime(new Date())} value={rentalForm.pickup_at} onChange={(e) => setRentalForm({ ...rentalForm, pickup_at: e.target.value })} /></label>
            <label>Return date & time<span className="required-star" aria-hidden="true"> *</span><input type="datetime-local" required min={rentalForm.pickup_at} value={rentalForm.return_at} onChange={(e) => setRentalForm({ ...rentalForm, return_at: e.target.value })} /></label>
            <label>Driver option<span className="required-star" aria-hidden="true"> *</span><select required value={rentalForm.driver_option} onChange={(e) => setRentalForm({ ...rentalForm, driver_option: e.target.value })}><option value="with_driver">With driver</option><option value="self_drive">Self drive (subject to approval)</option></select></label>
            <label className="checkout-address">Additional details (optional)<textarea rows={2} maxLength={500} value={rentalForm.customer_note} onChange={(e) => setRentalForm({ ...rentalForm, customer_note: e.target.value })} /></label>
            <div className="rental-documents-upload rental-documents-preupload"><h3>Mandatory CNIC verification<span className="required-star" aria-hidden="true"> *</span></h3><p>Both sides of your valid CNIC are required to submit a rental request. Images are uploaded directly to private storage and can only be viewed by authorized rental staff. JPG, PNG or WebP; maximum 4 MB per image. Documents are automatically purged under the published retention policy.</p><label>CNIC front image<span className="required-star" aria-hidden="true"> *</span><input type="file" accept="image/jpeg,image/png,image/webp" required onChange={(e)=>setRentalFrontFile(e.target.files?.[0]??null)}/></label>{rentalFrontFile && <small>Selected: {rentalFrontFile.name}</small>}<label>CNIC back image<span className="required-star" aria-hidden="true"> *</span><input type="file" accept="image/jpeg,image/png,image/webp" required onChange={(e)=>setRentalBackFile(e.target.files?.[0]??null)}/></label>{rentalBackFile && <small>Selected: {rentalBackFile.name}</small>}<label className="rental-consent"><input type="checkbox" required checked={rentalDocsConsent} onChange={(e)=>setRentalDocsConsent(e.target.checked)}/> I confirm these are my documents and consent to their secure processing and storage for this rental request.<span className="required-star" aria-hidden="true"> *</span></label></div>
            <section className="rental-price-estimate" aria-live="polite"><strong>Rental price estimate</strong>{rentalDurationDays > 0 ? <p>{rentalDurationDays} rental day{rentalDurationDays===1?"":"s"} · {rentalForm.driver_option==="with_driver"?"With driver":"Self drive"} · {rentalDailyRatePaisa!==null&&rentalDailyRatePaisa!==undefined?formatPrice(rentalDailyRatePaisa)+" / day":"Rate to be confirmed"}</p> : <p>Select valid pickup and return dates to calculate the duration.</p>}<strong className="rental-estimate-total">{rentalEstimatedTotalPaisa!==null?formatPrice(rentalEstimatedTotalPaisa):"Final price will be confirmed by De VERVE"}</strong><small>Full 24-hour rental periods are rounded up to the next day. Fuel, tolls, deposits, extra hours and route charges are confirmed separately before booking.</small></section>
            <label className="form-trap" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={rentalForm.website} onChange={(e) => setRentalForm({ ...rentalForm, website: e.target.value })} /></label>
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
      <footer className="site-footer">
        <a className="footer-wordmark" href="#home">De VERVE<span>.</span></a>
        <p>Elevate Your Style · Jhelum, Pakistan</p>
        <nav className="footer-policy-links" aria-label="Customer policies"><button type="button" onClick={() => navigate("policies")}>Policies / پالیسیاں</button></nav>
        {Object.entries(socialLinks).filter(([,url])=>Boolean(url)).length>0 && <nav className="footer-social-links" aria-label="De VERVE social accounts">{Object.entries(socialLinks).filter(([,url])=>Boolean(url)).map(([platform,url])=><a key={platform} href={url} target="_blank" rel="noreferrer" aria-label={"Visit De VERVE on "+platform}><span className="footer-social-icon" aria-hidden="true">{socialGlyphs[platform] ?? "↗"}</span><span className="footer-social-label">{platform}</span></a>)}</nav>}
        <span>© 2026 DE VERVE. ALL RIGHTS RESERVED.</span>
        <small className="site-credit">Website Design &amp; Development: <strong>Syed Nabeel Wasti</strong></small>
      </footer>
      <nav className="mobile-dock" aria-label="Quick navigation"><button type="button" className={activeScreen === "home" ? "active" : ""} onClick={() => navigate("home")}><span>⌂</span>Home</button><button type="button" className={activeScreen === "fashion" ? "active" : ""} onClick={() => navigate("fashion")}><span>◇</span>Shop</button><button type="button" onClick={() => { setCartOpen(true); setCheckoutMessage(""); setCheckoutResult(""); }}><span>▣</span>Cart <i>{cart.reduce((sum,item)=>sum+item.quantity,0)}</i></button><button type="button" className={activeScreen === "favourites" ? "active" : ""} onClick={() => navigate("favourites")}><span>♡</span>Saved</button><button type="button" className={activeScreen === "mobility" ? "active" : ""} onClick={() => navigate("mobility")}><span>↗</span>Rent</button></nav>
      <InstallPrompt />
      <a className="floating-whatsapp" href={whatsapp("Assalamu Alaikum, I would like to enquire about De VERVE.")} target="_blank" rel="noreferrer" aria-label="Chat with De VERVE on WhatsApp">✆</a>
    </div>
  );
}

export default function App() {
  return window.location.pathname.startsWith("/product/") ? <ProductPage /> : window.location.pathname.startsWith("/pages/") ? <PublicPage /> : window.location.pathname.startsWith("/account") ? <CustomerAccount /> : window.location.pathname.startsWith("/admin") ? <Admin /> : window.location.pathname.startsWith("/wholesale/quote/") ? <WholesaleQuote /> : window.location.pathname === "/delivery-confirmation" ? <DeliveryFeeApproval /> : <Storefront />;
}

