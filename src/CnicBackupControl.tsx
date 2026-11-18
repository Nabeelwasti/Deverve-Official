import { useRef, useState } from "react";
import { createEncryptedEvidenceBackup, decryptEvidenceBackup, downloadRestoredEvidence } from "./cnicBackup";

type Side = "cnic_front" | "cnic_back";
export default function CnicBackupControl({referenceCode,sides,fetchDocument}:{referenceCode:string;sides:Side[];fetchDocument:(side:Side)=>Promise<Blob>}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const fileInput=useRef<HTMLInputElement|null>(null);
 const createBackup=async()=>{
  const password=window.prompt("Create a strong backup password (at least 12 characters). This password is never sent to De VERVE or Cloudflare.");
  if(password===null)return;
  if(password.length<12){setMessage("Use at least 12 characters for the backup password.");return;}
  const confirmation=window.prompt("Re-enter the backup password to confirm it.");
  if(confirmation===null)return;
  if(password!==confirmation){setMessage("The passwords did not match. No backup was created.");return;}
  setBusy(true);setMessage("");
  try{
   const files=[];
   for(const side of sides){const blob=await fetchDocument(side);files.push({name:side,blob});}
   const backup=await createEncryptedEvidenceBackup(referenceCode,files,password);
   const url=URL.createObjectURL(backup),anchor=document.createElement("a");
   anchor.href=url;anchor.download=referenceCode.replace(/[^a-zA-Z0-9._-]/g,"-")+"-cnic-evidence.dvbackup";
   document.body.appendChild(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),120000);
   setMessage("Encrypted backup created. Save it outside this Cloudflare account and keep its password separately.");
  }catch(error){setMessage(error instanceof Error?error.message:"The encrypted backup could not be created.");}
  finally{setBusy(false);}
 };
 const restoreBackup=async(file:File)=>{
  const password=window.prompt("Enter the password for this encrypted De VERVE backup.");
  if(password===null)return;
  setBusy(true);setMessage("");
  try{const payload=await decryptEvidenceBackup(file,password);downloadRestoredEvidence(payload);setMessage("Backup decrypted and integrity-checked. Restored image files and a manifest have been downloaded.");}
  catch(error){setMessage(error instanceof Error?error.message:"The backup could not be restored.");}
  finally{setBusy(false);if(fileInput.current)fileInput.current.value="";}
 };
 return <div className="admin-cnic-backup">
  <div><strong>Encrypted offline backup</strong><small>Creates a password-protected AES-256-GCM copy in this browser. No CNIC image is sent to another service.</small></div>
  <div className="admin-form-actions">
   <button type="button" className="admin-secondary" disabled={busy||!sides.length} onClick={()=>void createBackup()}>{busy?"Preparing…":"Create encrypted backup"}</button>
   <button type="button" className="admin-secondary" disabled={busy} onClick={()=>fileInput.current?.click()}>Restore backup</button>
   <input ref={fileInput} type="file" accept=".dvbackup,application/json" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void restoreBackup(file);}}/>
  </div>
  {message&&<small role="status" className="admin-muted">{message}</small>}
 </div>;
}
