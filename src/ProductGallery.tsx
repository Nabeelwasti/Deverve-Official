import { useEffect, useRef, useState } from "react";

export type GalleryImage = { id: string; url: string; alt_text: string };

export default function ProductGallery({ images, className = "", autoPlay = true, detailsHref }: { images: GalleryImage[]; className?: string; autoPlay?: boolean; detailsHref?: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const pointerStart = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const signature = images.map(image => image.id).join("|");
  const move = (step: number) => setIndex(current => (current + step + images.length) % images.length);

  useEffect(() => { setIndex(0); setZoomOpen(false); setZoom(1); }, [signature]);
  useEffect(() => { setZoom(1); }, [index]);
  useEffect(() => {
    if (!zoomOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomOpen(false);
      if (event.key === "ArrowRight" && images.length > 1) move(1);
      if (event.key === "ArrowLeft" && images.length > 1) move(-1);
      if (event.key === "+" || event.key === "=") setZoom(value => Math.min(4, value + .5));
      if (event.key === "-") setZoom(value => Math.max(1, value - .5));
      if (event.key === "0") setZoom(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomOpen, images.length]);
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) { setInView(true); return; }
    const observer = new IntersectionObserver(entries => setInView(entries.some(entry => entry.isIntersecting)), { rootMargin: "120px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [signature]);
  useEffect(() => {
    if (!autoPlay || images.length < 2 || paused || zoomOpen || !inView || document.visibilityState !== "visible" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") setIndex(current => (current + 1) % images.length); }, 4200);
    return () => window.clearInterval(timer);
  }, [autoPlay, images.length, paused, inView, zoomOpen]);

  if (!images.length) return <div className={className + " dv-gallery-empty"} role="status">Photos for this option are not available yet.</div>;
  const start = Math.max(0, Math.min(index - 2, images.length - 6));
  const visible = images.length <= 6 ? images : images.slice(start, start + 6);

  return <div ref={rootRef} className={"dv-gallery " + className}
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocusCapture={() => setPaused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false); }}
    onPointerDown={event => {
      const target = event.target as HTMLElement;
      if (target.closest(".dv-gallery-lightbox") || target.closest(".dv-gallery-controls") || (target.closest("button,a,input,textarea,select") && !target.closest(".dv-gallery-zoom-trigger"))) return;
      pointerStart.current = event.clientX; setPaused(true);
    }}
    onPointerUp={event => {
      if (pointerStart.current !== null) {
        const delta = event.clientX - pointerStart.current;
        if (Math.abs(delta) > 42 && images.length > 1) { event.preventDefault(); move(delta < 0 ? 1 : -1); }
        pointerStart.current = null;
      }
      setPaused(false);
    }}
    onPointerCancel={() => { pointerStart.current = null; setPaused(false); }}
    aria-label={"Product image gallery, " + images.length + " images"}>
    <div className="dv-gallery-stage">
      <button type="button" className="dv-gallery-zoom-trigger" onClick={() => { setZoom(1); setZoomOpen(true); }} aria-label="Open image zoom">
        <img key={images[index].id} src={images[index].url} alt={images[index].alt_text || "Product image " + (index + 1)} draggable={false} loading={index === 0 ? "eager" : "lazy"}/>
        <span>⌕ View & zoom</span>
      </button>
      {images.length > 1 && <><div className="dv-gallery-controls"><button type="button" onClick={() => move(-1)} aria-label="Previous product image">‹</button><button type="button" onClick={() => move(1)} aria-label="Next product image">›</button></div><span className="dv-gallery-meta" aria-live="polite">{index + 1} / {images.length}</span></>}
      {detailsHref && <a className="dv-gallery-product-link" href={detailsHref}>View product details ↗</a>}
    </div>
    {zoomOpen && <div className="dv-gallery-lightbox" role="dialog" aria-modal="true" aria-label="Zoomed product image" onMouseDown={event => { if (event.target === event.currentTarget) setZoomOpen(false); }}>
      <button type="button" className="dv-gallery-lightbox-close" onClick={() => setZoomOpen(false)} aria-label="Close image zoom">×</button>
      <div className="dv-gallery-lightbox-toolbar" aria-label="Image zoom controls">
        <button type="button" onClick={() => setZoom(value => Math.max(1, value - .5))} disabled={zoom <= 1} aria-label="Zoom out">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom(value => Math.min(4, value + .5))} disabled={zoom >= 4} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setZoom(1)} disabled={zoom === 1}>Reset</button>
      </div>
      {images.length > 1 && <button type="button" className="dv-gallery-lightbox-nav is-prev" onClick={() => move(-1)} aria-label="Previous image">‹</button>}
      <div className="dv-gallery-lightbox-viewport"><img onClick={() => setZoom(value => value === 1 ? 2 : 1)} onDoubleClick={() => setZoom(value => value === 1 ? 2.5 : 1)} onWheel={event => { event.preventDefault(); setZoom(value => Math.max(1, Math.min(4, value + (event.deltaY < 0 ? .25 : -.25)))); }} style={{ transform: "scale(" + zoom + ")", cursor: zoom > 1 ? "zoom-out" : "zoom-in" }} src={images[index].url} alt={images[index].alt_text || "Product image " + (index + 1)}/></div>
      {images.length > 1 && <button type="button" className="dv-gallery-lightbox-nav is-next" onClick={() => move(1)} aria-label="Next image">›</button>}
      <span className="dv-gallery-lightbox-count">{index + 1} / {images.length} · Click image or use + / − to zoom</span>
    </div>}
    {images.length > 1 && <div className="dv-gallery-thumbs" aria-label="Choose product image">{visible.map(image => {
      const i = images.findIndex(item => item.id === image.id);
      return <button type="button" key={image.id} className="dv-gallery-thumb" aria-label={"Show image " + (i + 1)} aria-current={i === index} onClick={() => setIndex(i)}><img src={image.url} alt="" loading="lazy"/></button>;
    })}</div>}
  </div>;
}
