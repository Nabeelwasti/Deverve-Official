import {useEffect,useState} from "react";
export default function BrandLogo({className=""}:{className?:string}){
 const [logo,setLogo]=useState<string|null>(null);
 const [customLogoFailed,setCustomLogoFailed]=useState(false);
 useEffect(()=>{let active=true;const refresh=()=>{void fetch("/api/storefront/settings",{headers:{accept:"application/json"},cache:"no-store"}).then(async response=>{if(!response.ok)return;const data=await response.json() as {brand_assets?:{logo_id?:string|null}};if(active){setLogo(data.brand_assets?.logo_id??null);setCustomLogoFailed(false);}}).catch(()=>undefined);};refresh();window.addEventListener("deverve:brand-assets-updated",refresh);return()=>{active=false;window.removeEventListener("deverve:brand-assets-updated",refresh);};},[]);
 return logo&&!customLogoFailed?<img className={className} src={"/media/"+logo} alt="De VERVE" onError={()=>setCustomLogoFailed(true)}/>:<img className={className} src="/brand/de-verve-logo.svg" alt="De VERVE"/>;
}
