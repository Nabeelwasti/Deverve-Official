import {useEffect} from "react";
export default function BrandHead(){
 useEffect(()=>{
  let active=true;
  const refresh=async()=>{
   try{
    const response=await fetch("/api/storefront/settings",{headers:{accept:"application/json"},cache:"no-store"});
    if(!response.ok)return;
    const data=await response.json() as {brand_assets?:{logo_id?:string|null};site_design?:{image_settings?:Record<string,{fit?:string;x?:number;y?:number}>}};
    if(!active)return;
    const logoFrame=data.site_design?.image_settings?.brand_logo;
    const logoX=Math.max(0,Math.min(100,Number.isFinite(logoFrame?.x)?Number(logoFrame?.x):50));
    const logoY=Math.max(0,Math.min(100,Number.isFinite(logoFrame?.y)?Number(logoFrame?.y):50));
    document.documentElement.style.setProperty("--dv-brand-logo-fit",logoFrame?.fit==="contain"?"contain":"cover");
    document.documentElement.style.setProperty("--dv-brand-logo-position",logoX+"% "+logoY+"%");
    const logoId=data.brand_assets?.logo_id??"default";
    // The same canonical, owner-managed logo endpoint feeds every browser and installed-app brand mark.
    const iconUrl="/api/brand/logo?v="+encodeURIComponent(logoId);
    let icon=document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if(!icon){icon=document.createElement("link");icon.rel="icon";document.head.appendChild(icon);}
    icon.href=iconUrl;icon.removeAttribute("type");
    let touch=document.head.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if(!touch){touch=document.createElement("link");touch.rel="apple-touch-icon";document.head.appendChild(touch);}
    touch.href=iconUrl;
    let manifest=document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if(!manifest){manifest=document.createElement("link");manifest.rel="manifest";document.head.appendChild(manifest);}
    manifest.href="/api/pwa/manifest?brand="+encodeURIComponent(logoId)+"&v=2";
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
