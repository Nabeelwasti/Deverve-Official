import { useEffect, useState, type FormEvent } from "react";
import "./admin.css";

type AdminUser = { id: string; email: string; role: string };
type Product = {
  id: string; slug: string; name: string; description: string; category: string;
  audience: "men" | "women" | "kids" | "unisex"; status: "draft" | "published" | "archived";
  retail_price_paisa: number | null; wholesale_price_paisa: number | null;
};

type ProductForm = { name: string; slug: string; description: string; category: string; audience: Product["audience"]; status: Product["status"]; retail_price_paisa: string; wholesale_price_paisa: string };
type Overview = { published_products: number; draft_products: number; new_enquiries: number; pending_orders: number; rental_requests: number };
type Enquiry = { id: string; enquiry_type: "retail" | "wholesale" | "rental" | "general"; customer_name: string; phone: string; email: string | null; message: string; status: "new" | "contacted" | "qualified" | "closed" | "spam"; source: string; created_at: string };
type Variant = { id: string; product_id: string; sku: string | null; size: string; color: string; stock_on_hand: number; is_active: number };

const emptyProduct: ProductForm = {
  name: "", slug: "", description: "", category: "", audience: "unisex" as const,
  status: "draft" as const, retail_price_paisa: "", wholesale_price_paisa: "",
};

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
  const [checking, setChecking] = useState(true);
  const [setupMode, setSetupMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);\n  const [variantProduct, setVariantProduct] = useState<Product | null>(null);\n  const [variants, setVariants] = useState<Variant[]>([]);\n  const [variantForm, setVariantForm] = useState({ sku: "", size: "", color: "", initial_stock: "0" });\n  const [stockTarget, setStockTarget] = useState<Variant | null>(null);\n  const [stockForm, setStockForm] = useState({ movement_type: "received", quantity_delta: "", note: "" });
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
  const loadEnquiries = async () => {
    const result = await api<{ enquiries: Enquiry[] }>("/api/admin/enquiries?limit=50");
    setEnquiries(result.enquiries);
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
      if (admin.role !== "catalogue") tasks.push(loadEnquiries());
      void Promise.all(tasks).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not load dashboard data."));
    }
  }, [admin]);

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
    setForm({ name: product.name, slug: product.slug, description: product.description, category: product.category, audience: product.audience, status: product.status, retail_price_paisa: product.retail_price_paisa === null ? "" : String(product.retail_price_paisa / 100), wholesale_price_paisa: product.wholesale_price_paisa === null ? "" : String(product.wholesale_price_paisa / 100) });
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
  const canEditProducts = ["owner", "manager", "catalogue"].includes(admin.role);
  return (
    <main className="admin-screen admin-dashboard">
      <header className="admin-topbar">
        <a className="admin-brand" href="/">De VERVE<span>.</span><small>BUSINESS CONTROL CENTRE</small></a>
        <div className="admin-user"><span>{admin.email}<small>{admin.role}</small></span><button type="button" onClick={signOut} disabled={busy}>Sign out</button></div>
      </header>
      <section className="admin-content">
        <div className="admin-heading-row"><div><p className="admin-eyebrow">YOUR BUSINESS, ONE PLACE</p><h1>Overview</h1><p className="admin-muted">Manage your catalogue and keep your storefront up to date.</p></div>{canEditProducts && <button className="admin-primary" onClick={startNew}>＋ Add product</button>}</div>
        <div className="admin-stat-grid"><article><span>ALL PRODUCTS</span><strong>{products.length}</strong></article><article><span>PUBLISHED</span><strong>{overview.published_products}</strong></article><article><span>DRAFTS</span><strong>{overview.draft_products}</strong></article><article><span>NEW ENQUIRIES</span><strong>{overview.new_enquiries}</strong></article><article><span>PENDING ORDERS</span><strong>{overview.pending_orders}</strong></article><article><span>RENTAL REQUESTS</span><strong>{overview.rental_requests}</strong></article></div>
        {admin.role !== "catalogue" && (
        <section className="admin-panel admin-enquiry-panel">
          <div className="admin-panel-heading"><div><h2>Customer enquiries</h2><p className="admin-muted">Review retail, wholesale, rental and general enquiries received from your website.</p></div><span className="admin-enquiry-count">{enquiries.length} recent</span></div>
          {enquiries.length === 0 ? <div className="admin-empty"><strong>No enquiries yet</strong><p>New customer messages submitted through the website will appear here.</p></div> :
            <div className="admin-enquiry-list">{enquiries.map((enquiry) => <article className="admin-enquiry-row" key={enquiry.id}>
              <div className="admin-enquiry-main"><div className="admin-enquiry-title"><strong>{enquiry.customer_name}</strong><span className="admin-enquiry-type">{enquiry.enquiry_type}</span><span className={`admin-enquiry-status status-${enquiry.status}`}>{enquiry.status}</span></div>
                <p>{enquiry.message}</p><div className="admin-enquiry-contact"><a href={`tel:${enquiry.phone}`}>{enquiry.phone}</a>{enquiry.email && <a href={`mailto:${enquiry.email}`}>{enquiry.email}</a>}<time dateTime={enquiry.created_at}>{new Date(enquiry.created_at).toLocaleString()}</time></div>
              </div>
              <label className="admin-enquiry-action">Status<select value={enquiry.status} disabled={busy || !["owner", "manager", "orders", "rental"].includes(admin.role) || (admin.role === "rental" && enquiry.enquiry_type !== "rental")} onChange={(event) => void updateEnquiryStatus(enquiry, event.target.value as Enquiry["status"])}><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="closed">Closed</option><option value="spam">Spam</option></select></label>
            </article>)}</div>}
        </section>
        )}
        <section className="admin-panel">
          <div className="admin-panel-heading"><div><h2>Product catalogue</h2><p className="admin-muted">Add products now; photos and stock controls will be added in the next module.</p></div><select aria-label="Filter products" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All products</option><option value="published">Published</option><option value="draft">Drafts</option><option value="archived">Archived</option></select></div>
          {shownProducts.length === 0 ? <div className="admin-empty"><strong>No products here yet</strong><p>Start by adding a product. You can save it as a draft before publishing.</p>{canEditProducts && <button className="admin-primary" onClick={startNew}>Add your first product</button>}</div> :
            <div className="admin-product-list">{shownProducts.map((product) => <article className="admin-product-row" key={product.id}><div><strong>{product.name}</strong><span>{product.category} · {product.audience} · <i className={`status-${product.status}`}>{product.status}</i></span></div><div className="admin-row-actions"><button type="button" onClick={() => void openVariants(product)}>Variants & stock</button>{canEditProducts && <button type="button" onClick={() => startEdit(product)}>Edit</button>{product.status !== "archived" && admin.role !== "catalogue" && <button type="button" className="admin-danger" onClick={() => void archiveProduct(product)}>Archive</button>}</div></article>)}</div>}
        </section>
        {variantProduct && <div className="admin-modal-backdrop"><section className="admin-editor admin-variant-editor" role="dialog" aria-modal="true" aria-labelledby="variant-editor-title">
          <div className="admin-panel-heading"><div><p className="admin-eyebrow">PRODUCT OPTIONS & INVENTORY</p><h2 id="variant-editor-title">{variantProduct.name}</h2><p className="admin-muted">Manage sizes, colours, SKUs and recorded stock movements.</p></div><button type="button" className="admin-close" onClick={() => { setVariantProduct(null); setStockTarget(null); }} aria-label="Close">×</button></div>
          <div className="admin-variant-list">{variants.length === 0 ? <div className="admin-empty"><strong>No variants yet</strong><p>Add a size, colour or SKU option to begin tracking stock.</p></div> : variants.map((variant) => <article className="admin-variant-row" key={variant.id}>
            <div><strong>{variant.sku || "No SKU"}</strong><span>{[variant.size, variant.color].filter(Boolean).join(" · ") || "General option"}</span><small>{variant.is_active ? "Active" : "Inactive"}</small></div>
            <div className="admin-variant-stock"><strong>{variant.stock_on_hand}</strong><span>in stock</span></div>
            {["owner", "manager", "orders"].includes(admin.role) && <button type="button" disabled={busy || !variant.is_active} onClick={() => { setStockTarget(variant); setStockForm({ movement_type: "received", quantity_delta: "", note: "" }); }}>Adjust stock</button>}
          </article>)}</div>
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
            <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })} disabled={admin.role === "catalogue"}><option value="draft">Save as draft</option><option value="published">Publish on website</option><option value="archived">Archived</option></select></label>
            <div className="admin-form-actions"><button type="button" className="admin-secondary" onClick={() => setShowEditor(false)}>Cancel</button><button className="admin-primary" disabled={busy}>{busy ? "Saving…" : "Save product"}</button></div>
          </form>
        </section></div>}
        {message && <p className="admin-message" role="status">{message}</p>}
      </section>
    </main>
  );
}
