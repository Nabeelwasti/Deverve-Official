import type { Env } from "../worker/index";
export async function onRequest(context:{request:Request;env:Env}):Promise<Response>{
 let icon="/api/brand/logo?v=default";let iconType="image/svg+xml";let version="default";
 try{
  const row=await context.env.DB.prepare("SELECT setting_value_json FROM store_settings WHERE setting_key='brand_assets' AND is_public=1 LIMIT 1").first<{setting_value_json:string}>();
  if(row){
   const assets=JSON.parse(row.setting_value_json) as {logo_id?:string|null};
   const id=assets.logo_id;
   if(typeof id==="string"&&/^[a-f0-9-]{36}$/i.test(id)){
    const media=await context.env.DB.prepare("SELECT mime_type FROM media_assets WHERE id=? AND media_type='image' AND status='ready' LIMIT 1").bind(id).first<{mime_type:string}>();
    if(media&&["image/png","image/jpeg","image/webp"].includes(media.mime_type)){version=id;icon="/api/brand/logo?v="+encodeURIComponent(id);iconType=media.mime_type;}
   }
  }
 }catch{/* The canonical logo route supplies the built-in De VERVE fallback. */}
 const icons=[
  {src:icon,sizes:"192x192",type:iconType,purpose:"any"},
  {src:icon,sizes:"512x512",type:iconType,purpose:"any"},
 ];
 const manifest={id:"/",name:"De VERVE | Elevate Your Style",short_name:"De VERVE",description:"Fashion, wholesale and car rental enquiries in Jhelum, Pakistan.",lang:"en-PK",start_url:"/",scope:"/",display:"standalone",orientation:"portrait",background_color:"#ffffff",theme_color:"#06234f",categories:["shopping","lifestyle"],icons};
 return new Response(JSON.stringify(manifest),{headers:{"content-type":"application/manifest+json; charset=utf-8","cache-control":"no-store, max-age=0","pragma":"no-cache","x-content-type-options":"nosniff","etag":'"'+version+'"'}});
}
