import BrandLogo from "./BrandLogo";
import { useEffect, useState } from "react";

type Section = { id: string; section_type: string; content: Record<string, string>; position: number; is_visible?: boolean };
type Page = { slug: string; title: string; seo_title: string; seo_description: string; status?: string; sections: Section[] };

export default function PublicPage() {
  const slug = decodeURIComponent(window.location.pathname.replace(/^\/pages\//, "")).slice(0, 80);
  const params = new URLSearchParams(window.location.search);
  const previewId = params.get("id") ?? "";
  const isPreview = params.get("preview") === "1";
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    if (isPreview && !/^[a-f0-9-]{36}$/i.test(previewId)) {
      setError(true);
      return () => { active = false; };
    }
    const endpoint = isPreview
      ? "/api/admin/pages/" + encodeURIComponent(previewId)
      : "/api/pages/" + encodeURIComponent(slug);
    void fetch(endpoint, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("Page unavailable");
        return await response.json() as { page: Omit<Page, "sections">; sections: Section[] };
      })
      .then((data) => {
        if (active) setPage({ ...data.page, sections: data.sections });
      })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [slug, previewId, isPreview]);

  useEffect(() => {
    if (!page) return;
    document.title = page.seo_title || page.title;
    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.name = "description";
      document.head.appendChild(description);
    }
    description.content = page.seo_description || "";
  }, [page]);

  if (error) return (
    <main className="public-page">
      {isPreview && <aside className="public-preview-banner"><strong>Draft preview unavailable</strong><span>Sign in with an authorised owner or manager account, then reopen the preview.</span><a href="/admin?section=content">Return to website editor</a></aside>}
      <a href="/">De VERVE</a><h1>{isPreview ? "Preview unavailable" : "Page not found"}</h1>
      <p>{isPreview ? "This saved draft could not be loaded." : "This page may be unpublished or no longer available."}</p>
    </main>
  );
  if (!page) return <main className="public-page"><p>Loading page…</p></main>;

  const visibleSections = page.sections.filter((section) => !isPreview || section.is_visible !== false);
  return (
    <main className="public-page">
      {isPreview && <aside className="public-preview-banner"><strong>Draft preview</strong><span>This saved page is visible only to authorised staff. Changes made in the editor must be saved before they appear here.</span><a href="/admin?section=content">Return to website editor</a></aside>}
      <header className="public-page-header">
        <a href="/" className="public-page-brand"><BrandLogo className="brand-logo-image" /></a>
        <nav><a href="/">Home</a><a href="/#fashion">Fashion</a><a href="/#contact">Contact</a></nav>
      </header>
      <article className="public-page-content">
        <p className="public-page-eyebrow">DE VERVE · JHELUM</p>
        <h1>{page.title}</h1>
        {visibleSections.map((section) => {
          const content = section.content;
          return (
            <section className={"public-section public-section-" + section.section_type} key={section.id}>
              {content.eyebrow && <small>{content.eyebrow}</small>}
              {content.heading && <h2>{content.heading}</h2>}
              {content.body && <p>{content.body}</p>}
              {content.image_url && /^\/media\/[a-f0-9-]{36}$/i.test(content.image_url) && <img src={content.image_url} alt={content.heading || page.title} />}
              {content.button_text && content.button_href && <a className="button button-primary" href={content.button_href}>{content.button_text} ↗</a>}
            </section>
          );
        })}
      </article>
      <footer className="public-page-footer">© DE VERVE · JHELUM, PAKISTAN</footer>
    </main>
  );
}
