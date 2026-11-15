import { useEffect, useState, type FormEvent } from "react";
import "./customer-account.css";

type Customer = { id: string; email: string; full_name: string; phone: string; email_verified: boolean };
type OrderItem = { product_name_snapshot: string; sku_snapshot: string | null; size_snapshot: string; color_snapshot: string; quantity: number; unit_price_paisa: number; line_total_paisa: number };
type Order = { id: string; order_number: string; city: string; subtotal_paisa: number; delivery_fee_paisa: number; total_paisa: number; payment_method: string; payment_status: string; order_status: string; delivery_fee_status: string; created_at: string; items: OrderItem[] };
type Rental = { id: string; reference_code: string; pickup_city: string; destination_city: string; pickup_at: string; return_at: string; driver_option: string; status: string; created_at: string };

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...options, credentials: "same-origin", headers: { accept: "application/json", ...(options.body ? { "content-type": "application/json" } : {}), ...options.headers } });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Please try again.");
  return payload;
}

let turnstilePromise: Promise<void> | null = null;
type TurnstileApi = { render: (host: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void }) => string; remove?: (id: string) => void };
declare global { interface Window { turnstile?: TurnstileApi } }
function SecurityCheck({ onToken, reset }: { onToken: (token: string) => void; reset: number }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    let active = true;
    if (!turnstilePromise) turnstilePromise = new Promise((resolve, reject) => {
      if (window.turnstile) { resolve(); return; }
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true; script.defer = true; script.onload = () => resolve(); script.onerror = () => reject(new Error("Security verification unavailable."));
      document.head.appendChild(script);
    });
    let widget = "";
    void turnstilePromise.then(() => { if (active && host && window.turnstile) widget = window.turnstile.render(host, { sitekey: "0x4AAAAAAGBpVe5Z1cq2CvB5", callback: onToken, "expired-callback": () => onToken(""), "error-callback": () => onToken("") }); }).catch(() => onToken(""));
    return () => { active = false; if (widget) window.turnstile?.remove?.(widget); };
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
  const [section, setSection] = useState<"orders" | "rentals" | "profile">("orders");

  const loadAccount = async () => {
    const result = await api<{ customer: Customer }>("/api/customer/me");
    setCustomer(result.customer);
    setProfile({ full_name: result.customer.full_name, phone: result.customer.phone });
    const [orderResult, rentalResult] = await Promise.all([
      api<{ orders: Order[] }>("/api/customer/orders"),
      api<{ rentals: Rental[] }>("/api/customer/rentals"),
    ]);
    setOrders(orderResult.orders);
    setRentals(rentalResult.rentals);
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

  const signOut = async () => { setBusy(true); try { await api("/api/customer/logout", { method: "POST", body: "{}" }); setCustomer(null); setOrders([]); setRentals([]); setMessage("You have signed out."); } catch (error) { setMessage(error instanceof Error ? error.message : "Sign-out failed."); } finally { setBusy(false); } };

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
        <nav className="customer-dashboard-tabs"><button className={section === "orders" ? "active" : ""} onClick={() => setSection("orders")}>My orders ({orders.length})</button><button className={section === "rentals" ? "active" : ""} onClick={() => setSection("rentals")}>My rentals ({rentals.length})</button><button className={section === "profile" ? "active" : ""} onClick={() => setSection("profile")}>Profile & security</button></nav>
        {section === "orders" && <div className="customer-list">{orders.length === 0 ? <p className="customer-empty">No orders are linked to this account yet. Sign in before your next checkout to keep new orders here.</p> : orders.map((order) => <article className="customer-record" key={order.id}><div className="customer-record-top"><div><small>ORDER REFERENCE</small><strong>{order.order_number}</strong></div><span className={"customer-status status-" + order.order_status}>{pretty(order.order_status)}</span></div><p>{new Date(order.created_at).toLocaleString("en-PK")} · {order.city}</p><ul>{order.items.map((item, index) => <li key={index}>{item.product_name_snapshot} · {item.quantity} × {money(item.unit_price_paisa)}</li>)}</ul><div className="customer-record-total"><span>Final total</span><strong>{money(order.total_paisa)}</strong></div><p className="customer-help">Delivery fee: {order.delivery_fee_status === "accepted" ? money(order.delivery_fee_paisa) : "Awaiting confirmation"} · Payment: {pretty(order.payment_status)}</p></article>)}</div>}
        {section === "rentals" && <div className="customer-list">{rentals.length === 0 ? <p className="customer-empty">No rental requests are linked to this account yet.</p> : rentals.map((rental) => <article className="customer-record" key={rental.id}><div className="customer-record-top"><div><small>RENTAL REFERENCE</small><strong>{rental.reference_code}</strong></div><span className="customer-status">{pretty(rental.status)}</span></div><p>{rental.pickup_city} → {rental.destination_city}</p><p>{new Date(rental.pickup_at).toLocaleString("en-PK")} – {new Date(rental.return_at).toLocaleString("en-PK")}</p></article>)}</div>}
        {section === "profile" && <div className="customer-profile-grid"><form className="customer-form customer-panel" onSubmit={submitProfile}><h3>Personal details</h3><label>Full name<input required minLength={2} maxLength={100} value={profile.full_name} onChange={(event) => setProfile({ ...profile, full_name: event.target.value })}/></label><label>Phone / WhatsApp<input required type="tel" minLength={8} maxLength={24} value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })}/></label><label>Email address<input disabled value={customer.email}/></label><button className="customer-primary" disabled={busy}>Save profile</button></form><form className="customer-form customer-panel" onSubmit={submitPassword}><h3>Change password</h3><label>Current password<input required type="password" autoComplete="current-password" value={passwords.current_password} onChange={(event) => setPasswords({ ...passwords, current_password: event.target.value })}/></label><label>New password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={passwords.new_password} onChange={(event) => setPasswords({ ...passwords, new_password: event.target.value })}/></label><p className="customer-help">Changing your password signs out other active sessions.</p><button className="customer-primary" disabled={busy}>Update password</button></form></div>}
        {message && <p className="customer-message" role="status">{message}</p>}
      </section>}
      <p className="customer-footnote">Your account uses a secure, server-managed sign-in session. Email verification and password recovery are not active yet; do not reuse a password from another service.</p>
    </section>
  </main>;
}
