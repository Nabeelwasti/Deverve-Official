import {useEffect} from "react";
export default function BrandHead(){
 useEffect(()=>{
  let active=true;
  const refresh=async()=>{
   try{
    const response=await fetch("/api/storefront/settings",{headers:{accept:"application/json"},cache:"no-store"});
    if(!response.ok)return;
    const data=await response.json() as {brand_assets?:{favicon_id?:string|null}};
    if(!active)return;
    const id=data.brand_assets?.favicon_id??null;
    const iconUrl=id?"/media/"+id+"?v="+encodeURIComponent(id):"/icons/icon-192.svg";
    let icon=document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if(!icon){icon=document.createElement("link");icon.rel="icon";document.head.appendChild(icon);}
    icon.href=iconUrl;icon.type=id?"":"image/svg+xml";
    let touch=document.head.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if(!touch){touch=document.createElement("link");touch.rel="apple-touch-icon";document.head.appendChild(touch);}
    touch.href=iconUrl;
    let manifest=document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if(!manifest){manifest=document.createElement("link");manifest.rel="manifest";document.head.appendChild(manifest);}
    manifest.href="/api/pwa/manifest?brand="+encodeURIComponent(id||"default");
   }catch{/* Keep the static fallback icon if settings cannot be loaded. */}
  };
  void refresh();
  const onVisible=()=>{if(document.visibilityState==="visible")void refresh();};
  window.addEventListener("deverve:brand-assets-updated",refresh);
  document.addEventListener("visibilitychange",onVisible);
  return()=>{active=false;window.removeEventListener("deverve:brand-assets-updated",refresh);document.removeEventListener("visibilitychange",onVisible);};
 },[]);
 return null;
}
