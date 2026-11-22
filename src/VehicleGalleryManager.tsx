import { useEffect, useState, type ChangeEvent } from "react";
import ImageCropper from "./ImageCropper";
import { adminRequest as request } from "./adminApi";

type Vehicle = { id:string; name:string };
type Media = { id:string; alt_text:string; caption:string; mime_type:string; byte_size:number; position:number; is_primary:number; url:string };

export default function VehicleGalleryManager({vehicle,onClose,onChanged}:{vehicle:Vehicle;onClose:()=>void;onChanged:()=>void}){
 const [media,setMedia]=useState<Media[]>([]);
 const [files,setFiles]=useState<File[]>([]);
 const [cropFiles,setCropFiles]=useState<File[]|null>(null);
 const [replaceTarget,setReplaceTarget]=useState<Media|null>(null);
 const [busy,setBusy]=useState(false);
 const [progress,setProgress]=useState("");
 const [message,setMessage]=useState("");

 const load=async()=>{const result=await request<{media:Media[]}>(`/api/admin/vehicles/${vehicle.id}/media`);setMedia(result.media);};
 useEffect(()=>{let active=true;void request<{media:Media[]}>(`/api/admin/vehicles/${vehicle.id}/media`).then(result=>{if(active)setMedia(result.media);}).catch(error=>{if(active)setMessage(error instanceof Error?error.message:"Vehicle photos could not be loaded.");});return()=>{active=false;};},[vehicle.id]);

 const selectFiles=(event:ChangeEvent<HTMLInputElement>)=>{
  const selected=Array.from(event.target.files??[]);
  setFiles(selected.slice(0,50));
  if(selected.length>50)setMessage("Only the first 50 selected photos were kept.");
 };
 const upload=async(event:React.FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(!files.length)return;
  if(files.length>50||media.length+files.length>50){setMessage("Choose up to 50 photos per batch. A vehicle gallery can contain up to 50 photos.");return;}
  const invalid=files.find(file=>!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size<1||file.size>5_000_000);
  if(invalid){setMessage(invalid.size>5_000_000?invalid.name+" is larger than 5 MB.":invalid.name+" is not a supported JPG, PNG or WebP image.");return;}
  setReplaceTarget(null);
  setCropFiles([...files]);
 };

 const recropVehicleMedia=async(item:Media)=>{
  if(!["image/jpeg","image/png","image/webp"].includes(item.mime_type))return;
  setBusy(true);setMessage("");
  try{
   const response=await fetch(item.url,{credentials:"same-origin",cache:"no-store"});
   if(!response.ok)throw new Error("The original vehicle photo could not be loaded for editing.");
   const blob=await response.blob();
   const mime=blob.type||item.mime_type;
   if(!["image/jpeg","image/png","image/webp"].includes(mime)||blob.size<1||blob.size>5_000_000)throw new Error("This photo is not a supported JPG, PNG or WebP image under 5 MB.");
   const extension=mime==="image/jpeg"?"jpg":mime==="image/webp"?"webp":"png";
   const file=new File([blob],"vehicle-"+item.id+"."+extension,{type:mime,lastModified:Date.now()});
   setFiles([]);
   setReplaceTarget(item);
   setCropFiles([file]);
  }catch(error){setMessage(error instanceof Error?error.message:"The vehicle photo could not be opened for editing.");}
  finally{setBusy(false);}
 };

 const uploadCroppedFiles=async(croppedFiles:File[])=>{
  setCropFiles(null);
  if(!croppedFiles.length)return;
  setBusy(true);setMessage("");
  let attached=0;
  const failures:string[]=[];
  try{
   if(replaceTarget){
    const target=replaceTarget,file=croppedFiles[0];
    setProgress("Saving the revised vehicle photo…");
    const form=new FormData();
    form.append("file",file);
    form.append("alt_text",(target.alt_text||vehicle.name).slice(0,240));
    form.append("caption",target.caption||"");
    const uploaded=await request<{media?:{id:string}}>("/api/admin/media",{method:"POST",body:form});
    if(!uploaded.media)throw new Error("The revised photo upload returned no media record.");
    const newId=uploaded.media.id;
    let oldRemoved=false;
    try{
     if(media.length>=50){
      await request(`/api/admin/vehicles/${vehicle.id}/media/${target.id}`,{method:"DELETE"});
      oldRemoved=true;
     }
     await request(`/api/admin/vehicles/${vehicle.id}/media`,{method:"POST",body:JSON.stringify({media_id:newId,position:target.position,is_primary:target.is_primary===1})});
     attached=1;
    }catch(error){
     if(oldRemoved){
      try{await request(`/api/admin/vehicles/${vehicle.id}/media`,{method:"POST",body:JSON.stringify({media_id:target.id,position:target.position,is_primary:target.is_primary===1})});}
      catch{throw new Error("The new crop could not be attached and the original photo needs to be reattached by an administrator.");}
     }
     throw error;
    }
    if(!oldRemoved){
     try{await request(`/api/admin/vehicles/${vehicle.id}/media/${target.id}`,{method:"DELETE"});}
     catch{
      await load();onChanged();setReplaceTarget(null);setFiles([]);
      setMessage("The new crop is saved. The original photo could not be removed, so both versions remain in the gallery; remove the older one when convenient.");
      return;
     }
    }
    await load();onChanged();setReplaceTarget(null);setFiles([]);
    setMessage("Vehicle photo cropped and repositioned successfully. All existing vehicle references remain intact.");
    return;
   }

   for(let i=0;i<croppedFiles.length;i++){
    const file=croppedFiles[i];
    setProgress("Uploading positioned photo "+(i+1)+" of "+croppedFiles.length+"…");
    try{
     const form=new FormData();
     form.append("file",file);
     form.append("alt_text",(vehicle.name+" · "+file.name).slice(0,240));
     const result=await request<{media?:{id:string}}>("/api/admin/media",{method:"POST",body:form});
     if(!result.media)throw new Error("Upload returned no media record.");
     await request(`/api/admin/vehicles/${vehicle.id}/media`,{method:"POST",body:JSON.stringify({media_id:result.media.id,position:media.length+attached,is_primary:media.length===0&&attached===0})});
     attached++;
    }catch(error){failures.push(file.name+": "+(error instanceof Error?error.message:"Upload failed"));}
   }
   await load();setFiles([]);onChanged();
   setMessage(failures.length?attached+" of "+croppedFiles.length+" photos added. "+failures.slice(0,3).join(" · "):"All "+attached+" photos were added to "+vehicle.name+".");
  }catch(error){setMessage(error instanceof Error?error.message:"Vehicle photos could not be uploaded.");}
  finally{setProgress("");setBusy(false);}
 };

 const makePrimary=async(item:Media)=>{
  setBusy(true);setMessage("");
  try{await request(`/api/admin/vehicles/${vehicle.id}/media`,{method:"POST",body:JSON.stringify({media_id:item.id,position:item.position,is_primary:true})});await load();onChanged();setMessage("Main vehicle photo updated.");}
  catch(error){setMessage(error instanceof Error?error.message:"Main photo could not be updated.");}
  finally{setBusy(false);}
 };
 const remove=async(item:Media)=>{
  if(!window.confirm("Remove this photo from the vehicle gallery?"))return;
  setBusy(true);setMessage("");
  try{await request(`/api/admin/vehicles/${vehicle.id}/media/${item.id}`,{method:"DELETE"});await load();onChanged();setMessage("Photo removed from gallery.");}
  catch(error){setMessage(error instanceof Error?error.message:"Photo could not be removed.");}
  finally{setBusy(false);}
 };

 return <div className="admin-modal-backdrop vehicle-gallery-backdrop"><section className="admin-editor admin-vehicle-gallery-editor" role="dialog" aria-modal="true" aria-labelledby="vehicle-gallery-title">
  <div className="admin-panel-heading"><div><p className="admin-eyebrow">DE VERVE MOBILITY · VEHICLE PHOTOS</p><h2 id="vehicle-gallery-title">{vehicle.name}</h2><p className="admin-muted">Add up to 50 photos at a time. Crop or reposition existing photos without losing their vehicle-gallery references. The first photo becomes the cover; visitors can swipe or let the gallery rotate automatically.</p></div><button type="button" className="admin-close" disabled={busy} onClick={onClose} aria-label="Close vehicle gallery">×</button></div>
  <form className="admin-form admin-vehicle-gallery-upload" onSubmit={upload}><label>Choose vehicle photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={selectFiles}/></label><button className="admin-primary" disabled={busy||!files.length}>{busy?"Uploading…":"Upload & add "+files.length+" photos"}</button><small>JPG, PNG or WebP · maximum 5 MB each · 50 per vehicle total</small>{progress&&<p className="admin-message" role="status">{progress}</p>}</form>
  {media.length?<div className="admin-vehicle-gallery-grid">{media.map(item=><article key={item.id} className="admin-vehicle-gallery-item"><img src={item.url} alt={item.alt_text||vehicle.name}/><div><strong>{item.is_primary?"Cover photo":"Gallery photo"}</strong><span>{item.alt_text}</span><div><button type="button" className="admin-secondary" disabled={busy||item.is_primary===1} onClick={()=>void makePrimary(item)}>Make cover</button><button type="button" className="admin-secondary" disabled={busy} onClick={()=>void recropVehicleMedia(item)}>Crop / reposition</button><button type="button" className="admin-danger-button" disabled={busy} onClick={()=>void remove(item)}>Remove</button></div></div></article>)}</div>:<div className="admin-empty"><strong>No photos added yet</strong><p>Upload multiple angles of this vehicle to help customers inspect it.</p></div>}
  {cropFiles&&<ImageCropper files={cropFiles} aspectRatio={4/3} frameLabel={replaceTarget?"Reposition vehicle photo":"Vehicle photo"} onCancel={()=>{setCropFiles(null);setReplaceTarget(null);}} onComplete={uploadCroppedFiles}/>}
  {message&&<p className="admin-message" role="status" aria-live="polite">{message}</p>}
 </section></div>;
}
