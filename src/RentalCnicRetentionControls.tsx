import { useState } from "react";
import type { FormEvent } from "react";
import { adminRequest } from "./adminApi";

type Props = {
  rentalId: string;
  rentalStatus: string;
  hasBothDocuments: boolean;
  retentionStatus?: string;
  retentionDueAt?: string | null;
  clearanceAt?: string | null;
  deletedAt?: string | null;
  holdActive?: boolean | number;
  holdReason?: string | null;
  canApprove: boolean;
  onSaved: () => void;
};

const checks = [
  ["payments_settled", "All rental payments and deposits are fully settled"],
  ["damages_settled", "Vehicle inspection and damage claims are fully cleared"],
  ["challans_settled", "Traffic challans and fines are fully cleared"],
  ["fees_settled", "Late, extra-mileage and other fees are fully cleared"],
  ["no_open_disputes", "No open dispute, chargeback, claim or legal matter remains"],
] as const;

export default function RentalCnicRetentionControls(props: Props) {
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [holdReason, setHoldReason] = useState("");
  const [reviewAt, setReviewAt] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [releaseNote, setReleaseNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const status = props.retentionStatus || "not_cleared";
  const held = Boolean(props.holdActive);

  const submitClearance = async (event: FormEvent) => {
    event.preventDefault();
    if (!checks.every(([key]) => confirmed[key]) || note.trim().length < 10 || busy) return;
    setBusy(true); setMessage("");
    try {
      const payload = Object.fromEntries(checks.map(([key]) => [key, true]));
      await adminRequest("/api/admin/rentals/" + props.rentalId + "/cnic-clearance", {
        method: "POST", body: JSON.stringify({ ...payload, note: note.trim() }),
      });
      setMessage("Final clearance recorded. CNIC retention is scheduled for 90 days from now.");
      props.onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Clearance could not be recorded.");
    } finally { setBusy(false); }
  };

  const submitHold = async (event: FormEvent) => {
    event.preventDefault();
    if (holdReason.trim().length < 10 || !reviewAt || busy) return;
    setBusy(true); setMessage("");
    try {
      await adminRequest("/api/admin/rentals/" + props.rentalId + "/cnic-hold", {
        method: "POST", body: JSON.stringify({ action: "place", reason: holdReason.trim(), review_at: new Date(reviewAt + "T23:59:59+05:00").toISOString() }),
      });
      setHoldReason("");
      setMessage("Retention hold placed. Automatic deletion is paused until an authorised manager releases it.");
      props.onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The retention hold could not be placed.");
    } finally { setBusy(false); }
  };

  const releaseHold = async () => {
    if (releaseNote.trim().length < 10 || busy) return;
    setBusy(true); setMessage("");
    try {
      await adminRequest("/api/admin/rentals/" + props.rentalId + "/cnic-hold", {
        method: "POST", body: JSON.stringify({ action: "release", note: releaseNote.trim() }),
      });
      setReleaseNote("");
      setMessage("Retention hold released. The original 90-day deadline remains unchanged.");
      props.onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The retention hold could not be released.");
    } finally { setBusy(false); }
  };

  return <section className="admin-rental-retention">
    <strong>CNIC retention control</strong>
    <p className="admin-muted">Documents remain private until final owner/manager clearance, then for 90 days. An active legal or business hold pauses deletion.</p>
    <p><strong>Status:</strong> {status.replaceAll("_", " ")}
      {props.clearanceAt && <> · Cleared {new Date(props.clearanceAt).toLocaleString("en-PK")}</>}
      {props.retentionDueAt && <> · Due {new Date(props.retentionDueAt).toLocaleString("en-PK")}</>}
      {props.deletedAt && <> · Deleted {new Date(props.deletedAt).toLocaleString("en-PK")}</>}
    </p>
    {held && <p role="status"><strong>Active hold:</strong> {props.holdReason || "A legal/business hold is active."}</p>}
    {props.canApprove && status === "not_cleared" && props.rentalStatus === "completed" && props.hasBothDocuments && <form onSubmit={submitClearance}>
      <strong>Final financial and incident clearance</strong>
      {checks.map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(confirmed[key])} disabled={busy} onChange={event => setConfirmed(current => ({ ...current, [key]: event.target.checked }))}/> {label}</label>)}
      <label>Reconciliation reference / notes<textarea rows={2} maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="Record settlement reference, inspection and final manager notes…" disabled={busy}/></label>
      <button type="submit" className="admin-primary" disabled={busy || !checks.every(([key]) => confirmed[key]) || note.trim().length < 10}>{busy ? "Saving…" : "Approve final clearance & start 90 days"}</button>
    </form>}
    {props.canApprove && status === "not_cleared" && props.rentalStatus !== "completed" && <p className="admin-muted">Mark the rental completed only after handover and return checks. Final clearance is unavailable until then.</p>}
    {props.canApprove && status === "not_cleared" && props.rentalStatus === "completed" && !props.hasBothDocuments && <p className="admin-muted">Both original CNIC sides must be present before final clearance can be recorded.</p>}
    {props.canApprove && !["purging", "deleted"].includes(status) && !held && <form onSubmit={submitHold}>
      <strong>Place a legal or business retention hold</strong>
      <label>Reason<textarea rows={2} maxLength={500} value={holdReason} onChange={event => setHoldReason(event.target.value)} placeholder="Describe the dispute, claim, investigation or legal reason…" disabled={busy}/></label>
      <label>Review date<input type="date" value={reviewAt} min={new Date().toISOString().slice(0, 10)} onChange={event => setReviewAt(event.target.value)} disabled={busy}/></label>
      <button type="submit" className="admin-secondary" disabled={busy || holdReason.trim().length < 10 || !reviewAt}>Place retention hold</button>
    </form>}
    {props.canApprove && held && <form onSubmit={event => {event.preventDefault();void releaseHold();}}>
      <strong>Release active hold</strong>
      <label>Reason for release<textarea rows={2} maxLength={500} value={releaseNote} onChange={event => setReleaseNote(event.target.value)} placeholder="Explain why the legal/business hold is cleared…" disabled={busy}/></label>
      <button type="submit" className="admin-secondary" disabled={busy || releaseNote.trim().length < 10}>Release hold</button>
    </form>}
    {message && <p role="status" aria-live="polite">{message}</p>}
  </section>;
}
