import { useEffect, useRef, useState, type FormEvent } from "react";
import { exportOfficeDocument, exportOfficeImage, exportOfficeSpreadsheet } from "./officeExport";
import { adminRequest as api } from "./adminApi";
import "./admin.css";
import ContentStudio from "./ContentStudio";
import NotificationCenter from "./NotificationCenter";
import VehicleGalleryManager from "./VehicleGalleryManager";
import InventoryWorkspace from "./InventoryWorkspace";
import POSWorkspace from "./POSWorkspace";
import AIKeyManager from "./AIKeyManager";
import ImageCropper from "./ImageCropper";

type AdminUser = { id: string; email: string; role: string };
type AdminPaymentMethod = {id:string;label:string;kind:"cod"|"bank"|"wallet"|"link"|"qr";provider:string;enabled:boolean;account_title:string;bank_name:string;account_number:string;iban:string;payment_url:string;instructions:string;qr_media_id:string|null};
type StaffMember = { id: string; email: string; role: string; is_active: number; created_at: string; last_login_at: string | null };
type StaffInvite = { id: string; email: string; role: string; expires_at: string; created_at: string };
type Product = {
  id: string; slug: string; name: string; description: string; category: string;
  audience: "men" | "women" | "kids" | "unisex"; status: "draft" | "published" | "archived";
  retail_price_paisa: number | null; wholesale_price_paisa: number | null; image_key: string | null; seo_title: string; seo_description: string;
};

type ProductForm = { name: string; slug: string; description: string; category: string; audience: Product["audience"]; status: Product["status"]; retail_price_paisa: string; wholesale_price_paisa: string; seo_title: string; seo_description: string };
type Overview = { published_products: number; draft_products: number; new_enquiries: number; pending_orders: number; rental_requests: number };
type FinancialAccount = {id:string;name:string;kind:"cash"|"bank"|"wallet"|"gateway";masked_reference:string};
type AdminOrder = { id: string; order_number: string; customer_name: string; phone: string; email: string | null; financial_account_id?: string | null; delivery_address: string; city: string; subtotal_paisa: number; delivery_fee_paisa: number; total_paisa: number; discount_code: string; discount_label: string; discount_amount_paisa: number; free_delivery: number; delivery_fee_status: "pending_quote" | "awaiting_customer" | "accepted" | "declined"; delivery_fee_expires_at: string | null; payment_method: string; payment_provider: string; payment_status: string; order_status: "pending" | "confirmed" | "processing" | "dispatched" | "delivered" | "cancelled"; customer_note: string; created_at: string; items: Array<{ id: string; product_name_snapshot: string; sku_snapshot: string | null; size_snapshot: string; color_snapshot: string; quantity: number; unit_price_paisa: number; line_total_paisa: number }> };
type FollowUpItem = { key: string; kind: "enquiry" | "order" | "return" | "rental" | "wholesale"; title: string; contact: string; phone: string; email: string | null; status: string; summary: string; created_at: string; screen: string; priority: number };
type AuditEvent = { id: string; action: string; entity_type: string; entity_id: string | null; metadata_json: string; created_at: string; actor_email: string | null };
type CustomerRecord = { id: string; full_name: string; email: string; phone: string; status: string; email_verified_at: string | null; created_at: string; last_login_at: string | null; order_count: number; paid_total_paisa: number; last_order_at: string | null; rental_count: number };
type AdminProductReview = {id:string;product_id:string;order_id:string|null;order_item_id:string|null;rating:number;title:string;body:string;status:"pending"|"approved"|"rejected";moderation_note:string;created_at:string;product_name:string;product_slug:string;customer_name:string;customer_email:string;order_number:string};
type AdminReturn = { id: string; order_id: string; customer_id: string; return_number: string; order_number: string; customer_name: string; customer_email: string | null; customer_phone: string; reason: string; details: string; status: "requested" | "approved" | "rejected" | "received" | "refunded"; refund_amount_paisa: number; refund_method: string | null; refund_reference: string | null; admin_note: string; payment_provider: string; payment_status: string; created_at: string; items: Array<{ quantity: number; unit_refund_paisa: number; product_name_snapshot: string; sku_snapshot: string | null; size_snapshot: string; color_snapshot: string }> };
type AdminExchange = { id: string; order_id: string; customer_id: string; exchange_number: string; order_number: string; customer_name: string; customer_email: string | null; customer_phone: string; reason: string; details: string; status: "requested" | "reviewing" | "approved" | "rejected" | "item_received" | "completed"; admin_note: string; created_at: string; items: Array<{ quantity: number; requested_size: string; requested_color: string; product_name_snapshot: string; sku_snapshot: string | null; size_snapshot: string; color_snapshot: string }> };
type Enquiry = { id: string; enquiry_type: "retail" | "wholesale" | "rental" | "general" | "complaint" | "dmca" | "legal" | "business" | "other"; customer_name: string; phone: string; email: string | null; message: string; status: "new" | "contacted" | "qualified" | "closed" | "spam"; source: string; created_at: string };
const enquiryTypeLabel = (type: Enquiry["enquiry_type"]) => ({
  general:"General",retail:"Retail fashion",wholesale:"Wholesale / bulk order",rental:"Car rental",
  complaint:"Complaint / service issue",dmca:"DMCA / copyright notice",legal:"Legal / compliance matter",
  business:"Business / partnership",other:"Other important matter"
}[type]);
type Variant = { id: string; product_id: string; sku: string | null; size: string; color: string; barcode?: string | null; cost_price_paisa?: number; reorder_level?: number; stock_on_hand: number; reserved_quantity: number; available_quantity: number; is_active: number };
type InventoryMovement = { id: string; movement_type: string; quantity_delta: number; reference_type: string; reference_id: string | null; note: string; created_at: string };
type MediaAsset = { id: string; media_type: string; mime_type: string; byte_size: number; alt_text: string; caption: string; status: string; created_at: string; url: string; color?: string };
type QuoteLineDraft = { product_id: string; variant_id: string; quantity: string; unit_price: string; variants: Variant[] };
type Vehicle = { id: string; name: string; vehicle_type: string; transmission: string; seats: number; fuel_type: string; daily_rate_paisa: number | null; with_driver_daily_rate_paisa: number | null; status: "draft" | "available" | "maintenance" | "retired"; image_key: string | null; description: string };
type RentalRequest = { id: string; vehicle_id: string | null; vehicle_name: string | null; vehicle_type: string | null; customer_name: string; phone: string; email: string | null; pickup_location: string; destination: string | null; pickup_city?: string; pickup_address?: string; destination_city?: string; destination_address?: string; cnic_front_uploaded?: number; cnic_back_uploaded?: number; rental_days?: number | null; estimated_daily_rate_paisa?: number | null; estimated_total_paisa?: number | null; pickup_at: string; return_at: string; driver_option: "self_drive" | "with_driver"; status: "requested" | "reviewing" | "confirmed" | "active" | "completed" | "cancelled"; customer_note: string; admin_note: string; reference_code: string; created_at: string };
type WholesaleQuote = { id: string; business_name: string; contact_name: string; phone: string; email: string | null; quoted_total_paisa: number | null; status: string; valid_until: string | null; city: string; approval_token: string | null; converted_order_id: string | null; approval_url: string | null; created_at: string; items: Array<{ id: string; product_name_snapshot: string; sku_snapshot: string | null; size_snapshot: string; color_snapshot: string; quantity: number; unit_price_paisa: number; line_total_paisa: number }> };

const emptyProduct: ProductForm = {
  name: "", slug: "", description: "", category: "", audience: "unisex" as const,
  status: "draft" as const, retail_price_paisa: "", wholesale_price_paisa: "", seo_title: "", seo_description: "",
};

const ADMIN_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
function readAdminDraft<T extends object>(key: string, fallback: T): T {
  try {
    const storageKey = "deverve:admin-draft:v1:" + key;
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as { savedAt?: number; data?: Partial<T> };
    if (!saved || typeof saved.savedAt !== "number" || Date.now() - saved.savedAt > ADMIN_DRAFT_TTL_MS || !saved.data || typeof saved.data !== "object") {
      sessionStorage.removeItem(storageKey);
      return fallback;
    }
    return { ...fallback, ...saved.data };
  } catch { return fallback; }
}
function writeAdminDraft(key: string, data: object): void {
  try { sessionStorage.setItem("deverve:admin-draft:v1:" + key, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* Admin work must continue if storage is unavailable. */ }
}
function clearAdminFormDraft(key: string): void {
  try { sessionStorage.removeItem("deverve:form-draft:v1:" + window.location.pathname + ":" + key); } catch { /* Storage may be unavailable. */ }
}

function whatsappHref(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  const international = digits.startsWith("0") ? "92" + digits.slice(1) : digits;
  return international.length >= 10 && international.length <= 15
    ? "https://wa.me/" + international + "?text=" + encodeURIComponent(message)
    : "https://wa.me/";
}

function orderDocumentRows(order: AdminOrder, kind: "invoice" | "delivery"): Array<Array<string | number>> {
  const money = (paisa: number) => Number((paisa / 100).toFixed(2));
  const details = kind === "invoice"
    ? [["Description","SKU","Size","Colour","Qty","Unit price (PKR)","Line total (PKR)"], ...order.items.map(item=>[item.product_name_snapshot,item.sku_snapshot||"",item.size_snapshot||"",item.color_snapshot||"",item.quantity,money(item.unit_price_paisa),money(item.line_total_paisa)])]
    : [["Description","SKU","Size","Colour","Quantity"], ...order.items.map(item=>[item.product_name_snapshot,item.sku_snapshot||"",item.size_snapshot||"",item.color_snapshot||"",item.quantity])];
  const meta: Array<Array<string|number>> = [
    ["Document",kind==="invoice"?"Sales invoice":"Delivery / packing slip"],
    ["Order reference",order.order_number],
    ["Issue date",new Date(order.created_at).toLocaleString("en-PK")],
    ["Customer",order.customer_name],
    ["Phone",order.phone],
    ["Email",order.email||"Not provided"],
    ["Delivery address",order.delivery_address+", "+order.city],
    ["Order status",order.order_status],
    ["Payment",order.payment_method+" · "+order.payment_status],
  ];
  if(kind==="invoice")meta.push(["Subtotal (PKR)",money(order.subtotal_paisa)],["Discount",order.discount_amount_paisa>0?(order.discount_label+" · -PKR "+money(order.discount_amount_paisa)):"None"],["Delivery",order.free_delivery?"FREE":money(order.delivery_fee_paisa)],["Final total (PKR)",money(order.total_paisa)]);
  return [...meta,[],...details];
}


function rentalDocumentRows(rental:RentalRequest):Array<Array<string|number>>{
 const amount=(paisa:number)=>Number((paisa/100).toFixed(2));
 return [
  ["Document","Vehicle rental request summary"],["Reference",rental.reference_code],["Created",new Date(rental.created_at).toLocaleString("en-PK")],
  ["Customer",rental.customer_name],["Phone",rental.phone],["Email",rental.email||"Not provided"],
  ["Vehicle",rental.vehicle_name||"To be assigned"],["Vehicle type",rental.vehicle_type||"Not specified"],
  ["Pickup",new Date(rental.pickup_at).toLocaleString("en-PK")],["Pickup location",rental.pickup_address?rental.pickup_address+", "+rental.pickup_city:rental.pickup_location],
  ["Return",new Date(rental.return_at).toLocaleString("en-PK")],["Destination",rental.destination_address?rental.destination_address+", "+rental.destination_city:rental.destination||"Not specified"],
  ["Driver option",rental.driver_option.replaceAll("_"," ")],["Duration (days)",rental.rental_days??"To confirm"],
  ["Estimated daily rate (PKR)",rental.estimated_daily_rate_paisa!==null&&rental.estimated_daily_rate_paisa!==undefined?amount(rental.estimated_daily_rate_paisa):"To confirm"],
  ["Estimated total (PKR)",rental.estimated_total_paisa!==null&&rental.estimated_total_paisa!==undefined?amount(rental.estimated_total_paisa):"To confirm"],
  ["CNIC front uploaded",rental.cnic_front_uploaded?"Yes":"No"],["CNIC back uploaded",rental.cnic_back_uploaded?"Yes":"No"],
  ["Request status",rental.status],["Customer note",rental.customer_note||"None"],
  [],["Important","This is a request summary, not a rental contract. Vehicle handover is subject to identity verification, vehicle availability and a separately signed rental agreement."]
 ];
}
function printRentalSummary(rental:RentalRequest):void{
 const popup=window.open("","_blank");if(!popup)throw new Error("Allow pop-ups for this site to print the rental slip.");popup.opener=null;
 const esc=(value:unknown)=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]||char));
 const fields=[["Customer",rental.customer_name],["Contact",rental.phone+" · "+(rental.email||"")],["Vehicle",rental.vehicle_name||"To be assigned"],["Driver option",rental.driver_option.replaceAll("_"," ")],["Pickup",new Date(rental.pickup_at).toLocaleString("en-PK")],["Pickup location",rental.pickup_address?rental.pickup_address+", "+rental.pickup_city:rental.pickup_location],["Return",new Date(rental.return_at).toLocaleString("en-PK")],["Destination",rental.destination_address?rental.destination_address+", "+rental.destination_city:rental.destination||"Not specified"],["Duration",String(rental.rental_days??"To confirm")+" day(s)"],["Estimated total",rental.estimated_total_paisa!==null&&rental.estimated_total_paisa!==undefined?"PKR "+(rental.estimated_total_paisa/100).toFixed(2):"To confirm"],["CNIC front / back uploaded",(rental.cnic_front_uploaded?"Yes":"No")+" / "+(rental.cnic_back_uploaded?"Yes":"No")],["Request status",rental.status]];
 const html="<!doctype html><html><head><meta charset='utf-8'><title>De VERVE rental "+esc(rental.reference_code)+"</title><style>@page{size:A4;margin:18mm}body{font:12px Arial;color:#263b50}.bar{height:8px;background:#163a5f;margin-bottom:24px}.brand{font-size:25px;font-weight:800;color:#102a43;letter-spacing:2px}.muted{color:#60758a}.title{display:flex;justify-content:space-between;margin:26px 0}.title h1{margin:0;font-size:22px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;background:#f1f5f9;padding:18px}.grid small{display:block;color:#60758a;text-transform:uppercase;font-size:9px;margin-bottom:4px}.grid strong{font-size:12px}p{line-height:1.6;color:#60758a}.sign{display:flex;justify-content:space-between;margin-top:55px}.sign span{width:42%;border-top:1px solid #60758a;padding-top:8px}.footer{border-top:1px solid #d7e0e8;margin-top:30px;padding-top:12px;color:#60758a;font-size:10px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div class='bar'></div><div class='brand'>DE VERVE</div><div class='muted'>JHELUM · PAKISTAN · +92 319 7553705</div><div class='title'><h1>RENTAL REQUEST SUMMARY</h1><strong>"+esc(rental.reference_code)+"</strong></div><div class='grid'>"+fields.map(([label,value])=>"<div><small>"+esc(label)+"</small><strong>"+esc(value)+"</strong></div>").join("")+"</div><p>This is a booking request summary, not a rental contract or vehicle handover authorisation. Final rate, deposit, mileage, fuel, insurance, driver arrangement, permitted use, damage responsibility, late-return charges and all other terms must be recorded in the separately signed De VERVE rental agreement before handover. This slip does not contain or reproduce any CNIC image or CNIC number.</p><div class='sign'><span>Prepared by De VERVE</span><span>Customer acknowledgement</span></div><div class='footer'>De VERVE · Private rental record · Access to identity evidence is separately controlled and audited.</div></body></html>";
 popup.addEventListener("load",()=>{popup.focus();popup.print();},{once:true});popup.document.open();popup.document.write(html);popup.document.close();
}

function printOrderDocument(order: AdminOrder, kind: "invoice" | "delivery"): void {
  const popup=window.open("","_blank");
  if(!popup)throw new Error("Your browser blocked the print window. Allow pop-ups for this site and try again.");
  popup.opener=null;
  const esc=(value:unknown)=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]||char));
  const invoice=kind==="invoice";
  const rows=order.items.map(item=>"<tr><td>"+esc(item.product_name_snapshot)+"<small>"+esc([item.sku_snapshot,item.size_snapshot,item.color_snapshot].filter(Boolean).join(" · "))+"</small></td><td>"+item.quantity+"</td>"+(invoice?"<td>PKR "+(item.unit_price_paisa/100).toFixed(2)+"</td><td>PKR "+(item.line_total_paisa/100).toFixed(2)+"</td>":"")+"</tr>").join("");
  const total=Number(order.total_paisa/100).toLocaleString("en-PK",{minimumFractionDigits:2,maximumFractionDigits:2});
  const subtotal=Number(order.subtotal_paisa/100).toLocaleString("en-PK",{minimumFractionDigits:2,maximumFractionDigits:2});
  const discount=Number(order.discount_amount_paisa/100).toLocaleString("en-PK",{minimumFractionDigits:2,maximumFractionDigits:2});
  const delivery=Number(order.delivery_fee_paisa/100).toLocaleString("en-PK",{minimumFractionDigits:2,maximumFractionDigits:2});
  const title=invoice?"SALES INVOICE":"DELIVERY / PACKING SLIP";
  const totals=invoice?"<section class='totals'><div><span>Subtotal</span><b>PKR "+subtotal+"</b></div>"+(order.discount_amount_paisa>0?"<div><span>"+esc(order.discount_label||"Discount")+"</span><b>- PKR "+discount+"</b></div>":"")+"<div><span>Delivery</span><b>"+(order.free_delivery?"FREE":"PKR "+delivery)+"</b></div><div class='grand'><span>AMOUNT DUE</span><b>PKR "+total+"</b></div></section>":"";
  const html="<!doctype html><html><head><meta charset='utf-8'><title>"+esc(title)+" · "+esc(order.order_number)+"</title><style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#263b50;margin:0;font-size:12px}.top{height:8px;background:#163a5f;margin-bottom:28px}.brand{font-size:25px;font-weight:800;letter-spacing:2px;color:#102a43}.muted{color:#60758a}.title{display:flex;justify-content:space-between;align-items:end;margin:24px 0 18px}.title h1{font-size:25px;margin:0;color:#102a43}.ref{text-align:right}.ref strong{display:block;font-size:15px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;background:#f1f5f9;padding:16px;border-radius:8px;margin-bottom:22px}.grid div{padding:4px 0}.grid small{display:block;text-transform:uppercase;color:#60758a;font-size:9px;letter-spacing:1px;margin-bottom:4px}.grid strong{font-size:12px;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;margin:16px 0}th{background:#163a5f;color:#fff;text-align:left;padding:11px 9px;font-size:10px;text-transform:uppercase;letter-spacing:.5px}td{padding:12px 9px;border-bottom:1px solid #d7e0e8;vertical-align:top}tbody tr:nth-child(even){background:#f7f9fb}td small{display:block;color:#60758a;margin-top:4px}.totals{width:48%;margin:18px 0 0 auto}.totals div{display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid #e3eaf0}.totals .grand{background:#163a5f;color:white;font-size:14px;font-weight:700;margin-top:6px}.note{margin-top:30px;padding-top:14px;border-top:1px solid #d7e0e8;color:#60758a;font-size:10px;line-height:1.6}.sign{display:flex;justify-content:space-between;margin-top:48px}.sign span{border-top:1px solid #8093a5;padding-top:8px;width:42%;color:#60758a}.footer{margin-top:30px;text-align:center;color:#60758a;font-size:10px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div class='top'></div><div class='brand'>DE VERVE</div><div class='muted'>JHELUM · PAKISTAN · +92 319 7553705</div><div class='title'><h1>"+title+"</h1><div class='ref'><strong>"+esc(order.order_number)+"</strong><span class='muted'>"+esc(new Date(order.created_at).toLocaleString("en-PK"))+"</span></div></div><div class='grid'><div><small>Customer</small><strong>"+esc(order.customer_name)+"</strong></div><div><small>Contact</small><strong>"+esc(order.phone)+" · "+esc(order.email||"")+"</strong></div><div><small>Delivery address</small><strong>"+esc(order.delivery_address+", "+order.city)+"</strong></div><div><small>Order / payment status</small><strong>"+esc(order.order_status)+" · "+esc(order.payment_status)+"</strong></div></div><table><thead><tr><th>Item / variant</th><th>Qty</th>"+(invoice?"<th>Unit price</th><th>Amount</th>":"")+"</tr></thead><tbody>"+rows+"</tbody></table>"+totals+"<div class='sign'><span>Prepared by De VERVE</span><span>Received by customer</span></div><div class='note'>"+(invoice?"This is a system-generated sales invoice for the order shown above. Please retain it for your records. Delivery and payment are subject to the final confirmed order terms.":"Please verify the listed items and quantities at handover. This slip is not proof of payment. Any shortage or damage should be reported to the delivery representative before signing.")+"</div><div class='footer'>De VERVE · deverve-official.pages.dev · Thank you for choosing us.</div></body></html>";
  popup.addEventListener("load",()=>{popup.focus();popup.print();},{once:true});
  popup.document.open();popup.document.write(html);popup.document.close();
}

export default function Admin() {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const adminScreens = ["overview","content","notifications","ai","followups","products","inventory","pos","vehicles","rentals","orders","exchanges","returns","wholesale","product-reviews","customers","enquiries","staff","settings","audit"] as const;
  const readAdminScreen = () => { const value = new URLSearchParams(window.location.search).get("section"); return adminScreens.includes(value as typeof adminScreens[number]) ? value as typeof adminScreens[number] : "overview"; };
  const [activeAdminScreen, setActiveAdminScreen] = useState<string>(readAdminScreen);
  const [openAdminMenu, setOpenAdminMenu] = useState<"operations" | "sales" | "customers" | "administration" | null>(null);
  const adminNavRef = useRef<HTMLElement | null>(null);
  const navigateAdminScreen = (screen: string) => { setActiveAdminScreen(screen); setOpenAdminMenu(null); const url = new URL(window.location.href); url.searchParams.set("section", screen); window.history.pushState({ section: screen }, "", url.pathname + url.search + url.hash); };
  useEffect(() => { const onPopState = () => { setActiveAdminScreen(readAdminScreen()); setOpenAdminMenu(null); }; window.addEventListener("popstate", onPopState); return () => window.removeEventListener("popstate", onPopState); }, []);
  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (adminNavRef.current && !adminNavRef.current.contains(event.target as Node)) setOpenAdminMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenAdminMenu(null); };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOnOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, []);
  const [staffUsers, setStaffUsers] = useState<StaffMember[]>([]);
  const [staffInvites, setStaffInvites] = useState<StaffInvite[]>([]);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState("catalogue");
  const [newInviteUrl, setNewInviteUrl] = useState("");
  const [socialLinks,setSocialLinks]=useState<Record<string,string>>({facebook:"",instagram:"",tiktok:"",youtube:"",linkedin:"",pinterest:"",threads:"",x:""});
  const [brandAssets,setBrandAssets]=useState<{logo_id:string|null;favicon_id:string|null}>({logo_id:null,favicon_id:null});
  const cnicUploadsEnabled = true;
  const [ownerPrimaryEmail,setOwnerPrimaryEmail]=useState("");
  const [ownerSecondaryEmails,setOwnerSecondaryEmails]=useState("");
  const [ownerEmailsEnabled,setOwnerEmailsEnabled]=useState(true);
  const [paymentMethods,setPaymentMethods]=useState<AdminPaymentMethod[]>([{id:"cod",label:"Cash on delivery",kind:"cod",provider:"",enabled:true,account_title:"",bank_name:"",account_number:"",iban:"",payment_url:"",instructions:"Pay when your order is delivered.",qr_media_id:null}]);
  const [brandPreviews,setBrandPreviews]=useState<{logo:string;favicon:string}>({logo:"",favicon:""});
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const inviteToken = window.location.pathname.startsWith("/admin/invite/") ? window.location.pathname.split("/").pop() ?? "" : "";
  const [checking, setChecking] = useState(true);
  const [setupMode, setSetupMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([]);
  const [paymentAccountDrafts, setPaymentAccountDrafts] = useState<Record<string,string>>({});
  const [returns, setReturns] = useState<AdminReturn[]>([]);
  const [exchanges, setExchanges] = useState<AdminExchange[]>([]);
  const [exchangeNotes, setExchangeNotes] = useState<Record<string, string>>(() => readAdminDraft("exchange-notes", { values: {} as Record<string, string> }).values);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [productReviews,setProductReviews]=useState<AdminProductReview[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditSearch,setAuditSearch]=useState("");
  const [auditOffset,setAuditOffset]=useState(0);
  const [auditHasMore,setAuditHasMore]=useState(false);
  const [followUpFilter, setFollowUpFilter] = useState<"all" | FollowUpItem["kind"]>("all");
  const [returnRefundDrafts, setReturnRefundDrafts] = useState<Record<string, { refund_method: string; refund_reference: string; admin_note: string }>>(() => readAdminDraft("return-refund-drafts", { values: {} as Record<string, { refund_method: string; refund_reference: string; admin_note: string }> }).values);
  const [deliveryFeeDrafts, setDeliveryFeeDrafts] = useState<Record<string, string>>(() => readAdminDraft("delivery-fee-drafts", { values: {} as Record<string, string> }).values);
  const [deliveryFeeLinks, setDeliveryFeeLinks] = useState<Record<string, string>>({});
  const [wholesaleQuotes, setWholesaleQuotes] = useState<WholesaleQuote[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [rentals, setRentals] = useState<RentalRequest[]>([]);
  const emptyVehicleForm = { name: "", vehicle_type: "Sedan", transmission: "Automatic", seats: "5", fuel_type: "Petrol", daily_rate: "", with_driver_daily_rate: "", status: "draft" as Vehicle["status"], description: "", image_key: "" };
  const [showVehicleEditor, setShowVehicleEditor] = useState(() => readAdminDraft("vehicle-editor-open", { open: false }).open);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(() => readAdminDraft("vehicle-editor-id", { id: null as string | null }).id);
  const [vehicleForm, setVehicleForm] = useState(() => readAdminDraft("vehicle-form", emptyVehicleForm));
  const [vehicleMediaAssets,setVehicleMediaAssets]=useState<MediaAsset[]>([]);
  const [vehicleGalleryTarget,setVehicleGalleryTarget]=useState<Vehicle|null>(null);
  const [showQuoteEditor, setShowQuoteEditor] = useState(() => readAdminDraft("quote-editor-open", { open: false }).open);
  const emptyQuoteLines: QuoteLineDraft[] = [{ product_id: "", variant_id: "", quantity: "10", unit_price: "", variants: [] }];
  const [quoteLines, setQuoteLines] = useState<QuoteLineDraft[]>(() => readAdminDraft("quote-lines", { lines: emptyQuoteLines }).lines);
  const emptyQuoteForm = { business_name: "", contact_name: "", phone: "", email: "", delivery_address: "", city: "Jhelum", customer_note: "", valid_until: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), enquiry_id: "" };
  const [quoteForm, setQuoteForm] = useState(() => readAdminDraft("quote-form", emptyQuoteForm));
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [movementTarget, setMovementTarget] = useState<Variant | null>(null);
  const [mediaProduct, setMediaProduct] = useState<Product | null>(null);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [productMedia, setProductMedia] = useState<MediaAsset[]>([]);
  const [mediaVariants, setMediaVariants] = useState<Variant[]>([]);
  const [mediaColor, setMediaColor] = useState("");
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaUploadProgress, setMediaUploadProgress] = useState("");
  const [mediaAlt, setMediaAlt] = useState("");
  const [cropFiles, setCropFiles] = useState<File[] | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [variantForm, setVariantForm] = useState({ sku: "", size: "", color: "", barcode: "", cost_price: "0", reorder_level: "5", initial_stock: "0" });
  const [variantEditTarget, setVariantEditTarget] = useState<Variant | null>(null);
  const [variantEditForm, setVariantEditForm] = useState({ sku: "", size: "", color: "", barcode: "", cost_price: "0", reorder_level: "5" });
  const [stockTarget, setStockTarget] = useState<Variant | null>(null);
  const [stockForm, setStockForm] = useState({ movement_type: "received", quantity_delta: "", note: "" });
  const [overview, setOverview] = useState<Overview>({ published_products: 0, draft_products: 0, new_enquiries: 0, pending_orders: 0, rental_requests: 0 });
  const [form, setForm] = useState(() => readAdminDraft("product-form", emptyProduct));
  const [editingId, setEditingId] = useState<string | null>(() => readAdminDraft("product-editing-id", { id: null as string | null }).id);
  const [showEditor, setShowEditor] = useState(() => readAdminDraft("product-editor-open", { open: false }).open);
  const [filter, setFilter] = useState("all");

  useEffect(() => { writeAdminDraft("product-form", form); }, [form]);
  useEffect(() => { writeAdminDraft("product-editor-open", { open: showEditor }); }, [showEditor]);
  useEffect(() => { writeAdminDraft("product-editing-id", { id: editingId }); }, [editingId]);
  useEffect(() => { writeAdminDraft("vehicle-form", vehicleForm); }, [vehicleForm]);
  useEffect(() => { writeAdminDraft("vehicle-editor-open", { open: showVehicleEditor }); }, [showVehicleEditor]);
  useEffect(() => { writeAdminDraft("vehicle-editor-id", { id: editingVehicleId }); }, [editingVehicleId]);
  useEffect(() => { writeAdminDraft("quote-form", quoteForm); }, [quoteForm]);
  useEffect(() => { writeAdminDraft("quote-lines", { lines: quoteLines }); }, [quoteLines]);
  useEffect(() => { writeAdminDraft("exchange-notes", { values: exchangeNotes }); }, [exchangeNotes]);
  useEffect(() => { writeAdminDraft("return-refund-drafts", { values: returnRefundDrafts }); }, [returnRefundDrafts]);
  useEffect(() => { writeAdminDraft("delivery-fee-drafts", { values: deliveryFeeDrafts }); }, [deliveryFeeDrafts]);
  useEffect(() => { writeAdminDraft("quote-editor-open", { open: showQuoteEditor }); }, [showQuoteEditor]);
  const updateProductForm = (next: ProductForm) => { setForm(next); writeAdminDraft("product-form", next); };
  const updateVehicleForm = (next: typeof emptyVehicleForm) => { setVehicleForm(next); writeAdminDraft("vehicle-form", next); };
  const updateQuoteForm = (next: typeof emptyQuoteForm) => { setQuoteForm(next); writeAdminDraft("quote-form", next); };
  const updateQuoteLines = (updater: (current: QuoteLineDraft[]) => QuoteLineDraft[]) => { const next = updater(quoteLines); setQuoteLines(next); writeAdminDraft("quote-lines", { lines: next }); };
  const updateExchangeNotes = (updater: (current: Record<string, string>) => Record<string, string>) => { const next = updater(exchangeNotes); setExchangeNotes(next); writeAdminDraft("exchange-notes", { values: next }); };
  const updateReturnRefundDrafts = (updater: (current: typeof returnRefundDrafts) => typeof returnRefundDrafts) => { const next = updater(returnRefundDrafts); setReturnRefundDrafts(next); writeAdminDraft("return-refund-drafts", { values: next }); };
  const updateDeliveryFeeDrafts = (updater: (current: Record<string, string>) => Record<string, string>) => { const next = updater(deliveryFeeDrafts); setDeliveryFeeDrafts(next); writeAdminDraft("delivery-fee-drafts", { values: next }); };


  const loadProducts = async () => {
    const result = await api<{ products: Product[] }>("/api/admin/products?limit=100");
    setProducts(result.products);
  };
  const loadOverview = async () => {
    const result = await api<{ overview: Overview }>("/api/admin/overview");
    setOverview(result.overview);
  };
  const loadOrders = async () => {
    const result = await api<{ orders: AdminOrder[] }>("/api/admin/orders?limit=50");
    setOrders(result.orders);
  };
  const loadAuditEvents = async (search = "", offset = 0) => {
    const query = new URLSearchParams({ limit: "100", offset: String(offset), ...(search.trim() ? { search: search.trim() } : {}) });
    const result = await api<{ events: AuditEvent[]; has_more: boolean }>("/api/admin/audit-logs?" + query.toString());
    setAuditEvents(result.events);
    setAuditOffset(offset);
    setAuditHasMore(result.has_more);
  };
  const loadProductReviews = async () => { const result = await api<{reviews:AdminProductReview[]}>("/api/admin/product-reviews?status=pending"); setProductReviews(result.reviews); };
  const moderateProductReview = async (review:AdminProductReview,status:"approved"|"rejected") => { await api("/api/admin/product-reviews",{method:"PATCH",body:JSON.stringify({id:review.id,status})}); await loadProductReviews(); setMessage(status==="approved"?"Review approved and published.":"Review rejected and kept private."); };
  const loadCustomers = async (search = "") => {
    const query = new URLSearchParams({ limit: "100", ...(search.trim() ? { search: search.trim() } : {}) });
    const result = await api<{ customers: CustomerRecord[] }>(`/api/admin/customers?${query.toString()}`);
    setCustomers(result.customers);
  };
  const loadReturns = async () => {
    const result = await api<{ returns: AdminReturn[] }>("/api/admin/returns");
    setReturns(result.returns);
  };
  const loadExchanges = async () => {
    const result = await api<{ exchanges: AdminExchange[] }>("/api/admin/exchanges");
    setExchanges(result.exchanges);
  };
  const loadWholesaleQuotes = async () => {
    const result = await api<{ quotes: WholesaleQuote[] }>("/api/admin/wholesale-quotes");
    setWholesaleQuotes(result.quotes);
  };
  const loadVehicles = async () => {
    const result = await api<{ vehicles: Vehicle[] }>("/api/admin/vehicles");
    setVehicles(result.vehicles);
  };
  const loadRentals = async () => {
    const result = await api<{ rentals: RentalRequest[] }>("/api/admin/rentals");
    setRentals(result.rentals);
  };
  const loadEnquiries = async () => {
    const result = await api<{ enquiries: Enquiry[] }>("/api/admin/enquiries?limit=50");
    setEnquiries(result.enquiries);
  };
  const loadStaff = async () => { const result = await api<{users:StaffMember[];invites:StaffInvite[]}>("/api/admin/staff"); setStaffUsers(result.users); setStaffInvites(result.invites); };
  const loadSettings = async () => {
    const result=await api<{settings:{social_links?:Record<string,string>;brand_assets?:{logo_id?:string|null;favicon_id?:string|null};cnic_uploads_enabled?:boolean;notification_emails?:{primary?:string;secondary?:string[];enabled?:boolean};payment_methods?:{methods?:AdminPaymentMethod[]}}}>("/api/admin/settings");
    setSocialLinks({...socialLinks,...(result.settings.social_links??{})});
    setOwnerPrimaryEmail(result.settings.notification_emails?.primary??"");
    setOwnerSecondaryEmails((result.settings.notification_emails?.secondary??[]).join(", "));
    setOwnerEmailsEnabled(result.settings.notification_emails?.enabled===true);
    if(Array.isArray(result.settings.payment_methods?.methods)&&result.settings.payment_methods.methods.length)setPaymentMethods(result.settings.payment_methods.methods);
    const brand={logo_id:result.settings.brand_assets?.logo_id??null,favicon_id:result.settings.brand_assets?.favicon_id??null};
    setBrandAssets(brand);
    setBrandPreviews({logo:brand.logo_id?"/api/admin/media/"+brand.logo_id+"/file":"",favicon:brand.favicon_id?"/api/admin/media/"+brand.favicon_id+"/file":""});
  };

  useEffect(() => {
    let active = true;
    api<{ admin: AdminUser }>("/api/admin/me")
      .then((result) => { if (active) setAdmin(result.admin); })
      .catch(() => { if (active) setAdmin(null); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (admin) {
      const tasks = [loadProducts(), loadOverview()];
      if (admin.role === "owner") { tasks.push(loadStaff()); tasks.push(loadSettings()); }
      if (admin.role !== "catalogue") tasks.push(loadEnquiries());
      if (["owner", "manager", "orders"].includes(admin.role)) { tasks.push(loadCustomers()); tasks.push(loadOrders()); tasks.push(loadReturns()); tasks.push(loadExchanges()); tasks.push(loadWholesaleQuotes()); }
      if (["owner", "manager", "rental"].includes(admin.role)) { tasks.push(loadVehicles()); tasks.push(loadRentals()); }
      void Promise.all(tasks).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not load dashboard data."));
    }
  }, [admin]);

  useEffect(() => {
    if (!admin) return;
    if (activeAdminScreen === "product-reviews" && ["owner", "manager"].includes(admin.role)) {
      void loadProductReviews().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Product reviews could not be loaded."));
    }
    if (activeAdminScreen === "audit" && admin.role === "owner") {
      void loadAuditEvents(auditSearch, 0).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Audit history could not be loaded."));
    }
  }, [admin, activeAdminScreen]);

  useEffect(() => {
    if (!admin || admin.role !== "owner" || activeAdminScreen !== "orders") return;
    let active = true;
    void api<{accounts:FinancialAccount[]}>("/api/admin/pos/bootstrap").then((result) => {
      if (active) setFinancialAccounts(result.accounts);
    }).catch(() => { if (active) setMessage("Financial accounts could not be loaded. Refresh before verifying a payment."); });
    return () => { active = false; };
  }, [admin, activeAdminScreen]);

  const saveSocialLinks = async (event:FormEvent<HTMLFormElement>) => {event.preventDefault();setBusy(true);setMessage("");try{const secondary=ownerSecondaryEmails.split(/[;,\n]/).map((item)=>item.trim()).filter(Boolean);await api("/api/admin/settings",{method:"PATCH",body:JSON.stringify({social_links:socialLinks,brand_assets:brandAssets,cnic_uploads_enabled:true,notification_emails:{primary:ownerPrimaryEmail,secondary,enabled:ownerEmailsEnabled},payment_methods:{methods:paymentMethods}})});setMessage("Website, owner notification email and brand settings saved.");window.dispatchEvent(new Event("deverve:brand-assets-updated"));}catch(error){setMessage(error instanceof Error?error.message:"Website settings could not be saved.");}finally{setBusy(false);}};
  const uploadBrandAsset = async (kind:"logo"|"favicon",file:File|null) => {
    if(!file)return;
    setBusy(true);setMessage("");
    try{
      const data=new FormData();data.append("file",file);data.append("alt_text",kind==="logo"?"Official De VERVE logo":"De VERVE website favicon");
      const result=await api<{media?:MediaAsset}>("/api/admin/media",{method:"POST",body:data});
      if(!result.media)throw new Error("Upload returned no media record.");
      const next={...brandAssets,[kind+"_id"]:result.media.id} as {logo_id:string|null;favicon_id:string|null};
      await api("/api/admin/settings",{method:"PATCH",body:JSON.stringify({brand_assets:next})});
      setBrandAssets(next);setBrandPreviews((current)=>({...current,[kind]:"/api/admin/media/"+result.media!.id+"/file"}));
      setMessage(kind==="logo"?"Website logo updated and published.":"Website favicon updated and published.");
    }catch(error){setMessage(error instanceof Error?error.message:"Brand image could not be saved.");}
    finally{setBusy(false);}
  };
  const uploadPaymentQr = async (index:number,file:File|null) => {
    if(!file)return;
    setBusy(true);setMessage("");
    try{
      const data=new FormData();data.append("file",file);data.append("alt_text","De VERVE customer payment QR code");
      const result=await api<{media?:MediaAsset}>("/api/admin/media",{method:"POST",body:data});
      if(!result.media)throw new Error("Upload returned no media record.");
      setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,qr_media_id:result.media!.id}:item));
      setMessage("Payment QR uploaded. Save website settings to publish it at checkout.");
    }catch(error){setMessage(error instanceof Error?error.message:"Payment QR could not be uploaded.");}
    finally{setBusy(false);}
  };
  const createStaffInvite = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setMessage(""); setNewInviteUrl(""); try { const result = await api<{invite:{invite_url:string}}>("/api/admin/staff",{method:"POST",body:JSON.stringify({email:staffEmail,role:staffRole})}); setNewInviteUrl(window.location.origin+result.invite.invite_url); setStaffEmail(""); await loadStaff(); setMessage("Invitation created. Share the secure link with the invited staff member."); } catch(error) { setMessage(error instanceof Error ? error.message : "Invitation could not be created."); } finally { setBusy(false); } };
  const updateStaffAccess = async (member:StaffMember, patch:{role?:string;is_active?:number}) => { setBusy(true); setMessage(""); try { await api("/api/admin/staff/"+member.id,{method:"PATCH",body:JSON.stringify(patch)}); await loadStaff(); setMessage("Staff access updated."); } catch(error) { setMessage(error instanceof Error ? error.message : "Staff access could not be updated."); } finally { setBusy(false); } };
  const acceptStaffInvite = async (event:FormEvent<HTMLFormElement>) => { event.preventDefault(); setInviteBusy(true); setMessage(""); try { const result=await api<{admin:AdminUser}>("/api/admin/invites/accept",{method:"POST",body:JSON.stringify({token:inviteToken,password:invitePassword})}); setAdmin(result.admin); setInvitePassword(""); window.history.replaceState({}, "", "/admin"); } catch(error) { setMessage(error instanceof Error ? error.message : "Invitation could not be accepted."); } finally { setInviteBusy(false); } };

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = setupMode
        ? await api<{ admin: AdminUser }>("/api/admin/bootstrap", { method: "POST", body: JSON.stringify({ email, password, bootstrapToken }) })
        : await api<{ admin: AdminUser }>("/api/admin/login", { method: "POST", body: JSON.stringify({ email, password }) });
      setAdmin(result.admin); setPassword(""); setBootstrapToken("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Authentication failed."); }
    finally { setBusy(false); }
  };

  const signOut = async () => {
    setBusy(true);
    try { await api("/api/admin/logout", { method: "POST", body: "{}" }); setAdmin(null); setProducts([]); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not sign out."); }
    finally { setBusy(false); }
  };

  const startNew = () => { clearAdminFormDraft("admin-product-editor"); setEditingId(null); setForm({ ...emptyProduct }); setShowEditor(true); };
  const startEdit = (product: Product) => {
    clearAdminFormDraft("admin-product-editor");
    setEditingId(product.id);
    setForm({ name: product.name, slug: product.slug, description: product.description, category: product.category, audience: product.audience, status: product.status, retail_price_paisa: product.retail_price_paisa === null ? "" : String(product.retail_price_paisa / 100), wholesale_price_paisa: product.wholesale_price_paisa === null ? "" : String(product.wholesale_price_paisa / 100), seo_title: product.seo_title || "", seo_description: product.seo_description || "" });
    setShowEditor(true);
  };
  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage("");
    const toPaisa = (value: string) => value.trim() === "" ? null : Math.round(Number(value) * 100);
    const payload = { ...form, retail_price_paisa: toPaisa(form.retail_price_paisa), wholesale_price_paisa: toPaisa(form.wholesale_price_paisa) };
    try {
      await api(editingId ? `/api/admin/products/${editingId}` : "/api/admin/products", { method: editingId ? "PATCH" : "POST", body: JSON.stringify(payload) });
      await loadProducts(); clearAdminFormDraft("admin-product-editor"); setShowEditor(false); setMessage("Product saved successfully.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Product could not be saved."); }
    finally { setBusy(false); }
  };
  const openVariants = async (product: Product) => {
    setBusy(true); setMessage("");
    try {
      const result = await api<{ variants: Variant[] }>(`/api/admin/products/${product.id}/variants`);
      setVariantProduct(product); setVariants(result.variants); setVariantForm({ sku: "", size: "", color: "", barcode: "", cost_price: "0", reorder_level: "5", initial_stock: "0" });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Variants could not be loaded."); }
    finally { setBusy(false); }
  };

  const openMediaLibrary = async (product: Product) => {
    setBusy(true); setMessage("");
    try {
      const [result, attached, variantResult] = await Promise.all([
        api<{ media: MediaAsset[] }>("/api/admin/media"),
        api<{ media: MediaAsset[] }>(`/api/admin/products/${product.id}/media`),
        api<{ variants: Variant[] }>(`/api/admin/products/${product.id}/variants`),
      ]);
      setMediaAssets(result.media); setProductMedia(attached.media); setMediaVariants(variantResult.variants); setMediaColor(""); setMediaProduct(product); setMediaFiles([]); setMediaAlt(""); setMediaUploadProgress("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Media library could not be loaded."); }
    finally { setBusy(false); }
  };

  const uploadMedia = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mediaFiles.length || !mediaProduct) return;
    const invalid = mediaFiles.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1 || file.size > 5_000_000);
    if (invalid) { setMessage(invalid.size > 5_000_000 ? invalid.name + " is larger than 5 MB." : invalid.name + " is not a supported JPG, PNG or WebP image."); return; }
    setCropFiles([...mediaFiles]);
  };

  const uploadCroppedMedia = async (files: File[]) => {
    setCropFiles(null);
    if (!files.length || !mediaProduct) return;
    if (mediaFiles.length > 50) { setMessage("Choose no more than 50 images in one batch."); return; }
    if (productMedia.length + mediaFiles.length > 100) { setMessage("This gallery can contain up to 100 media items. Remove older images before adding more."); return; }
    const invalid = files.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1 || file.size > 5_000_000);
    if (invalid) { setMessage(invalid.size > 5_000_000 ? invalid.name + " is larger than 5 MB." : invalid.name + " is not a supported JPG, PNG or WebP image."); return; }
    setBusy(true); setMessage("");
    let attachedCount = 0; const failures: string[] = [];
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index]; setMediaUploadProgress("Uploading and attaching image " + (index + 1) + " of " + files.length + "…");
        try {
          const data = new FormData(); data.append("file", file);
          const description = (mediaAlt.trim() ? mediaAlt.trim() + " · " : "") + mediaProduct.name + " · " + file.name;
          data.append("alt_text", description.slice(0, 240));
          const result=await api<{media?:MediaAsset}>("/api/admin/media",{method:"POST",body:data});
      if(!result.media)throw new Error("Upload returned no media record.");
          setMediaAssets((current) => [result.media!, ...current.filter((item) => item.id !== result.media!.id)]);
          const makeCover = !mediaProduct.image_key && attachedCount === 0 && !mediaColor;
          await api(`/api/admin/products/${mediaProduct.id}/media`, { method: "POST", body: JSON.stringify({ media_id: result.media.id, color: mediaColor, is_primary: makeCover, position: productMedia.length + attachedCount }) });
          attachedCount++; if (makeCover) setMediaProduct((current) => current ? { ...current, image_key: result.media!.id } : current);
        } catch (error) { failures.push(file.name + ": " + (error instanceof Error ? error.message : "Upload failed")); }
      }
      const [attached] = await Promise.all([api<{ media: MediaAsset[] }>(`/api/admin/products/${mediaProduct.id}/media`), loadProducts()]);
      setProductMedia(attached.media); setMediaFiles([]);
      setMessage(failures.length ? attachedCount + " of " + files.length + " images uploaded and attached. " + failures.slice(0, 3).join(" · ") : "Successfully uploaded and added all " + attachedCount + " images to " + mediaProduct.name + ".");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The image batch could not be completed."); }
    finally { setMediaUploadProgress(""); setBusy(false); }
  };

  const attachMedia = async (asset: MediaAsset | null, makeCover = false) => {
    if (!mediaProduct) return;
    setBusy(true); setMessage("");
    try {
      if (!asset) {
        await api(`/api/admin/products/${mediaProduct.id}/image`, { method: "PATCH", body: JSON.stringify({ image_id: null }) });
      } else {
        const makePrimary = makeCover && !mediaColor;
        await api(`/api/admin/products/${mediaProduct.id}/media`, { method: "POST", body: JSON.stringify({ media_id: asset.id, color: mediaColor, is_primary: makePrimary, position: productMedia.length }) });
      }
      const [attached] = await Promise.all([
        api<{ media: MediaAsset[] }>(`/api/admin/products/${mediaProduct.id}/media`),
        loadProducts(),
      ]);
      setProductMedia(attached.media);
      const makePrimary = Boolean(asset && makeCover && !mediaColor);
      if (asset && makePrimary) setMediaProduct((current) => current ? { ...current, image_key: asset.id } : current);
      setMessage(asset ? (makePrimary ? "Cover image updated and added to the gallery." : mediaColor ? "Media added to the " + mediaColor + " colour gallery." : "Media added to the product gallery.") : "Product cover image removed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Product media could not be updated."); }
    finally { setBusy(false); }
  };

  const removeProductMedia = async (asset: MediaAsset) => {
    if (!mediaProduct) return;
    setBusy(true); setMessage("");
    try {
      await api(`/api/admin/products/${mediaProduct.id}/media/${asset.id}`, { method: "DELETE" });
      const [attached] = await Promise.all([
        api<{ media: MediaAsset[] }>(`/api/admin/products/${mediaProduct.id}/media`),
        loadProducts(),
      ]);
      setProductMedia(attached.media);
      const primary = attached.media.find((item) => (item as MediaAsset & { is_primary?: number }).is_primary === 1);
      setMediaProduct((current) => current ? { ...current, image_key: primary?.id ?? null } : current);
      setMessage("Media removed from this product.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Media could not be removed."); }
    finally { setBusy(false); }
  };

  const openMovementHistory = async (variant: Variant) => {
    setBusy(true); setMessage("");
    try {
      const result = await api<{ movements: InventoryMovement[] }>(`/api/admin/variants/${variant.id}/movements`);
      setMovementTarget(variant); setMovements(result.movements);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Stock history could not be loaded."); }
    finally { setBusy(false); }
  };

  const createVariant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!variantProduct) return;
    setBusy(true); setMessage("");
    try {
      const payload = { ...variantForm, initial_stock: Number(variantForm.initial_stock), reorder_level: Number(variantForm.reorder_level), ...( ["owner","manager"].includes(admin?.role || "") ? { cost_price_paisa: Math.round(Number(variantForm.cost_price || 0) * 100) } : {}) };
      await api(`/api/admin/products/${variantProduct.id}/variants`, { method: "POST", body: JSON.stringify(payload) });
      const result = await api<{ variants: Variant[] }>(`/api/admin/products/${variantProduct.id}/variants`);
      setVariants(result.variants); setVariantForm({ sku: "", size: "", color: "", barcode: "", cost_price: "0", reorder_level: "5", initial_stock: "0" }); setMessage("Product variant added.");
      await loadProducts();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Variant could not be added."); }
    finally { setBusy(false); }
  };

  const startVariantEdit = (variant: Variant) => {
    setVariantEditTarget(variant);
    setVariantEditForm({ sku: variant.sku || "", size: variant.size || "", color: variant.color || "", barcode: variant.barcode || "", cost_price: String(((variant.cost_price_paisa || 0) / 100)), reorder_level: String(variant.reorder_level ?? 5) });
  };
  const saveVariantEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!variantEditTarget) return;
    setBusy(true); setMessage("");
    try {
      const payload = { ...variantEditForm, reorder_level: Number(variantEditForm.reorder_level), ...( ["owner","manager"].includes(admin?.role || "") ? { cost_price_paisa: Math.round(Number(variantEditForm.cost_price || 0) * 100) } : {}) };
      await api(`/api/admin/variants/${variantEditTarget.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      const result = await api<{ variants: Variant[] }>(`/api/admin/products/${variantEditTarget.product_id}/variants`);
      setVariants(result.variants); setVariantEditTarget(null); setMessage("Variant details saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Variant details could not be saved."); }
    finally { setBusy(false); }
  };

  const recordStock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stockTarget || !variantProduct) return;
    setBusy(true); setMessage("");
    try {
      await api(`/api/admin/variants/${stockTarget.id}/stock`, { method: "POST", body: JSON.stringify({ movement_type: stockForm.movement_type, quantity_delta: Number(stockForm.quantity_delta), note: stockForm.note }) });
      const result = await api<{ variants: Variant[] }>(`/api/admin/products/${variantProduct.id}/variants`);
      setVariants(result.variants); setStockTarget(null); setStockForm({ movement_type: "received", quantity_delta: "", note: "" }); setMessage("Stock movement recorded.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Stock could not be updated."); }
    finally { setBusy(false); }
  };

  const verifyManualPayment = async (order:AdminOrder) => {
    const available=financialAccounts.filter(account=>order.payment_method==="cod"||account.kind!=="cash");
    const defaultAccount=order.payment_method==="cod"?"cash-main":available.find(account=>account.kind==="bank"||account.kind==="wallet")?.id||available[0]?.id;
    const accountId=paymentAccountDrafts[order.id]||defaultAccount;
    if(!accountId){setMessage("Add or activate the business account that received this payment.");return;}
    const reference=window.prompt("Enter the transaction reference after checking the actual business account (optional):")??"";
    const prompt=order.payment_method==="cod"?"Confirm that the customer paid the full COD amount on delivery for "+order.order_number+"?":"Confirm that the full bank or wallet transfer for "+order.order_number+" is visible in your business account?";
    if(!window.confirm(prompt))return;
    setBusy(true);setMessage("");
    try{await api("/api/admin/orders/"+order.id,{method:"PATCH",body:JSON.stringify({payment_status:"paid",payment_reference:reference,financial_account_id:accountId})});await Promise.all([loadOrders(),loadOverview()]);setMessage("Payment recorded in the business cashbook for "+order.order_number+".");}
    catch(error){setMessage(error instanceof Error?error.message:"Payment could not be verified.");}
    finally{setBusy(false);}
  };
  const updateOrderStatus = async (order: AdminOrder, order_status: AdminOrder["order_status"]) => {
    if (order_status === order.order_status) return;
    setBusy(true); setMessage("");
    try {
      await api(`/api/admin/orders/${order.id}`, { method: "PATCH", body: JSON.stringify({ order_status }) });
      await Promise.all([loadOrders(), loadOverview()]);
      setMessage(`Order ${order.order_number} updated to ${order_status}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Order could not be updated."); }
    finally { setBusy(false); }
  };

  const updateReturnStatus = async (item: AdminReturn, status: AdminReturn["status"]) => {
    const draft = returnRefundDrafts[item.id] ?? { refund_method: "bank_transfer", refund_reference: "", admin_note: "" };
    setBusy(true); setMessage("");
    try {
      await api("/api/admin/returns/" + item.id, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          admin_note: draft.admin_note,
          refund_method: draft.refund_method,
          refund_reference: draft.refund_reference,
        }),
      });
      await loadReturns();
      setMessage("Return " + item.return_number + " updated to " + status + ".");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Return request could not be updated."); }
    finally { setBusy(false); }
  };

  const updateExchangeStatus = async (item: AdminExchange, status: AdminExchange["status"]) => {
    setBusy(true); setMessage("");
    try {
      await api("/api/admin/exchanges/" + item.id, { method: "PATCH", body: JSON.stringify({ status, admin_note: exchangeNotes[item.id] ?? item.admin_note ?? "" }) });
      await loadExchanges();
      setMessage("Exchange " + item.exchange_number + " updated to " + status.replaceAll("_", " ") + ".");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Exchange request could not be updated."); }
    finally { setBusy(false); }
  };

  const prepareDeliveryFeeQuote = async (order: AdminOrder) => {
    const rawAmount = deliveryFeeDrafts[order.id] ?? String(Math.round(order.delivery_fee_paisa / 100));
    const amount = Number(rawAmount);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1_000_000) {
      setMessage("Enter a whole-number delivery fee from Rs. 0 to Rs. 1,000,000.");
      return;
    }
    setBusy(true); setMessage("");
    try {
      const result = await api<{ approval_url: string }>(`/api/admin/orders/${order.id}/delivery-fee`, {
        method: "POST", body: JSON.stringify({ delivery_fee_paisa: amount * 100 }),
      });
      setDeliveryFeeLinks((current) => ({ ...current, [order.id]: result.approval_url }));
      await loadOrders();
      setMessage(`Delivery quotation prepared for ${order.order_number}. Share the approval link with the customer.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Delivery quotation could not be prepared."); }
    finally { setBusy(false); }
  };


  const openQuoteEditor = (enquiry?: Enquiry) => {
    clearAdminFormDraft("admin-wholesale-quote");
    setQuoteForm({ business_name: "", contact_name: enquiry?.customer_name ?? "", phone: enquiry?.phone ?? "", email: enquiry?.email ?? "", delivery_address: "", city: "Jhelum", customer_note: enquiry?.message ?? "", valid_until: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), enquiry_id: enquiry?.id ?? "" });
    setQuoteLines([{ product_id: "", variant_id: "", quantity: "10", unit_price: "", variants: [] }]);
    setShowQuoteEditor(true); setMessage("");
  };
  const changeQuoteProduct = async (index: number, productId: string) => {
    setBusy(true); setMessage("");
    try {
      const selected = products.find((product) => product.id === productId);
      const result = productId ? await api<{ variants: Variant[] }>(`/api/admin/products/${productId}/variants`) : { variants: [] };
      const available = result.variants.filter((variant) => variant.is_active);
      updateQuoteLines((current) => current.map((line, i) => i === index ? { ...line, product_id: productId, variant_id: available[0]?.id ?? "", variants: available, unit_price: selected?.wholesale_price_paisa !== null && selected?.wholesale_price_paisa !== undefined ? String(selected.wholesale_price_paisa / 100) : "" } : line));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Product options could not be loaded."); }
    finally { setBusy(false); }
  };
  const submitWholesaleQuote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage("");
    const items = quoteLines.map((line) => ({ variant_id: line.variant_id, quantity: Number(line.quantity), unit_price_paisa: Math.round(Number(line.unit_price) * 100) }));
    if (quoteLines.some((line) => !line.unit_price.trim()) || items.some((item) => !item.variant_id || !Number.isInteger(item.quantity) || item.quantity < 1 || !Number.isSafeInteger(item.unit_price_paisa) || item.unit_price_paisa < 0)) {
      setMessage("Choose a product option, quantity and valid wholesale price for every line."); setBusy(false); return;
    }
    try {
      await api("/api/admin/wholesale-quotes", { method: "POST", body: JSON.stringify({ ...quoteForm, valid_until: new Date(quoteForm.valid_until + "T23:59:59").toISOString(), items }) });
      await loadWholesaleQuotes(); clearAdminFormDraft("admin-wholesale-quote"); setShowQuoteEditor(false);
      setMessage("Quotation prepared. Send its secure approval link to the customer from the quotation list.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Quotation could not be prepared."); }
    finally { setBusy(false); }
  };
  const sendWholesaleQuote = async (quote: WholesaleQuote) => {
    setBusy(true); setMessage("");
    try {
      await api(`/api/admin/wholesale-quotes/${quote.id}`, { method: "PATCH", body: JSON.stringify({ status: "sent" }) });
      await loadWholesaleQuotes();
      setMessage("Quotation marked as sent. Copy its customer approval link.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Quotation could not be sent."); }
    finally { setBusy(false); }
  };
  const copyQuoteLink = async (quote: WholesaleQuote) => {
    if (!quote.approval_url) return;
    try { await navigator.clipboard.writeText(window.location.origin + quote.approval_url); setMessage("Customer approval link copied."); }
    catch { setMessage("Copy was blocked by the browser. Open the approval link and copy it from the address bar."); }
  };


  const startVehicleEditor = async (vehicle?: Vehicle) => {
    clearAdminFormDraft("admin-vehicle-editor");
    setEditingVehicleId(vehicle?.id ?? null);
    setVehicleForm(vehicle ? { name: vehicle.name, vehicle_type: vehicle.vehicle_type, transmission: vehicle.transmission, seats: String(vehicle.seats), fuel_type: vehicle.fuel_type, daily_rate: vehicle.daily_rate_paisa === null ? "" : String(vehicle.daily_rate_paisa / 100), with_driver_daily_rate: vehicle.with_driver_daily_rate_paisa === null ? "" : String(vehicle.with_driver_daily_rate_paisa / 100), status: vehicle.status, description: vehicle.description, image_key: vehicle.image_key ?? "" } : { name: "", vehicle_type: "Sedan", transmission: "Automatic", seats: "5", fuel_type: "Petrol", daily_rate: "", with_driver_daily_rate: "", status: "draft", description: "", image_key: "" });
    setShowVehicleEditor(true); setMessage("");
    try { const result=await api<{media:MediaAsset[]}>("/api/admin/media"); setVehicleMediaAssets(result.media.filter((item)=>item.media_type==="image")); }
    catch(error){setMessage(error instanceof Error?error.message:"Vehicle media library could not be loaded.");}
  };
  const uploadVehicleImage = async (file:File|null) => {
    if(!file)return;
    setBusy(true);setMessage("");
    try{
      const data=new FormData();data.append("file",file);data.append("alt_text",vehicleForm.name?vehicleForm.name+" vehicle photo":"De VERVE rental vehicle");
      const result=await api<{media?:MediaAsset}>("/api/admin/media",{method:"POST",body:data});
      if(!result.media)throw new Error("Upload returned no media record.");
      setVehicleMediaAssets((current)=>[result.media!,...current]);
      setVehicleForm((current)=>({...current,image_key:result.media!.id}));
      setMessage("Vehicle photo uploaded and selected.");
    }catch(error){setMessage(error instanceof Error?error.message:"Vehicle photo could not be uploaded.");}
    finally{setBusy(false);}
  };
  const saveVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage("");
    const rate = vehicleForm.daily_rate.trim() === "" ? null : Math.round(Number(vehicleForm.daily_rate) * 100);
    const withDriverRate = vehicleForm.with_driver_daily_rate.trim() === "" ? null : Math.round(Number(vehicleForm.with_driver_daily_rate) * 100);
    if ((rate !== null && (!Number.isSafeInteger(rate) || rate < 0)) || (withDriverRate !== null && (!Number.isSafeInteger(withDriverRate) || withDriverRate < 0)) || (vehicleForm.status === "available" && (rate === null || withDriverRate === null))) { setMessage("Enter both self-drive and with-driver daily rates before making a vehicle available."); setBusy(false); return; }
    try {
      await api(editingVehicleId ? `/api/admin/vehicles/${editingVehicleId}` : "/api/admin/vehicles", { method: editingVehicleId ? "PATCH" : "POST", body: JSON.stringify({ ...vehicleForm, seats: Number(vehicleForm.seats), daily_rate_paisa: rate, with_driver_daily_rate_paisa: withDriverRate }) });
      await loadVehicles(); clearAdminFormDraft("admin-vehicle-editor"); setShowVehicleEditor(false); setMessage("Vehicle saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Vehicle could not be saved."); }
    finally { setBusy(false); }
  };
  const fetchRentalDocumentBlob = async (rental:RentalRequest,side:"cnic_front"|"cnic_back",download=false) => {
    const response=await fetch(`/api/admin/rentals/${rental.id}/documents/${side}${download?"?download=1":""}`,{credentials:"same-origin",cache:"no-store",headers:{accept:"image/*"}});
    if(!response.ok)throw new Error(response.status===401?"Your admin session is not being accepted by the document service. Sign out and sign in again, then retry.":response.status===403?"Your role does not have permission to view this document.":response.status===404?"This CNIC image is no longer available.":"The private CNIC image could not be loaded.");
    const blob=await response.blob();
    if(!blob.type.startsWith("image/"))throw new Error("The document service did not return an image. The file remains private; refresh your session and retry.");
    return blob;
  };
  const previewRentalDocument = async (rental:RentalRequest,side:"cnic_front"|"cnic_back") => {
    const tab=window.open("about:blank","_blank");
    if(!tab){setMessage("Allow pop-ups to preview this private CNIC image.");return;}
    tab.opener=null;
    tab.document.title="Opening secure CNIC image…";
    try{
      const blob=await fetchRentalDocumentBlob(rental,side,false);
      tab.location.href=URL.createObjectURL(blob);
    }catch(error){
      tab.close();
      setMessage(error instanceof Error?error.message:"The private CNIC image could not be loaded.");
    }
  };
  const downloadRentalDocument = async (rental:RentalRequest,side:"cnic_front"|"cnic_back") => {
    setBusy(true);setMessage("");
    try{const blob=await fetchRentalDocumentBlob(rental,side,true);const objectUrl=URL.createObjectURL(blob);const extension=blob.type==="image/png"?"png":blob.type==="image/webp"?"webp":"jpg";const anchor=document.createElement("a");anchor.href=objectUrl;anchor.download=rental.reference_code+"-"+side+"."+extension;document.body.appendChild(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(objectUrl),120_000);setMessage("Private CNIC image downloaded securely.");}
    catch(error){setMessage(error instanceof Error?error.message:"The private CNIC image could not be downloaded.");}
    finally{setBusy(false);}
  };
  const saveRentalDetails = async (rental: RentalRequest) => {
    setBusy(true); setMessage("");
    try {
      await api(`/api/admin/rentals/${rental.id}`, { method: "PATCH", body: JSON.stringify({ status: rental.status, admin_note: rental.admin_note, vehicle_id: rental.vehicle_id }) });
      await loadRentals();
      setMessage(`Assignment and internal details saved for ${rental.reference_code}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rental details could not be saved.");
    } finally { setBusy(false); }
  };
  const updateRentalStatus = async (rental: RentalRequest, status: RentalRequest["status"]) => {
    if (status === rental.status) return;
    setBusy(true); setMessage("");
    try {
      await api(`/api/admin/rentals/${rental.id}`, { method: "PATCH", body: JSON.stringify({ status, admin_note: rental.admin_note, vehicle_id: rental.vehicle_id }) });
      await loadRentals(); await loadOverview(); setMessage(`Rental request ${rental.reference_code} updated to ${status}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Rental request could not be updated."); }
    finally { setBusy(false); }
  };

  const updateEnquiryStatus = async (enquiry: Enquiry, status: Enquiry["status"]) => {
    if (status === enquiry.status) return;
    setBusy(true); setMessage("");
    try {
      await api(`/api/admin/enquiries/${enquiry.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setEnquiries((current) => current.map((item) => item.id === enquiry.id ? { ...item, status } : item));
      setMessage("Enquiry status updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Enquiry could not be updated."); }
    finally { setBusy(false); }
  };

  const archiveProduct = async (product: Product) => {
    if (!window.confirm(`Archive “${product.name}”? It will no longer appear in the public catalogue.`)) return;
    setBusy(true); setMessage("");
    try { await api(`/api/admin/products/${product.id}`, { method: "DELETE" }); await loadProducts(); setMessage("Product archived."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Product could not be archived."); }
    finally { setBusy(false); }
  };

  if (checking) return <main className="admin-screen"><p>Checking secure session…</p></main>;
  if (!admin && inviteToken) return (
    <main className="admin-screen"><section className="admin-auth-card"><a className="admin-brand" href="/">De VERVE<span>.</span><small>STAFF INVITATION</small></a><p className="admin-eyebrow">SECURE STAFF ONBOARDING</p><h1>Set up your account.</h1><p className="admin-muted">Create a strong password to activate your De VERVE staff access. The invitation can only be used once and expires automatically.</p><form className="admin-form" onSubmit={acceptStaffInvite}><label>New password<input type="password" minLength={12} maxLength={128} required autoComplete="new-password" value={invitePassword} onChange={(e)=>setInvitePassword(e.target.value)} /></label><button className="admin-primary" disabled={inviteBusy}>{inviteBusy?"Activating…":"Accept invitation"}</button></form>{message && <p className="admin-message" role="alert">{message}</p>}</section></main>
  );
  if (!admin) return (
    <main className="admin-screen">
      <section className="admin-auth-card">
        <a className="admin-brand" href="/">De VERVE<span>.</span><small>BUSINESS CONTROL CENTRE</small></a>
        <p className="admin-eyebrow">SECURE ADMIN ACCESS</p>
        <h1>{setupMode ? "Create your owner account" : "Welcome back."}</h1>
        <p className="admin-muted">{setupMode ? "One-time setup for the first business owner." : "Sign in to manage your De VERVE business."}</p>
        <form onSubmit={submitAuth} className="admin-form">
          <label>Email address<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>Password<input type="password" autoComplete={setupMode ? "new-password" : "current-password"} minLength={setupMode ? 12 : 1} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {setupMode && <label>One-time setup token<input type="password" autoComplete="off" required value={bootstrapToken} onChange={(e) => setBootstrapToken(e.target.value)} /></label>}
          <button className="admin-primary" disabled={busy}>{busy ? "Please wait…" : setupMode ? "Create owner account" : "Sign in"}</button>
        </form>
        <button className="admin-link-button" type="button" onClick={() => { setSetupMode(!setupMode); setMessage(""); }}>{setupMode ? "Already have an account? Sign in" : "First-time owner setup"}</button>
        {message && <p className="admin-message" role="status">{message}</p>}
        <a className="admin-back-link" href="/">← Back to website</a>
      </section>
    </main>
  );

  const shownProducts = filter === "all" ? products : products.filter((product) => product.status === filter);

  const followUpItems: FollowUpItem[] = [];
  if (admin.role !== "catalogue" && admin.role !== "viewer") for (const enquiry of enquiries) {
    if (["closed", "spam"].includes(enquiry.status)) continue;
    followUpItems.push({ key: "enquiry:" + enquiry.id, kind: "enquiry", title: enquiry.customer_name, contact: enquiryTypeLabel(enquiry.enquiry_type) + " enquiry", phone: enquiry.phone, email: enquiry.email, status: enquiry.status, summary: enquiry.message, created_at: enquiry.created_at, screen: "enquiries", priority: enquiry.status === "new" ? 0 : enquiry.status === "qualified" ? 1 : 2 });
  }
  if (["owner", "manager", "orders"].includes(admin.role)) {
    for (const order of orders) {
      if (["delivered", "cancelled"].includes(order.order_status)) continue;
      const needsQuote = ["pending_quote", "awaiting_customer"].includes(order.delivery_fee_status);
      followUpItems.push({ key: "order:" + order.id, kind: "order", title: order.customer_name, contact: "Order " + order.order_number, phone: order.phone, email: order.email, status: needsQuote ? (order.delivery_fee_status === "pending_quote" ? "delivery quote needed" : "awaiting customer approval") : order.order_status, summary: needsQuote ? "Delivery total needs attention before fulfilment." : "Order is in " + order.order_status + " fulfilment.", created_at: order.created_at, screen: "orders", priority: needsQuote ? 0 : order.order_status === "pending" ? 1 : 2 });
    }
    for (const item of returns) {
      if (["rejected", "refunded"].includes(item.status)) continue;
      followUpItems.push({ key: "return:" + item.id, kind: "return", title: item.customer_name, contact: "Return " + item.return_number, phone: item.customer_phone, email: item.customer_email, status: item.status, summary: item.reason.replaceAll("_", " ") + " · Order " + item.order_number, created_at: item.created_at, screen: "returns", priority: item.status === "requested" ? 0 : item.status === "received" ? 1 : 2 });
    }
    for (const quote of wholesaleQuotes) {
      if (["accepted", "rejected", "expired", "converted"].includes(quote.status)) continue;
      followUpItems.push({ key: "wholesale:" + quote.id, kind: "wholesale", title: quote.contact_name, contact: quote.business_name, phone: quote.phone, email: quote.email, status: quote.status, summary: quote.status === "prepared" ? "Quotation is prepared but not marked as sent." : "Wholesale quotation is awaiting buyer response.", created_at: quote.created_at, screen: "wholesale", priority: quote.status === "prepared" ? 0 : 2 });
    }
  }
  if (["owner", "manager", "rental"].includes(admin.role)) for (const rental of rentals) {
    if (["completed", "cancelled"].includes(rental.status)) continue;
    followUpItems.push({ key: "rental:" + rental.id, kind: "rental", title: rental.customer_name, contact: "Rental " + rental.reference_code, phone: rental.phone, email: rental.email, status: rental.status, summary: (rental.vehicle_name || "Vehicle not assigned") + " · " + new Date(rental.pickup_at).toLocaleString(), created_at: rental.created_at, screen: "rentals", priority: rental.status === "requested" ? 0 : rental.status === "reviewing" ? 1 : 2 });
  }
  followUpItems.sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at));
  const visibleFollowUps = followUpFilter === "all" ? followUpItems : followUpItems.filter((item) => item.kind === followUpFilter);

  const canEditProducts = ["owner", "manager", "catalogue"].includes(admin.role);
  if (activeAdminScreen === "content" && ["owner", "manager"].includes(admin.role)) return <ContentStudio onClose={() => navigateAdminScreen("overview")} />;
  if (activeAdminScreen === "notifications" && admin.role === "owner") return <NotificationCenter onClose={() => navigateAdminScreen("overview")} />;
  return (
    <main className="admin-screen admin-dashboard" data-admin-screen={activeAdminScreen}>
      <header className="admin-topbar">
        <a className="admin-brand" href="/">De VERVE<span>.</span><small>BUSINESS CONTROL CENTRE</small></a>
        <div className="admin-user"><span>{admin.email}<small>{admin.role}</small></span><button type="button" onClick={signOut} disabled={busy}>Sign out</button></div>
      </header>
      <section className="admin-content">
        <div className="admin-heading-row"><div><p className="admin-eyebrow">YOUR BUSINESS, ONE PLACE</p><h1>{({overview:"Overview",followups:"Follow-up inbox",products:"Products & catalogue",inventory:"Inventory management",pos:"Point of sale",vehicles:"Vehicle fleet",rentals:"Rental bookings",orders:"Orders & payments",returns:"Return records",exchanges:"Exchange management",wholesale:"Wholesale quotations", "product-reviews":"Product reviews",customers:"Customer directory",audit:"Activity history",enquiries:"Customer enquiries",staff:"Staff & permissions",settings:"Website settings",content:"Pages & visual designer",notifications:"Notifications",ai:"AI & live chat"} as Record<string,string>)[activeAdminScreen] ?? "Workspace"}</h1><p className="admin-muted">{activeAdminScreen==="overview"?"Your business at a glance. Choose a workspace to manage a specific area.":"Manage this part of your De VERVE business from one focused screen."}</p></div>{canEditProducts && activeAdminScreen === "products" && <button className="admin-primary" onClick={startNew}>＋ Add product</button>}</div>
        <nav className="admin-ribbon" aria-label="Admin workspace" ref={adminNavRef}>
          <button type="button" className={activeAdminScreen==="overview"?"admin-ribbon-home active":"admin-ribbon-home"} aria-current={activeAdminScreen==="overview"?"page":undefined} onClick={()=>navigateAdminScreen("overview")}><span className="admin-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7M5 9v11h14V9M9 20v-6h6v6"/></svg></span><span>Overview</span></button>
          <details className="admin-ribbon-group" open={openAdminMenu==="operations"}>
            <summary aria-expanded={openAdminMenu==="operations"} onClick={event=>{event.preventDefault();setOpenAdminMenu(current=>current==="operations"?null:"operations");}}><span className="admin-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg></span><span>Operations</span><span className="admin-nav-chevron" aria-hidden="true">⌄</span></summary>
            <div className="admin-ribbon-popover">
              <button type="button" className={activeAdminScreen==="products"?"is-current":""} aria-current={activeAdminScreen==="products"?"page":undefined} onClick={()=>navigateAdminScreen("products")}>Products & variants</button>
              {["owner","manager","orders","catalogue"].includes(admin.role)&&<button type="button" className={activeAdminScreen==="inventory"?"is-current":""} onClick={()=>navigateAdminScreen("inventory")}>Stock inventory</button>}
              {["owner","manager","orders"].includes(admin.role)&&<><button type="button" className={activeAdminScreen==="pos"?"is-current":""} onClick={()=>navigateAdminScreen("pos")}>Point of sale</button><a href="/admin?section=pos" target="_blank" rel="noreferrer">Open POS in new tab ↗</a><a href="/admin?section=inventory" target="_blank" rel="noreferrer">Open inventory in new tab ↗</a></>}
              {["owner","manager","rental"].includes(admin.role)&&<><button type="button" className={activeAdminScreen==="vehicles"?"is-current":""} onClick={()=>navigateAdminScreen("vehicles")}>Vehicle fleet</button><button type="button" className={activeAdminScreen==="rentals"?"is-current":""} onClick={()=>navigateAdminScreen("rentals")}>Rental bookings</button></>}
            </div>
          </details>
          {["owner","manager","orders"].includes(admin.role)&&<details className="admin-ribbon-group" open={openAdminMenu==="sales"}>
            <summary aria-expanded={openAdminMenu==="sales"} onClick={event=>{event.preventDefault();setOpenAdminMenu(current=>current==="sales"?null:"sales");}}><span className="admin-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 3h14v18l-2-1-2 1-3-1-3 1-2-1-2 1V3zM8 8h8M8 12h8M8 16h5"/></svg></span><span>Sales & finance</span><span className="admin-nav-chevron" aria-hidden="true">⌄</span></summary>
            <div className="admin-ribbon-popover"><button type="button" className={activeAdminScreen==="orders"?"is-current":""} onClick={()=>navigateAdminScreen("orders")}>Orders & payments</button><button type="button" className={activeAdminScreen==="wholesale"?"is-current":""} onClick={()=>navigateAdminScreen("wholesale")}>Wholesale quotations</button><button type="button" className={activeAdminScreen==="exchanges"?"is-current":""} onClick={()=>navigateAdminScreen("exchanges")}>Exchanges</button><button type="button" className={activeAdminScreen==="returns"?"is-current":""} onClick={()=>navigateAdminScreen("returns")}>Legacy return records</button></div>
          </details>}
          {["owner","manager","orders","rental"].includes(admin.role)&&<details className="admin-ribbon-group" open={openAdminMenu==="customers"}>
            <summary aria-expanded={openAdminMenu==="customers"} onClick={event=>{event.preventDefault();setOpenAdminMenu(current=>current==="customers"?null:"customers");}}><span className="admin-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 20v-1.4A4.6 4.6 0 0 1 7.6 14h2.8a4.6 4.6 0 0 1 4.6 4.6V20M16 5.2a3.2 3.2 0 0 1 0 5.6M17 14h.4a3.6 3.6 0 0 1 3.6 3.6V20"/></svg></span><span>Customers & service</span><span className="admin-nav-chevron" aria-hidden="true">⌄</span></summary>
            <div className="admin-ribbon-popover"><button type="button" className={activeAdminScreen==="followups"?"is-current":""} onClick={()=>navigateAdminScreen("followups")}>Follow-up queue</button><button type="button" className={activeAdminScreen==="enquiries"?"is-current":""} onClick={()=>navigateAdminScreen("enquiries")}>Enquiries & feedback</button>{["owner","manager","orders"].includes(admin.role)&&<button type="button" className={activeAdminScreen==="customers"?"is-current":""} onClick={()=>{navigateAdminScreen("customers");void loadCustomers(customerSearch);}}>Customer records</button>}{["owner","manager"].includes(admin.role)&&<button type="button" className={activeAdminScreen==="product-reviews"?"is-current":""} onClick={()=>navigateAdminScreen("product-reviews")}>Product reviews</button>}</div>
          </details>}
          {["owner","manager"].includes(admin.role)&&<details className="admin-ribbon-group" open={openAdminMenu==="administration"}>
            <summary aria-expanded={openAdminMenu==="administration"} onClick={event=>{event.preventDefault();setOpenAdminMenu(current=>current==="administration"?null:"administration");}}><span className="admin-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z"/><path d="m19.4 15 .1.1 1.2 1-1.4 2.4-1.5-.6a8 8 0 0 1-1.7 1l-.3 1.6h-2.8l-.3-1.6a8 8 0 0 1-1.7-1l-1.5.6-1.4-2.4 1.2-1a8 8 0 0 1 0-2l-1.2-1 1.4-2.4 1.5.6a8 8 0 0 1 1.7-1l.3-1.6h2.8l.3 1.6a8 8 0 0 1 1.7 1l1.5-.6 1.4 2.4-1.2 1a8 8 0 0 1-.1 2z"/></svg></span><span>Administration</span><span className="admin-nav-chevron" aria-hidden="true">⌄</span></summary>
            <div className="admin-ribbon-popover">{admin.role==="owner"&&<><button type="button" className={activeAdminScreen==="notifications"?"is-current":""} onClick={()=>navigateAdminScreen("notifications")}>Notifications</button><button type="button" className={activeAdminScreen==="ai"?"is-current":""} onClick={()=>navigateAdminScreen("ai")}>AI & live chat</button><button type="button" className={activeAdminScreen==="staff"?"is-current":""} onClick={()=>navigateAdminScreen("staff")}>Staff & permissions</button><button type="button" className={activeAdminScreen==="settings"?"is-current":""} onClick={()=>navigateAdminScreen("settings")}>Website & brand settings</button><button type="button" className={activeAdminScreen==="audit"?"is-current":""} onClick={()=>navigateAdminScreen("audit")}>Activity history</button></>}{["owner","manager"].includes(admin.role)&&<button type="button" className={activeAdminScreen==="content"?"is-current":""} onClick={()=>navigateAdminScreen("content")}>Pages & designer</button>}</div>
          </details>}
          {admin.role !== "catalogue" && <button type="button" className="admin-ribbon-help" onClick={()=>navigateAdminScreen("enquiries")}><span className="admin-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 1 1 4.2 1.6c-.9 1-1.9 1.2-1.9 2.8M12 17h.01"/></svg></span><span>Help & enquiries</span></button>}
          <div className="admin-nav-footer"><span className="admin-nav-status" aria-hidden="true"></span><span>Secure workspace</span><small>Access: {admin.role}</small></div>
        </nav>
        <div className="admin-stat-grid"><article><span>ALL PRODUCTS</span><strong>{products.length}</strong></article><article><span>PUBLISHED</span><strong>{overview.published_products}</strong></article><article><span>DRAFTS</span><strong>{overview.draft_products}</strong></article><article><span>NEW ENQUIRIES</span><strong>{overview.new_enquiries}</strong></article><article><span>PENDING ORDERS</span><strong>{overview.pending_orders}</strong></article><article><span>RENTAL REQUESTS</span><strong>{overview.rental_requests}</strong></article></div>

        {["owner", "manager", "orders", "rental"].includes(admin.role) && <section id="followups" className="admin-panel admin-followups-panel">
          <div className="admin-panel-heading"><div><h2>Open follow-ups</h2><p className="admin-muted">A combined queue of active customer work from existing business records. Update each record in its original workspace.</p></div><span className="admin-enquiry-count">{followUpItems.length} open items</span></div>
          <div className="admin-followup-toolbar"><label>Show<select value={followUpFilter} onChange={(event) => setFollowUpFilter(event.target.value as typeof followUpFilter)}><option value="all">All follow-ups</option><option value="enquiry">Enquiries</option><option value="order">Orders</option><option value="return">Returns</option><option value="rental">Rentals</option><option value="wholesale">Wholesale</option></select></label><span>Priority first · oldest first within each priority</span></div>
          {visibleFollowUps.length === 0 ? <div className="admin-empty"><strong>No open follow-ups</strong><p>New enquiries and active orders, returns, rentals or quotations will appear here automatically.</p></div> :
            <div className="admin-followup-list">{visibleFollowUps.map((item) => <article className="admin-followup-row" key={item.key}>
              <div className="admin-followup-main"><div className="admin-followup-title"><strong>{item.title}</strong><span className="admin-enquiry-type">{item.kind}</span><span className="admin-enquiry-status">{item.status}</span></div><span className="admin-followup-reference">{item.contact}</span><p>{item.summary}</p><small>{new Date(item.created_at).toLocaleString()}</small></div>
              <div className="admin-followup-actions">{item.phone && <a href={whatsappHref(item.phone, "Assalamu Alaikum " + item.title + ", this is De VERVE following up about " + item.contact + ". Current status: " + item.status + ". Please let us know how we can help.")} target="_blank" rel="noreferrer">WhatsApp ↗</a>}{item.email && <a href={"mailto:" + item.email}>Email</a>}<button type="button" onClick={() => navigateAdminScreen(item.screen)}>Open record</button></div>
            </article>)}</div>}
        </section>}

        {admin.role === "owner" && <section id="audit" className="admin-panel admin-audit-panel">
          <div className="admin-panel-heading"><div><h2>Business activity history</h2><p className="admin-muted">A read-only record of important changes performed by staff and system workflows. Entries are shown newest first.</p></div><div className="admin-audit-toolbar"><input className="admin-audit-search" type="search" maxLength={120} value={auditSearch} onChange={event=>setAuditSearch(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")void loadAuditEvents(auditSearch,0).catch((error:unknown)=>setMessage(error instanceof Error?error.message:"Audit search failed."));}} placeholder="Search all activity: action, staff, reference or details…" aria-label="Search all activity history"/><button type="button" className="admin-primary" onClick={()=>void loadAuditEvents(auditSearch,0).catch((error:unknown)=>setMessage(error instanceof Error?error.message:"Audit search failed."))}>Search</button><span className="admin-enquiry-count">Showing {auditEvents.length}{auditHasMore?"+":""}</span><button type="button" className="admin-secondary" disabled={auditOffset===0} onClick={()=>void loadAuditEvents(auditSearch,Math.max(0,auditOffset-100)).catch((error:unknown)=>setMessage(error instanceof Error?error.message:"Audit history could not be loaded."))}>Previous</button><button type="button" className="admin-secondary" disabled={!auditHasMore} onClick={()=>void loadAuditEvents(auditSearch,auditOffset+100).catch((error:unknown)=>setMessage(error instanceof Error?error.message:"Audit history could not be loaded."))}>Next</button><button type="button" className="admin-secondary" onClick={()=>void loadAuditEvents(auditSearch,auditOffset).catch((error:unknown)=>setMessage(error instanceof Error?error.message:"Audit history could not be refreshed."))}>Refresh</button></div></div>
          {auditEvents.length === 0 ? <div className="admin-empty"><strong>No recorded activity yet</strong><p>Important staff, order, rental, wholesale, media and website-setting changes will appear here when recorded by the system.</p></div> : <div className="admin-audit-list">{auditEvents.map((event) => {
            let details = "";
            try { const parsed = JSON.parse(event.metadata_json) as unknown; details = typeof parsed === "object" && parsed !== null ? Object.entries(parsed as Record<string, unknown>).filter(([key,value]) => !/token|secret|password|cnic|document|authorization/i.test(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")).map(([key,value]) => key.replace(/_/g," ") + ": " + String(value)).join(" · ") : ""; } catch { details = "Details unavailable"; }
            return <article className="admin-audit-row" key={event.id}><div className="admin-audit-main"><strong>{event.action.replace(/[._]/g," ")}</strong><span>{event.entity_type.replace(/_/g," ")}{event.entity_id ? " · " + event.entity_id.slice(0,12) : ""}</span>{details && <small>{details}</small>}</div><div className="admin-audit-meta"><span>{event.actor_email || "System"}</span><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time></div></article>;
          })}</div>}
        </section>}
        {admin.role === "owner" && <section id="staff" className="admin-panel admin-staff-panel"><div className="admin-panel-heading"><div><h2>Staff & permissions</h2><p className="admin-muted">Invite team members, choose their access level and disable accounts when needed.</p></div><span className="admin-enquiry-count">{staffUsers.length} accounts</span></div><form className="admin-form admin-staff-invite" onSubmit={createStaffInvite}><label>Staff email<input type="email" required maxLength={160} value={staffEmail} onChange={(e)=>setStaffEmail(e.target.value)} placeholder="team@example.com"/></label><label>Role<select value={staffRole} onChange={(e)=>setStaffRole(e.target.value)}><option value="catalogue">Catalogue — products & stock details</option><option value="orders">Orders — orders & wholesale</option><option value="rental">Rental — rental requests</option><option value="manager">Manager — broad operational access</option><option value="viewer">Viewer — read-only access</option></select></label><button className="admin-primary" disabled={busy}>{busy?"Creating…":"＋ Create invitation"}</button></form>{newInviteUrl && <div className="admin-invite-result"><strong>Secure invitation link</strong><input readOnly value={newInviteUrl}/><button type="button" className="admin-secondary" onClick={()=>void navigator.clipboard.writeText(newInviteUrl).then(()=>setMessage("Invitation link copied."))}>Copy invitation link</button><small>Share privately with the invited person. This link expires in 48 hours and can only be used once. Email delivery is not configured yet.</small></div>}<h3>Team accounts</h3>{staffUsers.length===0?<p className="admin-muted">No staff accounts yet.</p>:<div className="admin-staff-list">{staffUsers.map((member)=><article className="admin-staff-row" key={member.id}><div><strong>{member.email}</strong><span>{member.role} · {member.is_active?"Active":"Disabled"}</span><small>{member.last_login_at?"Last login "+new Date(member.last_login_at).toLocaleString():"Never signed in"}</small></div><label>Role<select disabled={busy||member.role==="owner"} value={member.role} onChange={(e)=>void updateStaffAccess(member,{role:e.target.value})}><option value="manager">Manager</option><option value="catalogue">Catalogue</option><option value="orders">Orders</option><option value="rental">Rental</option><option value="viewer">Viewer</option></select></label><button type="button" className={member.is_active?"admin-danger":"admin-secondary"} disabled={busy||member.role==="owner"} onClick={()=>void updateStaffAccess(member,{is_active:member.is_active?0:1})}>{member.is_active?"Disable":"Enable"}</button></article>)}</div>}<h3>Pending invitations</h3>{staffInvites.length===0?<p className="admin-muted">No pending invitations.</p>:<div className="admin-staff-list">{staffInvites.map((invite)=><article className="admin-staff-row" key={invite.id}><div><strong>{invite.email}</strong><span>{invite.role}</span><small>Expires {new Date(invite.expires_at).toLocaleString()}</small></div></article>)}</div>}</section>}
        {admin.role === "owner" && <section id="ai" className="admin-panel admin-ai-panel">{activeAdminScreen === "ai" && <AIKeyManager />}</section>}
        {admin.role === "owner" && <section id="settings" className="admin-panel admin-settings-panel"><div className="admin-panel-heading"><div><h2>Website & brand settings</h2><p className="admin-muted">Manage the logo, browser favicon and official social profile links. Uploaded brand images are served through the private media bucket with public access only while selected here.</p></div></div><div className="admin-cnic-setting"><label><input type="checkbox" checked={true} disabled aria-label="CNIC uploads are mandatory"/> CNIC uploads are mandatory for every rental request</label><p>Keep this enabled for De VERVE vehicle rentals: both CNIC sides are required before a rental can be confirmed. Uploaded files are permanent evidence, private and limited to authorised rental staff. Rental CNIC images are permanent evidence. The application and scheduled Worker never delete them; database safeguards block deletion of stored document records and linked rental records. Access is restricted to authorised rental staff and every view/download is audited. For storage-level protection, the owner must enable an indefinite Cloudflare R2 Bucket Lock rule for the rental-private/ prefix. This lock has not yet been verified in the Cloudflare dashboard. This requirement cannot be disabled from the dashboard or API.</p></div><div className="admin-email-settings"><h3>Owner email & notifications</h3><p className="admin-muted">Order, rental and payment alerts will be sent to the primary address and any enabled secondary addresses. No recipient is configured by default. Set a business-owned inbox here before enabling email alerts.</p><label><input type="checkbox" checked={ownerEmailsEnabled} onChange={(e)=>setOwnerEmailsEnabled(e.target.checked)} disabled={busy}/> Enable owner email alerts</label><div className="admin-form admin-social-form"><label>Primary owner email<input type="email" required maxLength={160} value={ownerPrimaryEmail} onChange={(e)=>setOwnerPrimaryEmail(e.target.value)} disabled={busy}/></label><label>Secondary email addresses<input type="text" maxLength={850} placeholder="accounts@example.com, manager@example.com" value={ownerSecondaryEmails} onChange={(e)=>setOwnerSecondaryEmails(e.target.value)} disabled={busy}/><small>Separate addresses with commas or semicolons. Up to five secondary addresses.</small></label></div><p className="admin-muted">Email delivery also requires the owner to configure a verified sender domain and Resend API key in Cloudflare. Changing recipient addresses here does not expose or change provider secrets.</p></div><div className="admin-payment-settings"><h3>Customer payment options</h3><p className="admin-muted">Add the ways customers can pay. These instructions are public at checkout. Direct transfers and wallet payments stay pending until the owner verifies the payment in the business account. Never enter card numbers, CVV or gateway API secrets here.</p>{paymentMethods.map((method,index)=><article className="admin-payment-method" key={method.id}><div className="admin-payment-method-head"><strong>{method.label||"New payment option"}</strong><label><input type="checkbox" checked={method.enabled} onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,enabled:e.target.checked}:item))}/> Active</label><button type="button" className="admin-danger" disabled={method.kind==="cod"} onClick={()=>setPaymentMethods(items=>items.filter((_,i)=>i!==index))}>Remove</button></div><div className="admin-form admin-social-form"><label>Option ID<input value={method.id} maxLength={40} disabled={method.kind==="cod"} onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,id:e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g,"-")}:item))}/></label><label>Customer-facing name<input required value={method.label} maxLength={80} onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,label:e.target.value}:item))}/></label><label>Type<select value={method.kind} disabled={method.kind==="cod"} onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,kind:e.target.value as AdminPaymentMethod["kind"]}:item))}><option value="cod">Cash on delivery</option><option value="bank">Bank transfer</option><option value="wallet">Mobile wallet (SadaPay / JazzCash / Easypaisa)</option><option value="link">Payment URL</option><option value="qr">QR / Raast QR</option></select></label><label>Provider / bank / wallet<input value={method.provider} maxLength={40} placeholder="e.g. SadaPay, HBL, Meezan" onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,provider:e.target.value}:item))}/></label><label>Account title<input value={method.account_title} maxLength={100} onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,account_title:e.target.value}:item))}/></label><label>Bank name<input value={method.bank_name} maxLength={100} onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,bank_name:e.target.value}:item))}/></label><label>Account / wallet number<input value={method.account_number} maxLength={80} onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,account_number:e.target.value}:item))}/></label><label>IBAN<input value={method.iban} maxLength={40} onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,iban:e.target.value}:item))}/></label><label>Payment URL (HTTPS)<input type="url" value={method.payment_url} maxLength={500} placeholder="https://" onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,payment_url:e.target.value}:item))}/></label><label>Payment QR image<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>void uploadPaymentQr(index,e.target.files?.[0]??null)}/><small>{method.qr_media_id?"QR uploaded · "+method.qr_media_id:"Upload a QR image (JPG, PNG or WebP, max 5 MB)"}</small></label><label className="admin-full">Customer instructions<textarea rows={2} maxLength={500} value={method.instructions} onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,instructions:e.target.value}:item))}/></label></div></article>)}<button type="button" className="admin-secondary" disabled={paymentMethods.length>=12} onClick={()=>setPaymentMethods(items=>[...items,{id:"payment-"+(items.length+1),label:"New payment option",kind:"bank",provider:"",enabled:false,account_title:"",bank_name:"",account_number:"",iban:"",payment_url:"",instructions:"",qr_media_id:null}])}>＋ Add payment option</button><p className="admin-muted">Gateway integrations such as Safepay and PayFast need verified merchant onboarding and server-side secrets. This panel manages customer-facing direct payment instructions; it does not collect or store gateway passwords.</p></div><div className="admin-brand-assets"><article><strong>Website logo</strong>{brandPreviews.logo&&<img src={brandPreviews.logo} alt="Current De VERVE logo preview"/>}<label>Upload logo (JPG, PNG or WebP, max 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e)=>void uploadBrandAsset("logo",e.target.files?.[0]??null)}/></label></article><article><strong>Browser favicon</strong>{brandPreviews.favicon&&<img className="admin-favicon-preview" src={brandPreviews.favicon} alt="Current De VERVE favicon preview"/>}<label>Upload favicon image (PNG recommended)<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e)=>void uploadBrandAsset("favicon",e.target.files?.[0]??null)}/></label></article></div><form className="admin-form admin-social-form" onSubmit={saveSocialLinks}>{[["facebook","Facebook"],["instagram","Instagram"],["tiktok","TikTok"],["youtube","YouTube"],["linkedin","LinkedIn"],["pinterest","Pinterest"],["threads","Threads"],["x","X"]].map(([key,label])=><label key={key}>{label} profile URL<input type="url" inputMode="url" placeholder={"https://"+key+".com/your-page"} value={socialLinks[key]??""} onChange={(e)=>setSocialLinks((current)=>({...current,[key]:e.target.value}))}/></label>)}<p className="admin-muted admin-full">Use direct HTTPS links to the official De VERVE pages. Leave a field empty to hide that social link.</p><div className="admin-form-actions"><button type="submit" className="admin-primary" disabled={busy}>{busy?"Saving…":"Save website settings"}</button></div></form></section>}
        {["owner", "manager", "orders"].includes(admin.role) && <section id="orders" className="admin-panel admin-orders-panel">
          <div className="admin-panel-heading"><div><h2>Customer orders</h2><p className="admin-muted">Review COD orders, contact customers and move each order through fulfilment.</p></div><span className="admin-enquiry-count">{orders.length} recent</span></div>
          {orders.length === 0 ? <div className="admin-empty"><strong>No orders yet</strong><p>New website checkout requests will appear here.</p></div> : <div className="admin-order-list">{orders.map((order) => {
            const next: AdminOrder["order_status"][] = (order.order_status === "pending" ? ["confirmed", "cancelled"] : order.order_status === "confirmed" ? ["processing", "cancelled"] : order.order_status === "processing" ? ["dispatched", "cancelled"] : order.order_status === "dispatched" ? ["delivered"] : []) as AdminOrder["order_status"][];
            const canFulfil = order.delivery_fee_status === "accepted" && ((order.payment_provider === "manual" && order.payment_method === "cod") || order.payment_status === "paid");
            const allowedNext = canFulfil ? next : next.filter((status) => status !== "processing" && status !== "dispatched");
            return <article className="admin-order-card" key={order.id}>
              <div className="admin-order-heading"><div><strong>{order.order_number}</strong><span>{new Date(order.created_at).toLocaleString()}</span></div><span className={`admin-enquiry-status status-${order.order_status}`}>{order.order_status}</span></div>
              <div className="admin-order-payment"><strong>Payment: {order.payment_method||"cod"}</strong><span>Status: {order.payment_status}</span>{admin.role==="owner"&&order.payment_provider==="manual"&&order.payment_status==="pending"&&(order.payment_method!=="cod"||order.order_status==="delivered")&&<div className="admin-payment-verify-controls"><select aria-label={"Account receiving payment for "+order.order_number} value={paymentAccountDrafts[order.id]||(order.payment_method==="cod"?"cash-main":financialAccounts.find(account=>account.kind==="bank"||account.kind==="wallet")?.id||"")} onChange={event=>setPaymentAccountDrafts(current=>({...current,[order.id]:event.target.value}))}><option value="">Choose receiving account</option>{financialAccounts.filter(account=>order.payment_method==="cod"||account.kind!=="cash").map(account=><option key={account.id} value={account.id}>{account.name} · {account.kind}</option>)}</select><button type="button" className="admin-primary" disabled={busy||!financialAccounts.length} onClick={()=>void verifyManualPayment(order)}>{order.payment_method==="cod"?"Record COD payment received":"Verify received transfer"}</button></div>}{order.financial_account_id&&<small>Recorded to {financialAccounts.find(account=>account.id===order.financial_account_id)?.name||"business account"}</small>}</div><div className="admin-order-customer"><strong>{order.customer_name}</strong><a href={`tel:${order.phone}`}>{order.phone}</a>{order.email && <a href={`mailto:${order.email}`}>{order.email}</a>}<span>{order.delivery_address}, {order.city}</span><a className="admin-secondary" href={whatsappHref(order.phone, `Assalamu Alaikum ${order.customer_name}, this is De VERVE regarding your order ${order.order_number}. Current status: ${order.order_status}. Please reply here if you need assistance.`)} target="_blank" rel="noreferrer">WhatsApp customer ↗</a>{order.customer_note && <small>Note: {order.customer_note}</small>}</div>
              <div className="admin-order-items">{order.items.map((item) => <div key={item.id}><span>{item.product_name_snapshot} · {[item.size_snapshot, item.color_snapshot].filter(Boolean).join(" / ") || item.sku_snapshot || "Standard"} × {item.quantity}</span><strong>Rs. {Math.round(item.line_total_paisa / 100).toLocaleString("en-PK")}</strong></div>)}</div>
              <div className="admin-delivery-quote">
                <div><strong>Delivery fee approval</strong><span className={`admin-delivery-state state-${order.delivery_fee_status}`}>{order.delivery_fee_status === "pending_quote" ? "Needs a delivery quotation" : order.delivery_fee_status === "awaiting_customer" ? "Waiting for customer approval" : order.delivery_fee_status === "accepted" ? "Customer approved the final total" : "Customer declined the quotation"}</span></div>
                <label>Delivery fee (PKR)<input type="number" min="0" max="1000000" step="1" value={deliveryFeeDrafts[order.id] ?? String(Math.round(order.delivery_fee_paisa / 100))} onChange={(event) => updateDeliveryFeeDrafts((current) => ({ ...current, [order.id]: event.target.value }))} disabled={busy || !["pending", "confirmed"].includes(order.order_status)} /></label>
                <button type="button" className="admin-secondary" disabled={busy || !["pending", "confirmed"].includes(order.order_status)} onClick={() => void prepareDeliveryFeeQuote(order)}>{order.delivery_fee_status === "awaiting_customer" ? "Regenerate approval link" : "Prepare customer approval"}</button>
                {deliveryFeeLinks[order.id] && <div className="admin-delivery-share"><input readOnly value={deliveryFeeLinks[order.id]} aria-label="Customer delivery approval link" /><button type="button" className="admin-secondary" onClick={() => void navigator.clipboard.writeText(deliveryFeeLinks[order.id]).then(() => setMessage("Customer approval link copied."))}>Copy link</button><a href={`https://wa.me/${order.phone.replace(/\D/g, "").replace(/^0/, "92")}?text=${encodeURIComponent("Assalamu Alaikum " + order.customer_name + ", please review and confirm your De VERVE COD delivery total: " + deliveryFeeLinks[order.id])}`} target="_blank" rel="noreferrer">Send via WhatsApp ↗</a></div>}
                <small>Subtotal Rs. {Math.round(order.subtotal_paisa / 100).toLocaleString("en-PK")}{order.discount_amount_paisa>0 ? " · "+order.discount_label+" −Rs. "+Math.round(order.discount_amount_paisa/100).toLocaleString("en-PK") : ""} · Delivery {order.free_delivery ? "FREE" : "Rs. "+Math.round(order.delivery_fee_paisa/100).toLocaleString("en-PK")} · Final total Rs. {Math.round(order.total_paisa / 100).toLocaleString("en-PK")}. Dispatch is blocked until the customer accepts the final total.</small>
              </div>
              <div className="admin-order-footer"><div><span>{order.payment_provider === "safepay" ? "Safepay sandbox" : "COD"} · {order.payment_status}</span><strong>Rs. {Math.round(order.total_paisa / 100).toLocaleString("en-PK")}</strong></div><label>Status<select value={order.order_status} disabled={busy || !allowedNext.length} onChange={(event) => void updateOrderStatus(order, event.target.value as AdminOrder["order_status"])}><option value={order.order_status}>{order.order_status}</option>{allowedNext.map((status) => <option value={status} key={status}>{status}</option>)}</select></label></div>
              <div className="admin-order-document-actions">
                <button type="button" className="admin-secondary" onClick={()=>exportOfficeSpreadsheet("de-verve-invoice-"+order.order_number+".xlsx","Invoice",orderDocumentRows(order,"invoice"))}>Invoice · Excel</button>
                <button type="button" className="admin-secondary" onClick={()=>exportOfficeDocument("de-verve-invoice-"+order.order_number+".docx","De VERVE · Sales invoice","Order "+order.order_number+" · "+new Date(order.created_at).toLocaleString("en-PK"),orderDocumentRows(order,"invoice"))}>Invoice · Word</button>
                <button type="button" className="admin-secondary" onClick={()=>exportOfficeImage("de-verve-invoice-"+order.order_number+".jpg","Sales invoice · "+order.order_number,new Date(order.created_at).toLocaleString("en-PK"),orderDocumentRows(order,"invoice"))}>Invoice · JPG</button>
                <button type="button" className="admin-secondary" onClick={()=>{try{printOrderDocument(order,"invoice");}catch(error){setMessage(error instanceof Error?error.message:"Invoice could not be printed.");}}}>Invoice · PDF / Print</button>
                <button type="button" className="admin-secondary" onClick={()=>exportOfficeDocument("de-verve-delivery-slip-"+order.order_number+".docx","De VERVE · Delivery slip","Order "+order.order_number+" · "+new Date(order.created_at).toLocaleString("en-PK"),orderDocumentRows(order,"delivery"))}>Delivery slip · Word</button>
                <button type="button" className="admin-secondary" onClick={()=>{try{printOrderDocument(order,"delivery");}catch(error){setMessage(error instanceof Error?error.message:"Delivery slip could not be printed.");}}}>Delivery slip · PDF / Print</button>
              </div>
            </article>;
          })}</div>}
        </section>}
        {["owner", "manager", "orders"].includes(admin.role) && <section id="exchanges" className="admin-panel admin-returns-panel">
          <div className="admin-panel-heading"><div><h2>Customer exchanges</h2><p className="admin-muted">Review requests, approve or reject them, confirm receipt and close the exchange. No refunds are initiated here.</p></div><span className="admin-enquiry-count">{exchanges.length} requests</span></div>
          {exchanges.length === 0 ? <div className="admin-empty"><strong>No exchange requests yet</strong><p>Eligible customer requests submitted from My orders will appear here.</p></div> : <div className="admin-return-list">{exchanges.map((item) => <article className="admin-return-card" key={item.id}>
            <div className="admin-order-heading"><div><strong>{item.exchange_number}</strong><span>Order {item.order_number} · {new Date(item.created_at).toLocaleString()}</span></div><span className={"admin-enquiry-status status-" + item.status}>{item.status.replaceAll("_", " ")}</span></div>
            <div className="admin-order-customer"><strong>{item.customer_name}</strong><a href={"tel:" + item.customer_phone}>{item.customer_phone}</a>{item.customer_email && <a href={"mailto:" + item.customer_email}>{item.customer_email}</a>}<a className="admin-secondary" href={whatsappHref(item.customer_phone, "Assalamu Alaikum " + item.customer_name + ", this is De VERVE regarding exchange request " + item.exchange_number + " for order " + item.order_number + ". Current status: " + item.status + ". Please reply here if you need assistance.")} target="_blank" rel="noreferrer">WhatsApp customer ↗</a></div>
            <p className="admin-return-reason"><strong>{item.reason.replaceAll("_", " ")}</strong> · {item.details}</p>
            <div className="admin-order-items">{item.items.map((line, index) => <div key={index}><span>{line.product_name_snapshot} · {[line.size_snapshot, line.color_snapshot].filter(Boolean).join(" / ") || line.sku_snapshot || "Standard"} × {line.quantity}</span><strong>Replacement: {line.requested_size || "same size"} / {line.requested_color || "same colour"}</strong></div>)}</div>
            <label className="admin-return-note">Internal note<textarea rows={2} maxLength={500} value={exchangeNotes[item.id] ?? item.admin_note ?? ""} onChange={(event) => updateExchangeNotes((current) => ({ ...current, [item.id]: event.target.value }))} /></label>
            {item.status === "requested" && <div className="admin-return-actions"><button type="button" className="admin-secondary" disabled={busy} onClick={() => void updateExchangeStatus(item, "reviewing")}>Start review</button><button type="button" className="admin-primary" disabled={busy} onClick={() => void updateExchangeStatus(item, "approved")}>Approve exchange</button><button type="button" className="admin-danger-button" disabled={busy} onClick={() => void updateExchangeStatus(item, "rejected")}>Reject request</button></div>}
            {item.status === "reviewing" && <div className="admin-return-actions"><button type="button" className="admin-primary" disabled={busy} onClick={() => void updateExchangeStatus(item, "approved")}>Approve exchange</button><button type="button" className="admin-danger-button" disabled={busy} onClick={() => void updateExchangeStatus(item, "rejected")}>Reject request</button></div>}
            {item.status === "approved" && <button type="button" className="admin-primary" disabled={busy} onClick={() => void updateExchangeStatus(item, "item_received")}>Confirm item received</button>}
            {item.status === "item_received" && <button type="button" className="admin-primary" disabled={busy} onClick={() => void updateExchangeStatus(item, "completed")}>Mark exchange completed</button>}
            {item.status === "rejected" && <p className="admin-return-complete">Request rejected. {item.admin_note}</p>}
            {item.status === "completed" && <p className="admin-return-complete">Exchange completed. {item.admin_note}</p>}
          </article>)}</div>}
        </section>}
        {["owner", "manager", "orders"].includes(admin.role) && <section id="returns" className="admin-panel admin-returns-panel">
          <div className="admin-panel-heading"><div><h2>Historical return records (legacy)</h2><p className="admin-muted">Read-only legacy records created before the exchange-only policy. New customer requests are handled in Exchanges.</p></div><span className="admin-enquiry-count">{returns.length} requests</span></div>
          {returns.length === 0 ? <div className="admin-empty"><strong>No return requests yet</strong><p>Eligible customer return requests will appear here.</p></div> : <div className="admin-return-list">{returns.map((item) => {
            const draft = returnRefundDrafts[item.id] ?? { refund_method: "bank_transfer", refund_reference: "", admin_note: item.admin_note ?? "" };
            const setDraft = (patch: Partial<typeof draft>) => updateReturnRefundDrafts((current) => ({ ...current, [item.id]: { ...draft, ...patch } }));
            return <article className="admin-return-card" key={item.id}>
              <div className="admin-order-heading"><div><strong>{item.return_number}</strong><span>Order {item.order_number} · {new Date(item.created_at).toLocaleString()}</span></div><span className={"admin-enquiry-status status-" + item.status}>{item.status}</span></div>
              <div className="admin-order-customer"><strong>{item.customer_name}</strong><a href={"tel:" + item.customer_phone}>{item.customer_phone}</a>{item.customer_email && <a href={"mailto:" + item.customer_email}>{item.customer_email}</a>}<a className="admin-secondary" href={whatsappHref(item.customer_phone, `Assalamu Alaikum ${item.customer_name}, this is De VERVE regarding return request ${item.return_number} for order ${item.order_number}. Current return status: ${item.status}. Please reply here if you need assistance.`)} target="_blank" rel="noreferrer">WhatsApp customer ↗</a></div>
              <p className="admin-return-reason"><strong>{item.reason.replaceAll("_", " ")}</strong> · {item.details}</p>
              <div className="admin-order-items">{item.items.map((line, index) => <div key={index}><span>{line.product_name_snapshot} · {[line.size_snapshot, line.color_snapshot].filter(Boolean).join(" / ") || line.sku_snapshot || "Standard"} × {line.quantity}</span><strong>Rs. {Math.round(line.unit_refund_paisa * line.quantity / 100).toLocaleString("en-PK")}</strong></div>)}</div>
              <div className="admin-return-refund"><span>Item refund estimate</span><strong>Rs. {Math.round(item.refund_amount_paisa / 100).toLocaleString("en-PK")}</strong><small>Delivery charges are excluded. Payment type: {item.payment_provider === "safepay" ? "Safepay" : "COD"} · payment status: {item.payment_status}</small></div>
              <label className="admin-return-note">Internal note<textarea rows={2} maxLength={500} value={draft.admin_note} onChange={(event) => setDraft({ admin_note: event.target.value })} /></label>
              {item.status === "requested" && <div className="admin-return-actions"><button type="button" className="admin-primary" disabled={busy} onClick={() => void updateReturnStatus(item, "approved")}>Approve return</button><button type="button" className="admin-danger-button" disabled={busy} onClick={() => void updateReturnStatus(item, "rejected")}>Reject request</button></div>}
              {item.status === "approved" && <button type="button" className="admin-primary" disabled={busy} onClick={() => void updateReturnStatus(item, "received")}>Mark items received</button>}
              {item.status === "received" && <div className="admin-return-refund-form"><p>Record a refund only after it has actually been paid. This system does not transfer money or call Safepay refunds.</p><label>Manual refund method<select value={draft.refund_method} onChange={(event) => setDraft({ refund_method: event.target.value })}><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="store_credit">Store credit</option></select></label><label>Refund reference / receipt number<input required minLength={3} maxLength={120} value={draft.refund_reference} onChange={(event) => setDraft({ refund_reference: event.target.value })} placeholder="Transaction ID or receipt reference"/></label><button type="button" className="admin-primary" disabled={busy || draft.refund_reference.trim().length < 3} onClick={() => void updateReturnStatus(item, "refunded")}>Record refund completed</button></div>}
              {item.status === "refunded" && <p className="admin-return-complete">Refund recorded: {item.refund_method?.replaceAll("_", " ")} · {item.refund_reference}</p>}
            </article>;
          })}</div>}
        </section>}
        {["owner", "manager", "rental"].includes(admin.role) && <section id="vehicles" className="admin-panel admin-fleet-panel">
          <div className="admin-panel-heading"><div><h2>Vehicle fleet</h2><p className="admin-muted">Manage rental vehicles, daily rates and public availability.</p></div>{["owner", "manager"].includes(admin.role) && <button type="button" className="admin-primary" onClick={() => startVehicleEditor()}>＋ Add vehicle</button>}</div>
          {vehicles.length === 0 ? <div className="admin-empty"><strong>No vehicles added yet</strong><p>Add a vehicle before customers can request it from the rental section.</p></div> : <div className="admin-vehicle-list">{vehicles.map((vehicle) => <article className="admin-vehicle-card" key={vehicle.id}>
            <div><strong>{vehicle.name}</strong><span>{vehicle.vehicle_type} · {vehicle.seats} seats · {vehicle.transmission} · {vehicle.fuel_type}</span><small>{vehicle.description || "No description added."}</small></div>
            <div className="admin-vehicle-meta"><strong>Self: {vehicle.daily_rate_paisa === null ? "Rate on request" : `Rs. ${Math.round(vehicle.daily_rate_paisa / 100).toLocaleString("en-PK")} / day`}</strong><small>With driver: {vehicle.with_driver_daily_rate_paisa === null ? "Rate not configured" : `Rs. ${Math.round(vehicle.with_driver_daily_rate_paisa / 100).toLocaleString("en-PK")} / day`}</small><span className={`admin-enquiry-status status-${vehicle.status}`}>{vehicle.status}</span></div>
            {["owner", "manager"].includes(admin.role) && <><button type="button" className="admin-secondary" onClick={() => setVehicleGalleryTarget(vehicle)}>Photos</button><button type="button" className="admin-secondary" onClick={() => startVehicleEditor(vehicle)}>Edit</button></>}
          </article>)}</div>}
        </section>}
        {["owner", "manager", "rental"].includes(admin.role) && <section id="rentals" className="admin-panel admin-rentals-panel">
          <div className="admin-panel-heading"><div><h2>Rental requests</h2><p className="admin-muted">Review dates, price estimates and required CNIC documents. Confirm only after identity verification and availability checks.</p></div><span className="admin-enquiry-count">{rentals.length} recent</span></div>
          {rentals.length === 0 ? <div className="admin-empty"><strong>No rental requests yet</strong><p>Customer booking requests will appear here.</p></div> : <div className="admin-rental-list">{rentals.map((rental) => {
            const next: RentalRequest["status"][] = rental.status === "requested" ? ["reviewing", "cancelled"] : rental.status === "reviewing" ? ["confirmed", "cancelled"] : rental.status === "confirmed" ? ["active", "cancelled"] : rental.status === "active" ? ["completed"] : [];
            return <article className="admin-rental-card" key={rental.id}>
              <div className="admin-order-heading"><div><strong>{rental.reference_code}</strong><span>{new Date(rental.created_at).toLocaleString()}</span></div><span className={`admin-enquiry-status status-${rental.status}`}>{rental.status}</span></div>
              <div className="admin-order-customer"><strong>{rental.customer_name}</strong><a href={`tel:${rental.phone}`}>{rental.phone}</a>{rental.email && <a href={`mailto:${rental.email}`}>{rental.email}</a>}<span>{rental.vehicle_name || "Any available vehicle"} · {rental.vehicle_type || "Vehicle preference not specified"}</span><a className="admin-secondary" href={whatsappHref(rental.phone, `Assalamu Alaikum ${rental.customer_name}, this is De VERVE regarding rental request ${rental.reference_code}. Current status: ${rental.status}. Please reply here to discuss your booking.`)} target="_blank" rel="noreferrer">WhatsApp customer ↗</a></div>
              <div className="admin-rental-dates"><div><span>PICKUP</span><strong>{new Date(rental.pickup_at).toLocaleString()}</strong><small>{rental.pickup_address ? rental.pickup_address + ", " + rental.pickup_city : rental.pickup_location}</small></div><div><span>DESTINATION / RETURN</span><strong>{new Date(rental.return_at).toLocaleString()}</strong><small>{rental.destination_address ? rental.destination_address + ", " + rental.destination_city : rental.destination || "Destination not specified"}</small></div></div>
              {(rental.cnic_front_uploaded || rental.cnic_back_uploaded) && <div className="admin-rental-documents"><strong>Private CNIC documents</strong><small>Visible only to the owner, manager and authorised rental staff. Access is recorded in the audit history. Viewing a document does not expire or remove the stored file.</small>{rental.cnic_front_uploaded ? <span><button type="button" className="admin-secondary" disabled={busy} onClick={()=>void previewRentalDocument(rental,"cnic_front")}>Preview front</button><button type="button" className="admin-secondary" disabled={busy} onClick={()=>void downloadRentalDocument(rental,"cnic_front")}>Download front</button></span> : <span>Front not uploaded</span>}{rental.cnic_back_uploaded ? <span><button type="button" className="admin-secondary" disabled={busy} onClick={()=>void previewRentalDocument(rental,"cnic_back")}>Preview back</button><button type="button" className="admin-secondary" disabled={busy} onClick={()=>void downloadRentalDocument(rental,"cnic_back")}>Download back</button></span> : <span>Back not uploaded</span>}<small>Stored in private server storage with the rental record. Preview uses your active staff session; the CNIC file does not expire when viewed.</small></div>}
              <label className="admin-rental-note">Assign vehicle<select value={rental.vehicle_id ?? ""} disabled={busy} onChange={(e) => setRentals((current) => current.map((item) => item.id === rental.id ? { ...item, vehicle_id: e.target.value || null, vehicle_name: vehicles.find((vehicle) => vehicle.id === e.target.value)?.name ?? null } : item))}><option value="">Any / not assigned</option>{vehicles.filter((vehicle) => vehicle.status === "available").map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}</select></label>
              <p className="admin-muted">{rental.driver_option.replace("_", " ")} · {rental.rental_days ?? "—"} day(s) · {rental.estimated_daily_rate_paisa !== null && rental.estimated_daily_rate_paisa !== undefined ? `Rs. ${Math.round(rental.estimated_daily_rate_paisa / 100).toLocaleString("en-PK")} / day` : "Rate to confirm"} · {rental.estimated_total_paisa !== null && rental.estimated_total_paisa !== undefined ? `Estimated total Rs. ${Math.round(rental.estimated_total_paisa / 100).toLocaleString("en-PK")}` : "Total to confirm"}{rental.customer_note ? ` · ${rental.customer_note}` : ""}</p>
              {["owner", "manager"].includes(admin.role) && <label className="admin-rental-note">Internal note<input value={rental.admin_note} maxLength={500} onChange={(e) => setRentals((current) => current.map((item) => item.id === rental.id ? { ...item, admin_note: e.target.value } : item))} /></label>}
              <button type="button" className="admin-secondary" disabled={busy} onClick={() => void saveRentalDetails(rental)}>Save assignment & note</button>
              <label className="admin-enquiry-action">Update status<select value={rental.status} disabled={busy || !next.length} onChange={(e) => void updateRentalStatus(rental, e.target.value as RentalRequest["status"])}><option value={rental.status}>{rental.status}</option>{next.map((status) => <option value={status} key={status}>{status}</option>)}</select></label>
              <div className="admin-order-document-actions">
                <button type="button" className="admin-secondary" onClick={()=>exportOfficeDocument("de-verve-rental-"+rental.reference_code+".docx","De VERVE · Rental request summary",rental.reference_code+" · "+new Date(rental.created_at).toLocaleString("en-PK"),rentalDocumentRows(rental))}>Word</button>
                <button type="button" className="admin-secondary" onClick={()=>exportOfficeSpreadsheet("de-verve-rental-"+rental.reference_code+".xlsx","Rental summary",rentalDocumentRows(rental))}>Excel</button>
                <button type="button" className="admin-secondary" onClick={()=>exportOfficeImage("de-verve-rental-"+rental.reference_code+".jpg","Rental request · "+rental.reference_code,new Date(rental.created_at).toLocaleString("en-PK"),rentalDocumentRows(rental))}>JPG</button>
                <button type="button" className="admin-secondary" onClick={()=>{try{printRentalSummary(rental);}catch(error){setMessage(error instanceof Error?error.message:"Rental slip could not be printed.");}}}>PDF / Print</button>
              </div>
            </article>;
          })}</div>}
        </section>}
        {["owner", "manager", "orders"].includes(admin.role) && <section id="wholesale" className="admin-panel admin-wholesale-panel">
          <div className="admin-panel-heading"><div><h2>Wholesale quotations</h2><p className="admin-muted">Prepare itemised business quotes, share secure approval links and convert accepted quotes into COD orders.</p></div><button type="button" className="admin-primary" onClick={() => openQuoteEditor()}>＋ Prepare quotation</button></div>
          {wholesaleQuotes.length === 0 ? <div className="admin-empty"><strong>No wholesale quotations yet</strong><p>Create a quotation for a retailer or bulk buyer. Customer approval will create an order and reserve stock.</p></div> : <div className="admin-quote-list">{wholesaleQuotes.map((quote) => <article className="admin-quote-card" key={quote.id}>
            <div className="admin-order-heading"><div><strong>{quote.business_name}</strong><span>{quote.contact_name} · {quote.phone} · {new Date(quote.created_at).toLocaleDateString()}</span><a className="admin-secondary" href={whatsappHref(quote.phone, `Assalamu Alaikum ${quote.contact_name}, this is De VERVE regarding your wholesale quotation for ${quote.business_name}. Current status: ${quote.status}. Please reply here if you have any questions.`)} target="_blank" rel="noreferrer">WhatsApp buyer ↗</a></div><span className={`admin-enquiry-status status-${quote.status}`}>{quote.status}</span></div>
            <div className="admin-quote-lines">{quote.items.map((item) => <div key={item.id}><span>{item.product_name_snapshot} · {[item.size_snapshot, item.color_snapshot].filter(Boolean).join(" / ") || item.sku_snapshot || "Standard"} × {item.quantity}</span><strong>Rs. {Math.round(item.line_total_paisa / 100).toLocaleString("en-PK")}</strong></div>)}</div>
            <div className="admin-quote-footer"><strong>Rs. {Math.round((quote.quoted_total_paisa ?? 0) / 100).toLocaleString("en-PK")}</strong><div>{quote.status === "prepared" && <button type="button" disabled={busy} onClick={() => void sendWholesaleQuote(quote)}>Mark as sent</button>}{quote.status === "sent" && <button type="button" disabled={busy} onClick={() => void copyQuoteLink(quote)}>Copy approval link</button>}{quote.status === "accepted" && <span>Converted to order{quote.converted_order_id ? ` · ${quote.converted_order_id.slice(0, 8)}` : ""}</span>}</div></div>
            {quote.valid_until && <small className="admin-quote-expiry">Valid until {new Date(quote.valid_until).toLocaleDateString()} · {quote.city}</small>}
          </article>)}</div>}
        </section>}

        {["owner", "manager", "orders"].includes(admin.role) && <section id="customers" className="admin-panel admin-customers-panel">
          <div className="admin-panel-heading"><div><h2>Registered customers</h2><p className="admin-muted">A privacy-conscious directory of customer accounts, purchase activity and rental history. Guest checkouts are not included.</p></div><span className="admin-enquiry-count">{customers.length} shown</span></div>
          <form className="admin-customer-search" onSubmit={(event) => { event.preventDefault(); void loadCustomers(customerSearch).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Customer search failed.")); }}>
            <label>Find by name, email or phone<input value={customerSearch} maxLength={80} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Search customer records" /></label>
            <button type="submit" className="admin-primary" disabled={busy}>Search customers</button>
            <button type="button" className="admin-secondary" onClick={() => { setCustomerSearch(""); void loadCustomers(""); }}>Clear</button>
          </form>
          {customers.length === 0 ? <div className="admin-empty"><strong>No registered customers found</strong><p>Customer accounts will appear here after people register on the website. Guest orders are managed in the Orders workspace.</p></div> :
            <div className="admin-customer-list">{customers.map((customer) => <article className="admin-customer-row" key={customer.id}>
              <div className="admin-customer-main"><strong>{customer.full_name}</strong><span>{customer.email}</span><span>{customer.phone || "No phone provided"} · <i className={customer.status === "active" ? "status-published" : "status-archived"}>{customer.status}</i></span><small>Joined {new Date(customer.created_at).toLocaleDateString()} · {customer.email_verified_at ? "Email verified" : "Email not verified"} · {customer.last_login_at ? "Last login " + new Date(customer.last_login_at).toLocaleDateString() : "No sign-in recorded"}</small></div>
              <div className="admin-customer-metrics"><strong>{customer.order_count} orders</strong><span>Rs. {Math.round(customer.paid_total_paisa / 100).toLocaleString("en-PK")} paid</span><small>{customer.rental_count} rental requests</small>{customer.last_order_at && <small>Last order {new Date(customer.last_order_at).toLocaleDateString()}</small>}</div>
              <div className="admin-customer-actions"><a href={"mailto:" + customer.email}>Email</a>{customer.phone && <a href={"tel:" + customer.phone}>Call</a>}{customer.phone && <a href={whatsappHref(customer.phone, "Assalamu Alaikum " + customer.full_name + ", this is De VERVE. How may we assist you today?")} target="_blank" rel="noreferrer">WhatsApp ↗</a>}</div>
            </article>)}</div>}
        </section>}
        {admin.role !== "catalogue" && (
        <section id="enquiries" className="admin-panel admin-enquiry-panel">
          <div className="admin-panel-heading"><div><h2>Customer enquiries</h2><p className="admin-muted">Review retail, wholesale, rental and general enquiries received from your website.</p></div><span className="admin-enquiry-count">{enquiries.length} recent</span></div>
          {enquiries.length === 0 ? <div className="admin-empty"><strong>No enquiries yet</strong><p>New customer messages submitted through the website will appear here.</p></div> :
            <div className="admin-enquiry-list">{enquiries.map((enquiry) => <article className="admin-enquiry-row" key={enquiry.id}>
              <div className="admin-enquiry-main"><div className="admin-enquiry-title"><strong>{enquiry.customer_name}</strong><span className="admin-enquiry-type">{enquiryTypeLabel(enquiry.enquiry_type)}</span><span className={`admin-enquiry-status status-${enquiry.status}`}>{enquiry.status}</span></div>
                <p>{enquiry.message}</p><div className="admin-enquiry-contact"><a href={`tel:${enquiry.phone}`}>{enquiry.phone}</a>{enquiry.email && <a href={`mailto:${enquiry.email}`}>{enquiry.email}</a>}<time dateTime={enquiry.created_at}>{new Date(enquiry.created_at).toLocaleString()}</time><a className="admin-secondary" href={whatsappHref(enquiry.phone, `Assalamu Alaikum ${enquiry.customer_name}, thank you for contacting De VERVE about ${enquiryTypeLabel(enquiry.enquiry_type)}. We are following up on your message. How may we help you?`)} target="_blank" rel="noreferrer">WhatsApp customer ↗</a></div>
              </div>
              <label className="admin-enquiry-action">Status<select value={enquiry.status} disabled={busy || !["owner", "manager", "orders", "rental"].includes(admin.role) || (admin.role === "rental" && enquiry.enquiry_type !== "rental")} onChange={(event) => void updateEnquiryStatus(enquiry, event.target.value as Enquiry["status"])}><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="closed">Closed</option><option value="spam">Spam</option></select></label>{enquiry.enquiry_type === "wholesale" && ["owner", "manager", "orders"].includes(admin.role) && <button type="button" className="admin-secondary" onClick={() => openQuoteEditor(enquiry)}>Prepare quote</button>}
            </article>)}</div>}
        </section>
        )}
        {["owner", "manager", "orders", "catalogue"].includes(admin.role) && activeAdminScreen === "inventory" && <section id="inventory" className="admin-panel"><InventoryWorkspace canManageMoney={["owner","manager"].includes(admin.role)} onManageProduct={(productId) => { const product = products.find((item) => item.id === productId); navigateAdminScreen("products"); if (product) startEdit(product); }} /></section>}
        {["owner", "manager", "orders"].includes(admin.role) && activeAdminScreen === "pos" && <section id="pos" className="admin-panel"><POSWorkspace canManageMoney={["owner", "manager"].includes(admin.role)} /></section>}
        {["owner","manager"].includes(admin.role) && <section id="product-reviews" className="admin-panel admin-product-reviews-panel"><div className="admin-panel-heading"><div><h2>Product reviews & comments</h2><p className="admin-muted">New customer reviews are published immediately. This workspace is only for legacy pending entries or exceptional moderation.</p></div><button type="button" className="admin-secondary" onClick={()=>void loadProductReviews()}>Refresh queue</button></div>{productReviews.length===0?<div className="admin-empty"><strong>No pending moderation items</strong><p>New customer feedback is already visible on the public product page as soon as it is submitted.</p></div>:<div className="admin-review-queue">{productReviews.map(review=><article className="admin-review-row" key={review.id}><div className="admin-review-meta"><strong>{review.product_name}</strong><span>{review.order_number?"Order "+review.order_number:"Customer comment"} · {new Date(review.created_at).toLocaleString()}</span><span>{review.customer_name} · {review.customer_email}</span><b>{"★".repeat(review.rating)}{"☆".repeat(5-review.rating)}</b></div>{review.title&&<h3>{review.title}</h3>}<p>{review.body}</p><div className="admin-row-actions"><a href={"/product/"+encodeURIComponent(review.product_slug)} target="_blank" rel="noreferrer">View product ↗</a><button type="button" className="admin-primary" onClick={()=>void moderateProductReview(review,"approved").catch((error:unknown)=>setMessage(error instanceof Error?error.message:"Review could not be approved."))}>Approve & publish</button><button type="button" className="admin-danger" onClick={()=>void moderateProductReview(review,"rejected").catch((error:unknown)=>setMessage(error instanceof Error?error.message:"Review could not be rejected."))}>Reject</button></div></article>)}</div>}</section>}
        <section id="products" className="admin-panel">
          <div className="admin-panel-heading"><div><h2>Product catalogue</h2><p className="admin-muted">Manage product details, images and stock from one place.</p></div><select aria-label="Filter products" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All products</option><option value="published">Published</option><option value="draft">Drafts</option><option value="archived">Archived</option></select></div>
          {shownProducts.length === 0 ? <div className="admin-empty"><strong>No products here yet</strong><p>Start by adding a product. You can save it as a draft before publishing.</p>{canEditProducts && <button className="admin-primary" onClick={startNew}>Add your first product</button>}</div> :
            <div className="admin-product-list">{shownProducts.map((product) => <article className="admin-product-row" key={product.id}><div><strong>{product.name}</strong><span>{product.category} · {product.audience} · <i className={`status-${product.status}`}>{product.status}</i></span></div><div className="admin-row-actions">{canEditProducts && <button type="button" onClick={() => void openMediaLibrary(product)}>Images</button>}<button type="button" onClick={() => void openVariants(product)}>Variants & stock</button>{canEditProducts && <button type="button" onClick={() => startEdit(product)}>Edit</button>}{["owner", "manager"].includes(admin.role) && product.status !== "archived" && <button type="button" className="admin-danger" onClick={() => void archiveProduct(product)}>Archive</button>}</div></article>)}</div>}
        </section>
        {vehicleGalleryTarget && <VehicleGalleryManager vehicle={vehicleGalleryTarget} onClose={() => setVehicleGalleryTarget(null)} onChanged={() => void loadVehicles()} />}
        {showVehicleEditor && <div className="admin-modal-backdrop"><section className="admin-editor" role="dialog" aria-modal="true" aria-labelledby="vehicle-editor-title">
          <div className="admin-panel-heading"><div><p className="admin-eyebrow">DE VERVE MOBILITY</p><h2 id="vehicle-editor-title">{editingVehicleId ? "Edit vehicle" : "Add vehicle"}</h2></div><button type="button" className="admin-close" onClick={() => setShowVehicleEditor(false)} aria-label="Close">×</button></div>
          <form className="admin-form admin-product-form" data-draft-key="admin-vehicle-editor" onSubmit={saveVehicle}>
            <label>Vehicle name<input required minLength={2} maxLength={100} value={vehicleForm.name} onChange={(e) => updateVehicleForm({ ...vehicleForm, name: e.target.value })} placeholder="e.g. Toyota Corolla 2022" /></label>
            <label>Vehicle type<input required maxLength={60} value={vehicleForm.vehicle_type} onChange={(e) => updateVehicleForm({ ...vehicleForm, vehicle_type: e.target.value })} placeholder="Sedan, SUV, Van" /></label>
            <label>Transmission<select value={vehicleForm.transmission} onChange={(e) => updateVehicleForm({ ...vehicleForm, transmission: e.target.value })}><option>Automatic</option><option>Manual</option><option>Unspecified</option></select></label>
            <label>Fuel type<select value={vehicleForm.fuel_type} onChange={(e) => updateVehicleForm({ ...vehicleForm, fuel_type: e.target.value })}><option>Petrol</option><option>Diesel</option><option>Hybrid</option><option>Electric</option><option>Unspecified</option></select></label>
            <label>Seats<input type="number" required min="1" max="30" step="1" value={vehicleForm.seats} onChange={(e) => updateVehicleForm({ ...vehicleForm, seats: e.target.value })} /></label>
            <label>Self-drive daily rate (PKR){vehicleForm.status === "available" && <span className="required-star" aria-hidden="true"> *</span>}<input type="number" min="0" step="1" required={vehicleForm.status === "available"} value={vehicleForm.daily_rate} onChange={(e) => updateVehicleForm({ ...vehicleForm, daily_rate: e.target.value })} /></label>
            <label>With-driver daily rate (PKR){vehicleForm.status === "available" && <span className="required-star" aria-hidden="true"> *</span>}<input type="number" min="0" step="1" required={vehicleForm.status === "available"} value={vehicleForm.with_driver_daily_rate} onChange={(e) => updateVehicleForm({ ...vehicleForm, with_driver_daily_rate: e.target.value })} /></label>
            <label>Status<select value={vehicleForm.status} onChange={(e) => updateVehicleForm({ ...vehicleForm, status: e.target.value as Vehicle["status"] })}><option value="draft">Draft</option><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="retired">Retired</option></select></label>
            <label className="admin-full">Description<textarea rows={3} maxLength={1000} value={vehicleForm.description} onChange={(e) => updateVehicleForm({ ...vehicleForm, description: e.target.value })} /></label>
            <label>Vehicle image from media library<select value={vehicleForm.image_key} onChange={(e)=>setVehicleForm({...vehicleForm,image_key:e.target.value})}><option value="">No image selected</option>{vehicleMediaAssets.map((asset)=><option key={asset.id} value={asset.id}>{asset.alt_text||asset.id.slice(0,8)}</option>)}</select></label>
            <label>Upload vehicle photo (JPG, PNG or WebP, max 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e)=>void uploadVehicleImage(e.target.files?.[0]??null)}/></label>
            {vehicleForm.image_key&&<img className="admin-vehicle-image-preview" src={"/api/admin/media/"+vehicleForm.image_key+"/file"} alt="Selected vehicle preview"/>}
            <div className="admin-form-actions"><button type="button" className="admin-secondary" onClick={() => setShowVehicleEditor(false)}>Cancel</button><button className="admin-primary" disabled={busy}>{busy ? "Saving…" : "Save vehicle"}</button></div>
          </form>
        </section></div>}
        {showQuoteEditor && <div className="admin-modal-backdrop"><section className="admin-editor admin-quote-editor" role="dialog" aria-modal="true" aria-labelledby="quote-editor-title">
          <div className="admin-panel-heading"><div><p className="admin-eyebrow">WHOLESALE SALES</p><h2 id="quote-editor-title">Prepare a quotation</h2><p className="admin-muted">Set the buyer details and agreed per-piece prices. Customer approval will reserve stock.</p></div><button type="button" className="admin-close" onClick={() => setShowQuoteEditor(false)} aria-label="Close">×</button></div>
          <form className="admin-form admin-product-form" data-draft-key="admin-wholesale-quote" onSubmit={submitWholesaleQuote}>
            <label>Business / shop name<input required minLength={2} maxLength={120} value={quoteForm.business_name} onChange={(e) => updateQuoteForm({ ...quoteForm, business_name: e.target.value })} /></label>
            <label>Contact person<input required minLength={2} maxLength={100} value={quoteForm.contact_name} onChange={(e) => updateQuoteForm({ ...quoteForm, contact_name: e.target.value })} /></label>
            <label>Phone / WhatsApp<input required maxLength={24} value={quoteForm.phone} onChange={(e) => updateQuoteForm({ ...quoteForm, phone: e.target.value })} /></label>
            <label>Email (optional)<input type="email" maxLength={160} value={quoteForm.email} onChange={(e) => updateQuoteForm({ ...quoteForm, email: e.target.value })} /></label>
            <label>Delivery city<input required maxLength={80} value={quoteForm.city} onChange={(e) => updateQuoteForm({ ...quoteForm, city: e.target.value })} /></label>
            <label>Valid until<input type="date" required min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} value={quoteForm.valid_until} onChange={(e) => updateQuoteForm({ ...quoteForm, valid_until: e.target.value })} /></label>
            <label className="admin-full">Delivery address<input required minLength={8} maxLength={300} value={quoteForm.delivery_address} onChange={(e) => updateQuoteForm({ ...quoteForm, delivery_address: e.target.value })} /></label>
            <label className="admin-full">Notes (optional)<textarea rows={2} maxLength={500} value={quoteForm.customer_note} onChange={(e) => updateQuoteForm({ ...quoteForm, customer_note: e.target.value })} /></label>
            <div className="admin-full admin-quote-line-editor"><div className="admin-panel-heading"><h3>Quoted products</h3><button type="button" className="admin-secondary" onClick={() => updateQuoteLines((current) => [...current, { product_id: "", variant_id: "", quantity: "10", unit_price: "", variants: [] }])}>＋ Add line</button></div>
              {quoteLines.map((line, index) => <div className="admin-quote-draft-line" key={index}>
                <label>Published product<select required value={line.product_id} onChange={(e) => void changeQuoteProduct(index, e.target.value)}><option value="">Choose product</option>{products.filter((product) => product.status === "published").map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
                <label>Size / colour / SKU<select required value={line.variant_id} onChange={(e) => updateQuoteLines((current) => current.map((item, i) => i === index ? { ...item, variant_id: e.target.value } : item))}><option value="">Choose option</option>{line.variants.map((variant) => <option key={variant.id} value={variant.id}>{[variant.size, variant.color, variant.sku].filter(Boolean).join(" · ") || "Standard"} · available {variant.available_quantity}</option>)}</select></label>
                <label>Quantity<input required type="number" min="1" max="10000" step="1" value={line.quantity} onChange={(e) => updateQuoteLines((current) => current.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} /></label>
                <label>Unit price (PKR)<input required type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => updateQuoteLines((current) => current.map((item, i) => i === index ? { ...item, unit_price: e.target.value } : item))} /></label>
                {quoteLines.length > 1 && <button type="button" className="admin-danger-button" onClick={() => updateQuoteLines((current) => current.filter((_, i) => i !== index))}>Remove line</button>}
              </div>)}
            </div>
            <div className="admin-form-actions"><button type="button" className="admin-secondary" onClick={() => setShowQuoteEditor(false)}>Cancel</button><button className="admin-primary" disabled={busy}>{busy ? "Saving…" : "Save quotation"}</button></div>
          </form>
        </section></div>}
        {cropFiles && <ImageCropper files={cropFiles} aspectRatio={4/5} onCancel={() => setCropFiles(null)} onComplete={(cropped) => void uploadCroppedMedia(cropped)} />}
        {mediaProduct && <div className="admin-modal-backdrop"><section className="admin-editor admin-media-editor" role="dialog" aria-modal="true" aria-labelledby="media-editor-title">
          <div className="admin-panel-heading"><div><p className="admin-eyebrow">PRODUCT MEDIA</p><h2 id="media-editor-title">{mediaProduct.name}</h2><p className="admin-muted">Build a gallery with multiple photos and short MP4/WebM videos. Images: 5 MB max. Videos: 20 MB max. Add separate photos for each colour after creating exact size/colour stock variants.</p></div><button type="button" className="admin-close" onClick={() => setMediaProduct(null)} aria-label="Close">×</button></div>
          <form className="admin-form admin-media-upload" onSubmit={uploadMedia}>
            <label>Choose product images (up to 50 at once)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { const files = Array.from(event.target.files ?? []); setMediaFiles(files.slice(0, 50)); if (files.length > 50) setMessage("Only the first 50 selected images were kept."); }} /></label>
            <label>Gallery colour<select value={mediaColor} onChange={(event) => setMediaColor(event.target.value)}><option value="">General photos · all colours</option>{[...new Set(mediaVariants.filter((variant) => variant.is_active === 1).flatMap((variant) => variant.color.split(/[,;|]+/).map((color) => color.trim()).filter(Boolean)))].sort().map((color) => <option key={color} value={color}>{color} only</option>)}</select><small>Choose a colour to show these photos only when customers select that colour. Keep “General photos” for images shared by every colour.</small></label>
            <label>Media description<input value={mediaAlt} maxLength={240} onChange={(event) => setMediaAlt(event.target.value)} placeholder="e.g. Navy blue stretch hoodie, front view" /></label>
            <button className="admin-primary" disabled={busy || !mediaFiles.length}>{busy ? "Please wait…" : "Upload & add " + mediaFiles.length + " images"}</button>
            {mediaFiles.length > 0 && <p className="admin-muted admin-media-selected">{mediaFiles.length} images selected · crop each to the consistent 4:5 product frame before upload · JPG, PNG or WebP · maximum 5 MB each · 50 per batch</p>}
            {mediaUploadProgress && <p className="admin-message" role="status" aria-live="polite">{mediaUploadProgress}</p>}
          </form>
          <h3 className="admin-media-subheading">Attached to this product ({productMedia.length})</h3>
          <div className="admin-media-grid">
            {productMedia.length === 0 ? <div className="admin-empty"><strong>No gallery items yet</strong><p>Add product photos or a short product video from your media library below.</p></div> : productMedia.map((asset) => <article className={(asset as MediaAsset & {is_primary?:number}).is_primary === 1 ? "admin-media-card is-selected" : "admin-media-card"} key={asset.id}>
              {asset.media_type === "video" ? <video src={asset.url} controls preload="metadata" /> : <img src={asset.url} alt={asset.alt_text || "Product media"} loading="lazy" />}
              <div><span>{asset.alt_text || (asset.media_type === "video" ? "Product video" : "Product image")}</span><small>{(asset.byte_size / 1024).toFixed(0)} KB · {asset.color ? asset.color + " colour" : (asset as MediaAsset & {is_primary?:number}).is_primary === 1 ? "Cover image" : asset.media_type}</small></div>
              <div className="admin-media-actions">{asset.media_type === "image" && !asset.color && <button type="button" disabled={busy || (asset as MediaAsset & {is_primary?:number}).is_primary === 1} className="admin-secondary" onClick={() => void attachMedia(asset, true)}>Set as cover</button>}<button type="button" disabled={busy} className="admin-danger-button" onClick={() => void removeProductMedia(asset)}>Remove</button></div>
            </article>)}
          </div>
          <h3 className="admin-media-subheading">Media library</h3>
          <div className="admin-media-grid">
            {mediaAssets.length === 0 ? <div className="admin-empty"><strong>No media uploaded yet</strong><p>Upload a clear product photo or short video to start your media library.</p></div> : mediaAssets.map((asset) => {
              const attached = productMedia.some((item) => item.id === asset.id);
              return <article className={attached ? "admin-media-card is-selected" : "admin-media-card"} key={asset.id}>
                {asset.media_type === "video" ? <video src={asset.url} controls preload="metadata" /> : <img src={asset.url} alt={asset.alt_text || "Uploaded product media"} loading="lazy" />}
                <div><span>{asset.alt_text || (asset.media_type === "video" ? "Untitled video" : "Untitled image")}</span><small>{(asset.byte_size / 1024).toFixed(0)} KB · {asset.media_type}</small></div>
                <button type="button" disabled={busy || attached} className="admin-secondary" onClick={() => void attachMedia(asset, asset.media_type === "image" && !mediaProduct.image_key)}>{attached ? "Already in gallery" : "Add to gallery"}</button>
              </article>;
            })}
          </div>
          {mediaProduct.image_key && <button type="button" className="admin-danger-button" disabled={busy} onClick={() => void attachMedia(null)}>Clear cover image</button>}
        </section></div>}
        {variantProduct && <div className="admin-modal-backdrop"><section className="admin-editor admin-variant-editor" role="dialog" aria-modal="true" aria-labelledby="variant-editor-title">
          <div className="admin-panel-heading"><div><p className="admin-eyebrow">PRODUCT OPTIONS & INVENTORY</p><h2 id="variant-editor-title">{variantProduct.name}</h2><p className="admin-muted">Manage sizes, colours, SKUs and recorded stock movements.</p></div><button type="button" className="admin-close" onClick={() => { setVariantProduct(null); setStockTarget(null); setMovementTarget(null); setVariantEditTarget(null); }} aria-label="Close">×</button></div>
          <div className="admin-variant-list">{variants.length === 0 ? <div className="admin-empty"><strong>No variants yet</strong><p>Add a size, colour or SKU option to begin tracking stock.</p></div> : variants.map((variant) => <article className="admin-variant-row" key={variant.id}>
            <div><strong>{variant.sku || "No SKU"}</strong><span>{[variant.size, variant.color].filter(Boolean).join(" · ") || "General option"}</span><small>{variant.is_active ? "Active" : "Inactive"}</small></div>
            <div className="admin-variant-stock"><strong>{variant.available_quantity}</strong><span>available</span><small>{variant.reserved_quantity} reserved · {variant.stock_on_hand} physical</small></div>
            {["owner", "manager", "catalogue"].includes(admin.role) && <button type="button" disabled={busy} onClick={() => startVariantEdit(variant)}>Edit details</button>}<button type="button" disabled={busy} onClick={() => void openMovementHistory(variant)}>History</button>{["owner", "manager", "orders"].includes(admin.role) && <button type="button" disabled={busy || !variant.is_active} onClick={() => { setStockTarget(variant); setStockForm({ movement_type: "received", quantity_delta: "", note: "" }); }}>Adjust stock</button>}
          </article>)}</div>
          {variantEditTarget && <form className="admin-form admin-variant-form" onSubmit={saveVariantEdit}>
            <h3>Edit variant · {[variantEditTarget.size, variantEditTarget.color].filter(Boolean).join(" / ") || variantEditTarget.sku || "Variant"}</h3>
            <div className="admin-variant-fields">
              <label>SKU<input maxLength={64} value={variantEditForm.sku} onChange={e=>setVariantEditForm({...variantEditForm,sku:e.target.value})}/></label>
              <label>Size<input maxLength={32} value={variantEditForm.size} onChange={e=>setVariantEditForm({...variantEditForm,size:e.target.value})}/></label>
              <label>Colour<input maxLength={32} value={variantEditForm.color} onChange={e=>setVariantEditForm({...variantEditForm,color:e.target.value})}/></label>
              <label>Barcode<input maxLength={64} value={variantEditForm.barcode} onChange={e=>setVariantEditForm({...variantEditForm,barcode:e.target.value})}/></label>
              <label>Reorder alert at<input type="number" min="0" max="1000000" step="1" value={variantEditForm.reorder_level} onChange={e=>setVariantEditForm({...variantEditForm,reorder_level:e.target.value})}/></label>
              {["owner","manager"].includes(admin.role) && <label>Purchase cost (PKR)<input type="number" min="0" step="0.01" value={variantEditForm.cost_price} onChange={e=>setVariantEditForm({...variantEditForm,cost_price:e.target.value})}/></label>}
            </div><div className="admin-form-actions"><button className="admin-primary" disabled={busy}>Save variant</button><button type="button" className="admin-secondary" disabled={busy} onClick={()=>setVariantEditTarget(null)}>Cancel</button></div>
          </form>}
          {movementTarget && <section className="admin-movement-history"><div className="admin-panel-heading"><div><h3>Stock history</h3><p className="admin-muted">{movementTarget.sku || [movementTarget.size, movementTarget.color].filter(Boolean).join(" / ")}</p></div><button type="button" className="admin-secondary" onClick={() => setMovementTarget(null)}>Close history</button></div>
            {movements.length === 0 ? <p className="admin-muted">No stock movements recorded.</p> : <div className="admin-movement-list">{movements.map((movement) => <article key={movement.id}><div><strong>{movement.movement_type.replaceAll("_", " ")}</strong><span>{movement.note}</span><small>{movement.reference_type}{movement.reference_id ? ` · ${movement.reference_id}` : ""}</small></div><b className={movement.quantity_delta < 0 ? "movement-negative" : "movement-positive"}>{movement.quantity_delta > 0 ? "+" : ""}{movement.quantity_delta}</b><time dateTime={movement.created_at}>{new Date(movement.created_at).toLocaleString()}</time></article>)}</div>}
          </section>}
          {["owner", "manager", "catalogue"].includes(admin.role) && <form className="admin-form admin-variant-form" onSubmit={createVariant}>
            <h3>Add variant</h3><p className="admin-muted admin-full">Create one stock row for each exact size + colour combination. Do not enter comma-separated lists. Example: M / Black, L / Black, M / Navy. Enter the real quantity for each combination so checkout and inventory stay accurate.</p><div className="admin-variant-fields">
              <label>SKU <small>Automatically generated if left blank</small><input maxLength={64} placeholder="Leave blank to auto-generate" value={variantForm.sku} onChange={(e) => setVariantForm({ ...variantForm, sku: e.target.value })} /></label>
              <label>Size<input maxLength={32} placeholder="e.g. M" value={variantForm.size} onChange={(e) => setVariantForm({ ...variantForm, size: e.target.value })} /></label>
              <label>Colour<input maxLength={32} placeholder="e.g. Black" value={variantForm.color} onChange={(e) => setVariantForm({ ...variantForm, color: e.target.value })} /></label>
              <label>Barcode <small>EAN-13 barcode generated if left blank</small><input maxLength={64} placeholder="Leave blank to auto-generate" value={variantForm.barcode} onChange={(e) => setVariantForm({ ...variantForm, barcode: e.target.value })} /></label>
              <label>Opening stock<input type="number" min="0" max="1000000" step="1" value={variantForm.initial_stock} onChange={(e) => setVariantForm({ ...variantForm, initial_stock: e.target.value })} /></label>
              <label>Reorder alert at<input type="number" min="0" max="1000000" step="1" value={variantForm.reorder_level} onChange={(e) => setVariantForm({ ...variantForm, reorder_level: e.target.value })} /></label>
              {["owner","manager"].includes(admin.role) && <label>Purchase cost (PKR)<input type="number" min="0" step="0.01" value={variantForm.cost_price} onChange={(e) => setVariantForm({ ...variantForm, cost_price: e.target.value })} /></label>}
            </div><button className="admin-primary" disabled={busy}>Add variant</button>
          </form>}
          {stockTarget && <form className="admin-form admin-stock-form" onSubmit={recordStock}>
            <h3>Stock movement · {stockTarget.sku || [stockTarget.size, stockTarget.color].filter(Boolean).join(" / ")}</h3>
            <label>Movement type<select value={stockForm.movement_type} onChange={(e) => setStockForm({ ...stockForm, movement_type: e.target.value })}><option value="received">Stock received</option><option value="customer_return">Customer return</option><option value="adjustment">Stock adjustment</option></select></label>
            <label>Quantity change<input type="number" required min={stockForm.movement_type === "adjustment" ? -1000000 : 1} max="1000000" step="1" value={stockForm.quantity_delta} onChange={(e) => setStockForm({ ...stockForm, quantity_delta: e.target.value })} placeholder="Use a negative number for stock reduction" /></label>
            <label>Reason / note<input required minLength={3} maxLength={500} value={stockForm.note} onChange={(e) => setStockForm({ ...stockForm, note: e.target.value })} placeholder="e.g. Received supplier delivery" /></label>
            <div className="admin-form-actions"><button type="button" className="admin-secondary" onClick={() => setStockTarget(null)}>Cancel</button><button className="admin-primary" disabled={busy}>Save stock movement</button></div>
          </form>}
        </section></div>}
        {showEditor && <div className="admin-modal-backdrop"><section className="admin-editor" role="dialog" aria-modal="true" aria-labelledby="product-editor-title"><div className="admin-panel-heading"><div><p className="admin-eyebrow">CATALOGUE MANAGEMENT</p><h2 id="product-editor-title">{editingId ? "Edit product" : "Add a product"}</h2></div><button type="button" className="admin-close" onClick={() => setShowEditor(false)} aria-label="Close">×</button></div>
          <form className="admin-form admin-product-form" data-draft-key="admin-product-editor" onSubmit={saveProduct}>
            <label>Product name<input required minLength={2} maxLength={120} value={form.name} onChange={(e) => updateProductForm({ ...form, name: e.target.value, slug: editingId ? form.slug : e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} /></label>
            <label>URL slug<input required value={form.slug} onChange={(e) => updateProductForm({ ...form, slug: e.target.value })} /></label>
            <label>Category<input required minLength={2} maxLength={60} placeholder="e.g. Hoodies" value={form.category} onChange={(e) => updateProductForm({ ...form, category: e.target.value })} /></label>
            <label>For<select value={form.audience} onChange={(e) => updateProductForm({ ...form, audience: e.target.value as typeof form.audience })}><option value="men">Men</option><option value="women">Women</option><option value="kids">Kids</option><option value="unisex">Unisex</option></select></label>
            <label>Retail price (PKR, optional)<input type="number" min="0" step="0.01" value={form.retail_price_paisa} onChange={(e) => updateProductForm({ ...form, retail_price_paisa: e.target.value })} /></label>
            <label>Wholesale price (PKR, optional)<input type="number" min="0" step="0.01" value={form.wholesale_price_paisa} onChange={(e) => updateProductForm({ ...form, wholesale_price_paisa: e.target.value })} /></label>
            <label className="admin-full">Description<textarea rows={4} maxLength={4000} value={form.description} onChange={(e) => updateProductForm({ ...form, description: e.target.value })} /></label>
            <div className="admin-full admin-seo-fields"><h3>Search engine preview</h3><p className="admin-muted">These fields appear in search results and social previews. Keep titles under 70 characters and descriptions under 160.</p><label>SEO title<input maxLength={70} value={form.seo_title} onChange={(e) => updateProductForm({ ...form, seo_title: e.target.value })} placeholder={form.name || "Product name · De VERVE"} /></label><small>{form.seo_title.length}/70 characters</small><label>SEO description<textarea rows={2} maxLength={160} value={form.seo_description} onChange={(e) => updateProductForm({ ...form, seo_description: e.target.value })} placeholder={form.description.slice(0,160) || "Describe this product clearly for search visitors."} /></label><small>{form.seo_description.length}/160 characters</small></div>
            <label>Status<select value={form.status} onChange={(e) => updateProductForm({ ...form, status: e.target.value as typeof form.status })} disabled={admin.role === "catalogue"}><option value="draft">Save as draft</option><option value="published">Publish on website</option><option value="archived">Archived</option></select></label>
            <div className="admin-form-actions"><button type="button" className="admin-secondary" onClick={() => setShowEditor(false)}>Cancel</button><button className="admin-primary" disabled={busy}>{busy ? "Saving…" : "Save product"}</button></div>
          </form>
        </section></div>}
        {message && <p className="admin-message" role="status">{message}</p>}
      </section>
    </main>
  );
}
