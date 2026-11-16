import { useEffect, useRef, useState } from "react";
export type GalleryImage = { id: string; url: string; alt_text: string };
export default function ProductGallery({ images, className = "" }: { images: GalleryImage[]; className?: string }) {
 const [index,setIndex]=useState(0),[paused,setPaused]=useState(false);const pointerStart=useRef<number|null>(null);const signature=images.map(image=>image.id).join("|");
 const move=(step:number)=>setIndex(current=>(current+step+images.length)%images.length);
 useEffect(()=>{setIndex(0);},[signature]);
 useEffect(()=>{if(images.length<2||paused||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;const timer=window.setInterval(()=>{if(document.visibilityState==="visible")setIndex(current=>(current+1)%images.length);},4200);return()=>window.clearInterval(timer);},[images.length,paused]);
 if(!images.length)return <div className={className} aria-label="No product images available"/>;
 const start=Math.max(0,Math.min(index-2,images.length-6)),visible=images.length<=6?images:images.slice(start,start+6);
 return <div className={"dv-gallery "+className} onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocusCapture={()=>setPaused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setPaused(false);}} onPointerDown={event=>{pointerStart.current=event.clientX;}} onPointerUp={event=>{if(pointerStart.current!==null){const delta=event.clientX-pointerStart.current;if(Math.abs(delta)>42&&images.length>1)move(delta<0?1:-1);pointerStart.current=null;}}} onPointerCancel={()=>{pointerStart.current=null;}} aria-label={"Product image gallery, "+images.length+" images"}>
  <div className="dv-gallery-stage"><img src={images[index].url} alt={images[index].alt_text||"Product image "+(index+1)} draggable={false} loading={index===0?"eager":"lazy"}/>{images.length>1&&<><div className="dv-gallery-controls"><button type="button" onClick={()=>move(-1)} aria-label="Previous product image">‹</button><button type="button" onClick={()=>move(1)} aria-label="Next product image">›</button></div><span className="dv-gallery-meta" aria-live="polite">{index+1} / {images.length}</span></>}</div>
  {images.length>1&&<div className="dv-gallery-thumbs" aria-label="Choose product image">{visible.map(image=>{const i=images.findIndex(item=>item.id===image.id);return <button type="button" key={image.id} className="dv-gallery-thumb" aria-label={"Show image "+(i+1)} aria-current={i===index} onClick={()=>setIndex(i)}><img src={image.url} alt="" loading="lazy"/></button>;})}</div>}
 </div>;
}
