import { useEffect, useMemo, useState, type FormEvent } from "react";
import InstallPrompt from "./InstallPrompt";
import Admin from "./Admin";\nimport WholesaleQuote from "./WholesaleQuote";

const categories = [
  { id: "men", name: "Men's fashion", detail: "Everyday essentials, layers and relaxed fits", tag: "01", tone: "men" },
  { id: "women", name: "Women's fashion", detail: "Comfort-led looks for every day", tag: "02", tone: "women" },
  { id: "kids", name: "Kids' fashion", detail: "Easy styles for little personalities", tag: "03", tone: "kids" },
  { id: "essentials", name: "Everyday essentials", detail: "T-shirts, socks, boxers and more", tag: "04", tone: "essentials" },
  { id: "layers", name: "Hoodies & jackets", detail: "Sweatshirts, zippers and outer layers", tag: "05", tone: "layers" },
  { id: "bottoms", name: "Trousers & pants", detail: "Relaxed comfort, made for movement", tag: "06", tone: "bottoms" },
];

const phone = "923298684517";
const whatsapp = (message: string) => `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

type StoreVariant = { id: string; sku: string | null; size: string; color: string; available_quantity: number };
type StoreProduct = { id: string; slug: string; name: string; description: string; category: string; audience: string; retail_price_paisa: number | null; image_key: string | null; variants: StoreVariant[] };
type CartLine = { variant_id: string; product_id: string; name: string; sku: string | null; size: string; color: string; quantity: number; unit_price_paisa: number; available_quantity: number };

function Storefront() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"retail" | "wholesale">("retail");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [enquiry, setEnquiry] = useState({ name: "", phone: "", email: "", enquiryType: "general", message: "", website: "" });
  const [sending, setSending] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [checkoutResult, setCheckoutResult] = useState("");
  const [checkoutToken, setCheckoutToken] = useState(() => crypto.randomUUID());
  const [checkoutForm, setCheckoutForm] = useState({ customer_name: "", phone: "", email: "", delivery_address: "", city: "Jhelum", customer_note: "" });
  const [catalogueState, setCatalogueState] = useState<"loading" | "ready" | "empty" | "error">("loading");

  useEffect(() => {
    let active = true;
    const loadProducts = async () => {
      try {
        const response = await fetch("/api/products?limit=12", { headers: { accept: "application/json" } });
        if (!response.ok) throw new Error("Catalogue unavailable");
        const payload = await response.json() as { products?: typeof products };
        if (!Array.isArray(payload.products)) throw new Error("Invalid catalogue response");
        if (!active) return;
        setProducts(payload.products);
        setSelectedVariants(Object.fromEntries(payload.products.map((product) => [product.id, product.variants[0]?.id ?? ""])));
        setCatalogueState(payload.products.length ? "ready" : "empty");
      } catch {
        if (active) setCatalogueState("error");
      }
    };
    void loadProducts();
    return () => { active = false; };
  }, []);

  const formatPrice = (paisa: number | null) => paisa === null
    ? "Ask for price"
    : new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(paisa / 100);

  const cartSubtotal = cart.reduce((sum, item) => sum + item.unit_price_paisa * item.quantity, 0);
  const addToCart = (product: StoreProduct) => {
    const variantId = selectedVariants[product.id] || product.variants[0]?.id;
    const variant = product.variants.find((item) => item.id === variantId);
    if (!variant || product.retail_price_paisa === null) return;
    setCart((current) => {
      const existing = current.find((item) => item.variant_id === variant.id);
      if (existing) return current.map((item) => item.variant_id === variant.id ? { ...item, quantity: Math.min(item.quantity + 1, variant.available_quantity) } : item);
      return [...current, { variant_id: variant.id, product_id: product.id, name: product.name, sku: variant.sku, size: variant.size, color: variant.color, quantity: 1, unit_price_paisa: product.retail_price_paisa!, available_quantity: variant.available_quantity }];
    });
  };
  const changeCartQuantity = (variantId: string, quantity: number) => setCart((current) => current.map((item) => item.variant_id === variantId ? { ...item, quantity: Math.max(1, Math.min(item.available_quantity, quantity)) } : item));
  const removeCartItem = (variantId: string) => setCart((current) => current.filter((item) => item.variant_id !== variantId));
  const submitCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setCheckoutBusy(true); setCheckoutMessage(""); setCheckoutResult("");
    try {
      const response = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ ...checkoutForm, checkout_token: checkoutToken, items: cart.map((item) => ({ variant_id: item.variant_id, quantity: item.quantity })) }) });
      const result = await response.json() as { accepted?: boolean; error?: string; order_number?: string };
      if (!response.ok || !result.accepted || !result.order_number) throw new Error(result.error || "Your order could not be placed.");
      setCheckoutResult(result.order_number); setCart([]); setCheckoutToken(crypto.randomUUID());
      setCheckoutMessage("Your COD order request has been received. Our team will contact you to confirm delivery details.");
    } catch (error) { setCheckoutMessage(error instanceof Error ? error.message : "Checkout is unavailable. Please try again."); }
    finally { setCheckoutBusy(false); }
  };

  const submitEnquiry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setSubmitMessage("");
    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(enquiry),
      });
      const result = await response.json() as { accepted?: boolean; error?: string };
      if (!response.ok || !result.accepted) throw new Error(result.error || "Your enquiry could not be sent.");
      setSubmitMessage("Thank you. Your enquiry has been received.");
      setEnquiry({ name: "", phone: "", email: "", enquiryType: "general", message: "", website: "" });
    } catch (error) {
      setSubmitMessage(error instanceof Error ? error.message : "The enquiry service is not available yet. Please contact us on WhatsApp.");
    } finally {
      setSending(false);
    }
  };

  const visibleCategories = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? categories.filter((item) => `${item.name} ${item.detail}`.toLowerCase().includes(term))
      : categories;
    return showAll || term ? filtered : filtered.slice(0, 4);
  }, [search, showAll]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="site-shell">
      <div className="announcement">
        <span>JHELUM, PAKISTAN</span>
        <span>FASHION · WHOLESALE · CAR RENTALS</span>
        <a href={whatsapp("Assalamu Alaikum De VERVE, I would like to enquire.")} target="_blank" rel="noreferrer">WhatsApp us ↗</a>
      </div>

      <header className="site-header">
        <a className="brand-lockup" href="#home" aria-label="De VERVE home" onClick={closeMenu}>
          <span className="brand-symbol">DV</span>
          <span className="brand-type"><strong>De VERVE</strong><small>ELEVATE YOUR STYLE</small></span>
        </a>
        <button className="menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          <span /><span />
        </button>
        <nav className={menuOpen ? "main-nav is-open" : "main-nav"} aria-label="Main navigation">
          <a href="#collections" onClick={closeMenu}>Fashion</a>
          <a href="#wholesale" onClick={closeMenu}>Wholesale</a>
          <a href="#mobility" onClick={closeMenu}>Car rental</a>
          <a href="#about" onClick={closeMenu}>Our story</a>
          <a href="#contact" onClick={closeMenu}>Contact</a>
        </nav>
        <a className="header-cta" href={whatsapp("Assalamu Alaikum, I would like to contact De VERVE.")} target="_blank" rel="noreferrer">Let's talk <span>↗</span></a>
      </header>

      <main id="home">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> FASHION · LIFESTYLE · MOBILITY</p>
            <h1>Elevate<br /><em>your style.</em></h1>
            <p className="hero-description">Everyday fashion for men, women and kids. Explore our garment collections, connect for wholesale enquiries, or talk to our team about your next journey.</p>
            <div className="hero-actions">
              <a className="button button-primary" href="#collections">Explore fashion <span>↗</span></a>
              <a className="text-link" href="#wholesale">Wholesale enquiries →</a>
            </div>
            <div className="hero-footnote"><span className="blue-dot" /> YOUR EVERYDAY VERVE · JHELUM, PAKISTAN</div>
          </div>
          <div className="hero-art" aria-label="De VERVE apparel collection artwork">
            <div className="hero-art-glow" />
            <div className="hero-art-word">VERVE<span>.</span></div>
            <div className="hero-garment hero-garment-one"><i /></div>
            <div className="hero-garment hero-garment-two"><i /></div>
            <div className="hero-garment hero-garment-three"><i /></div>
            <div className="hero-art-label"><strong>THE EVERYDAY EDIT</strong><span>FASHION / COMFORT / CONFIDENCE</span></div>
            <div className="hero-art-index">DV — 001</div>
          </div>
          <div className="hero-bottom"><span>DE VERVE / 001</span><span>FASHION · WHOLESALE · MOBILITY</span><a href="#collections">SCROLL TO EXPLORE ↓</a></div>
        </section>

        <section className="intro-strip" id="about">
          <p>MORE THAN A LOOK.<br /><strong>YOUR EVERYDAY VERVE.</strong></p>
          <p>We bring fashion and mobility together with a simple promise: clear communication, considered choices and a better everyday experience.</p>
          <span className="intro-mark">DV<span>.</span></span>
        </section>

        <section className="section collections-section" id="collections">
          <div className="section-heading">
            <div><p className="eyebrow">01 — THE FASHION EDIT</p><h2>Find your<br /><em>everyday favourite.</em></h2></div>
            <div className="catalogue-tools">
              <p className="section-aside">Explore our garment categories.<br />Ask our team for current stock and sizes.</p>
              <label className="catalogue-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a category..." aria-label="Search fashion categories" /></label>
            </div>
          </div>
          <div className="collection-grid">
            {visibleCategories.map((item) => (
              <article className={`collection-card ${item.tone}`} key={item.id}>
                <a className="collection-art" href={whatsapp(`Assalamu Alaikum, please share available ${item.name} at De VERVE.`)} target="_blank" rel="noreferrer" aria-label={`Enquire about ${item.name}`}>
                  <span className="category-tag">{item.tag} / DE VERVE</span>
                  <span className="category-garment"><i /></span>
                  <span className="category-art-word">{item.id === "essentials" ? "DAILY" : item.id.toUpperCase()}</span>
                  <span className="category-arrow">↗</span>
                </a>
                <div className="collection-meta"><div><span className="category-number">{item.tag} / 06</span><h3>{item.name}</h3><p>{item.detail}</p></div><a href={whatsapp(`I am interested in ${item.name}. Please share availability.`)} target="_blank" rel="noreferrer" aria-label={`Ask about ${item.name}`}>↗</a></div>
              </article>
            ))}
            {visibleCategories.length === 0 && <p className="empty-search">No matching category. Try “hoodies”, “kids” or “trousers”.</p>}
          </div>
          {!search && <button className="catalogue-more" type="button" onClick={() => setShowAll(!showAll)}>{showAll ? "Show less ↑" : "Explore all categories ↓"}</button>}
          <p className="catalogue-note">Category artwork is illustrative. Product photographs, prices, sizes and live stock will be added to the catalogue after the inventory is entered.</p>
          <div className="live-catalogue" aria-live="polite">
            <div className="live-catalogue-heading">
              <div><p className="eyebrow">LIVE FROM OUR CATALOGUE</p><h3>Featured pieces</h3></div>
              <div className="live-catalogue-actions"><span>REAL LISTINGS · UPDATED BY OUR TEAM</span><button type="button" className="cart-open-button" disabled={!cart.length} onClick={() => { setCheckoutOpen(true); setCheckoutMessage(""); setCheckoutResult(""); }}>Cart ({cart.reduce((sum, item) => sum + item.quantity, 0)}) · {formatPrice(cartSubtotal)}</button></div>
            </div>
            {catalogueState === "loading" && <p className="catalogue-feedback">Loading available listings…</p>}
            {catalogueState === "error" && <p className="catalogue-feedback">The live catalogue is not connected yet. Please contact our team for current collections.</p>}
            {catalogueState === "empty" && <p className="catalogue-feedback">New pieces are being added. Contact us to ask about current arrivals and availability.</p>}
            {catalogueState === "ready" && <div className="product-grid">
              {products.map((product) => (
                <article className="product-card" key={product.id}>
                  {product.image_key ? <div className="product-visual product-photo"><img src={`/media/${product.image_key}`} alt={product.name} loading="lazy" /></div> : <div className="product-visual" aria-hidden="true"><span>DE VERVE</span><div className="product-garment"><i /></div><small>{product.category}</small></div>}
                  <div className="product-info">
                    <span className="product-audience">{product.audience} · {product.category}</span>
                    <h4>{product.name}</h4>
                    <p>{product.description || "Contact our team for product details and available options."}</p>
                    {product.variants.length ? <label className="product-variant-select"><span>SIZE / COLOUR</span><select value={selectedVariants[product.id] || product.variants[0].id} onChange={(event) => setSelectedVariants((current) => ({ ...current, [product.id]: event.target.value }))}>{product.variants.map((variant) => <option key={variant.id} value={variant.id}>{[variant.size, variant.color].filter(Boolean).join(" / ") || "Standard"} · {variant.available_quantity} available</option>)}</select></label> : <span className="product-stock-note">Contact us for current availability</span>}
                    <div className="product-buy-row"><strong>{formatPrice(product.retail_price_paisa)}</strong>{product.variants.length && product.retail_price_paisa !== null ? <button type="button" onClick={() => addToCart(product)}>Add to cart +</button> : <a href={whatsapp(`Assalamu Alaikum, I am interested in ${product.name}. Please confirm current sizes, colours, price and availability.`)} target="_blank" rel="noreferrer">Enquire ↗</a>}</div>
                  </div>
                </article>
              ))}
            </div>}
          </div>
        </section>

        {checkoutOpen && <div className="checkout-backdrop"><section className="checkout-panel" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
          <div className="checkout-heading"><div><p className="eyebrow">SECURE ORDER REQUEST</p><h2 id="checkout-title">Cash on delivery</h2><p>Review your items and enter your delivery details.</p></div><button type="button" aria-label="Close checkout" onClick={() => setCheckoutOpen(false)}>×</button></div>
          {checkoutResult ? <div className="checkout-success"><strong>Order received</strong><span>{checkoutResult}</span><p>{checkoutMessage}</p><button type="button" className="button button-primary" onClick={() => setCheckoutOpen(false)}>Continue shopping</button></div> : <form className="checkout-form" onSubmit={submitCheckout}>
            <div className="checkout-items">{cart.map((item) => <div className="checkout-item" key={item.variant_id}><div><strong>{item.name}</strong><span>{[item.size, item.color].filter(Boolean).join(" / ") || item.sku || "Standard"}</span><small>{formatPrice(item.unit_price_paisa)} each</small></div><div className="checkout-quantity"><button type="button" aria-label="Decrease quantity" onClick={() => item.quantity === 1 ? removeCartItem(item.variant_id) : changeCartQuantity(item.variant_id, item.quantity - 1)}>−</button><span>{item.quantity}</span><button type="button" aria-label="Increase quantity" disabled={item.quantity >= item.available_quantity} onClick={() => changeCartQuantity(item.variant_id, item.quantity + 1)}>+</button></div><strong>{formatPrice(item.unit_price_paisa * item.quantity)}</strong></div>)}</div>
            <div className="checkout-total"><span>Subtotal</span><strong>{formatPrice(cartSubtotal)}</strong><span>Delivery fee</span><strong>Confirmed by our team</strong><span>Payment</span><strong>Cash on delivery</strong></div>
            <div className="checkout-fields">
              <label>Full name<input required minLength={2} maxLength={100} autoComplete="name" value={checkoutForm.customer_name} onChange={(event) => setCheckoutForm({ ...checkoutForm, customer_name: event.target.value })} /></label>
              <label>Phone / WhatsApp<input required type="tel" minLength={8} maxLength={24} autoComplete="tel" value={checkoutForm.phone} onChange={(event) => setCheckoutForm({ ...checkoutForm, phone: event.target.value })} /></label>
              <label>Email (optional)<input type="email" maxLength={160} autoComplete="email" value={checkoutForm.email} onChange={(event) => setCheckoutForm({ ...checkoutForm, email: event.target.value })} /></label>
              <label>City<input required minLength={2} maxLength={80} autoComplete="address-level2" value={checkoutForm.city} onChange={(event) => setCheckoutForm({ ...checkoutForm, city: event.target.value })} /></label>
              <label className="checkout-address">Complete delivery address<textarea required minLength={8} maxLength={300} rows={3} autoComplete="street-address" value={checkoutForm.delivery_address} onChange={(event) => setCheckoutForm({ ...checkoutForm, delivery_address: event.target.value })} /></label>
              <label className="checkout-address">Order note (optional)<textarea maxLength={500} rows={2} value={checkoutForm.customer_note} onChange={(event) => setCheckoutForm({ ...checkoutForm, customer_note: event.target.value })} /></label>
            </div>
            <p className="checkout-disclaimer">No online payment is collected. Delivery charges and final availability are confirmed by De VERVE before dispatch.</p>
            {checkoutMessage && <p className="checkout-message" role="alert">{checkoutMessage}</p>}
            <button type="submit" className="button button-primary checkout-submit" disabled={checkoutBusy || !cart.length}>{checkoutBusy ? "Placing order…" : "Place COD order"} <span>↗</span></button>
          </form>}
        </section></div>}

        <section className="wholesale-section" id="wholesale">
          <div className="wholesale-art">
            <div className="wholesale-art-mark">DV<span>.</span></div>
            <span className="wholesale-caption">YOUR STORE. YOUR STYLE.<br />YOUR BUSINESS PARTNER.</span>
          </div>
          <div className="wholesale-copy">
            <p className="eyebrow">02 — RETAIL & WHOLESALE</p>
            <h2>Shop your way.<br /><em>Grow your business.</em></h2>
            <div className="shopping-tabs" role="tablist" aria-label="Shopping options">
              <button type="button" role="tab" aria-selected={activeTab === "retail"} className={activeTab === "retail" ? "active" : ""} onClick={() => setActiveTab("retail")}>Retail</button>
              <button type="button" role="tab" aria-selected={activeTab === "wholesale"} className={activeTab === "wholesale" ? "active" : ""} onClick={() => setActiveTab("wholesale")}>Wholesale</button>
            </div>
            {activeTab === "retail" ? (
              <div className="tab-panel"><h3>Find the right look.</h3><p>Tell us what you are looking for and our team will help with available styles, sizes and pricing. Product details are confirmed before an order is accepted.</p><a className="text-link" href={whatsapp("Assalamu Alaikum, I have a retail product enquiry.")} target="_blank" rel="noreferrer">Ask about a product ↗</a></div>
            ) : (
              <div className="tab-panel"><h3>Buying for your business?</h3><p>Share the garment types and quantities you need. Our team can discuss available lots, wholesale options and a quotation.</p><a className="text-link" href={whatsapp("Assalamu Alaikum, I am interested in wholesale garments. Please guide me about available lots and rates.")} target="_blank" rel="noreferrer">Request a wholesale quote ↗</a></div>
            )}
          </div>
        </section>

        <section className="mobility-section" id="mobility">
          <div><p className="eyebrow">03 — DE VERVE MOBILITY</p><h2>Make room for<br /><em>the journey.</em></h2></div>
          <div className="mobility-copy"><span className="mobility-icon">↗</span><p>Need a car for your next trip? Contact De VERVE about self-drive or chauffeur-driven rental options. Vehicle availability, rates, documents and rental terms are confirmed by our team.</p><a className="button button-light" href={whatsapp("Assalamu Alaikum, I would like information about De VERVE car rentals. Please share available vehicles, rates and terms.")} target="_blank" rel="noreferrer">Enquire about a rental <span>↗</span></a></div>
        </section>

        <section className="contact-section" id="contact">
          <p className="eyebrow">04 — VISIT OR CONTACT</p>
          <h2>Let's make it<br /><em>happen.</em></h2>
          <p>For fashion, wholesale or car rental enquiries, connect with De VERVE in Jhelum.</p>
          <div className="contact-details">
            <div><span>VISIT OUR STORE</span><strong>Kachahri Road, near Khawateen College,<br />opposite Ali Mobile, basement of Ali Plaza,<br />Jhelum, Pakistan</strong></div>
            <div><span>CALL / WHATSAPP</span><strong>+92 329 8684517<br />+92 319 7553705</strong></div>
            <div><span>OUR SERVICES</span><strong>Fashion retail · Wholesale · Car rentals</strong></div>
          </div>
          <div className="contact-actions">
            <a className="button button-primary" href={whatsapp("Assalamu Alaikum De VERVE, I would like to enquire.")} target="_blank" rel="noreferrer">Chat on WhatsApp <span>↗</span></a>
            <a className="button button-outline" href="https://www.google.com/maps/search/?api=1&query=Ali+Plaza+Kachahri+Road+Jhelum+Pakistan" target="_blank" rel="noreferrer">Find our location <span>↗</span></a>
          </div>
          <form className="enquiry-form" onSubmit={submitEnquiry}>
            <h3>Send us an enquiry</h3>
            <div className="enquiry-fields">
              <label>Your name<input required minLength={2} maxLength={100} autoComplete="name" value={enquiry.name} onChange={(event) => setEnquiry({ ...enquiry, name: event.target.value })} /></label>
              <label>Phone / WhatsApp<input required type="tel" minLength={8} maxLength={24} autoComplete="tel" value={enquiry.phone} onChange={(event) => setEnquiry({ ...enquiry, phone: event.target.value })} /></label>
              <label>Email (optional)<input type="email" maxLength={160} autoComplete="email" value={enquiry.email} onChange={(event) => setEnquiry({ ...enquiry, email: event.target.value })} /></label>
              <label>Enquiry type<select value={enquiry.enquiryType} onChange={(event) => setEnquiry({ ...enquiry, enquiryType: event.target.value })}><option value="general">General</option><option value="retail">Retail fashion</option><option value="wholesale">Wholesale</option><option value="rental">Car rental</option></select></label>
              <label className="enquiry-message">How can we help?<textarea required minLength={5} maxLength={3000} rows={4} value={enquiry.message} onChange={(event) => setEnquiry({ ...enquiry, message: event.target.value })} /></label>
              <label className="form-trap" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={enquiry.website} onChange={(event) => setEnquiry({ ...enquiry, website: event.target.value })} /></label>
            </div>
            <div className="enquiry-submit"><button className="button button-primary" type="submit" disabled={sending}>{sending ? "Sending..." : "Send enquiry"} <span>↗</span></button><p role="status" aria-live="polite">{submitMessage}</p></div>
          </form>
          <small>Prices, product availability, delivery, payment and rental terms are confirmed directly by the De VERVE team.</small>
        </section>
      </main>

      <footer className="site-footer">
        <a className="footer-wordmark" href="#home">De VERVE<span>.</span></a>
        <p>Elevate Your Style · Jhelum, Pakistan</p>
        <span>© 2026 DE VERVE. ALL RIGHTS RESERVED.</span>
      </footer>
      <InstallPrompt />
      <a className="floating-whatsapp" href={whatsapp("Assalamu Alaikum, I would like to enquire about De VERVE.")} target="_blank" rel="noreferrer" aria-label="Chat with De VERVE on WhatsApp">✆</a>
    </div>
  );
}

export default function App() {
  return window.location.pathname.startsWith("/admin") ? <Admin /> : window.location.pathname.startsWith("/wholesale/quote/") ? <WholesaleQuote /> : <Storefront />;
}

