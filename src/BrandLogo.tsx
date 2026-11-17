import {useEffect,useState} from "react";
export default function BrandLogo({className=""}:{className?:string}){
 const [logo,setLogo]=useState<string|null>(null);
 useEffect(()=>{let active=true;void fetch("/api/storefront/settings",{headers:{accept:"application/json"}}).then(async response=>{if(!response.ok)return;const data=await response.json() as {brand_assets?:{logo_id?:string|null}};if(active)setLogo(data.brand_assets?.logo_id??null);}).catch(()=>undefined);return()=>{active=false;};},[]);
 return logo?<img className={className} src={"/media/"+logo} alt="De VERVE"/>:<span className={className}>De VERVE<span>.</span></span>;
}
