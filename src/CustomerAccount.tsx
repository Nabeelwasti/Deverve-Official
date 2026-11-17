import { useEffect, useState, type FormEvent } from "react";
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
const pretty = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function CustomerAccount() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [securityToken, setSecurityToken] = useState("");
  const [securityReset, setSecurityReset] = useState(0);
  const [credentials, setCredentials] = useState({ full_name: "", phone: "", email: "", password: "" });
  const [profile, setProfile] = useState({ full_name: "", phone: "" });
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "" });
  const [orders, setOrders] = useState<Order[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [exchanges, setExchanges] = useState<ExchangeRequest[]>([]);
  const [exchangeTarget, setExchangeTarget] = useState<Order | null>(null);
  const [exchangeReason, setExchangeReason] = useState("size_issue");
  const [exchangeDetails, setExchangeDetails] = useState("");
  const [exchangeLines, setExchangeLines] = useState<Record<string, { quantity: string; requested_size: string; requested_color: string }>>({});
  const [paymentBusyOrder, setPaymentBusyOrder] = useState("");
  const [section, setSection] = useState<"orders" | "rentals" | "exchanges" | "profile">("orders");

  const loadAccount = async () => {
    const result = await api<{ customer: Customer }>("/api/customer/me");
    setCustomer(result.customer);
    setProfile({ full_name: result.customer.full_name, phone: result.customer.phone });
    const [orderResult, rentalResult, exchangeResult] = await Promise.all([
      api<{ orders: Order[] }>("/api/customer/orders"),
      api<{ rentals: Rental[] }>("/api/customer/rentals"),
      api<{ exchanges: ExchangeRequest[] }>("/api/customer/exchanges"),
    ]);
    setOrders(orderResult.orders);
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
      setCredentials({ full_name: "", phone: "", email: "", password: "" });
      setMessage(mode === "register" ? "Your De VERVE account is ready." : "Welcome back.");
      await loadAccount();
      const nextPath = new URLSearchParams(window.location.search).get("next");
      if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) window.location.assign(nextPath);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Sign-in could not be completed."); }
    finally { setBusy(false); setSecurityToken(""); setSecurityReset((value) => value + 1); }
  };

  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await api("/api/customer/profile", { method: "PATCH", body: JSON.stringify(profile) }); setCustomer((current) => current ? { ...current, ...profile } : current); setMessage("Your profile has been updated."); }
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
      setExchangeTarget(null); setExchangeDetails(""); setExchangeLines({});
      await loadAccount();
      setSection("exchanges");
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
        <div className="customer-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setMessage(""); }}>Sign in</button><button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setMessage(""); }}>Create account</button></div>
        <form onSubmit={submitAuth} className="customer-form">
          {mode === "register" && <><label>Full name<input required minLength={2} maxLength={100} autoComplete="name" value={credentials.full_name} onChange={(event) => setCredentials({ ...credentials, full_name: event.target.value })}/></label><label>Phone / WhatsApp<input required type="tel" minLength={8} maxLength={24} autoComplete="tel" value={credentials.phone} onChange={(event) => setCredentials({ ...credentials, phone: event.target.value })}/></label></>}
          <label>Email address<input required type="email" maxLength={160} autoComplete="email" value={credentials.email} onChange={(event) => setCredentials({ ...credentials, email: event.target.value })}/></label>
          <label>Password<input required type="password" minLength={mode === "register" ? 12 : 1} maxLength={128} autoComplete={mode === "register" ? "new-password" : "current-password"} value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })}/></label>
          {mode === "register" && <><p className="customer-help">Use at least 12 characters. Email verification and password-reset emails will be enabled when the store's secure email service is connected.</p><SecurityCheck onToken={setSecurityToken} reset={securityReset}/></>}
          {message && <p className="customer-message" role="status">{message}</p>}
          <button className="customer-primary" type="submit" disabled={busy || (mode === "register" && !securityToken)}>{busy ? "Please wait…" : mode === "register" ? "Create my account" : "Sign in"} <span>↗</span></button>
        </form>
      </section> : <section className="customer-dashboard">
        <div className="customer-welcome"><div><p className="customer-eyebrow">SIGNED IN AS</p><h2>{customer.full_name}</h2><p>{customer.email} · {customer.phone}</p></div><button onClick={signOut} disabled={busy}>Sign out</button></div>
        <nav className="customer-dashboard-tabs"><button className={section === "orders" ? "active" : ""} onClick={() => setSection("orders")}>My orders ({orders.length})</button><button className={section === "rentals" ? "active" : ""} onClick={() => setSection("rentals")}>My rentals ({rentals.length})</button><button className={section === "exchanges" ? "active" : ""} onClick={() => setSection("exchanges")}>My exchanges ({exchanges.length})</button><button className={section === "profile" ? "active" : ""} onClick={() => setSection("profile")}>Profile & security</button></nav>
        {section === "orders" && <div className="customer-list">{orders.length === 0 ? <p className="customer-empty">No orders are linked to this account yet. Sign in before your next checkout to keep new orders here.</p> : orders.map((order) => <article className="customer-record" key={order.id}><div className="customer-record-top"><div><small>ORDER REFERENCE</small><strong>{order.order_number}</strong></div><span className={"customer-status status-" + order.order_status}>{pretty(order.order_status)}</span></div><p>{new Date(order.created_at).toLocaleString("en-PK")} · {order.city}</p><ul>{order.items.map((item, index) => <li key={index}>{item.product_name_snapshot} · {item.quantity} × {money(item.unit_price_paisa)}</li>)}</ul><div className="customer-record-total"><span>Final total</span><strong>{money(order.total_paisa)}</strong></div><p className="customer-help">Delivery fee: {order.delivery_fee_status === "accepted" ? money(order.delivery_fee_paisa) : "Awaiting confirmation"} · Payment: {pretty(order.payment_status)}</p>{order.payment_provider === "safepay" && order.payment_status !== "paid" && order.delivery_fee_status === "accepted" && ["pending", "confirmed"].includes(order.order_status) && <button className="customer-primary customer-pay-button" type="button" disabled={Boolean(paymentBusyOrder)} onClick={() => void startPayment(order)}>{paymentBusyOrder === order.id ? "Preparing secure checkout…" : "Pay securely (sandbox)"} <span>↗</span></button>}{order.events?.length > 0 && <div className="customer-order-timeline"><strong>Order progress</strong>{order.events.map((event) => <div className="customer-order-event" key={event.id}><span>{pretty(event.to_status)}</span><time>{new Date(event.created_at).toLocaleString("en-PK")}</time><small>{event.note}</small></div>)}</div>}{order.order_status === "delivered" && Date.now() - Date.parse(order.updated_at) <= 7 * 24 * 60 * 60 * 1000 && Date.now() >= Date.parse(order.updated_at) && !exchanges.some((item) => item.order_id === order.id) && <button type="button" className="customer-secondary customer-return-open" onClick={() => { setExchangeTarget(order); setExchangeReason("size_issue"); setExchangeDetails(""); setExchangeLines(Object.fromEntries(order.items.map((item) => [item.id, { quantity: "0", requested_size: item.size_snapshot || "", requested_color: item.color_snapshot || "" }]))); }}>Request exchange</button>}{exchangeTarget?.id === order.id && <form className="customer-return-form" onSubmit={submitExchange}><h3>Request an exchange</h3><p>Submit within 7 calendar days of delivery. Items must be unused, unworn, unwashed and unaltered, with original tags and packaging. Wrong, damaged or defective items should be reported as soon as possible, preferably within 48 hours. Hygiene-sensitive items such as opened or used socks and boxers are not exchangeable except where the law requires.</p><label>Reason<select value={exchangeReason} onChange={(event) => setExchangeReason(event.target.value)}><option value="size_issue">Size or fit issue</option><option value="wrong_item">Wrong item received</option><option value="damaged">Damaged or defective</option><option value="other">Other</option></select></label><div className="customer-return-items">{order.items.map((item) => { const line = exchangeLines[item.id] ?? { quantity: "0", requested_size: item.size_snapshot || "", requested_color: item.color_snapshot || "" }; return <div key={item.id}><span>{item.product_name_snapshot} · {item.size_snapshot} / {item.color_snapshot} (bought {item.quantity})</span><label>Quantity<input type="number" min="0" max={item.quantity} step="1" value={line.quantity} onChange={(event) => setExchangeLines((current) => ({ ...current, [item.id]: { ...line, quantity: event.target.value } }))}/></label><label>Requested size<input maxLength={32} value={line.requested_size} onChange={(event) => setExchangeLines((current) => ({ ...current, [item.id]: { ...line, requested_size: event.target.value } }))}/></label><label>Requested colour<input maxLength={32} value={line.requested_color} onChange={(event) => setExchangeLines((current) => ({ ...current, [item.id]: { ...line, requested_color: event.target.value } }))}/></label></div>; })}</div><label>Tell us what happened<textarea required minLength={10} maxLength={1000} rows={3} value={exchangeDetails} onChange={(event) => setExchangeDetails(event.target.value)}/></label><div className="customer-return-actions"><button className="customer-primary" disabled={busy}>{busy ? "Submitting…" : "Submit exchange request"}</button><button type="button" className="customer-secondary" onClick={() => setExchangeTarget(null)}>Cancel</button></div></form>}</article>)}</div>}
        {section === "exchanges" && <div className="customer-list">{exchanges.length === 0 ? <p className="customer-empty">No exchange requests yet. Eligible delivered orders can be submitted from My orders.</p> : exchanges.map((item) => <article className="customer-record" key={item.id}><div className="customer-record-top"><div><small>EXCHANGE REFERENCE</small><strong>{item.exchange_number}</strong></div><span className="customer-status">{pretty(item.status)}</span></div><p>Order {item.order_number} · {new Date(item.created_at).toLocaleString("en-PK")}</p><p>{pretty(item.reason)} · {item.details}</p><ul>{item.items.map((line) => <li key={line.id}>{line.product_name_snapshot} · {line.quantity} × requested {line.requested_size || "same size"} / {line.requested_color || "same colour"}</li>)}</ul>{item.admin_note && <p className="customer-help">De VERVE update: {item.admin_note}</p>}{item.events?.length > 0 && <div className="customer-order-timeline"><strong>Exchange progress</strong>{item.events.map((event) => <div className="customer-order-event" key={event.id}><span>{pretty(event.to_status)}</span><time>{new Date(event.created_at).toLocaleString("en-PK")}</time><small>{event.note}</small></div>)}</div>}</article>)}</div>}
        {section === "rentals" && <div className="customer-list">{rentals.length === 0 ? <p className="customer-empty">No rental requests are linked to this account yet.</p> : rentals.map((rental) => <article className="customer-record" key={rental.id}><div className="customer-record-top"><div><small>RENTAL REFERENCE</small><strong>{rental.reference_code}</strong></div><span className="customer-status">{pretty(rental.status)}</span></div><p>{rental.pickup_city} → {rental.destination_city}</p><p>{new Date(rental.pickup_at).toLocaleString("en-PK")} – {new Date(rental.return_at).toLocaleString("en-PK")}</p></article>)}</div>}
        {section === "profile" && <div className="customer-profile-grid"><form className="customer-form customer-panel" onSubmit={submitProfile}><h3>Personal details</h3><label>Full name<input required minLength={2} maxLength={100} value={profile.full_name} onChange={(event) => setProfile({ ...profile, full_name: event.target.value })}/></label><label>Phone / WhatsApp<input required type="tel" minLength={8} maxLength={24} value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })}/></label><label>Email address<input disabled value={customer.email}/></label><button className="customer-primary" disabled={busy}>Save profile</button></form><form className="customer-form customer-panel" onSubmit={submitPassword}><h3>Change password</h3><label>Current password<input required type="password" autoComplete="current-password" value={passwords.current_password} onChange={(event) => setPasswords({ ...passwords, current_password: event.target.value })}/></label><label>New password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={passwords.new_password} onChange={(event) => setPasswords({ ...passwords, new_password: event.target.value })}/></label><p className="customer-help">Changing your password signs out other active sessions.</p><button className="customer-primary" disabled={busy}>Update password</button></form></div>}
        {message && <p className="customer-message" role="status">{message}</p>}
      </section>}
      <p className="customer-footnote">Your account uses a secure, server-managed sign-in session. Email verification and password recovery are not active yet; do not reuse a password from another service.</p>
    </section>
  </main>;
}
