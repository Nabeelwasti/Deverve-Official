import { useEffect, useState } from "react";
import { exportOfficeDocument, exportOfficeImage, exportOfficeSpreadsheet } from "./officeExport";

type QuoteItem = { product_name_snapshot: string; sku_snapshot: string | null; size_snapshot: string; color_snapshot: string; quantity: number; unit_price_paisa: number; line_total_paisa: number };
type PublicQuote = { business_name: string; contact_name: string; items: QuoteItem[]; quoted_total_paisa: number; status: string; valid_until: string | null; city: string };
export default function WholesaleQuote() {
  const token = window.location.pathname.split("/").filter(Boolean).at(-1) ?? "";
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const money = (paisa: number) => new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(paisa / 100);
  const quoteRows = quote ? [
    ["Business",quote.business_name],["Prepared for",quote.contact_name],["Delivery city",quote.city],["Valid until",quote.valid_until?new Date(quote.valid_until).toLocaleDateString("en-PK"):"Not specified"],["Quotation status",quote.status],[],
    ["Product","SKU","Size","Colour","Quantity","Unit price (PKR)","Line total (PKR)"],
    ...quote.items.map(item=>[item.product_name_snapshot,item.sku_snapshot||"",item.size_snapshot||"",item.color_snapshot||"",item.quantity,Number((item.unit_price_paisa/100).toFixed(2)),Number((item.line_total_paisa/100).toFixed(2))]),
    [],["Quoted total (PKR)",Number((quote.quoted_total_paisa/100).toFixed(2))],["Terms","Cash on delivery. Delivery charges and final arrangements are confirmed by De VERVE."]
  ] as Array<Array<string|number>> : [];
  const exportQuoteExcel=()=>{if(quote)exportOfficeSpreadsheet("de-verve-wholesale-quotation-"+token.slice(0,8)+".xlsx","Quotation",quoteRows);};
  const exportQuoteWord=()=>{if(quote)exportOfficeDocument("de-verve-wholesale-quotation-"+token.slice(0,8)+".docx","De VERVE · Wholesale quotation","Prepared for "+quote.business_name+" · "+new Date().toLocaleString("en-PK"),quoteRows);};
  const exportQuoteImage=()=>{if(quote)exportOfficeImage("de-verve-wholesale-quotation-"+token.slice(0,8)+".jpg","Wholesale quotation","Prepared for "+quote.business_name+" · "+new Date().toLocaleDateString("en-PK"),quoteRows);};

  const load = async () => {
    try {
      const response = await fetch("/api/wholesale-quotes/" + encodeURIComponent(token), { headers: { accept: "application/json" } });
      const result = await response.json() as { quote?: PublicQuote; accepted?: boolean; order?: { order_number: string }; error?: string };
      if (!response.ok || !result.quote) throw new Error(result.error || "This quotation could not be opened.");
      setQuote(result.quote);
      if (result.accepted && result.order?.order_number) setOrderNumber(result.order.order_number);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Quotation unavailable."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [token]);
  const respond = async (action: "accept" | "decline") => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/wholesale-quotes/" + encodeURIComponent(token) + "/" + action, { method: "POST", credentials: "same-origin", headers: { accept: "application/json", "content-type": "application/json" }, body: "{}" });
      if (response.status === 401 && action === "accept") { window.location.href = "/account?next=" + encodeURIComponent(window.location.pathname); return; }
      const result = await response.json() as { accepted?: boolean; declined?: boolean; order?: { order_number: string }; error?: string };
      if (!response.ok) throw new Error(result.error || "Your response could not be saved.");
      if (action === "accept") {
        setOrderNumber(result.order?.order_number ?? "");
        setMessage("Quotation accepted. Your wholesale COD order has been created. Our team will contact you to confirm fulfilment.");
      } else setMessage("Thank you. Your quotation response has been recorded. Our team can help if you need another option.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please contact De VERVE."); }
    finally { setBusy(false); }
  };
  return <main className="public-quote-screen">
    <header className="public-quote-header"><a href="/" className="public-quote-brand">De VERVE<span>.</span></a><span>WHOLESALE QUOTATION</span></header>
    <section className="public-quote-card">
      <p className="eyebrow">DE VERVE · JHELUM, PAKISTAN</p>
      <h1>Your wholesale<br /><em>quotation.</em></h1>
      {loading ? <p className="public-quote-muted">Loading your quotation…</p> : quote ? <>
        <div className="public-quote-meta"><div><span>BUSINESS</span><strong>{quote.business_name}</strong></div><div><span>PREPARED FOR</span><strong>{quote.contact_name}</strong></div><div><span>DELIVERY CITY</span><strong>{quote.city}</strong></div><div><span>VALID UNTIL</span><strong>{quote.valid_until ? new Date(quote.valid_until).toLocaleDateString() : "Not specified"}</strong></div></div>
        <div className="public-quote-items">{quote.items.map((item, index) => <article key={index}><div><strong>{item.product_name_snapshot}</strong><span>{[item.sku_snapshot, item.size_snapshot, item.color_snapshot].filter(Boolean).join(" · ")}</span><small>{item.quantity} × {money(item.unit_price_paisa)}</small></div><b>{money(item.line_total_paisa)}</b></article>)}</div>
        <div className="public-quote-total"><span>QUOTED TOTAL · PKR</span><strong>{money(quote.quoted_total_paisa)}</strong></div>
        <p className="public-quote-note">This quotation is for cash-on-delivery fulfilment. Accepting it creates a pending wholesale order and reserves the quoted stock. Delivery charges and final arrangements are confirmed by De VERVE.</p>        <div className="public-quote-downloads"><button type="button" onClick={exportQuoteExcel}>Download Excel</button><button type="button" onClick={exportQuoteWord}>Download Word</button><button type="button" onClick={exportQuoteImage}>Download JPG</button><button type="button" onClick={()=>window.print()}>Print / Save PDF</button></div>

        {quote.status === "sent" ? <div className="public-quote-actions"><button type="button" disabled={busy} onClick={() => void respond("decline")} className="public-quote-decline">Decline quotation</button><button type="button" disabled={busy} onClick={() => void respond("accept")} className="public-quote-accept">{busy ? "Please wait…" : "Accept quotation"}</button></div> : <p className="public-quote-state">This quotation is {quote.status}. Contact De VERVE if you need assistance.</p>}
      </> : <p className="public-quote-error">{message}</p>}
      {orderNumber && <p className="public-quote-order">Wholesale order reference: <strong>{orderNumber}</strong></p>}
      {message && <p className="public-quote-feedback" role="status">{message}</p>}
      <a className="public-quote-contact" href="https://wa.me/923298684517?text=Assalamu%20Alaikum%2C%20I%20need%20help%20with%20my%20De%20VERVE%20wholesale%20quotation." target="_blank" rel="noreferrer">Need help? Contact De VERVE on WhatsApp ↗</a>
    </section>
    <footer className="public-quote-footer">ELEVATE YOUR STYLE · DE VERVE</footer>
  </main>;
}
