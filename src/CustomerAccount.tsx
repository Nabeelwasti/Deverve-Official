import { useEffect, useState, type FormEvent } from "react";
import { exportOfficeDocument, exportOfficeImage, exportOfficeSpreadsheet } from "./officeExport";
import "./customer-account.css";

type Customer = { id: string; email: string; full_name: string; phone: string; email_verified: boolean };
type OrderItem = { id: string; product_name_snapshot: string; sku_snapshot: string | null; size_snapshot: string; color_snapshot: string; quantity: number; unit_price_paisa: number; line_total_paisa: number };
type OrderEvent = { id: string; from_status: string | null; to_status: string; actor_type: string; note: string; created_at: string };
type Order = { id: string; order_number: string; city: string; subtotal_paisa: number; delivery_fee_paisa: number; total_paisa: number; payment_method: string; payment_provider: string; payment_status: string; order_status: string; delivery_fee_status: string; created_at: string; updated_at: string; items: OrderItem[]; events: OrderEvent[] };
type ExchangeRequest = { id: string; order_id: string; exchange_number: string; order_number: string; reason: string; details: string; status: "requested" | "reviewing" | "approved" | "rejected" | "item_received" | "completed"; admin_note: string; created_at: string; updated_at: string; items: Array<{ id: string; quantity: number; requested_size: string; requested_color: string; product_name_snapshot: string; sku_snapshot: string | null; size_snapshot: string; color_snapshot: string }>; events: Array<{ id: string; from_status: string | null; to_status: string; note: string; created_at: string }> };
type Rental = { id: string; reference_code: string; pickup_city: string; destination_city: string; pickup_at: string; return_at: string; driver_option: string; status: string; created_at: string };

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...options, credentials: "same-origin", headers: { accept: "application/json", ...(options.body ? { "content-type": "application/json" } : {}), ...options.headers } });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Please try again.");
  return payload;
}

let turnstilePromise: Promise<void> | null = null;
type TurnstileApi = { render: (host: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void }) => string; remove?: (id: string) => void };
type CustomerWindow = Window & { turnstile?: TurnstileApi };
function SecurityCheck({ onToken, reset }: { onToken: (token: string) => void; reset: number }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    let active = true;
    if (!turnstilePromise) turnstilePromise = new Promise((resolve, reject) => {
      if ((window as CustomerWindow).turnstile) { resolve(); return; }
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true; script.defer = true; script.onload = () => resolve(); script.onerror = () => reject(new Error("Security verification unavailable."));
      document.head.appendChild(script);
    });
    let widget = "";
    void turnstilePromise.then(() => { if (active && host && (window as CustomerWindow).turnstile) widget = (window as CustomerWindow).turnstile!.render(host, { sitekey: "0x4AAAAAAGBpVe5Z1cq2CvB5", callback: onToken, "expired-callback": () => onToken(""), "error-callback": () => onToken("") }); }).catch(() => onToken(""));
    return () => { active = false; if (widget) (window as CustomerWindow).turnstile?.remove?.(widget); };
  }, [host, reset, onToken]);
  return <div className="customer-security" ref={setHost} aria-label="Security verification" />;
}

const money = (paisa: number) => "Rs. " + Math.round(paisa / 100).toLocaleString("en-PK");

function customerOrderRows(order:Order,customer:Customer|null):Array<Array<string|number>>{
 const amount=(paisa:number)=>Number((paisa/100).toFixed(2));
 return [
  ["Order reference",order.order_number],["Date",new Date(order.created_at).toLocaleString("en-PK")],
  ["Customer",customer?.full_name||""],["Phone",customer?.phone||""],["Email",customer?.email||""],["Delivery city",order.city],[],
  ["Product","SKU","Size","Colour","Quantity","Unit price (PKR)","Line total (PKR)"],
  ...order.items.map(item=>[item.product_name_snapshot,item.sku_snapshot||"",item.size_snapshot||"",item.color_snapshot||"",item.quantity,amount(item.unit_price_paisa),amount(item.line_total_paisa)]),
  [],["Subtotal (PKR)",amount(order.subtotal_paisa)],["Delivery fee",order.delivery_fee_status==="accepted"?amount(order.delivery_fee_paisa):"Awaiting confirmation"],
  ["Final total (PKR)",amount(order.total_paisa)],["Payment",order.payment_method+" · "+order.payment_status],["Order status",order.order_status]
 ];
}
function printCustomerOrder(order:Order,customer:Customer|null):void{
 const popup=window.open("","_blank");if(!popup)throw new Error("Allow pop-ups for this site to print your invoice.");popup.opener=null;
 const esc=(value:unknown)=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]||char));
 const rows=order.items.map(item=>"<tr><td>"+esc(item.product_name_snapshot)+"<small>"+esc([item.sku_snapshot,item.size_snapshot,item.color_snapshot].filter(Boolean).join(" · "))+"</small></td><td>"+item.quantity+"</td><td>PKR "+(item.unit_price_paisa/100).toFixed(2)+"</td><td>PKR "+(item.line_total_paisa/100).toFixed(2)+"</td></tr>").join("");
 const html="<!doctype html><html><head><meta charset='utf-8'><title>De VERVE invoice "+esc(order.order_number)+"</title><style>@page{size:A4;margin:16mm}body{font:12px Arial;color:#263b50}.bar{height:8px;background:#163a5f;margin-bottom:24px}.brand-lockup{display:flex;align-items:center;gap:14px}.brand-logo{display:block;width:58px;height:58px;object-fit:contain}.brand{font-size:25px;font-weight:800;color:#102a43;letter-spacing:2px}.muted{color:#60758a}.head{display:flex;justify-content:space-between;margin:26px 0 18px}.head h1{font-size:24px;margin:0}.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;background:#f1f5f9;padding:15px;margin-bottom:20px}.meta small{display:block;color:#60758a;text-transform:uppercase;font-size:9px;margin-bottom:4px}table{width:100%;border-collapse:collapse}th{background:#163a5f;color:#fff;text-align:left;padding:10px}td{padding:11px 8px;border-bottom:1px solid #d7e0e8}td small{display:block;color:#60758a;margin-top:3px}.totals{margin:20px 0 0 auto;width:48%}.totals div{display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid #d7e0e8}.grand{background:#163a5f;color:white;font-weight:bold}.foot{margin-top:35px;border-top:1px solid #d7e0e8;padding-top:12px;color:#60758a;font-size:10px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div class='bar'></div><div class='brand-lockup'><img class='brand-logo' src='"+esc(window.location.origin)+"/brand/de-verve-logo.svg' alt='De VERVE logo'><div><div class='brand'>DE VERVE</div><div class='muted'>JHELUM · PAKISTAN · +92 319 7553705</div></div></div><div class='head'><h1>SALES INVOICE</h1><strong>"+esc(order.order_number)+"</strong></div><div class='meta'><div><small>Customer</small><b>"+esc(customer?.full_name||"Customer")+"</b></div><div><small>Contact</small><b>"+esc(customer?.phone||"")+"</b><br>"+esc(customer?.email||"")+"</div><div><small>Order date</small><b>"+esc(new Date(order.created_at).toLocaleString("en-PK"))+"</b></div><div><small>Delivery city</small><b>"+esc(order.city)+"</b></div><div><small>Payment status</small><b>"+esc(order.payment_status)+"</b></div><div><small>Order status</small><b>"+esc(order.order_status)+"</b></div></div><table><thead><tr><th>Product / variant</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>"+rows+"</tbody></table><section class='totals'><div><span>Subtotal</span><b>PKR "+(order.subtotal_paisa/100).toFixed(2)+"</b></div><div><span>Delivery</span><b>"+(order.delivery_fee_status==="accepted"?"PKR "+(order.delivery_fee_paisa/100).toFixed(2):"Awaiting confirmation")+"</b></div><div class='grand'><span>Final total</span><b>PKR "+(order.total_paisa/100).toFixed(2)+"</b></div></section><div class='foot'>System-generated De VERVE invoice. Please retain it for your records. Delivery and payment remain subject to the confirmed order terms.</div></body></html>";
 popup.addEventListener("load",()=>{popup.focus();popup.print();},{once:true});popup.document.open();popup.document.write(html);popup.document.close();
}

const pretty = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const CUSTOMER_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
function readCustomerDraft<T extends object>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem("deverve:customer-draft:v1:" + key);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as { savedAt?: number; data?: Partial<T> };
    if (!saved || typeof saved.savedAt !== "number" || Date.now() - saved.savedAt > CUSTOMER_DRAFT_TTL_MS || !saved.data || typeof saved.data !== "object") {
      sessionStorage.removeItem("deverve:customer-draft:v1:" + key);
      return fallback;
    }
    return { ...fallback, ...saved.data };
  } catch { return fallback; }
}
function hasCustomerDraft(key: string): boolean {
  try { return sessionStorage.getItem("deverve:customer-draft:v1:" + key) !== null; } catch { return false; }
}
function writeCustomerDraft(key: string, data: object): void {
  try { sessionStorage.setItem("deverve:customer-draft:v1:" + key, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* Never interrupt customer forms. */ }
}
function clearCustomerDraft(key: string): void {
  try { sessionStorage.removeItem("deverve:customer-draft:v1:" + key); } catch { /* Storage may be unavailable. */ }
}
function clearCustomerFormDraft(key: string): void {
  try { sessionStorage.removeItem("deverve:form-draft:v1:" + window.location.pathname + ":" + key); } catch { /* Storage may be unavailable. */ }
}

export default function CustomerAccount() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [mode, setMode] = useState<"login" | "register">(() => new URLSearchParams(window.location.search).get("mode") === "register" ? "register" : "login");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [securityToken, setSecurityToken] = useState("");
  const [securityReset, setSecurityReset] = useState(0);
  const emptyCredentials = { full_name: "", phone: "", email: "", password: "" };
  const [credentials, setCredentials] = useState(() => ({ ...readCustomerDraft("credentials", { full_name: "", phone: "", email: "" }), password: "" }));
  const emptyProfile = { full_name: "", phone: "" };
  const [profile, setProfile] = useState(() => readCustomerDraft("profile", emptyProfile));
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "" });
  const [orders, setOrders] = useState<Order[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [exchanges, setExchanges] = useState<ExchangeRequest[]>([]);
  const initialExchangeDraft = readCustomerDraft("exchange", { orderId: "", reason: "size_issue", details: "", lines: {} as Record<string, { quantity: string; requested_size: string; requested_color: string }> });
  const [exchangeTarget, setExchangeTarget] = useState<Order | null>(null);
  const [exchangeReason, setExchangeReason] = useState(initialExchangeDraft.reason);
  const [exchangeDetails, setExchangeDetails] = useState(initialExchangeDraft.details);
  const [exchangeLines, setExchangeLines] = useState(initialExchangeDraft.lines);
  const [paymentBusyOrder, setPaymentBusyOrder] = useState("");
  const readSection = (): "orders" | "rentals" | "exchanges" | "profile" => { const value = new URLSearchParams(window.location.search).get("section"); return value === "rentals" || value === "exchanges" || value === "profile" ? value : "orders"; };
  const [section, setSection] = useState<"orders" | "rentals" | "exchanges" | "profile">(readSection);
  const navigateSection = (next: "orders" | "rentals" | "exchanges" | "profile") => { setSection(next); const url = new URL(window.location.href); url.searchParams.set("section", next); window.history.pushState({ section: next }, "", url.pathname + url.search + url.hash); };
  useEffect(() => { const onPopState = () => { setSection(readSection()); setMode(new URLSearchParams(window.location.search).get("mode") === "register" ? "register" : "login"); }; window.addEventListener("popstate", onPopState); return () => window.removeEventListener("popstate", onPopState); }, []);
  useEffect(() => { const { full_name, phone, email } = credentials; writeCustomerDraft("credentials", { full_name, phone, email }); }, [credentials.full_name, credentials.phone, credentials.email]);
  useEffect(() => { writeCustomerDraft("profile", profile); }, [profile]);
  const updateCredentials = (next: typeof emptyCredentials) => { setCredentials(next); writeCustomerDraft("credentials", { full_name: next.full_name, phone: next.phone, email: next.email }); };
  const updateProfile = (next: typeof emptyProfile) => { setProfile(next); writeCustomerDraft("profile", next); };
  const saveExchangeDraft = (next: typeof initialExchangeDraft) => writeCustomerDraft("exchange", next);
  const updateExchangeReason = (next: string) => { setExchangeReason(next); saveExchangeDraft({ ...readCustomerDraft("exchange", initialExchangeDraft), reason: next }); };
  const updateExchangeDetails = (next: string) => { setExchangeDetails(next); saveExchangeDraft({ ...readCustomerDraft("exchange", initialExchangeDraft), details: next }); };
  const updateExchangeLines = (next: typeof exchangeLines) => { setExchangeLines(next); saveExchangeDraft({ ...readCustomerDraft("exchange", initialExchangeDraft), lines: next }); };
  const openExchangeRequest = (order: Order) => {
    clearCustomerFormDraft("customer-exchange");
    const next = { orderId: order.id, reason: "size_issue", details: "", lines: Object.fromEntries(order.items.map((item) => [item.id, { quantity: "0", requested_size: item.size_snapshot || "", requested_color: item.color_snapshot || "" }])) };
    setExchangeTarget(order); setExchangeReason(next.reason); setExchangeDetails(next.details); setExchangeLines(next.lines); saveExchangeDraft(next);
  };
  const closeExchangeRequest = () => { setExchangeTarget(null); clearCustomerDraft("exchange"); clearCustomerFormDraft("customer-exchange"); setExchangeReason("size_issue"); setExchangeDetails(""); setExchangeLines({}); };

  const changeMode = (next: "login" | "register") => { setMode(next); const url = new URL(window.location.href); if (next === "register") url.searchParams.set("mode", "register"); else url.searchParams.delete("mode"); window.history.pushState({ mode: next }, "", url.pathname + url.search + url.hash); };

  const loadAccount = async () => {
    const result = await api<{ customer: Customer }>("/api/customer/me");
    setCustomer(result.customer);
    if (!hasCustomerDraft("profile")) setProfile({ full_name: result.customer.full_name, phone: result.customer.phone });
    const [orderResult, rentalResult, exchangeResult] = await Promise.all([
      api<{ orders: Order[] }>("/api/customer/orders"),
      api<{ rentals: Rental[] }>("/api/customer/rentals"),
      api<{ exchanges: ExchangeRequest[] }>("/api/customer/exchanges"),
    ]);
    setOrders(orderResult.orders);
    const savedExchange = readCustomerDraft("exchange", { orderId: "", reason: "size_issue", details: "", lines: {} as Record<string, { quantity: string; requested_size: string; requested_color: string }> });
    if (savedExchange.orderId) {
      const target = orderResult.orders.find((order) => order.id === savedExchange.orderId);
      if (target && target.order_status === "delivered") setExchangeTarget(target);
      else clearCustomerDraft("exchange");
    }
    setRentals(rentalResult.rentals);
    setExchanges(exchangeResult.exchanges);
  };

  useEffect(() => { void loadAccount().catch(() => setCustomer(null)).finally(() => setLoading(false)); }, []);

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      if (mode === "register" && !securityToken) throw new Error("Complete the security check first.");
      const path = mode === "register" ? "/api/customer/register" : "/api/customer/login";
      const payload = mode === "register" ? { ...credentials, turnstile_token: securityToken } : { email: credentials.email, password: credentials.password };
      const result = await api<{ customer: Customer }>(path, { method: "POST", body: JSON.stringify(payload) });
      setCustomer(result.customer);
      setProfile({ full_name: result.customer.full_name, phone: result.customer.phone });
      clearCustomerDraft("credentials");
      clearCustomerDraft("profile");
      clearCustomerFormDraft("customer-auth");
      setCredentials({ ...emptyCredentials });
      setMessage(mode === "register" ? "Your De VERVE account is ready." : "Welcome back.");
      await loadAccount();
      const nextPath = new URLSearchParams(window.location.search).get("next");
      if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) window.location.assign(nextPath);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Sign-in could not be completed."); }
    finally { setBusy(false); setSecurityToken(""); setSecurityReset((value) => value + 1); }
  };

  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await api("/api/customer/profile", { method: "PATCH", body: JSON.stringify(profile) }); setCustomer((current) => current ? { ...current, ...profile } : current); clearCustomerDraft("profile"); clearCustomerFormDraft("customer-profile"); setMessage("Your profile has been updated."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Profile update failed."); }
    finally { setBusy(false); }
  };

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try { const result = await api<{ message: string }>("/api/customer/password", { method: "PATCH", body: JSON.stringify(passwords) }); setMessage(result.message); setPasswords({ current_password: "", new_password: "" }); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Password change failed."); }
    finally { setBusy(false); }
  };

  const startPayment = async (order: Order) => {
    setPaymentBusyOrder(order.id); setMessage("");
    try {
      const result = await api<{ checkout_url?: string; paid?: boolean }>(`/api/customer/orders/${order.id}/payment`, { method: "POST", body: "{}" });
      if (result.paid) { await loadAccount(); setMessage("This order is already paid."); return; }
      if (!result.checkout_url) throw new Error("The payment provider did not return a checkout address.");
      let checkout: URL;
      try { checkout = new URL(result.checkout_url); } catch { throw new Error("The payment provider returned an invalid checkout address."); }
      if (checkout.protocol !== "https:" || !["sandbox.api.getsafepay.com", "api.getsafepay.com"].includes(checkout.hostname) || checkout.pathname !== "/embedded" || checkout.username || checkout.password || checkout.port) throw new Error("The payment provider returned an untrusted checkout address.");
      window.location.assign(checkout.toString());
    } catch (error) { setMessage(error instanceof Error ? error.message : "Payment could not be started."); }
    finally { setPaymentBusyOrder(""); }
  };

  const submitExchange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!exchangeTarget) return;
    const items = Object.entries(exchangeLines).map(([order_item_id, line]) => ({ order_item_id, quantity: Number(line.quantity), requested_size: line.requested_size.trim(), requested_color: line.requested_color.trim() })).filter((item) => Number.isInteger(item.quantity) && item.quantity > 0);
    if (!items.length) { setMessage("Choose at least one item for exchange."); return; }
    setBusy(true); setMessage("");
    try {
      const result = await api<{ exchange_number: string }>("/api/customer/orders/" + exchangeTarget.id + "/exchanges", {
        method: "POST", body: JSON.stringify({ reason: exchangeReason, details: exchangeDetails, items }),
      });
      closeExchangeRequest();
      clearCustomerFormDraft("customer-exchange");
      await loadAccount();
      navigateSection("exchanges");
      setMessage("Exchange request " + result.exchange_number + " has been submitted.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Your exchange request could not be submitted."); }
    finally { setBusy(false); }
  };

  const signOut = async () => { setBusy(true); try { await api("/api/customer/logout", { method: "POST", body: "{}" }); setCustomer(null); setOrders([]); setRentals([]); setExchanges([]); setMessage("You have signed out."); } catch (error) { setMessage(error instanceof Error ? error.message : "Sign-out failed."); } finally { setBusy(false); } };

  return <main className="customer-account-page">
    <header className="customer-account-header"><a href="/" className="customer-brand"><span>DV</span><strong>De VERVE</strong></a><a href="/">Back to store ↗</a></header>
    <section className="customer-account-wrap">
      <div className="customer-account-intro"><p className="customer-eyebrow">YOUR DE VERVE ACCOUNT</p><h1>Good to have<br/><em>you here.</em></h1><p>Manage your details and keep track of your orders and rental requests in one place.</p></div>
      {loading ? <div className="customer-panel">Loading your account…</div> : !customer ? <section className="customer-panel customer-auth-panel">
        <div className="customer-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => { changeMode("login"); setMessage(""); }}>Sign in</button><button className={mode === "register" ? "active" : ""} onClick={() => { changeMode("register"); setMessage(""); }}>Create account</button></div>
        <form onSubmit={submitAuth} className="customer-form" data-draft-key="customer-auth">
          {mode === "register" && <><label>Full name<input required minLength={2} maxLength={100} autoComplete="name" value={credentials.full_name} onChange={(event) => updateCredentials({ ...credentials, full_name: event.target.value })}/></label><label>Phone / WhatsApp<input required type="tel" minLength={8} maxLength={24} autoComplete="tel" value={credentials.phone} onChange={(event) => updateCredentials({ ...credentials, phone: event.target.value })}/></label></>}
          <label>Email address<input required type="email" maxLength={160} autoComplete="email" value={credentials.email} onChange={(event) => updateCredentials({ ...credentials, email: event.target.value })}/></label>
          <label>Password<input required type="password" minLength={mode === "register" ? 12 : 1} maxLength={128} autoComplete={mode === "register" ? "new-password" : "current-password"} value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })}/></label>
          {mode === "register" && <><p className="customer-help">Use at least 12 characters. Email verification and password-reset emails will be enabled when the store's secure email service is connected.</p><SecurityCheck onToken={setSecurityToken} reset={securityReset}/></>}
          {message && <p className="customer-message" role="status">{message}</p>}
          <button className="customer-primary" type="submit" disabled={busy || (mode === "register" && !securityToken)}>{busy ? "Please wait…" : mode === "register" ? "Create my account" : "Sign in"} <span>↗</span></button>
        </form>
      </section> : <section className="customer-dashboard">
        <div className="customer-welcome"><div><p className="customer-eyebrow">SIGNED IN AS</p><h2>{customer.full_name}</h2><p>{customer.email} · {customer.phone}</p></div><button onClick={signOut} disabled={busy}>Sign out</button></div>
        <nav className="customer-dashboard-tabs"><button className={section === "orders" ? "active" : ""} onClick={() => navigateSection("orders")}>My orders ({orders.length})</button><button className={section === "rentals" ? "active" : ""} onClick={() => navigateSection("rentals")}>My rentals ({rentals.length})</button><button className={section === "exchanges" ? "active" : ""} onClick={() => navigateSection("exchanges")}>My exchanges ({exchanges.length})</button><button className={section === "profile" ? "active" : ""} onClick={() => navigateSection("profile")}>Profile & security</button></nav>
        {section === "orders" && <div className="customer-list">{orders.length === 0 ? <p className="customer-empty">No orders are linked to this account yet. Sign in before your next checkout to keep new orders here.</p> : orders.map((order) => <article className="customer-record" key={order.id}><div className="customer-record-top"><div><small>ORDER REFERENCE</small><strong>{order.order_number}</strong></div><span className={"customer-status status-" + order.order_status}>{pretty(order.order_status)}</span></div><p>{new Date(order.created_at).toLocaleString("en-PK")} · {order.city}</p><ul>{order.items.map((item, index) => <li key={index}>{item.product_name_snapshot} · {item.quantity} × {money(item.unit_price_paisa)}</li>)}</ul><div className="customer-record-total"><span>Final total</span><strong>{money(order.total_paisa)}</strong></div><div className="customer-order-doc-actions"><button type="button" onClick={()=>{try{printCustomerOrder(order,customer);}catch(error){setMessage(error instanceof Error?error.message:"Invoice could not be printed.");}}}>Invoice PDF / Print</button><button type="button" onClick={()=>exportOfficeDocument("de-verve-invoice-"+order.order_number+".docx","De VERVE · Sales invoice","Order "+order.order_number+" · "+new Date(order.created_at).toLocaleString("en-PK"),customerOrderRows(order,customer))}>Word</button><button type="button" onClick={()=>exportOfficeSpreadsheet("de-verve-invoice-"+order.order_number+".xlsx","Invoice",customerOrderRows(order,customer))}>Excel</button><button type="button" onClick={()=>exportOfficeImage("de-verve-invoice-"+order.order_number+".jpg","Sales invoice · "+order.order_number,new Date(order.created_at).toLocaleString("en-PK"),customerOrderRows(order,customer))}>JPG</button></div><p className="customer-help">Delivery fee: {order.delivery_fee_status === "accepted" ? money(order.delivery_fee_paisa) : "Awaiting confirmation"} · Payment: {pretty(order.payment_status)}</p>{order.payment_provider === "safepay" && order.payment_status !== "paid" && order.delivery_fee_status === "accepted" && ["pending", "confirmed"].includes(order.order_status) && <button className="customer-primary customer-pay-button" type="button" disabled={Boolean(paymentBusyOrder)} onClick={() => void startPayment(order)}>{paymentBusyOrder === order.id ? "Preparing secure checkout…" : "Pay securely (sandbox)"} <span>↗</span></button>}{order.events?.length > 0 && <div className="customer-order-timeline"><strong>Order progress</strong>{order.events.map((event) => <div className="customer-order-event" key={event.id}><span>{pretty(event.to_status)}</span><time>{new Date(event.created_at).toLocaleString("en-PK")}</time><small>{event.note}</small></div>)}</div>}{order.order_status === "delivered" && Date.now() - Date.parse(order.updated_at) <= 7 * 24 * 60 * 60 * 1000 && Date.now() >= Date.parse(order.updated_at) && !exchanges.some((item) => item.order_id === order.id) && <button type="button" className="customer-secondary customer-return-open" onClick={() => openExchangeRequest(order)}>Request exchange</button>}{exchangeTarget?.id === order.id && <form className="customer-return-form" data-draft-key="customer-exchange" onSubmit={submitExchange}><h3>Request an exchange</h3><p>Submit within 7 calendar days of delivery. Items must be unused, unworn, unwashed and unaltered, with original tags and packaging. Wrong, damaged or defective items should be reported as soon as possible, preferably within 48 hours. Hygiene-sensitive items such as opened or used socks and boxers are not exchangeable except where the law requires.</p><label>Reason<select value={exchangeReason} onChange={(event) => updateExchangeReason(event.target.value)}><option value="size_issue">Size or fit issue</option><option value="wrong_item">Wrong item received</option><option value="damaged">Damaged or defective</option><option value="other">Other</option></select></label><div className="customer-return-items">{order.items.map((item) => { const line = exchangeLines[item.id] ?? { quantity: "0", requested_size: item.size_snapshot || "", requested_color: item.color_snapshot || "" }; return <div key={item.id}><span>{item.product_name_snapshot} · {item.size_snapshot} / {item.color_snapshot} (bought {item.quantity})</span><label>Quantity<input type="number" min="0" max={item.quantity} step="1" value={line.quantity} onChange={(event) => updateExchangeLines({ ...exchangeLines, [item.id]: { ...line, quantity: event.target.value } })}/></label><label>Requested size<input maxLength={32} value={line.requested_size} onChange={(event) => updateExchangeLines({ ...exchangeLines, [item.id]: { ...line, requested_size: event.target.value } })}/></label><label>Requested colour<input maxLength={32} value={line.requested_color} onChange={(event) => updateExchangeLines({ ...exchangeLines, [item.id]: { ...line, requested_color: event.target.value } })}/></label></div>; })}</div><label>Tell us what happened<textarea required minLength={10} maxLength={1000} rows={3} value={exchangeDetails} onChange={(event) => updateExchangeDetails(event.target.value)}/></label><div className="customer-return-actions"><button className="customer-primary" disabled={busy}>{busy ? "Submitting…" : "Submit exchange request"}</button><button type="button" className="customer-secondary" onClick={closeExchangeRequest}>Cancel</button></div></form>}</article>)}</div>}
        {section === "exchanges" && <div className="customer-list">{exchanges.length === 0 ? <p className="customer-empty">No exchange requests yet. Eligible delivered orders can be submitted from My orders.</p> : exchanges.map((item) => <article className="customer-record" key={item.id}><div className="customer-record-top"><div><small>EXCHANGE REFERENCE</small><strong>{item.exchange_number}</strong></div><span className="customer-status">{pretty(item.status)}</span></div><p>Order {item.order_number} · {new Date(item.created_at).toLocaleString("en-PK")}</p><p>{pretty(item.reason)} · {item.details}</p><ul>{item.items.map((line) => <li key={line.id}>{line.product_name_snapshot} · {line.quantity} × requested {line.requested_size || "same size"} / {line.requested_color || "same colour"}</li>)}</ul>{item.admin_note && <p className="customer-help">De VERVE update: {item.admin_note}</p>}{item.events?.length > 0 && <div className="customer-order-timeline"><strong>Exchange progress</strong>{item.events.map((event) => <div className="customer-order-event" key={event.id}><span>{pretty(event.to_status)}</span><time>{new Date(event.created_at).toLocaleString("en-PK")}</time><small>{event.note}</small></div>)}</div>}</article>)}</div>}
        {section === "rentals" && <div className="customer-list">{rentals.length === 0 ? <p className="customer-empty">No rental requests are linked to this account yet.</p> : rentals.map((rental) => <article className="customer-record" key={rental.id}><div className="customer-record-top"><div><small>RENTAL REFERENCE</small><strong>{rental.reference_code}</strong></div><span className="customer-status">{pretty(rental.status)}</span></div><p>{rental.pickup_city} → {rental.destination_city}</p><p>{new Date(rental.pickup_at).toLocaleString("en-PK")} – {new Date(rental.return_at).toLocaleString("en-PK")}</p></article>)}</div>}
        {section === "profile" && <div className="customer-profile-grid"><form className="customer-form customer-panel" data-draft-key="customer-profile" onSubmit={submitProfile}><h3>Personal details</h3><label>Full name<input required minLength={2} maxLength={100} value={profile.full_name} onChange={(event) => updateProfile({ ...profile, full_name: event.target.value })}/></label><label>Phone / WhatsApp<input required type="tel" minLength={8} maxLength={24} value={profile.phone} onChange={(event) => updateProfile({ ...profile, phone: event.target.value })}/></label><label>Email address<input disabled value={customer.email}/></label><button className="customer-primary" disabled={busy}>Save profile</button></form><form className="customer-form customer-panel" data-draft-key="customer-password" onSubmit={submitPassword}><h3>Change password</h3><label>Current password<input required type="password" autoComplete="current-password" value={passwords.current_password} onChange={(event) => setPasswords({ ...passwords, current_password: event.target.value })}/></label><label>New password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={passwords.new_password} onChange={(event) => setPasswords({ ...passwords, new_password: event.target.value })}/></label><p className="customer-help">Changing your password signs out other active sessions.</p><button className="customer-primary" disabled={busy}>Update password</button></form></div>}
        {message && <p className="customer-message" role="status">{message}</p>}
      </section>}
      <p className="customer-footnote">Your account uses a secure, server-managed sign-in session. Email verification and password recovery are not active yet; do not reuse a password from another service.</p>
    </section>
  </main>;
}
