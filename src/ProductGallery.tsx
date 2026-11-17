import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type GalleryImage = { id: string; url: string; alt_text: string };

export default function ProductGallery({ images, className = "", autoPlay = true, detailsHref, onActivate }: { images: GalleryImage[]; className?: string; autoPlay?: boolean; detailsHref?: string; onActivate?: () => void }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const pointerStart = useRef<{x:number;y:number} | null>(null);
  const suppressActivation = useRef(false);
  const touchTapStart = useRef<{pointerId:number;x:number;y:number;time:number}|null>(null);
  const lastTouchTap = useRef<{x:number;y:number;time:number}|null>(null);
  const ignoreNextDoubleClick = useRef(false);
  const lightboxSwipeStart = useRef<{pointerId:number;x:number;y:number}|null>(null);
  const pointers = useRef<Map<number,{x:number;y:number}>>(new Map());
  const pinchStart = useRef<{distance:number;zoom:number;midX:number;midY:number}|null>(null);
  const panStart = useRef<{x:number;y:number;left:number;top:number}|null>(null);
  const [pan,setPan] = useState({x:0,y:0});
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (!zoomOpen) return; const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previous; }; }, [zoomOpen]);
  const zoomViewportRef = useRef<HTMLDivElement | null>(null);
  const zoomImageRef = useRef<HTMLImageElement | null>(null);
  const clampPan = (x:number,y:number,scale:number) => { const viewport=zoomViewportRef.current,image=zoomImageRef.current;if(!viewport||!image)return{x,y};const maxX=Math.max(0,(image.offsetWidth*scale-viewport.clientWidth)/2),maxY=Math.max(0,(image.offsetHeight*scale-viewport.clientHeight)/2);return{x:Math.max(-maxX,Math.min(maxX,x)),y:Math.max(-maxY,Math.min(maxY,y))};};
  const signature = images.map(image => image.id).join("|");
  const move = (step: number) => setIndex(current => (current + step + images.length) % images.length);
  const pointerDistance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
  const resetZoom=()=>{setZoom(1);setPan({x:0,y:0});touchTapStart.current=null;lastTouchTap.current=null;lightboxSwipeStart.current=null;};
  const toggleZoom=()=>{if(zoom===1){setZoom(2.5);setPan({x:0,y:0});lastTouchTap.current=null;}else resetZoom();};

  useEffect(() => { setIndex(0); setZoomOpen(false); setZoom(1); }, [signature]);
  useEffect(() => { setZoom(1); setPan({x:0,y:0}); }, [index]);
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

  return <>
  <div ref={rootRef} className={"dv-gallery " + className}
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocusCapture={() => setPaused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false); }}
    onPointerDown={event => {
      const target = event.target as HTMLElement;
      if (target.closest(".dv-gallery-lightbox") || target.closest(".dv-gallery-controls") || (target.closest("button,a,input,textarea,select") && !target.closest(".dv-gallery-zoom-trigger"))) return;
      suppressActivation.current=false;
      pointerStart.current = {x:event.clientX,y:event.clientY}; setPaused(true);
    }}
    onPointerUp={event => {
      if (pointerStart.current !== null) {
        const deltaX = event.clientX - pointerStart.current.x;
        const deltaY = event.clientY - pointerStart.current.y;
        if (Math.hypot(deltaX,deltaY)>8) suppressActivation.current=true;
        if (Math.abs(deltaX)>42 && Math.abs(deltaX)>Math.abs(deltaY) && images.length > 1) { event.preventDefault(); move(deltaX < 0 ? 1 : -1); }
        pointerStart.current = null;
      }
      setPaused(false);
    }}
    onPointerCancel={() => { pointerStart.current = null; suppressActivation.current=false; setPaused(false); }}
    aria-label={"Product image gallery, " + images.length + " images"}>
    <div className="dv-gallery-stage">
      <button type="button" className="dv-gallery-zoom-trigger" onClick={() => { if(suppressActivation.current){suppressActivation.current=false;return;} if(onActivate){onActivate();return;} if(detailsHref){window.location.assign(detailsHref);return;} resetZoom(); setZoomOpen(true); }} aria-label={onActivate ? "View vehicle details" : detailsHref ? "View product details" : "Open image zoom"}>
        <img key={images[index].id} src={images[index].url} alt={images[index].alt_text || "Product image " + (index + 1)} draggable={false} loading={index === 0 ? "eager" : "lazy"}/>
        <span>⌕ View & zoom</span>
      </button>
      {images.length > 1 && <><div className="dv-gallery-controls"><button type="button" onClick={() => move(-1)} aria-label="Previous product image">‹</button><button type="button" onClick={() => move(1)} aria-label="Next product image">›</button></div><span className="dv-gallery-meta" aria-live="polite">{index + 1} / {images.length}</span></>}
      {detailsHref && <a className="dv-gallery-product-link" href={detailsHref}>View product details ↗</a>}
    </div>

    {images.length > 1 && <div className="dv-gallery-thumbs" aria-label="Choose product image">{visible.map(image => {
      const i = images.findIndex(item => item.id === image.id);
      return <button type="button" key={image.id} className="dv-gallery-thumb" aria-label={"Show image " + (i + 1)} aria-current={i === index} onClick={() => setIndex(i)}><img src={image.url} alt="" loading="lazy"/></button>;
    })}</div>}
  </div>
  {zoomOpen && createPortal(<div className="dv-gallery-lightbox" role="dialog" aria-modal="true" aria-label="Zoomed product image" onMouseDown={event => { if (event.target === event.currentTarget) setZoomOpen(false); }}>
      <button type="button" className="dv-gallery-lightbox-close" onClick={() => setZoomOpen(false)} aria-label="Close image zoom">×</button>
      <div className="dv-gallery-lightbox-toolbar" aria-label="Image zoom controls">
        <button type="button" onClick={() => {setZoom(value => Math.max(1, value - .5));setPan({x:0,y:0});}} disabled={zoom <= 1} aria-label="Zoom out">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom(value => Math.min(4, value + .5))} disabled={zoom >= 4} aria-label="Zoom in">+</button>
        <button type="button" onClick={resetZoom} disabled={zoom === 1}>Reset</button>
      </div>
      {images.length > 1 && <button type="button" className="dv-gallery-lightbox-nav is-prev" onClick={() => move(-1)} aria-label="Previous image">‹</button>}
      <div ref={zoomViewportRef} className="dv-gallery-lightbox-viewport"
        onPointerDown={event=>{
          if(event.pointerType==="mouse"&&event.button!==0)return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const point={x:event.clientX,y:event.clientY};
          pointers.current.set(event.pointerId,point);
          if(pointers.current.size===1){
            if(zoom===1)lightboxSwipeStart.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY};
            if(event.pointerType==="touch")touchTapStart.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,time:Date.now()};
          }else{
            lightboxSwipeStart.current=null;
            touchTapStart.current=null;
          }
          if(pointers.current.size===2){
            const pair=[...pointers.current.values()];
            pinchStart.current={distance:pointerDistance(pair[0],pair[1]),zoom,midX:(pair[0].x+pair[1].x)/2,midY:(pair[0].y+pair[1].y)/2};
            panStart.current=null;
          }else if(zoom>1){panStart.current={x:event.clientX,y:event.clientY,left:pan.x,top:pan.y};}
        }}
        onPointerMove={event=>{
          if(!pointers.current.has(event.pointerId))return;
          const point={x:event.clientX,y:event.clientY};
          pointers.current.set(event.pointerId,point);
          const tap=touchTapStart.current;
          if(tap&&tap.pointerId===event.pointerId&&Math.hypot(point.x-tap.x,point.y-tap.y)>12)touchTapStart.current=null;
          if(pointers.current.size>=2){
            const pair=[...pointers.current.values()];
            const distance=pointerDistance(pair[0],pair[1]);
            if(pinchStart.current){
              const next=Math.max(1,Math.min(4,pinchStart.current.zoom*distance/Math.max(1,pinchStart.current.distance)));
              setZoom(next);
              if(next===1)setPan({x:0,y:0});else setPan(current=>clampPan(current.x,current.y,next));
            }
            event.preventDefault();
          }else if(panStart.current&&zoom>1){
            const nextX=panStart.current.left+event.clientX-panStart.current.x,nextY=panStart.current.top+event.clientY-panStart.current.y;
            setPan(clampPan(nextX,nextY,zoom));event.preventDefault();
          }
        }}
        onPointerUp={event=>{
          const tap=touchTapStart.current;
          if(event.pointerType==="touch"&&tap?.pointerId===event.pointerId&&pointers.current.size===1&&Date.now()-tap.time<450&&Math.hypot(event.clientX-tap.x,event.clientY-tap.y)<12){
            const now=Date.now(),last=lastTouchTap.current;
            if(last&&now-last.time<380&&Math.hypot(event.clientX-last.x,event.clientY-last.y)<40){
              ignoreNextDoubleClick.current=true;
              window.setTimeout(()=>{ignoreNextDoubleClick.current=false;},500);
              toggleZoom();
              lastTouchTap.current=null;
            }else lastTouchTap.current={x:event.clientX,y:event.clientY,time:now};
          }
          touchTapStart.current=null;
          const swipe=lightboxSwipeStart.current;
          const remaining=[...pointers.current.entries()].filter(([id])=>id!==event.pointerId);
          if(remaining.length===0&&swipe?.pointerId===event.pointerId&&zoom===1){
            const dx=event.clientX-swipe.x,dy=event.clientY-swipe.y;
            if(Math.abs(dx)>42&&Math.abs(dx)>Math.abs(dy)&&images.length>1){move(dx<0?1:-1);resetZoom();event.preventDefault();}
          }
          lightboxSwipeStart.current=null;
          pointers.current.delete(event.pointerId);
          if(remaining.length===1&&zoom>1){const [,point]=remaining[0];panStart.current={x:point.x,y:point.y,left:pan.x,top:pan.y};}
          else if(remaining.length===0){panStart.current=null;pinchStart.current=null;}
          else if(remaining.length<2)pinchStart.current=null;
        }}
        onPointerCancel={event=>{pointers.current.delete(event.pointerId);touchTapStart.current=null;lightboxSwipeStart.current=null;pinchStart.current=null;panStart.current=null;}}>
        <img ref={zoomImageRef} onDoubleClick={()=>{if(ignoreNextDoubleClick.current){ignoreNextDoubleClick.current=false;return;}toggleZoom();}} onWheel={event=>{event.preventDefault();const next=Math.max(1,Math.min(4,zoom+(event.deltaY<0?.25:-.25)));setZoom(next);setPan(current=>next===1?{x:0,y:0}:clampPan(current.x,current.y,next));}} style={{transform:"translate("+pan.x+"px,"+pan.y+"px) scale("+zoom+")",cursor:zoom>1?"grab":"zoom-in"}} src={images[index].url} alt={images[index].alt_text||"Product image "+(index+1)}/>
      </div>
      {images.length > 1 && <button type="button" className="dv-gallery-lightbox-nav is-next" onClick={() => move(1)} aria-label="Next image">›</button>}
      <span className="dv-gallery-lightbox-count">{index + 1} / {images.length} · Double-tap or pinch to zoom · drag in any direction to inspect · swipe to change photos</span>
    </div>, document.body)}
  </>;
}
