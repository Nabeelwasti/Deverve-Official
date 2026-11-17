import { useEffect } from "react";
import BrandLogo from "./BrandLogo";

export default function NotFound() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Page not found | De VERVE";
    let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const created = !robots;
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    const previousRobots = robots.content;
    robots.content = "noindex, nofollow";
    return () => {
      document.title = previousTitle;
      if (created) robots?.remove();
      else if (robots) robots.content = previousRobots;
    };
  }, []);

  return (
    <main className="public-page">
      <header>
        <a href="/" className="footer-wordmark" aria-label="De VERVE home">
          <BrandLogo className="brand-logo-image" />
        </a>
        <nav aria-label="Main navigation">
          <a href="/">Home</a>
          <a href="/#fashion">Fashion</a>
          <a href="/#contact">Contact</a>
        </nav>
      </header>
      <article>
        <p className="public-page-eyebrow">DE VERVE · 404</p>
        <h1>This page could not be found.</h1>
        <p>The address may be incorrect, or the page may have moved.</p>
        <a className="button button-primary" href="/">Back to De VERVE</a>
      </article>
      <footer>© DE VERVE · JHELUM, PAKISTAN</footer>
    </main>
  );
}
