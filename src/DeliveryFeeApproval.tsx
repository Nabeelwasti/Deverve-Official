import { useEffect, useState } from "react";
import "./delivery-fee.css";

type DeliveryQuote = {
  order_number: string;
  customer_name: string;
  subtotal_paisa: number;
  delivery_fee_paisa: number;
  total_paisa: number;
  delivery_fee_expires_at: string;
};

const money = (paisa: number) => "Rs. " + Math.round(paisa / 100).toLocaleString("en-PK");

export default function DeliveryFeeApproval() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [outcome, setOutcome] = useState<"accepted" | "declined" | null>(null);

  useEffect(() => {
    let active = true;
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) {
      setMessage("This approval link is incomplete or invalid. Please contact De VERVE.");
      setLoading(false);
      return () => { active = false; };
    }
    fetch("/api/delivery-fee/" + encodeURIComponent(token), { headers: { accept: "application/json" }, credentials: "same-origin" })
      .then(async (response) => {
        const payload = await response.json() as { order?: DeliveryQuote; error?: string };
        if (!response.ok || !payload.order) throw new Error(payload.error || "This quotation is no longer available.");
        if (active) setQuote(payload.order);
      })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "The quotation could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const decide = async (decision: "accept" | "decline") => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/delivery-fee/" + encodeURIComponent(token), {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Your decision could not be saved.");
      setOutcome(decision === "accept" ? "accepted" : "declined");
      setMessage(payload.message || "Your response has been saved.");
      setQuote(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your decision could not be saved.");
    } finally { setBusy(false); }
  };

  return <main className="delivery-approval-page">
    <section className="delivery-approval-card">
      <a className="delivery-approval-brand" href="/">De VERVE<span>.</span></a>
      <p className="delivery-approval-eyebrow">CUSTOMER ORDER CONFIRMATION</p>
      <h1>{outcome === "accepted" ? "Your total is confirmed." : outcome === "declined" ? "Your order was cancelled." : "Confirm your delivery total."}</h1>
      {loading ? <p className="delivery-approval-muted">Loading your secure quotation…</p> : quote ? <>
        <p className="delivery-approval-muted">Assalamu Alaikum {quote.customer_name}. Please review the final Cash on Delivery amount for order <strong>{quote.order_number}</strong>.</p>
        <dl className="delivery-approval-breakdown">
          <div><dt>Order subtotal</dt><dd>{money(quote.subtotal_paisa)}</dd></div>
          <div><dt>Delivery fee</dt><dd>{money(quote.delivery_fee_paisa)}</dd></div>
          <div className="delivery-approval-total"><dt>Total payable on delivery</dt><dd>{money(quote.total_paisa)}</dd></div>
        </dl>
        <p className="delivery-approval-note">By accepting, you confirm the delivery fee and the final COD total shown above. No online payment is collected here.</p>
        <div className="delivery-approval-actions">
          <button type="button" className="delivery-approval-accept" disabled={busy} onClick={() => void decide("accept")}>{busy ? "Saving…" : "Accept final total"}</button>
          <button type="button" className="delivery-approval-decline" disabled={busy} onClick={() => void decide("decline")}>Decline and cancel order</button>
        </div>
        <small>This secure link expires {new Date(quote.delivery_fee_expires_at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })} Pakistan time.</small>
      </> : <p className="delivery-approval-muted">{message || "The quotation is unavailable."}</p>}
      {message && quote && <p className="delivery-approval-message" role="status">{message}</p>}
      <a className="delivery-approval-contact" href="https://wa.me/923197553705" target="_blank" rel="noreferrer">Need help? Contact De VERVE on WhatsApp</a>
    </section>
  </main>;
}
