import { useRef, useState, type FormEvent } from "react";
import { createEncryptedEvidenceBackup, decryptEvidenceBackup, downloadRestoredEvidence } from "./cnicBackup";

type Side = "cnic_front" | "cnic_back";
export default function CnicBackupControl({referenceCode,sides,fetchDocument}:{referenceCode:string;sides:Side[];fetchDocument:(side:Side)=>Promise<Blob>}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[mode,setMode]=useState<"backup"|"restore"|null>(null);
 const [password,setPassword]=useState(""),[confirmation,setConfirmation]=useState(""),[restorePassword,setRestorePassword]=useState("");
 const [restoreFile,setRestoreFile]=useState<File|null>(null);
 const fileInput=useRef<HTMLInputElement|null>(null);
 const reset=()=>{setPassword("");setConfirmation("");setRestorePassword("");setRestoreFile(null);setMode(null);};
 const createBackup=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(password.length<12){setMessage("Use at least 12 characters for the backup password.");return;}
  if(password!==confirmation){setMessage("The passwords did not match. No backup was created.");return;}
  setBusy(true);setMessage("");
  try{
   const files=[];
   for(const side of sides){const blob=await fetchDocument(side);files.push({name:side,blob});}
   const backup=await createEncryptedEvidenceBackup(referenceCode,files,password);
   const url=URL.createObjectURL(backup),anchor=document.createElement("a");
   anchor.href=url;anchor.download=referenceCode.replace(/[^a-zA-Z0-9._-]/g,"-")+"-cnic-evidence.dvbackup";
   document.body.appendChild(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),120000);
   reset();setMessage("Encrypted backup created. Store it outside this Cloudflare account and keep its password separately.");
  }catch(error){setMessage(error instanceof Error?error.message:"The encrypted backup could not be created.");}
  finally{setBusy(false);setPassword("");setConfirmation("");}
 };
 const recoverFiles=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(!restoreFile){setMessage("Choose a De VERVE backup file first.");return;}
  setBusy(true);setMessage("");
  try{
   const payload=await decryptEvidenceBackup(restoreFile,restorePassword);
   downloadRestoredEvidence(payload);
   reset();setMessage("Backup decrypted and integrity-checked. Original images and a manifest have been downloaded to this device; this does not reinsert records into production D1/R2.");
  }catch(error){setMessage(error instanceof Error?error.message:"The backup could not be decrypted.");}
  finally{setBusy(false);setRestorePassword("");}
 };
 return <div className="admin-cnic-backup">
  <div><strong>Encrypted offline backup</strong><small>Creates a password-protected AES-256-GCM copy in this browser. No CNIC image or password is sent to another service. Keep the password separately from the backup file.</small></div>
  <div className="admin-form-actions">
   <button type="button" className="admin-secondary" disabled={busy||!sides.length} onClick={()=>{setMessage("");setMode(mode==="backup"?null:"backup");setRestoreFile(null);}}>Create encrypted backup</button>
   <button type="button" className="admin-secondary" disabled={busy} onClick={()=>{setMessage("");fileInput.current?.click();}}>Decrypt & download</button>
   <input ref={fileInput} type="file" accept=".dvbackup,application/json" hidden onChange={event=>{const file=event.target.files?.[0]||null;setRestoreFile(file);setMode(file?"restore":null);setRestorePassword("");}}/>
  </div>
  {mode==="backup"&&<form className="admin-cnic-backup-form" onSubmit={event=>void createBackup(event)}>
   <label>New backup password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={event=>setPassword(event.target.value)} required placeholder="At least 12 characters"/></label>
   <label>Confirm backup password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={event=>setConfirmation(event.target.value)} required placeholder="Enter the same password again"/></label>
   <div className="admin-form-actions"><button type="submit" className="admin-primary" disabled={busy||password.length<12||!confirmation}>{busy?"Encrypting evidence…":"Encrypt & download backup"}</button><button type="button" className="admin-secondary" disabled={busy} onClick={reset}>Cancel</button></div>
  </form>}
  {mode==="restore"&&restoreFile&&<form className="admin-cnic-backup-form" onSubmit={event=>void recoverFiles(event)}>
   <small>Selected file: {restoreFile.name} · {(restoreFile.size/1024).toFixed(1)} KB</small>
   <label>Backup password<input type="password" autoComplete="current-password" maxLength={128} value={restorePassword} onChange={event=>setRestorePassword(event.target.value)} required placeholder="Enter the password used for this backup"/></label>
   <div className="admin-form-actions"><button type="submit" className="admin-primary" disabled={busy||!restorePassword}>{busy?"Checking backup…":"Decrypt & recover files"}</button><button type="button" className="admin-secondary" disabled={busy} onClick={reset}>Cancel</button></div>
  </form>}
  {message&&<small role="status" className="admin-muted">{message}</small>}
 </div>;
}
