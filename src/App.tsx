import { useMemo, useState } from "react";

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

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"retail" | "wholesale">("retail");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

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
        </section>

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
          <small>Prices, product availability, delivery, payment and rental terms are confirmed directly by the De VERVE team.</small>
        </section>
      </main>

      <footer className="site-footer">
        <a className="footer-wordmark" href="#home">De VERVE<span>.</span></a>
        <p>Elevate Your Style · Jhelum, Pakistan</p>
        <span>© 2026 DE VERVE. ALL RIGHTS RESERVED.</span>
      </footer>
      <a className="floating-whatsapp" href={whatsapp("Assalamu Alaikum, I would like to enquire about De VERVE.")} target="_blank" rel="noreferrer" aria-label="Chat with De VERVE on WhatsApp">✆</a>
    </div>
  );
}

export default App;
