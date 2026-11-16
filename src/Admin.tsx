import { useEffect, useState, type FormEvent } from "react";
import "./admin.css";
import ContentStudio from "./ContentStudio";
import NotificationCenter from "./NotificationCenter";

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
type AdminOrder = { id: string; order_number: string; customer_name: string; phone: string; email: string | null; delivery_address: string; city: string; subtotal_paisa: number; delivery_fee_paisa: number; total_paisa: number; discount_code: string; discount_label: string; discount_amount_paisa: number; free_delivery: number; delivery_fee_status: "pending_quote" | "awaiting_customer" | "accepted" | "declined"; delivery_fee_expires_at: string | null; payment_method: string; payment_provider: string; payment_status: string; order_status: "pending" | "confirmed" | "processing" | "dispatched" | "delivered" | "cancelled"; customer_note: string; created_at: string; items: Array<{ id: string; product_name_snapshot: string; sku_snapshot: string | null; size_snapshot: string; color_snapshot: string; quantity: number; unit_price_paisa: number; line_total_paisa: number }> };
type FollowUpItem = { key: string; kind: "enquiry" | "order" | "return" | "rental" | "wholesale"; title: string; contact: string; phone: string; email: string | null; status: string; summary: string; created_at: string; screen: string; priority: number };
type AuditEvent = { id: string; action: string; entity_type: string; entity_id: string | null; metadata_json: string; created_at: string; actor_email: string | null };
type CustomerRecord = { id: string; full_name: string; email: string; phone: string; status: string; email_verified_at: string | null; created_at: string; last_login_at: string | null; order_count: number; paid_total_paisa: number; last_order_at: string | null; rental_count: number };
type AdminReturn = { id: string; order_id: string; customer_id: string; return_number: string; order_number: string; customer_name: string; customer_email: string | null; customer_phone: string; reason: string; details: string; status: "requested" | "approved" | "rejected" | "received" | "refunded"; refund_amount_paisa: number; refund_method: string | null; refund_reference: string | null; admin_note: string; payment_provider: string; payment_status: string; created_at: string; items: Array<{ quantity: number; unit_refund_paisa: number; product_name_snapshot: string; sku_snapshot: string | null; size_snapshot: string; color_snapshot: string }> };
type AdminExchange = { id: string; order_id: string; customer_id: string; exchange_number: string; order_number: string; customer_name: string; customer_email: string | null; customer_phone: string; reason: string; details: string; status: "requested" | "reviewing" | "approved" | "rejected" | "item_received" | "completed"; admin_note: string; created_at: string; items: Array<{ quantity: number; requested_size: string; requested_color: string; product_name_snapshot: string; sku_snapshot: string | null; size_snapshot: string; color_snapshot: string }> };
type Enquiry = { id: string; enquiry_type: "retail" | "wholesale" | "rental" | "general"; customer_name: string; phone: string; email: string | null; message: string; status: "new" | "contacted" | "qualified" | "closed" | "spam"; source: string; created_at: string };
type Variant = { id: string; product_id: string; sku: string | null; size: string; color: string; stock_on_hand: number; reserved_quantity: number; available_quantity: number; is_active: number };
type InventoryMovement = { id: string; movement_type: string; quantity_delta: number; reference_type: string; reference_id: string | null; note: string; created_at: string };
type MediaAsset = { id: string; media_type: string; mime_type: string; byte_size: number; alt_text: string; caption: string; status: string; created_at: string; url: string };
type QuoteLineDraft = { product_id: string; variant_id: string; quantity: string; unit_price: string; variants: Variant[] };
type Vehicle = { id: string; name: string; vehicle_type: string; transmission: string; seats: number; fuel_type: string; daily_rate_paisa: number | null; with_driver_daily_rate_paisa: number | null; status: "draft" | "available" | "maintenance" | "retired"; image_key: string | null; description: string };
type RentalRequest = { id: string; vehicle_id: string | null; vehicle_name: string | null; vehicle_type: string | null; customer_name: string; phone: string; email: string | null; pickup_location: string; destination: string | null; pickup_city?: string; pickup_address?: string; destination_city?: string; destination_address?: string; cnic_front_uploaded?: number; cnic_back_uploaded?: number; rental_days?: number | null; estimated_daily_rate_paisa?: number | null; estimated_total_paisa?: number | null; pickup_at: string; return_at: string; driver_option: "self_drive" | "with_driver"; status: "requested" | "reviewing" | "confirmed" | "active" | "completed" | "cancelled"; customer_note: string; admin_note: string; reference_code: string; created_at: string };
type WholesaleQuote = { id: string; business_name: string; contact_name: string; phone: string; email: string | null; quoted_total_paisa: number | null; status: string; valid_until: string | null; city: string; approval_token: string | null; converted_order_id: string | null; approval_url: string | null; created_at: string; items: Array<{ id: string; product_name_snapshot: string; sku_snapshot: string | null; size_snapshot: string; color_snapshot: string; quantity: number; unit_price_paisa: number; line_total_paisa: number }> };

const emptyProduct: ProductForm = {
  name: "", slug: "", description: "", category: "", audience: "unisex" as const,
  status: "draft" as const, retail_price_paisa: "", wholesale_price_paisa: "", seo_title: "", seo_description: "",
};

function whatsappHref(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  const international = digits.startsWith("0") ? "92" + digits.slice(1) : digits;
  return international.length >= 10 && international.length <= 15
    ? "https://wa.me/" + international + "?text=" + encodeURIComponent(message)
    : "https://wa.me/";
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: { accept: "application/json", ...(options.body ? { "content-type": "application/json" } : {}), ...options.headers },
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Something went wrong. Please try again.");
  return payload;
}

export default function Admin() {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [activeAdminScreen, setActiveAdminScreen] = useState("overview");
  const [staffUsers, setStaffUsers] = useState<StaffMember[]>([]);
  const [staffInvites, setStaffInvites] = useState<StaffInvite[]>([]);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState("catalogue");
  const [newInviteUrl, setNewInviteUrl] = useState("");
  const [socialLinks,setSocialLinks]=useState<Record<string,string>>({facebook:"",instagram:"",tiktok:"",youtube:"",linkedin:"",pinterest:"",threads:"",x:""});
  const [brandAssets,setBrandAssets]=useState<{logo_id:string|null;favicon_id:string|null}>({logo_id:null,favicon_id:null});
  const [cnicUploadsEnabled,setCnicUploadsEnabled]=useState(false);
  const [ownerPrimaryEmail,setOwnerPrimaryEmail]=useState("deverve61@gmail.com");
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
  const [returns, setReturns] = useState<AdminReturn[]>([]);
  const [exchanges, setExchanges] = useState<AdminExchange[]>([]);
  const [exchangeNotes, setExchangeNotes] = useState<Record<string, string>>({});
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [followUpFilter, setFollowUpFilter] = useState<"all" | FollowUpItem["kind"]>("all");
  const [returnRefundDrafts, setReturnRefundDrafts] = useState<Record<string, { refund_method: string; refund_reference: string; admin_note: string }>>({});
  const [deliveryFeeDrafts, setDeliveryFeeDrafts] = useState<Record<string, string>>({});
  const [deliveryFeeLinks, setDeliveryFeeLinks] = useState<Record<string, string>>({});
  const [wholesaleQuotes, setWholesaleQuotes] = useState<WholesaleQuote[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [rentals, setRentals] = useState<RentalRequest[]>([]);
  const [showVehicleEditor, setShowVehicleEditor] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = useState({ name: "", vehicle_type: "Sedan", transmission: "Automatic", seats: "5", fuel_type: "Petrol", daily_rate: "", with_driver_daily_rate: "", status: "draft" as Vehicle["status"], description: "", image_key: "" });
  const [vehicleMediaAssets,setVehicleMediaAssets]=useState<MediaAsset[]>([]);
  const [showQuoteEditor, setShowQuoteEditor] = useState(false);
  const [quoteLines, setQuoteLines] = useState<QuoteLineDraft[]>([{ product_id: "", variant_id: "", quantity: "10", unit_price: "", variants: [] }]);
  const [quoteForm, setQuoteForm] = useState({ business_name: "", contact_name: "", phone: "", email: "", delivery_address: "", city: "Jhelum", customer_note: "", valid_until: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), enquiry_id: "" });
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [movementTarget, setMovementTarget] = useState<Variant | null>(null);
  const [mediaProduct, setMediaProduct] = useState<Product | null>(null);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [productMedia, setProductMedia] = useState<MediaAsset[]>([]);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaAlt, setMediaAlt] = useState("");
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [variantForm, setVariantForm] = useState({ sku: "", size: "", color: "", initial_stock: "0" });
  const [stockTarget, setStockTarget] = useState<Variant | null>(null);
  const [stockForm, setStockForm] = useState({ movement_type: "received", quantity_delta: "", note: "" });
  const [overview, setOverview] = useState<Overview>({ published_products: 0, draft_products: 0, new_enquiries: 0, pending_orders: 0, rental_requests: 0 });
  const [form, setForm] = useState({ ...emptyProduct });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [filter, setFilter] = useState("all");

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
  const loadAuditEvents = async () => {
    const result = await api<{ events: AuditEvent[] }>('/api/admin/audit-logs?limit=100');
    setAuditEvents(result.events);
  };
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
    setCnicUploadsEnabled(result.settings.cnic_uploads_enabled===true);
    setOwnerPrimaryEmail(result.settings.notification_emails?.primary??"deverve61@gmail.com");
    setOwnerSecondaryEmails((result.settings.notification_emails?.secondary??[]).join(", "));
    setOwnerEmailsEnabled(result.settings.notification_emails?.enabled!==false);
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

  const saveSocialLinks = async (event:FormEvent<HTMLFormElement>) => {event.preventDefault();setBusy(true);setMessage("");try{const secondary=ownerSecondaryEmails.split(/[;,\n]/).map((item)=>item.trim()).filter(Boolean);await api("/api/admin/settings",{method:"PATCH",body:JSON.stringify({social_links:socialLinks,brand_assets:brandAssets,cnic_uploads_enabled:cnicUploadsEnabled,notification_emails:{primary:ownerPrimaryEmail,secondary,enabled:ownerEmailsEnabled},payment_methods:{methods:paymentMethods}})});setMessage("Website, owner notification email and brand settings saved.");}catch(error){setMessage(error instanceof Error?error.message:"Website settings could not be saved.");}finally{setBusy(false);}};
  const uploadBrandAsset = async (kind:"logo"|"favicon",file:File|null) => {
    if(!file)return;
    setBusy(true);setMessage("");
    try{
      const data=new FormData();data.append("file",file);data.append("alt_text",kind==="logo"?"Official De VERVE logo":"De VERVE website favicon");
      const response=await fetch("/api/admin/media",{method:"POST",credentials:"same-origin",headers:{accept:"application/json"},body:data});
      const result=await response.json() as {error?:string;media?:MediaAsset};
      if(!response.ok||!result.media)throw new Error(result.error||"Brand image upload failed.");
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
      const response=await fetch("/api/admin/media",{method:"POST",credentials:"same-origin",headers:{accept:"application/json"},body:data});
      const result=await response.json() as {error?:string;media?:MediaAsset};
      if(!response.ok||!result.media)throw new Error(result.error||"Payment QR upload failed.");
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

  const startNew = () => { setEditingId(null); setForm({ ...emptyProduct }); setShowEditor(true); };
  const startEdit = (product: Product) => {
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
      await loadProducts(); setShowEditor(false); setMessage("Product saved successfully.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Product could not be saved."); }
    finally { setBusy(false); }
  };
  const openVariants = async (product: Product) => {
    setBusy(true); setMessage("");
    try {
      const result = await api<{ variants: Variant[] }>(`/api/admin/products/${product.id}/variants`);
      setVariantProduct(product); setVariants(result.variants); setVariantForm({ sku: "", size: "", color: "", initial_stock: "0" });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Variants could not be loaded."); }
    finally { setBusy(false); }
  };

  const openMediaLibrary = async (product: Product) => {
    setBusy(true); setMessage("");
    try {
      const [result, attached] = await Promise.all([
        api<{ media: MediaAsset[] }>("/api/admin/media"),
        api<{ media: MediaAsset[] }>(`/api/admin/products/${product.id}/media`),
      ]);
      setMediaAssets(result.media); setProductMedia(attached.media); setMediaProduct(product); setMediaFile(null); setMediaAlt("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Media library could not be loaded."); }
    finally { setBusy(false); }
  };

  const uploadMedia = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mediaFile || !mediaProduct) return;
    setBusy(true); setMessage("");
    try {
      const data = new FormData(); data.append("file", mediaFile); data.append("alt_text", mediaAlt);
      const response = await fetch("/api/admin/media", { method: "POST", credentials: "same-origin", headers: { accept: "application/json" }, body: data });
      const result = await response.json() as { error?: string; media?: MediaAsset };
      if (!response.ok || !result.media) throw new Error(result.error || "Media upload failed.");
      setMediaAssets((current) => [result.media!, ...current]); setMediaFile(null); setMediaAlt("");
      setMessage(result.media.media_type === "video" ? "Video uploaded. Add it to the product gallery below." : "Image uploaded. Add it to the product gallery below.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Image could not be uploaded."); }
    finally { setBusy(false); }
  };

  const attachMedia = async (asset: MediaAsset | null, makeCover = false) => {
    if (!mediaProduct) return;
    setBusy(true); setMessage("");
    try {
      if (!asset) {
        await api(`/api/admin/products/${mediaProduct.id}/image`, { method: "PATCH", body: JSON.stringify({ image_id: null }) });
      } else {
        await api(`/api/admin/products/${mediaProduct.id}/media`, { method: "POST", body: JSON.stringify({ media_id: asset.id, is_primary: makeCover, position: productMedia.length }) });
      }
      const [attached] = await Promise.all([
        api<{ media: MediaAsset[] }>(`/api/admin/products/${mediaProduct.id}/media`),
        loadProducts(),
      ]);
      setProductMedia(attached.media);
      if (asset && makeCover) setMediaProduct((current) => current ? { ...current, image_key: asset.id } : current);
      setMessage(asset ? (makeCover ? "Cover image updated and added to the gallery." : "Media added to the product gallery.") : "Product cover image removed.");
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
      await api(`/api/admin/products/${variantProduct.id}/variants`, { method: "POST", body: JSON.stringify({ ...variantForm, initial_stock: Number(variantForm.initial_stock) }) });
      const result = await api<{ variants: Variant[] }>(`/api/admin/products/${variantProduct.id}/variants`);
      setVariants(result.variants); setVariantForm({ sku: "", size: "", color: "", initial_stock: "0" }); setMessage("Product variant added.");
      await loadProducts();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Variant could not be added."); }
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
    const reference=window.prompt("Enter the bank/wallet transaction reference after checking your business account (optional):")??"";
    if(!window.confirm("Have you independently confirmed receipt of the full payment for "+order.order_number+"?"))return;
    setBusy(true);setMessage("");
    try{await api("/api/admin/orders/"+order.id,{method:"PATCH",body:JSON.stringify({payment_status:"paid",payment_reference:reference})});await Promise.all([loadOrders(),loadOverview()]);setMessage("Direct payment verified for "+order.order_number+".");}
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
      setQuoteLines((current) => current.map((line, i) => i === index ? { ...line, product_id: productId, variant_id: available[0]?.id ?? "", variants: available, unit_price: selected?.wholesale_price_paisa !== null && selected?.wholesale_price_paisa !== undefined ? String(selected.wholesale_price_paisa / 100) : "" } : line));
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
      await loadWholesaleQuotes(); setShowQuoteEditor(false);
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
      const response=await fetch("/api/admin/media",{method:"POST",credentials:"same-origin",headers:{accept:"application/json"},body:data});
      const result=await response.json() as {error?:string;media?:MediaAsset};
      if(!response.ok||!result.media)throw new Error(result.error||"Vehicle photo upload failed.");
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
      await loadVehicles(); setShowVehicleEditor(false); setMessage("Vehicle saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Vehicle could not be saved."); }
    finally { setBusy(false); }
  };
  const deleteRentalDocument = async (rental: RentalRequest, side: "cnic_front" | "cnic_back") => {
    if(!window.confirm("Permanently delete this private CNIC image?"))return;
    setBusy(true);setMessage("");
    try{await api(`/api/admin/rentals/${rental.id}/documents/${side}`,{method:"DELETE"});await loadRentals();setMessage("Private rental document deleted.");}
    catch(error){setMessage(error instanceof Error?error.message:"Document could not be deleted.");}
    finally{setBusy(false);}
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
    followUpItems.push({ key: "enquiry:" + enquiry.id, kind: "enquiry", title: enquiry.customer_name, contact: enquiry.enquiry_type + " enquiry", phone: enquiry.phone, email: enquiry.email, status: enquiry.status, summary: enquiry.message, created_at: enquiry.created_at, screen: "enquiries", priority: enquiry.status === "new" ? 0 : enquiry.status === "qualified" ? 1 : 2 });
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
  if (activeAdminScreen === "content" && ["owner", "manager"].includes(admin.role)) return <ContentStudio onClose={() => setActiveAdminScreen("overview")} />;
  if (activeAdminScreen === "notifications" && admin.role === "owner") return <NotificationCenter onClose={() => setActiveAdminScreen("overview")} />;
  return (
    <main className="admin-screen admin-dashboard" data-admin-screen={activeAdminScreen}>
      <header className="admin-topbar">
        <a className="admin-brand" href="/">De VERVE<span>.</span><small>BUSINESS CONTROL CENTRE</small></a>
        <div className="admin-user"><span>{admin.email}<small>{admin.role}</small></span><button type="button" onClick={signOut} disabled={busy}>Sign out</button></div>
      </header>
      <section className="admin-content">
        <div className="admin-heading-row"><div><p className="admin-eyebrow">YOUR BUSINESS, ONE PLACE</p><h1>{({overview:"Overview",followups:"Follow-up inbox",products:"Products & stock",vehicles:"Car fleet",rentals:"Rental bookings",orders:"Customer orders",returns:"Legacy return records",exchanges:"Exchanges",wholesale:"Wholesale quotations",customers:"Customer directory",audit:"Activity history",enquiries:"Customer enquiries",staff:"Staff & permissions",settings:"Website settings",content:"Pages & visual designer",notifications:"Notifications"} as Record<string,string>)[activeAdminScreen] ?? "Workspace"}</h1><p className="admin-muted">{activeAdminScreen==="overview"?"Your business at a glance. Choose a workspace to manage a specific area.":"Manage this part of your De VERVE business from one focused screen."}</p></div>{canEditProducts && activeAdminScreen === "products" && <button className="admin-primary" onClick={startNew}>＋ Add product</button>}</div>
        <nav className="admin-quick-nav" aria-label="Admin workspace"><button type="button" className={activeAdminScreen === "overview" ? "active" : ""} onClick={() => setActiveAdminScreen("overview")}>Overview</button>{["owner", "manager"].includes(admin.role) && <button type="button" className={activeAdminScreen === "content" ? "active" : ""} onClick={() => setActiveAdminScreen("content")}>Pages & designer</button>}{admin.role === "owner" && <button type="button" className={activeAdminScreen === "notifications" ? "active" : ""} onClick={() => setActiveAdminScreen("notifications")}>Notifications</button>}{["owner", "manager", "orders", "rental"].includes(admin.role) && <button type="button" className={activeAdminScreen === "followups" ? "active" : ""} onClick={() => setActiveAdminScreen("followups")}>Follow-ups</button>}<button type="button" className={activeAdminScreen === "products" ? "active" : ""} onClick={() => setActiveAdminScreen("products")}>Products & stock</button>{["owner", "manager", "rental"].includes(admin.role) && <><button type="button" className={activeAdminScreen === "vehicles" ? "active" : ""} onClick={() => setActiveAdminScreen("vehicles")}>Car fleet</button><button type="button" className={activeAdminScreen === "rentals" ? "active" : ""} onClick={() => setActiveAdminScreen("rentals")}>Rental bookings</button></>}{["owner", "manager", "orders"].includes(admin.role) && <><button type="button" className={activeAdminScreen === "orders" ? "active" : ""} onClick={() => setActiveAdminScreen("orders")}>Orders</button><button type="button" className={activeAdminScreen === "exchanges" ? "active" : ""} onClick={() => setActiveAdminScreen("exchanges")}>Exchanges</button><button type="button" className={activeAdminScreen === "returns" ? "active" : ""} onClick={() => setActiveAdminScreen("returns")}>Legacy return records</button><button type="button" className={activeAdminScreen === "wholesale" ? "active" : ""} onClick={() => setActiveAdminScreen("wholesale")}>Wholesale</button></>}{["owner", "manager", "orders"].includes(admin.role) && <button type="button" className={activeAdminScreen === "customers" ? "active" : ""} onClick={() => { setActiveAdminScreen("customers"); void loadCustomers(customerSearch).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Customer records could not be loaded.")); }}>Customers</button>}{["owner", "manager", "orders", "rental"].includes(admin.role) && <button type="button" className={activeAdminScreen === "enquiries" ? "active" : ""} onClick={() => setActiveAdminScreen("enquiries")}>Enquiries</button>}{admin.role === "owner" && <><button type="button" className={activeAdminScreen === "staff" ? "active" : ""} onClick={() => setActiveAdminScreen("staff")}>Staff & access</button><button type="button" className={activeAdminScreen === "settings" ? "active" : ""} onClick={() => setActiveAdminScreen("settings")}>Website settings</button><button type="button" className={activeAdminScreen === "audit" ? "active" : ""} onClick={() => { setActiveAdminScreen("audit"); void loadAuditEvents().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Audit history could not be loaded.")); }}>Activity history</button></>} </nav>
        <div className="admin-stat-grid"><article><span>ALL PRODUCTS</span><strong>{products.length}</strong></article><article><span>PUBLISHED</span><strong>{overview.published_products}</strong></article><article><span>DRAFTS</span><strong>{overview.draft_products}</strong></article><article><span>NEW ENQUIRIES</span><strong>{overview.new_enquiries}</strong></article><article><span>PENDING ORDERS</span><strong>{overview.pending_orders}</strong></article><article><span>RENTAL REQUESTS</span><strong>{overview.rental_requests}</strong></article></div>

        {["owner", "manager", "orders", "rental"].includes(admin.role) && <section id="followups" className="admin-panel admin-followups-panel">
          <div className="admin-panel-heading"><div><h2>Open follow-ups</h2><p className="admin-muted">A combined queue of active customer work from existing business records. Update each record in its original workspace.</p></div><span className="admin-enquiry-count">{followUpItems.length} open items</span></div>
          <div className="admin-followup-toolbar"><label>Show<select value={followUpFilter} onChange={(event) => setFollowUpFilter(event.target.value as typeof followUpFilter)}><option value="all">All follow-ups</option><option value="enquiry">Enquiries</option><option value="order">Orders</option><option value="return">Returns</option><option value="rental">Rentals</option><option value="wholesale">Wholesale</option></select></label><span>Priority first · oldest first within each priority</span></div>
          {visibleFollowUps.length === 0 ? <div className="admin-empty"><strong>No open follow-ups</strong><p>New enquiries and active orders, returns, rentals or quotations will appear here automatically.</p></div> :
            <div className="admin-followup-list">{visibleFollowUps.map((item) => <article className="admin-followup-row" key={item.key}>
              <div className="admin-followup-main"><div className="admin-followup-title"><strong>{item.title}</strong><span className="admin-enquiry-type">{item.kind}</span><span className="admin-enquiry-status">{item.status}</span></div><span className="admin-followup-reference">{item.contact}</span><p>{item.summary}</p><small>{new Date(item.created_at).toLocaleString()}</small></div>
              <div className="admin-followup-actions">{item.phone && <a href={whatsappHref(item.phone, "Assalamu Alaikum " + item.title + ", this is De VERVE following up about " + item.contact + ". Current status: " + item.status + ". Please let us know how we can help.")} target="_blank" rel="noreferrer">WhatsApp ↗</a>}{item.email && <a href={"mailto:" + item.email}>Email</a>}<button type="button" onClick={() => setActiveAdminScreen(item.screen)}>Open record</button></div>
            </article>)}</div>}
        </section>}

        {admin.role === "owner" && <section id="audit" className="admin-panel admin-audit-panel">
          <div className="admin-panel-heading"><div><h2>Business activity history</h2><p className="admin-muted">A read-only record of important changes performed by staff and system workflows. Entries are shown newest first.</p></div><div className="admin-audit-toolbar"><span className="admin-enquiry-count">{auditEvents.length} recent events</span><button type="button" className="admin-secondary" onClick={() => void loadAuditEvents().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Audit history could not be refreshed."))}>Refresh</button></div></div>
          {auditEvents.length === 0 ? <div className="admin-empty"><strong>No recorded activity yet</strong><p>Important staff, order, rental, wholesale, media and website-setting changes will appear here when recorded by the system.</p></div> : <div className="admin-audit-list">{auditEvents.map((event) => {
            let details = "";
            try { const parsed = JSON.parse(event.metadata_json) as unknown; details = typeof parsed === "object" && parsed !== null ? Object.entries(parsed as Record<string, unknown>).filter(([key,value]) => !/token|secret|password|cnic|document|authorization/i.test(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")).map(([key,value]) => key.replace(/_/g," ") + ": " + String(value)).join(" · ") : ""; } catch { details = "Details unavailable"; }
            return <article className="admin-audit-row" key={event.id}><div className="admin-audit-main"><strong>{event.action.replace(/[._]/g," ")}</strong><span>{event.entity_type.replace(/_/g," ")}{event.entity_id ? " · " + event.entity_id.slice(0,12) : ""}</span>{details && <small>{details}</small>}</div><div className="admin-audit-meta"><span>{event.actor_email || "System"}</span><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time></div></article>;
          })}</div>}
        </section>}
        {admin.role === "owner" && <section id="staff" className="admin-panel admin-staff-panel"><div className="admin-panel-heading"><div><h2>Staff & permissions</h2><p className="admin-muted">Invite team members, choose their access level and disable accounts when needed.</p></div><span className="admin-enquiry-count">{staffUsers.length} accounts</span></div><form className="admin-form admin-staff-invite" onSubmit={createStaffInvite}><label>Staff email<input type="email" required maxLength={160} value={staffEmail} onChange={(e)=>setStaffEmail(e.target.value)} placeholder="team@example.com"/></label><label>Role<select value={staffRole} onChange={(e)=>setStaffRole(e.target.value)}><option value="catalogue">Catalogue — products & stock details</option><option value="orders">Orders — orders & wholesale</option><option value="rental">Rental — rental requests</option><option value="manager">Manager — broad operational access</option><option value="viewer">Viewer — read-only access</option></select></label><button className="admin-primary" disabled={busy}>{busy?"Creating…":"＋ Create invitation"}</button></form>{newInviteUrl && <div className="admin-invite-result"><strong>Secure invitation link</strong><input readOnly value={newInviteUrl}/><button type="button" className="admin-secondary" onClick={()=>void navigator.clipboard.writeText(newInviteUrl).then(()=>setMessage("Invitation link copied."))}>Copy invitation link</button><small>Share privately with the invited person. This link expires in 48 hours and can only be used once. Email delivery is not configured yet.</small></div>}<h3>Team accounts</h3>{staffUsers.length===0?<p className="admin-muted">No staff accounts yet.</p>:<div className="admin-staff-list">{staffUsers.map((member)=><article className="admin-staff-row" key={member.id}><div><strong>{member.email}</strong><span>{member.role} · {member.is_active?"Active":"Disabled"}</span><small>{member.last_login_at?"Last login "+new Date(member.last_login_at).toLocaleString():"Never signed in"}</small></div><label>Role<select disabled={busy||member.role==="owner"} value={member.role} onChange={(e)=>void updateStaffAccess(member,{role:e.target.value})}><option value="manager">Manager</option><option value="catalogue">Catalogue</option><option value="orders">Orders</option><option value="rental">Rental</option><option value="viewer">Viewer</option></select></label><button type="button" className={member.is_active?"admin-danger":"admin-secondary"} disabled={busy||member.role==="owner"} onClick={()=>void updateStaffAccess(member,{is_active:member.is_active?0:1})}>{member.is_active?"Disable":"Enable"}</button></article>)}</div>}<h3>Pending invitations</h3>{staffInvites.length===0?<p className="admin-muted">No pending invitations.</p>:<div className="admin-staff-list">{staffInvites.map((invite)=><article className="admin-staff-row" key={invite.id}><div><strong>{invite.email}</strong><span>{invite.role}</span><small>Expires {new Date(invite.expires_at).toLocaleString()}</small></div></article>)}</div>}</section>}
        {admin.role === "owner" && <section id="settings" className="admin-panel admin-settings-panel"><div className="admin-panel-heading"><div><h2>Website & brand settings</h2><p className="admin-muted">Manage the logo, browser favicon and official social profile links. Uploaded brand images are served through the private media bucket with public access only while selected here.</p></div></div><div className="admin-cnic-setting"><label><input type="checkbox" checked={cnicUploadsEnabled} onChange={(e)=>setCnicUploadsEnabled(e.target.checked)} disabled={busy}/> Enable secure CNIC uploads for rental requests</label><p>Keep this off unless identity documents are genuinely needed. Uploaded files are private and limited to authorized rental staff. A daily Cloudflare cleanup job is configured to delete documents 30 days after a rental is completed/cancelled, or after 90 days for unresolved requests. Owners and managers can also delete a document earlier from its rental record. This setting is saved with the “Save website settings” button below.</p></div><div className="admin-email-settings"><h3>Owner email & notifications</h3><p className="admin-muted">Order, rental and payment alerts will be sent to the primary address and any enabled secondary addresses. The initial address is deverve61@gmail.com. You can replace it when the business email is ready.</p><label><input type="checkbox" checked={ownerEmailsEnabled} onChange={(e)=>setOwnerEmailsEnabled(e.target.checked)} disabled={busy}/> Enable owner email alerts</label><div className="admin-form admin-social-form"><label>Primary owner email<input type="email" required maxLength={160} value={ownerPrimaryEmail} onChange={(e)=>setOwnerPrimaryEmail(e.target.value)} disabled={busy}/></label><label>Secondary email addresses<input type="text" maxLength={850} placeholder="accounts@example.com, manager@example.com" value={ownerSecondaryEmails} onChange={(e)=>setOwnerSecondaryEmails(e.target.value)} disabled={busy}/><small>Separate addresses with commas or semicolons. Up to five secondary addresses.</small></label></div><p className="admin-muted">Email delivery also requires the owner to configure a verified sender domain and Resend API key in Cloudflare. Changing recipient addresses here does not expose or change provider secrets.</p></div><div className="admin-payment-settings"><h3>Customer payment options</h3><p className="admin-muted">Add the ways customers can pay. These instructions are public at checkout. Direct transfers and wallet payments stay pending until the owner verifies the payment in the business account. Never enter card numbers, CVV or gateway API secrets here.</p>{paymentMethods.map((method,index)=><article className="admin-payment-method" key={method.id}><div className="admin-payment-method-head"><strong>{method.label||"New payment option"}</strong><label><input type="checkbox" checked={method.enabled} onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,enabled:e.target.checked}:item))}/> Active</label><button type="button" className="admin-danger" disabled={method.kind==="cod"} onClick={()=>setPaymentMethods(items=>items.filter((_,i)=>i!==index))}>Remove</button></div><div className="admin-form admin-social-form"><label>Option ID<input value={method.id} maxLength={40} disabled={method.kind==="cod"} onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,id:e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g,"-")}:item))}/></label><label>Customer-facing name<input required value={method.label} maxLength={80} onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,label:e.target.value}:item))}/></label><label>Type<select value={method.kind} disabled={method.kind==="cod"} onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,kind:e.target.value as AdminPaymentMethod["kind"]}:item))}><option value="cod">Cash on delivery</option><option value="bank">Bank transfer</option><option value="wallet">Mobile wallet (SadaPay / JazzCash / Easypaisa)</option><option value="link">Payment URL</option><option value="qr">QR / Raast QR</option></select></label><label>Provider / bank / wallet<input value={method.provider} maxLength={40} placeholder="e.g. SadaPay, HBL, Meezan" onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,provider:e.target.value}:item))}/></label><label>Account title<input value={method.account_title} maxLength={100} onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,account_title:e.target.value}:item))}/></label><label>Bank name<input value={method.bank_name} maxLength={100} onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,bank_name:e.target.value}:item))}/></label><label>Account / wallet number<input value={method.account_number} maxLength={80} onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,account_number:e.target.value}:item))}/></label><label>IBAN<input value={method.iban} maxLength={40} onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,iban:e.target.value}:item))}/></label><label>Payment URL (HTTPS)<input type="url" value={method.payment_url} maxLength={500} placeholder="https://" onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,payment_url:e.target.value}:item))}/></label><label>Payment QR image<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>void uploadPaymentQr(index,e.target.files?.[0]??null)}/><small>{method.qr_media_id?"QR uploaded · "+method.qr_media_id:"Upload a QR image (JPG, PNG or WebP, max 5 MB)"}</small></label><label className="admin-full">Customer instructions<textarea rows={2} maxLength={500} value={method.instructions} onChange={e=>setPaymentMethods(items=>items.map((item,i)=>i===index?{...item,instructions:e.target.value}:item))}/></label></div></article>)}<button type="button" className="admin-secondary" disabled={paymentMethods.length>=12} onClick={()=>setPaymentMethods(items=>[...items,{id:"payment-"+(items.length+1),label:"New payment option",kind:"bank",provider:"",enabled:false,account_title:"",bank_name:"",account_number:"",iban:"",payment_url:"",instructions:"",qr_media_id:null}])}>＋ Add payment option</button><p className="admin-muted">Gateway integrations such as Safepay and PayFast need verified merchant onboarding and server-side secrets. This panel manages customer-facing direct payment instructions; it does not collect or store gateway passwords.</p></div><div className="admin-brand-assets"><article><strong>Website logo</strong>{brandPreviews.logo&&<img src={brandPreviews.logo} alt="Current De VERVE logo preview"/>}<label>Upload logo (JPG, PNG or WebP, max 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e)=>void uploadBrandAsset("logo",e.target.files?.[0]??null)}/></label></article><article><strong>Browser favicon</strong>{brandPreviews.favicon&&<img className="admin-favicon-preview" src={brandPreviews.favicon} alt="Current De VERVE favicon preview"/>}<label>Upload favicon image (PNG recommended)<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e)=>void uploadBrandAsset("favicon",e.target.files?.[0]??null)}/></label></article></div><form className="admin-form admin-social-form" onSubmit={saveSocialLinks}>{[["facebook","Facebook"],["instagram","Instagram"],["tiktok","TikTok"],["youtube","YouTube"],["linkedin","LinkedIn"],["pinterest","Pinterest"],["threads","Threads"],["x","X"]].map(([key,label])=><label key={key}>{label} profile URL<input type="url" inputMode="url" placeholder={"https://"+key+".com/your-page"} value={socialLinks[key]??""} onChange={(e)=>setSocialLinks((current)=>({...current,[key]:e.target.value}))}/></label>)}<p className="admin-muted admin-full">Use direct HTTPS links to the official De VERVE pages. Leave a field empty to hide that social link.</p><div className="admin-form-actions"><button type="submit" className="admin-primary" disabled={busy}>{busy?"Saving…":"Save website settings"}</button></div></form></section>}
        {["owner", "manager", "orders"].includes(admin.role) && <section id="orders" className="admin-panel admin-orders-panel">
          <div className="admin-panel-heading"><div><h2>Customer orders</h2><p className="admin-muted">Review COD orders, contact customers and move each order through fulfilment.</p></div><span className="admin-enquiry-count">{orders.length} recent</span></div>
          {orders.length === 0 ? <div className="admin-empty"><strong>No orders yet</strong><p>New website checkout requests will appear here.</p></div> : <div className="admin-order-list">{orders.map((order) => {
            const next: AdminOrder["order_status"][] = (order.order_status === "pending" ? ["confirmed", "cancelled"] : order.order_status === "confirmed" ? ["processing", "cancelled"] : order.order_status === "processing" ? ["dispatched", "cancelled"] : order.order_status === "dispatched" ? ["delivered"] : []) as AdminOrder["order_status"][];
            const canFulfil = order.delivery_fee_status === "accepted" && ((order.payment_provider === "manual" && order.payment_method === "cod") || order.payment_status === "paid");
            const allowedNext = canFulfil ? next : next.filter((status) => status !== "processing" && status !== "dispatched");
            return <article className="admin-order-card" key={order.id}>
              <div className="admin-order-heading"><div><strong>{order.order_number}</strong><span>{new Date(order.created_at).toLocaleString()}</span></div><span className={`admin-enquiry-status status-${order.order_status}`}>{order.order_status}</span></div>
              <div className="admin-order-payment"><strong>Payment: {order.payment_method||"cod"}</strong><span>Status: {order.payment_status}</span>{admin.role==="owner"&&order.payment_provider==="manual"&&order.payment_method!=="cod"&&order.payment_status==="pending"&&<button type="button" className="admin-primary" disabled={busy} onClick={()=>void verifyManualPayment(order)}>Verify received transfer</button>}</div><div className="admin-order-customer"><strong>{order.customer_name}</strong><a href={`tel:${order.phone}`}>{order.phone}</a>{order.email && <a href={`mailto:${order.email}`}>{order.email}</a>}<span>{order.delivery_address}, {order.city}</span><a className="admin-secondary" href={whatsappHref(order.phone, `Assalamu Alaikum ${order.customer_name}, this is De VERVE regarding your order ${order.order_number}. Current status: ${order.order_status}. Please reply here if you need assistance.`)} target="_blank" rel="noreferrer">WhatsApp customer ↗</a>{order.customer_note && <small>Note: {order.customer_note}</small>}</div>
              <div className="admin-order-items">{order.items.map((item) => <div key={item.id}><span>{item.product_name_snapshot} · {[item.size_snapshot, item.color_snapshot].filter(Boolean).join(" / ") || item.sku_snapshot || "Standard"} × {item.quantity}</span><strong>Rs. {Math.round(item.line_total_paisa / 100).toLocaleString("en-PK")}</strong></div>)}</div>
              <div className="admin-delivery-quote">
                <div><strong>Delivery fee approval</strong><span className={`admin-delivery-state state-${order.delivery_fee_status}`}>{order.delivery_fee_status === "pending_quote" ? "Needs a delivery quotation" : order.delivery_fee_status === "awaiting_customer" ? "Waiting for customer approval" : order.delivery_fee_status === "accepted" ? "Customer approved the final total" : "Customer declined the quotation"}</span></div>
                <label>Delivery fee (PKR)<input type="number" min="0" max="1000000" step="1" value={deliveryFeeDrafts[order.id] ?? String(Math.round(order.delivery_fee_paisa / 100))} onChange={(event) => setDeliveryFeeDrafts((current) => ({ ...current, [order.id]: event.target.value }))} disabled={busy || !["pending", "confirmed"].includes(order.order_status)} /></label>
                <button type="button" className="admin-secondary" disabled={busy || !["pending", "confirmed"].includes(order.order_status)} onClick={() => void prepareDeliveryFeeQuote(order)}>{order.delivery_fee_status === "awaiting_customer" ? "Regenerate approval link" : "Prepare customer approval"}</button>
                {deliveryFeeLinks[order.id] && <div className="admin-delivery-share"><input readOnly value={deliveryFeeLinks[order.id]} aria-label="Customer delivery approval link" /><button type="button" className="admin-secondary" onClick={() => void navigator.clipboard.writeText(deliveryFeeLinks[order.id]).then(() => setMessage("Customer approval link copied."))}>Copy link</button><a href={`https://wa.me/${order.phone.replace(/\D/g, "").replace(/^0/, "92")}?text=${encodeURIComponent("Assalamu Alaikum " + order.customer_name + ", please review and confirm your De VERVE COD delivery total: " + deliveryFeeLinks[order.id])}`} target="_blank" rel="noreferrer">Send via WhatsApp ↗</a></div>}
                <small>Subtotal Rs. {Math.round(order.subtotal_paisa / 100).toLocaleString("en-PK")}{order.discount_amount_paisa>0 ? " · "+order.discount_label+" −Rs. "+Math.round(order.discount_amount_paisa/100).toLocaleString("en-PK") : ""} · Delivery {order.free_delivery ? "FREE" : "Rs. "+Math.round(order.delivery_fee_paisa/100).toLocaleString("en-PK")} · Final total Rs. {Math.round(order.total_paisa / 100).toLocaleString("en-PK")}. Dispatch is blocked until the customer accepts the final total.</small>
              </div>
              <div className="admin-order-footer"><div><span>{order.payment_provider === "safepay" ? "Safepay sandbox" : "COD"} · {order.payment_status}</span><strong>Rs. {Math.round(order.total_paisa / 100).toLocaleString("en-PK")}</strong></div><label>Status<select value={order.order_status} disabled={busy || !allowedNext.length} onChange={(event) => void updateOrderStatus(order, event.target.value as AdminOrder["order_status"])}><option value={order.order_status}>{order.order_status}</option>{allowedNext.map((status) => <option value={status} key={status}>{status}</option>)}</select></label></div>
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
            <label className="admin-return-note">Internal note<textarea rows={2} maxLength={500} value={exchangeNotes[item.id] ?? item.admin_note ?? ""} onChange={(event) => setExchangeNotes((current) => ({ ...current, [item.id]: event.target.value }))} /></label>
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
            const setDraft = (patch: Partial<typeof draft>) => setReturnRefundDrafts((current) => ({ ...current, [item.id]: { ...draft, ...patch } }));
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
            {["owner", "manager"].includes(admin.role) && <button type="button" className="admin-secondary" onClick={() => startVehicleEditor(vehicle)}>Edit</button>}
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
              {(rental.cnic_front_uploaded || rental.cnic_back_uploaded) && <div className="admin-rental-documents"><strong>Private CNIC documents</strong>{rental.cnic_front_uploaded ? <span><a href={`/api/admin/rentals/${rental.id}/documents/cnic_front`} target="_blank" rel="noreferrer">View CNIC front</a>{["owner","manager"].includes(admin.role)&&<button type="button" className="admin-danger-button" disabled={busy} onClick={()=>void deleteRentalDocument(rental,"cnic_front")}>Delete</button>}</span> : <span>Front not uploaded</span>}{rental.cnic_back_uploaded ? <span><a href={`/api/admin/rentals/${rental.id}/documents/cnic_back`} target="_blank" rel="noreferrer">View CNIC back</a>{["owner","manager"].includes(admin.role)&&<button type="button" className="admin-danger-button" disabled={busy} onClick={()=>void deleteRentalDocument(rental,"cnic_back")}>Delete</button>}</span> : <span>Back not uploaded</span>}<small>Delete sensitive documents as soon as verification is complete and they are no longer required.</small></div>}
              <label className="admin-rental-note">Assign vehicle<select value={rental.vehicle_id ?? ""} disabled={busy} onChange={(e) => setRentals((current) => current.map((item) => item.id === rental.id ? { ...item, vehicle_id: e.target.value || null, vehicle_name: vehicles.find((vehicle) => vehicle.id === e.target.value)?.name ?? null } : item))}><option value="">Any / not assigned</option>{vehicles.filter((vehicle) => vehicle.status === "available").map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}</select></label>
              <p className="admin-muted">{rental.driver_option.replace("_", " ")} · {rental.rental_days ?? "—"} day(s) · {rental.estimated_daily_rate_paisa !== null && rental.estimated_daily_rate_paisa !== undefined ? `Rs. ${Math.round(rental.estimated_daily_rate_paisa / 100).toLocaleString("en-PK")} / day` : "Rate to confirm"} · {rental.estimated_total_paisa !== null && rental.estimated_total_paisa !== undefined ? `Estimated total Rs. ${Math.round(rental.estimated_total_paisa / 100).toLocaleString("en-PK")}` : "Total to confirm"}{rental.customer_note ? ` · ${rental.customer_note}` : ""}</p>
              {["owner", "manager"].includes(admin.role) && <label className="admin-rental-note">Internal note<input value={rental.admin_note} maxLength={500} onChange={(e) => setRentals((current) => current.map((item) => item.id === rental.id ? { ...item, admin_note: e.target.value } : item))} /></label>}
              <label className="admin-enquiry-action">Update status<select value={rental.status} disabled={busy || !next.length} onChange={(e) => void updateRentalStatus(rental, e.target.value as RentalRequest["status"])}><option value={rental.status}>{rental.status}</option>{next.map((status) => <option value={status} key={status}>{status}</option>)}</select></label>
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
              <div className="admin-enquiry-main"><div className="admin-enquiry-title"><strong>{enquiry.customer_name}</strong><span className="admin-enquiry-type">{enquiry.enquiry_type}</span><span className={`admin-enquiry-status status-${enquiry.status}`}>{enquiry.status}</span></div>
                <p>{enquiry.message}</p><div className="admin-enquiry-contact"><a href={`tel:${enquiry.phone}`}>{enquiry.phone}</a>{enquiry.email && <a href={`mailto:${enquiry.email}`}>{enquiry.email}</a>}<time dateTime={enquiry.created_at}>{new Date(enquiry.created_at).toLocaleString()}</time><a className="admin-secondary" href={whatsappHref(enquiry.phone, `Assalamu Alaikum ${enquiry.customer_name}, thank you for contacting De VERVE about ${enquiry.enquiry_type}. We are following up on your message. How may we help you?`)} target="_blank" rel="noreferrer">WhatsApp customer ↗</a></div>
              </div>
              <label className="admin-enquiry-action">Status<select value={enquiry.status} disabled={busy || !["owner", "manager", "orders", "rental"].includes(admin.role) || (admin.role === "rental" && enquiry.enquiry_type !== "rental")} onChange={(event) => void updateEnquiryStatus(enquiry, event.target.value as Enquiry["status"])}><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="closed">Closed</option><option value="spam">Spam</option></select></label>{enquiry.enquiry_type === "wholesale" && ["owner", "manager", "orders"].includes(admin.role) && <button type="button" className="admin-secondary" onClick={() => openQuoteEditor(enquiry)}>Prepare quote</button>}
            </article>)}</div>}
        </section>
        )}
        <section id="products" className="admin-panel">
          <div className="admin-panel-heading"><div><h2>Product catalogue</h2><p className="admin-muted">Manage product details, images and stock from one place.</p></div><select aria-label="Filter products" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All products</option><option value="published">Published</option><option value="draft">Drafts</option><option value="archived">Archived</option></select></div>
          {shownProducts.length === 0 ? <div className="admin-empty"><strong>No products here yet</strong><p>Start by adding a product. You can save it as a draft before publishing.</p>{canEditProducts && <button className="admin-primary" onClick={startNew}>Add your first product</button>}</div> :
            <div className="admin-product-list">{shownProducts.map((product) => <article className="admin-product-row" key={product.id}><div><strong>{product.name}</strong><span>{product.category} · {product.audience} · <i className={`status-${product.status}`}>{product.status}</i></span></div><div className="admin-row-actions"><button type="button" onClick={() => void openMediaLibrary(product)}>Images</button><button type="button" onClick={() => void openVariants(product)}>Variants & stock</button>{canEditProducts && <button type="button" onClick={() => startEdit(product)}>Edit</button>}{product.status !== "archived" && admin.role !== "catalogue" && <button type="button" className="admin-danger" onClick={() => void archiveProduct(product)}>Archive</button>}</div></article>)}</div>}
        </section>
        {showVehicleEditor && <div className="admin-modal-backdrop"><section className="admin-editor" role="dialog" aria-modal="true" aria-labelledby="vehicle-editor-title">
          <div className="admin-panel-heading"><div><p className="admin-eyebrow">DE VERVE MOBILITY</p><h2 id="vehicle-editor-title">{editingVehicleId ? "Edit vehicle" : "Add vehicle"}</h2></div><button type="button" className="admin-close" onClick={() => setShowVehicleEditor(false)} aria-label="Close">×</button></div>
          <form className="admin-form admin-product-form" onSubmit={saveVehicle}>
            <label>Vehicle name<input required minLength={2} maxLength={100} value={vehicleForm.name} onChange={(e) => setVehicleForm({ ...vehicleForm, name: e.target.value })} placeholder="e.g. Toyota Corolla 2022" /></label>
            <label>Vehicle type<input required maxLength={60} value={vehicleForm.vehicle_type} onChange={(e) => setVehicleForm({ ...vehicleForm, vehicle_type: e.target.value })} placeholder="Sedan, SUV, Van" /></label>
            <label>Transmission<select value={vehicleForm.transmission} onChange={(e) => setVehicleForm({ ...vehicleForm, transmission: e.target.value })}><option>Automatic</option><option>Manual</option><option>Unspecified</option></select></label>
            <label>Fuel type<select value={vehicleForm.fuel_type} onChange={(e) => setVehicleForm({ ...vehicleForm, fuel_type: e.target.value })}><option>Petrol</option><option>Diesel</option><option>Hybrid</option><option>Electric</option><option>Unspecified</option></select></label>
            <label>Seats<input type="number" required min="1" max="30" step="1" value={vehicleForm.seats} onChange={(e) => setVehicleForm({ ...vehicleForm, seats: e.target.value })} /></label>
            <label>Self-drive daily rate (PKR){vehicleForm.status === "available" && <span className="required-star" aria-hidden="true"> *</span>}<input type="number" min="0" step="1" required={vehicleForm.status === "available"} value={vehicleForm.daily_rate} onChange={(e) => setVehicleForm({ ...vehicleForm, daily_rate: e.target.value })} /></label>
            <label>With-driver daily rate (PKR){vehicleForm.status === "available" && <span className="required-star" aria-hidden="true"> *</span>}<input type="number" min="0" step="1" required={vehicleForm.status === "available"} value={vehicleForm.with_driver_daily_rate} onChange={(e) => setVehicleForm({ ...vehicleForm, with_driver_daily_rate: e.target.value })} /></label>
            <label>Status<select value={vehicleForm.status} onChange={(e) => setVehicleForm({ ...vehicleForm, status: e.target.value as Vehicle["status"] })}><option value="draft">Draft</option><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="retired">Retired</option></select></label>
            <label className="admin-full">Description<textarea rows={3} maxLength={1000} value={vehicleForm.description} onChange={(e) => setVehicleForm({ ...vehicleForm, description: e.target.value })} /></label>
            <label>Vehicle image from media library<select value={vehicleForm.image_key} onChange={(e)=>setVehicleForm({...vehicleForm,image_key:e.target.value})}><option value="">No image selected</option>{vehicleMediaAssets.map((asset)=><option key={asset.id} value={asset.id}>{asset.alt_text||asset.id.slice(0,8)}</option>)}</select></label>
            <label>Upload vehicle photo (JPG, PNG or WebP, max 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e)=>void uploadVehicleImage(e.target.files?.[0]??null)}/></label>
            {vehicleForm.image_key&&<img className="admin-vehicle-image-preview" src={"/api/admin/media/"+vehicleForm.image_key+"/file"} alt="Selected vehicle preview"/>}
            <div className="admin-form-actions"><button type="button" className="admin-secondary" onClick={() => setShowVehicleEditor(false)}>Cancel</button><button className="admin-primary" disabled={busy}>{busy ? "Saving…" : "Save vehicle"}</button></div>
          </form>
        </section></div>}
        {showQuoteEditor && <div className="admin-modal-backdrop"><section className="admin-editor admin-quote-editor" role="dialog" aria-modal="true" aria-labelledby="quote-editor-title">
          <div className="admin-panel-heading"><div><p className="admin-eyebrow">WHOLESALE SALES</p><h2 id="quote-editor-title">Prepare a quotation</h2><p className="admin-muted">Set the buyer details and agreed per-piece prices. Customer approval will reserve stock.</p></div><button type="button" className="admin-close" onClick={() => setShowQuoteEditor(false)} aria-label="Close">×</button></div>
          <form className="admin-form admin-product-form" onSubmit={submitWholesaleQuote}>
            <label>Business / shop name<input required minLength={2} maxLength={120} value={quoteForm.business_name} onChange={(e) => setQuoteForm({ ...quoteForm, business_name: e.target.value })} /></label>
            <label>Contact person<input required minLength={2} maxLength={100} value={quoteForm.contact_name} onChange={(e) => setQuoteForm({ ...quoteForm, contact_name: e.target.value })} /></label>
            <label>Phone / WhatsApp<input required maxLength={24} value={quoteForm.phone} onChange={(e) => setQuoteForm({ ...quoteForm, phone: e.target.value })} /></label>
            <label>Email (optional)<input type="email" maxLength={160} value={quoteForm.email} onChange={(e) => setQuoteForm({ ...quoteForm, email: e.target.value })} /></label>
            <label>Delivery city<input required maxLength={80} value={quoteForm.city} onChange={(e) => setQuoteForm({ ...quoteForm, city: e.target.value })} /></label>
            <label>Valid until<input type="date" required min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} value={quoteForm.valid_until} onChange={(e) => setQuoteForm({ ...quoteForm, valid_until: e.target.value })} /></label>
            <label className="admin-full">Delivery address<input required minLength={8} maxLength={300} value={quoteForm.delivery_address} onChange={(e) => setQuoteForm({ ...quoteForm, delivery_address: e.target.value })} /></label>
            <label className="admin-full">Notes (optional)<textarea rows={2} maxLength={500} value={quoteForm.customer_note} onChange={(e) => setQuoteForm({ ...quoteForm, customer_note: e.target.value })} /></label>
            <div className="admin-full admin-quote-line-editor"><div className="admin-panel-heading"><h3>Quoted products</h3><button type="button" className="admin-secondary" onClick={() => setQuoteLines((current) => [...current, { product_id: "", variant_id: "", quantity: "10", unit_price: "", variants: [] }])}>＋ Add line</button></div>
              {quoteLines.map((line, index) => <div className="admin-quote-draft-line" key={index}>
                <label>Published product<select required value={line.product_id} onChange={(e) => void changeQuoteProduct(index, e.target.value)}><option value="">Choose product</option>{products.filter((product) => product.status === "published").map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
                <label>Size / colour / SKU<select required value={line.variant_id} onChange={(e) => setQuoteLines((current) => current.map((item, i) => i === index ? { ...item, variant_id: e.target.value } : item))}><option value="">Choose option</option>{line.variants.map((variant) => <option key={variant.id} value={variant.id}>{[variant.size, variant.color, variant.sku].filter(Boolean).join(" · ") || "Standard"} · available {variant.available_quantity}</option>)}</select></label>
                <label>Quantity<input required type="number" min="1" max="10000" step="1" value={line.quantity} onChange={(e) => setQuoteLines((current) => current.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} /></label>
                <label>Unit price (PKR)<input required type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => setQuoteLines((current) => current.map((item, i) => i === index ? { ...item, unit_price: e.target.value } : item))} /></label>
                {quoteLines.length > 1 && <button type="button" className="admin-danger-button" onClick={() => setQuoteLines((current) => current.filter((_, i) => i !== index))}>Remove line</button>}
              </div>)}
            </div>
            <div className="admin-form-actions"><button type="button" className="admin-secondary" onClick={() => setShowQuoteEditor(false)}>Cancel</button><button className="admin-primary" disabled={busy}>{busy ? "Saving…" : "Save quotation"}</button></div>
          </form>
        </section></div>}
        {mediaProduct && <div className="admin-modal-backdrop"><section className="admin-editor admin-media-editor" role="dialog" aria-modal="true" aria-labelledby="media-editor-title">
          <div className="admin-panel-heading"><div><p className="admin-eyebrow">PRODUCT MEDIA</p><h2 id="media-editor-title">{mediaProduct.name}</h2><p className="admin-muted">Build a gallery with multiple photos and short MP4/WebM videos. Images: 5 MB max. Videos: 20 MB max.</p></div><button type="button" className="admin-close" onClick={() => setMediaProduct(null)} aria-label="Close">×</button></div>
          <form className="admin-form admin-media-upload" onSubmit={uploadMedia}>
            <label>Choose image or video<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={(event) => setMediaFile(event.target.files?.[0] ?? null)} /></label>
            <label>Media description<input value={mediaAlt} maxLength={240} onChange={(event) => setMediaAlt(event.target.value)} placeholder="e.g. Navy blue stretch hoodie, front view" /></label>
            <button className="admin-primary" disabled={busy || !mediaFile}>{busy ? "Please wait…" : "Upload media"}</button>
          </form>
          <h3 className="admin-media-subheading">Attached to this product ({productMedia.length})</h3>
          <div className="admin-media-grid">
            {productMedia.length === 0 ? <div className="admin-empty"><strong>No gallery items yet</strong><p>Add product photos or a short product video from your media library below.</p></div> : productMedia.map((asset) => <article className={(asset as MediaAsset & {is_primary?:number}).is_primary === 1 ? "admin-media-card is-selected" : "admin-media-card"} key={asset.id}>
              {asset.media_type === "video" ? <video src={asset.url} controls preload="metadata" /> : <img src={asset.url} alt={asset.alt_text || "Product media"} loading="lazy" />}
              <div><span>{asset.alt_text || (asset.media_type === "video" ? "Product video" : "Product image")}</span><small>{(asset.byte_size / 1024).toFixed(0)} KB · {(asset as MediaAsset & {is_primary?:number}).is_primary === 1 ? "Cover image" : asset.media_type}</small></div>
              <div className="admin-media-actions">{asset.media_type === "image" && <button type="button" disabled={busy || (asset as MediaAsset & {is_primary?:number}).is_primary === 1} className="admin-secondary" onClick={() => void attachMedia(asset, true)}>Set as cover</button>}<button type="button" disabled={busy} className="admin-danger-button" onClick={() => void removeProductMedia(asset)}>Remove</button></div>
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
          <div className="admin-panel-heading"><div><p className="admin-eyebrow">PRODUCT OPTIONS & INVENTORY</p><h2 id="variant-editor-title">{variantProduct.name}</h2><p className="admin-muted">Manage sizes, colours, SKUs and recorded stock movements.</p></div><button type="button" className="admin-close" onClick={() => { setVariantProduct(null); setStockTarget(null); setMovementTarget(null); }} aria-label="Close">×</button></div>
          <div className="admin-variant-list">{variants.length === 0 ? <div className="admin-empty"><strong>No variants yet</strong><p>Add a size, colour or SKU option to begin tracking stock.</p></div> : variants.map((variant) => <article className="admin-variant-row" key={variant.id}>
            <div><strong>{variant.sku || "No SKU"}</strong><span>{[variant.size, variant.color].filter(Boolean).join(" · ") || "General option"}</span><small>{variant.is_active ? "Active" : "Inactive"}</small></div>
            <div className="admin-variant-stock"><strong>{variant.available_quantity}</strong><span>available</span><small>{variant.reserved_quantity} reserved · {variant.stock_on_hand} physical</small></div>
            <button type="button" disabled={busy} onClick={() => void openMovementHistory(variant)}>History</button>{["owner", "manager", "orders"].includes(admin.role) && <button type="button" disabled={busy || !variant.is_active} onClick={() => { setStockTarget(variant); setStockForm({ movement_type: "received", quantity_delta: "", note: "" }); }}>Adjust stock</button>}
          </article>)}</div>
          {movementTarget && <section className="admin-movement-history"><div className="admin-panel-heading"><div><h3>Stock history</h3><p className="admin-muted">{movementTarget.sku || [movementTarget.size, movementTarget.color].filter(Boolean).join(" / ")}</p></div><button type="button" className="admin-secondary" onClick={() => setMovementTarget(null)}>Close history</button></div>
            {movements.length === 0 ? <p className="admin-muted">No stock movements recorded.</p> : <div className="admin-movement-list">{movements.map((movement) => <article key={movement.id}><div><strong>{movement.movement_type.replaceAll("_", " ")}</strong><span>{movement.note}</span><small>{movement.reference_type}{movement.reference_id ? ` · ${movement.reference_id}` : ""}</small></div><b className={movement.quantity_delta < 0 ? "movement-negative" : "movement-positive"}>{movement.quantity_delta > 0 ? "+" : ""}{movement.quantity_delta}</b><time dateTime={movement.created_at}>{new Date(movement.created_at).toLocaleString()}</time></article>)}</div>}
          </section>}
          {["owner", "manager", "catalogue"].includes(admin.role) && <form className="admin-form admin-variant-form" onSubmit={createVariant}>
            <h3>Add variant</h3><div className="admin-variant-fields">
              <label>SKU (optional)<input maxLength={64} placeholder="e.g. DV-HOOD-BLK-M" value={variantForm.sku} onChange={(e) => setVariantForm({ ...variantForm, sku: e.target.value })} /></label>
              <label>Size<input maxLength={32} placeholder="e.g. M, L, XL" value={variantForm.size} onChange={(e) => setVariantForm({ ...variantForm, size: e.target.value })} /></label>
              <label>Colour<input maxLength={32} placeholder="e.g. Black" value={variantForm.color} onChange={(e) => setVariantForm({ ...variantForm, color: e.target.value })} /></label>
              <label>Opening stock<input type="number" min="0" max="1000000" step="1" value={variantForm.initial_stock} onChange={(e) => setVariantForm({ ...variantForm, initial_stock: e.target.value })} /></label>
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
          <form className="admin-form admin-product-form" onSubmit={saveProduct}>
            <label>Product name<input required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: editingId ? form.slug : e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} /></label>
            <label>URL slug<input required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></label>
            <label>Category<input required minLength={2} maxLength={60} placeholder="e.g. Hoodies" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
            <label>For<select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as typeof form.audience })}><option value="men">Men</option><option value="women">Women</option><option value="kids">Kids</option><option value="unisex">Unisex</option></select></label>
            <label>Retail price (PKR, optional)<input type="number" min="0" step="1" value={form.retail_price_paisa} onChange={(e) => setForm({ ...form, retail_price_paisa: e.target.value })} /></label>
            <label>Wholesale price (PKR, optional)<input type="number" min="0" step="1" value={form.wholesale_price_paisa} onChange={(e) => setForm({ ...form, wholesale_price_paisa: e.target.value })} /></label>
            <label className="admin-full">Description<textarea rows={4} maxLength={4000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <div className="admin-full admin-seo-fields"><h3>Search engine preview</h3><p className="admin-muted">These fields appear in search results and social previews. Keep titles under 70 characters and descriptions under 160.</p><label>SEO title<input maxLength={70} value={form.seo_title} onChange={(e) => setForm({ ...form, seo_title: e.target.value })} placeholder={form.name || "Product name · De VERVE"} /></label><small>{form.seo_title.length}/70 characters</small><label>SEO description<textarea rows={2} maxLength={160} value={form.seo_description} onChange={(e) => setForm({ ...form, seo_description: e.target.value })} placeholder={form.description.slice(0,160) || "Describe this product clearly for search visitors."} /></label><small>{form.seo_description.length}/160 characters</small></div>
            <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })} disabled={admin.role === "catalogue"}><option value="draft">Save as draft</option><option value="published">Publish on website</option><option value="archived">Archived</option></select></label>
            <div className="admin-form-actions"><button type="button" className="admin-secondary" onClick={() => setShowEditor(false)}>Cancel</button><button className="admin-primary" disabled={busy}>{busy ? "Saving…" : "Save product"}</button></div>
          </form>
        </section></div>}
        {message && <p className="admin-message" role="status">{message}</p>}
      </section>
    </main>
  );
}
