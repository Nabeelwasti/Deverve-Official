import {useEffect,useState} from "react";

export default function BrandLogo({className=""}:{className?:string}){
 const [version,setVersion]=useState(0);
 const [fallback,setFallback]=useState(false);
 useEffect(()=>{
  const refresh=()=>{setFallback(false);setVersion(Date.now());};
  window.addEventListener("deverve:brand-assets-updated",refresh);
  return()=>window.removeEventListener("deverve:brand-assets-updated",refresh);
 },[]);
 const src=fallback?"/brand/de-verve-mark.svg":version?"/api/brand/logo?v="+version:"/api/brand/logo";
 return <img className={["deverve-round-logo",className].filter(Boolean).join(" ")} src={src} alt="De VERVE" decoding="async" fetchPriority="high" draggable={false} onError={()=>{if(!fallback)setFallback(true);}}/>;
}
