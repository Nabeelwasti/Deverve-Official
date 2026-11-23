import {useCallback,useEffect,useState} from "react";
import {adminRequest as call} from "./adminApi";

type Counts=Record<string,number>|null;
type Health={
 checked_at:string;
 overall_status:"available"|"partial"|"unavailable";
 database:{status:string};
 bindings:{private_media:boolean;translation_service:boolean};
 providers:{
  email:{configured:boolean};
  whatsapp:{configured:boolean};
  safepay:{configured:boolean;live_enabled:boolean};
  turnstile:{status:string};
 };
 queues:{owner_notifications:Counts;pos_receipts:Counts};
 payments:Counts;
 inventory:Counts;
 pos:Counts;
 staff:Counts;
 audit:Counts;
 backup:{status:string};
 unavailable_sections:number;
};

function value(data:Counts,key:string){const n=data?.[key];return typeof n==="number"?n.toLocaleString():"—";}
function statusText(ok:boolean){return ok?"Configured":"Not configured";}

export default function SystemHealthWorkspace({onClose}:{onClose:()=>void}){
 const [snapshot,setSnapshot]=useState<Health|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const refresh=useCallback(async()=>{
  setBusy(true);setMessage("");
  try{const result=await call<Health>("/api/admin/system-health");setSnapshot(result);}
  catch(error){setMessage(error instanceof Error?error.message:"System health could not be loaded.");}
  finally{setBusy(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 const checked=snapshot?.checked_at?new Date(snapshot.checked_at).toLocaleString():"Not checked yet";
 const tone=snapshot?.overall_status==="available"?"configured":snapshot?.overall_status==="partial"?"warning":"unavailable";
 return <main className="admin-screen owner-system-health">
  <header className="admin-topbar"><a className="admin-brand" href="/">De VERVE<span>.</span><small>OWNER SYSTEM HEALTH</small></a><button type="button" className="admin-secondary" onClick={onClose}>← Back to dashboard</button></header>
  <section className="admin-content">
   <div className="admin-heading-row"><div><p className="admin-eyebrow">OPERATIONS & RELIABILITY</p><h1>System health</h1><p className="admin-muted">Read-only checks for database availability, operational queues, inventory integrity and provider configuration. Secret values are never displayed.</p></div><div className="owner-notification-actions"><span>Checked: {checked}</span><button type="button" className="admin-primary" disabled={busy} onClick={()=>void refresh()}>{busy?"Checking…":"Refresh checks"}</button></div></div>
   {message&&<p className="admin-message" role="alert">{message}</p>}
   {!snapshot&&busy?<div className="admin-empty">Checking production services…</div>:snapshot&&<>
    <div className={"owner-email-status "+tone}><strong>Overall status: {snapshot.overall_status}</strong><p>Database: {snapshot.database.status}. {snapshot.unavailable_sections} operational data section(s) could not be read.</p></div>
    <div className="admin-stat-grid">
     <article><span>DATABASE</span><strong>{snapshot.database.status==="connected"?"Connected":"Unavailable"}</strong></article>
     <article><span>OPEN POS SHIFTS</span><strong>{value(snapshot.pos,"open_sessions")}</strong></article>
     <article><span>STOCK ANOMALIES</span><strong>{value(snapshot.inventory,"stock_anomalies")}</strong></article>
     <article><span>PENDING PAYMENTS</span><strong>{value(snapshot.payments,"pending")}</strong></article>
     <article><span>ACTIVE STAFF</span><strong>{value(snapshot.staff,"active_staff")}</strong></article>
     <article><span>AUDIT EVENTS · 24H</span><strong>{value(snapshot.audit,"events_24h")}</strong></article>
    </div>
    <div className="admin-panel"><div className="admin-panel-heading"><div><h2>Operational queues</h2><p className="admin-muted">Counts are live database snapshots, not delivery guarantees.</p></div></div>
     <div className="admin-stat-grid"><article><span>OWNER NOTIFICATIONS · QUEUED / FAILED</span><strong>{value(snapshot.queues.owner_notifications,"queued")} / {value(snapshot.queues.owner_notifications,"failed")}</strong></article><article><span>POS RECEIPTS · QUEUED / FAILED</span><strong>{value(snapshot.queues.pos_receipts,"queued")} / {value(snapshot.queues.pos_receipts,"failed")}</strong></article><article><span>PAYMENTS · SUCCEEDED / FAILED</span><strong>{value(snapshot.payments,"succeeded")} / {value(snapshot.payments,"failed")}</strong></article><article><span>ACTIVE CASHIERS / PENDING INVITES</span><strong>{value(snapshot.staff,"active_cashiers")} / {value(snapshot.staff,"pending_invites")}</strong></article></div>
    </div>
    <div className="admin-panel"><div className="admin-panel-heading"><div><h2>Provider configuration</h2><p className="admin-muted">Configuration presence only. This dashboard does not send test emails, WhatsApp messages or payments.</p></div></div>
     <div className="owner-notification-list">
      <article className="owner-notification"><div><strong>Email delivery</strong><p>{statusText(snapshot.providers.email.configured)}</p></div></article>
      <article className="owner-notification"><div><strong>WhatsApp delivery</strong><p>{statusText(snapshot.providers.whatsapp.configured)}</p></div></article>
      <article className="owner-notification"><div><strong>Safepay</strong><p>{statusText(snapshot.providers.safepay.configured)} · {snapshot.providers.safepay.live_enabled?"Live mode enabled":"Live mode disabled"}</p></div></article>
      <article className="owner-notification"><div><strong>Turnstile</strong><p>External verifier not probed from this application</p></div></article>
      <article className="owner-notification"><div><strong>Private media storage</strong><p>{statusText(snapshot.bindings.private_media)}</p></div></article>
      <article className="owner-notification"><div><strong>Translation service binding</strong><p>{statusText(snapshot.bindings.translation_service)}</p></div></article>
      <article className="owner-notification"><div><strong>Encrypted D1 backup & restore</strong><p>Requires a verified encrypted backup and isolated restore drill; not inferred from workflow configuration</p></div></article>
     </div>
    </div>
   </>}
  </section>
 </main>;
}
