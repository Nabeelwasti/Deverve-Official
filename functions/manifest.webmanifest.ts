import type { Env } from "../worker/index";
export async function onRequest(context:{request:Request;env:Env}):Promise<Response>{
 let icon="/icons/icon-192.svg";let iconType="image/svg+xml";
 try{
  const row=await context.env.DB.prepare("SELECT setting_value_json FROM store_settings WHERE setting_key='brand_assets' AND is_public=1 LIMIT 1").first<{setting_value_json:string}>();
  if(row){const assets=JSON.parse(row.setting_value_json) as {favicon_id?:string|null;logo_id?:string|null};const id=assets.favicon_id||assets.logo_id;if(typeof id==="string"&&/^[a-f0-9-]{36}$/i.test(id)){const media=await context.env.DB.prepare("SELECT mime_type FROM media_assets WHERE id=? AND status = ? LIMIT 1").bind(id,"ready").first<{mime_type:string}>();if(media){icon="/media/"+id;iconType=media.mime_type;}}}
 }catch{}
 const manifest={id:"/",name:"De VERVE — Elevate Your Style",short_name:"De VERVE",description:"Fashion, wholesale and car rental enquiries in Jhelum, Pakistan.",lang:"en-PK",start_url:"/?source=pwa",scope:"/",display:"standalone",display_override:["standalone","minimal-ui"],orientation:"portrait-primary",background_color:"#ffffff",theme_color:"#06234f",categories:["shopping","lifestyle"],icons:[{src:icon,sizes:"any",type:iconType,purpose:"any"}]};
 return new Response(JSON.stringify(manifest),{headers:{"content-type":"application/manifest+json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
}
