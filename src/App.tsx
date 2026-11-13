import { useState } from "react";

const collections = [
  { name: "Everyday essentials", note: "Easy-to-wear pieces for every day", tag: "01", tone: "sand" },
  { name: "Streetwear layers", note: "Hoodies, sweatshirts and relaxed fits", tag: "02", tone: "blue" },
  { name: "The finishing edit", note: "Small details that complete the look", tag: "03", tone: "ice" },
];

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"retail" | "wholesale">("retail");

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="site-shell">
      <div className="announcement">
        <span>DE VERVE · JHELUM</span>
        <span>Fashion for every day. Confidence in every detail.</span>
        <a href="#contact">Get in touch <span aria-hidden="true">↗</span></a>
      </div>

      <header className="site-header">
        <a className="wordmark" href="#home" aria-label="De VERVE home" onClick={closeMenu}>
          <span>DE</span> VERVE<span className="wordmark-dot">.</span>
          <small>FASHION & MOBILITY</small>
        </a>
        <button className="menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          <span /><span />
        </button>
        <nav className={menuOpen ? "main-nav is-open" : "main-nav"} aria-label="Main navigation">
          <a href="#collections" onClick={closeMenu}>Collections</a>
          <a href="#wholesale" onClick={closeMenu}>Wholesale</a>
          <a href="#mobility" onClick={closeMenu}>Car rental</a>
          <a href="#about" onClick={closeMenu}>Our story</a>
        </nav>
        <a className="header-cta" href="#contact">Let's talk <span aria-hidden="true">↗</span></a>
      </header>

      <main id="home">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> THE DE VERVE EDIT · JHELUM, PAKISTAN</p>
            <h1>Own your<br /><em>everyday.</em></h1>
            <p className="hero-description">A considered collection of everyday fashion, made for your pace, your plans and your point of view.</p>
            <div className="hero-actions">
              <a className="button button-primary" href="#collections">Explore the edit <span aria-hidden="true">↗</span></a>
              <a className="text-link" href="#wholesale">Shop wholesale <span aria-hidden="true">→</span></a>
            </div>
            <div className="hero-footnote"><span className="blue-dot" /> RETAIL · WHOLESALE · JHELUM</div>
          </div>
          <div className="hero-art" aria-label="Abstract blue fashion editorial artwork">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-panel panel-back"><span>VERVE</span></div>
            <div className="art-panel panel-front"><span className="panel-index">DV / 001</span><span className="panel-title">THE<br /><i>NEW</i><br />EVERYDAY</span><span className="panel-caption">A DIFFERENT KIND OF ENERGY.</span></div>
            <div className="art-stamp">D<br />V</div>
            <span className="art-side-label">STYLE IN MOTION — 2026</span>
          </div>
          <div className="hero-bottom"><span>01 / 03</span><span>DISCOVER A MORE VERSATILE WARDROBE</span><span>SCROLL TO EXPLORE ↓</span></div>
        </section>

        <section className="intro-strip" id="about">
          <p>MORE THAN A LOOK.<br /><strong>A WAY TO MOVE.</strong></p>
          <p>De VERVE brings fashion and everyday mobility together through a customer-first experience rooted in Jhelum.</p>
          <span className="intro-mark">DV<span>.</span></span>
        </section>

        <section className="section collections-section" id="collections">
          <div className="section-heading">
            <div><p className="eyebrow">01 — FIND YOUR VERVE</p><h2>Made for your<br /><em>everyday rhythm.</em></h2></div>
            <p className="section-aside">Versatile styles. Thoughtful choices.<br />A fresh point of view on everyday wear.</p>
          </div>
          <div className="collection-grid">
            {collections.map((item) => (
              <article className={`collection-card ${item.tone}`} key={item.tag}>
                <div className="collection-visual">
                  <span className="collection-number">{item.tag} / 03</span>
                  <span className="visual-word">{item.name === "Everyday essentials" ? "FORM" : item.name === "Streetwear layers" ? "MOVE" : "DETAIL"}</span>
                  <span className="visual-symbol" aria-hidden="true">{item.tag === "01" ? "◒" : item.tag === "02" ? "✳" : "＋"}</span>
                </div>
                <div className="collection-meta"><div><h3>{item.name}</h3><p>{item.note}</p></div><a href="#contact" aria-label={`Enquire about ${item.name}`}>↗</a></div>
              </article>
            ))}
          </div>
          <p className="catalogue-note">A preview of the De VERVE direction. Product photos, sizes, prices and live stock will be added after the catalogue is confirmed.</p>
        </section>

        <section className="wholesale-section" id="wholesale">
          <div className="wholesale-art"><span className="wholesale-big">D/V</span><span className="wholesale-caption">BUILT FOR BUSINESS<br />AND EVERYDAY STYLE</span></div>
          <div className="wholesale-copy">
            <p className="eyebrow">02 — FOR EVERY KIND OF CUSTOMER</p>
            <h2>One destination.<br /><em>More ways to shop.</em></h2>
            <div className="shopping-tabs" role="tablist" aria-label="Shopping options">
              <button type="button" role="tab" aria-selected={activeTab === "retail"} className={activeTab === "retail" ? "active" : ""} onClick={() => setActiveTab("retail")}>Retail</button>
              <button type="button" role="tab" aria-selected={activeTab === "wholesale"} className={activeTab === "wholesale" ? "active" : ""} onClick={() => setActiveTab("wholesale")}>Wholesale</button>
            </div>
            {activeTab === "retail" ? (
              <div className="tab-panel"><h3>Your style, your way.</h3><p>Explore the collection, discover your fit and send an order enquiry. Our team will confirm availability and delivery details with you.</p><a className="text-link" href="#contact">Ask about an item →</a></div>
            ) : (
              <div className="tab-panel"><h3>Stock up with confidence.</h3><p>Looking for garments in quantity? Tell us what you need and our team will help with available styles, quantity options and a wholesale quotation.</p><a className="text-link" href="#contact">Request wholesale details →</a></div>
            )}
          </div>
        </section>

        <section className="mobility-section" id="mobility">
          <div><p className="eyebrow">03 — THE JOURNEY, YOUR WAY</p><h2>Fashion meets<br /><em>the freedom to move.</em></h2></div>
          <div className="mobility-copy"><span className="mobility-icon">↗</span><p>Need a ride? Explore De VERVE car rental enquiries alongside our fashion offering. Vehicle options, availability and rental terms will be confirmed directly by our team.</p><a className="button button-light" href="#contact">Enquire about rentals <span aria-hidden="true">↗</span></a></div>
        </section>

        <section className="contact-section" id="contact">
          <p className="eyebrow">04 — START A CONVERSATION</p>
          <h2>Good things<br />start with <em>hello.</em></h2>
          <p>For product availability, wholesale enquiries or car rentals, get in touch with De VERVE.</p>
          <a className="button button-primary" href="https://wa.me/" target="_blank" rel="noreferrer">Connect on WhatsApp <span aria-hidden="true">↗</span></a>
          <small>Official WhatsApp link will be connected once the business number is confirmed.</small>
        </section>
      </main>

      <footer className="site-footer">
        <a className="footer-wordmark" href="#home">DE VERVE<span>.</span></a>
        <p>Jhelum, Pakistan · Fashion & Mobility</p>
        <span>© 2026 DE VERVE. ALL RIGHTS RESERVED.</span>
      </footer>
    </div>
  );
}

export default App;
