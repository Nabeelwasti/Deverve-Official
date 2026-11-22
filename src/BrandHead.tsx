import {useEffect} from "react";
export default function BrandHead(){
 useEffect(()=>{
  let active=true;
  const refresh=async()=>{
   try{
    const response=await fetch("/api/storefront/settings",{headers:{accept:"application/json"},cache:"no-store"});
    if(!response.ok)return;
    const data=await response.json() as {brand_assets?:{logo_id?:string|null;favicon_id?:string|null}};
    if(!active)return;
    const logoId=data.brand_assets?.logo_id??null;
    const faviconId=data.brand_assets?.favicon_id??null;
    // Use the official uploaded logo as the tab icon when a dedicated favicon
    // has not been supplied. Never leave the generic placeholder in that case.
    const iconAssetId=faviconId??logoId;
    const iconUrl=iconAssetId?"/media/"+encodeURIComponent(iconAssetId)+"?v="+encodeURIComponent(iconAssetId):"/brand/de-verve-loader.svg";
    let icon=document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if(!icon){icon=document.createElement("link");icon.rel="icon";document.head.appendChild(icon);}
    icon.href=iconUrl;icon.type=iconAssetId?"":"image/svg+xml";
    icon.onerror=()=>{icon!.href="/brand/de-verve-loader.svg";icon!.type="image/svg+xml";};
    let touch=document.head.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if(!touch){touch=document.createElement("link");touch.rel="apple-touch-icon";document.head.appendChild(touch);}
    touch.href=iconAssetId?"/media/"+encodeURIComponent(iconAssetId)+"?v="+encodeURIComponent(iconAssetId):iconUrl;
    let manifest=document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if(!manifest){manifest=document.createElement("link");manifest.rel="manifest";document.head.appendChild(manifest);}
    manifest.href="/api/pwa/manifest?brand="+encodeURIComponent(iconAssetId||"default");
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
