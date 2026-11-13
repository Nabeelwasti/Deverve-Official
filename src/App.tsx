import { useState } from "react";

const categories = [
  { number: "01", name: "T-shirts", detail: "Everyday staples", visual: "tee" },
  { number: "02", name: "Hoodies & sweatshirts", detail: "Layers for every season", visual: "hoodie" },
  { number: "03", name: "Trousers & pants", detail: "Comfort in motion", visual: "trouser" },
  { number: "04", name: "Jackets & zippers", detail: "The finishing layer", visual: "jacket" },
  { number: "05", name: "Socks & essentials", detail: "The details matter", visual: "socks" },
  { number: "06", name: "Kidswear", detail: "Everyday looks for little ones", visual: "kids" },
];

function GarmentVisual({ kind }: { kind: string }) {
  return <div className={`garment-art garment-${kind}`} aria-hidden="true">
    <span className="garment-shape" />
    <span className="garment-highlight" />
    <span className="garment-code">DV / EDIT</span>
  </div>;
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"retail" | "wholesale">("retail");
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="site-shell">
      <div className="announcement">
        <span>DE VERVE · JHELUM, PAKISTAN</span>
        <span>FASHION · RETAIL · WHOLESALE · CAR RENTALS</span>
        <a href="#contact">Connect with us <span aria-hidden="true">↗</span></a>
      </div>

      <header className="site-header">
        <a className="brand-lockup" href="#home" aria-label="De VERVE home" onClick={closeMenu}>
          <img src="/brand/de-verve-logo.svg" alt="De VERVE" />
          <span><strong>De VERVE</strong><small>ELEVATE YOUR STYLE</small></span>
        </a>
        <button className="menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          <span /><span />
        </button>
        <nav className={menuOpen ? "main-nav is-open" : "main-nav"} aria-label="Main navigation">
          <a href="#collections" onClick={closeMenu}>Fashion</a>
          <a href="#wholesale" onClick={closeMenu}>Wholesale</a>
          <a href="#mobility" onClick={closeMenu}>Car rental</a>
          <a href="#about" onClick={closeMenu}>About</a>
        </nav>
        <a className="header-cta" href="#contact">Get in touch <span aria-hidden="true">↗</span></a>
      </header>

      <main id="home">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> STYLE THAT MOVES WITH YOU · JHELUM</p>
            <h1>Wear your<br /><em>better self.</em></h1>
            <p className="hero-description">Discover everyday fashion for men, women and kids — from relaxed essentials to statement layers. Shop retail or connect with us for wholesale enquiries.</p>
            <div className="hero-actions">
              <a className="button button-primary" href="#collections">Explore fashion <span aria-hidden="true">↗</span></a>
              <a className="text-link" href="#wholesale">Wholesale enquiries <span aria-hidden="true">→</span></a>
            </div>
            <div className="hero-footnote"><span className="blue-dot" /> FASHION FOR EVERY DAY · JHELUM, PAKISTAN</div>
          </div>
          <div className="hero-art" aria-label="Original De VERVE fashion artwork">
            <div className="hero-disc"><img src="/brand/de-verve-logo.svg" alt="" /></div>
            <div className="hero-ribbon"><span>FASHION</span><span>COMFORT</span><span>CONFIDENCE</span></div>
            <div className="hero-side-note">THE EVERYDAY EDIT — DV / 01</div>
            <div className="hero-mini-card"><span>YOUR STYLE.</span><strong>YOUR VERVE.</strong><small>EST. JHELUM · PAKISTAN</small></div>
          </div>
          <div className="hero-bottom"><span>DE VERVE / 001</span><span>FASHION · LIFESTYLE · MOBILITY</span><a href="#collections">SCROLL TO EXPLORE ↓</a></div>
        </section>

        <section className="intro-strip" id="about">
          <p>MORE THAN A LOOK.<br /><strong>YOUR EVERYDAY VERVE.</strong></p>
          <p>De VERVE brings fashion and mobility together with a simple promise: a better experience, clear communication and style for everyday life.</p>
          <span className="intro-mark">DV<span>.</span></span>
        </section>

        <section className="section collections-section" id="collections">
          <div className="section-heading">
            <div><p className="eyebrow">01 — THE FASHION EDIT</p><h2>Find your<br /><em>everyday favourite.</em></h2></div>
            <p className="section-aside">For men, women and kids.<br />Explore the categories and ask our team about availability.</p>
          </div>
          <div className="collection-grid">
            {categories.map((item) => (
              <article className="collection-card" key={item.number}>
                <GarmentVisual kind={item.visual} />
                <div className="collection-meta"><div><span className="category-number">{item.number} / 06</span><h3>{item.name}</h3><p>{item.detail}</p></div><a href="#contact" aria-label={`Enquire about ${item.name}`}>↗</a></div>
              </article>
            ))}
          </div>
          <p className="catalogue-note">Illustrative category artwork. Product photos, sizes, prices and live stock will appear when the verified catalogue is added.</p>
        </section>

        <section className="wholesale-section" id="wholesale">
          <div className="wholesale-art">
            <img src="/brand/de-verve-logo.svg" alt="" />
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
              <div className="tab-panel"><h3>Find the right look.</h3><p>Browse our fashion categories and contact the team about a product, size or current availability. We’ll confirm the details before an order is placed.</p><a className="text-link" href="#contact">Ask about a product →</a></div>
            ) : (
              <div className="tab-panel"><h3>Buying for your business?</h3><p>Tell us the garment types and quantities you are looking for. Our team can discuss available lots, wholesale options and a quotation.</p><a className="text-link" href="#contact">Request a wholesale enquiry →</a></div>
            )}
          </div>
        </section>

        <section className="mobility-section" id="mobility">
          <div><p className="eyebrow">03 — DE VERVE MOBILITY</p><h2>Make room for<br /><em>the journey.</em></h2></div>
          <div className="mobility-copy"><span className="mobility-icon">↗</span><p>Alongside fashion, De VERVE also handles car rental enquiries. Contact our team to discuss your journey, vehicle requirements and rental details. Availability and terms are confirmed directly.</p><a className="button button-light" href="#contact">Ask about car rentals <span aria-hidden="true">↗</span></a></div>
        </section>

        <section className="contact-section" id="contact">
          <p className="eyebrow">04 — VISIT OR CONTACT</p>
          <h2>Let's make it<br /><em>happen.</em></h2>
          <p>For fashion, wholesale or car rental enquiries, connect with De VERVE in Jhelum.</p>
          <div className="contact-details">
            <div><span>FIND US</span><strong>Kachahri Road, near Khawateen College,<br />opposite Ali Mobile, basement of Ali Plaza,<br />Jhelum, Pakistan</strong></div>
            <div><span>WHAT WE DO</span><strong>Fashion retail · Wholesale · Car rentals</strong></div>
          </div>
          <a className="button button-primary" href="https://www.google.com/maps/search/?api=1&query=Ali+Plaza+Kachahri+Road+Jhelum+Pakistan" target="_blank" rel="noreferrer">Find our location <span aria-hidden="true">↗</span></a>
          <small>Product availability, pricing, delivery and rental terms are confirmed by the De VERVE team.</small>
        </section>
      </main>

      <footer className="site-footer">
        <a className="footer-wordmark" href="#home">De VERVE<span>.</span></a>
        <p>Elevate Your Style · Jhelum, Pakistan</p>
        <span>© 2026 DE VERVE. ALL RIGHTS RESERVED.</span>
      </footer>
    </div>
  );
}

export default App;
