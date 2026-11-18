import {useEffect,useRef,useState} from "react";
type DetectedBarcode={rawValue:string};
type DetectorLike={detect(source:HTMLVideoElement):Promise<DetectedBarcode[]>};
type DetectorConstructor=(new(options:{formats:string[]})=>DetectorLike)&{getSupportedFormats?:()=>Promise<string[]>};
type BrowserWithBarcodeDetector=Window&{BarcodeDetector?:DetectorConstructor};
function cameraErrorMessage(caught:unknown):string{
 const name=caught instanceof DOMException?caught.name:caught instanceof Error?caught.name:"";
 if(name==="NotAllowedError"||name==="PermissionDeniedError")return "Camera access was blocked. If your browser asks for permission, choose Allow. If you previously blocked it, open this site's settings from the address bar, set Camera to Allow, then tap Try camera again. Also check Android app camera permission.";
 if(name==="NotFoundError"||name==="DevicesNotFoundError")return "No camera was found on this device. Connect or enable a camera, or use a USB barcode scanner.";
 if(name==="NotReadableError"||name==="TrackStartError")return "The camera is already in use or could not start. Close other camera apps and try again.";
 if(name==="SecurityError"||!window.isSecureContext)return "Camera access requires a secure HTTPS connection. Open the official De VERVE website over HTTPS and try again.";
 if(name==="OverconstrainedError")return "The requested camera mode is unavailable. Try again after closing other camera apps.";
 if(name==="AbortError")return "The camera request was interrupted. Please try again.";
 return caught instanceof Error?caught.message:"The camera could not be started. Check site permissions and try again.";
}
export default function BarcodeScanner({onDetected,onClose,title="POS scanner"}:{onDetected:(value:string)=>void;onClose:()=>void;title?:string}){
 const video=useRef<HTMLVideoElement|null>(null),stream=useRef<MediaStream|null>(null),callback=useRef(onDetected),frame=useRef<number|null>(null),mounted=useRef(false),detected=useRef(false);
 const [status,setStatus]=useState("Allow camera access to scan product barcodes. Your camera is used only while this scanner is open.");
 const [error,setError]=useState(""),[starting,setStarting]=useState(false),[cameraActive,setCameraActive]=useState(false),[manualCode,setManualCode]=useState("");
 callback.current=onDetected;
 const stopCamera=()=>{
  if(frame.current!==null){cancelAnimationFrame(frame.current);frame.current=null;}
  stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;
  if(video.current)video.current.srcObject=null;
  setCameraActive(false);
 };
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(frame.current!==null)cancelAnimationFrame(frame.current);stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;};},[]);
 const startCamera=async()=>{
  if(starting)return;
  setError("");setStarting(true);detected.current=false;
  if(!window.isSecureContext){setError("Camera access requires a secure HTTPS connection. Open the official De VERVE website over HTTPS and try again.");setStarting(false);return;}
  const mediaDevices=navigator.mediaDevices;
  if(!mediaDevices||typeof mediaDevices.getUserMedia!=="function"){setError("This browser does not expose camera access. Update your browser, check its site permissions, or use a USB barcode scanner.");setStarting(false);return;}
  try{
   // Request the camera directly from this button action so the browser can show its native permission prompt.
   const camera=await mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}}});
   if(!mounted.current){camera.getTracks().forEach(track=>track.stop());return;}
   stream.current=camera;
   const Detector=(window as BrowserWithBarcodeDetector).BarcodeDetector;
   if(!Detector){stopCamera();setError("Camera permission is available, but this browser does not include a barcode decoder. Use a USB barcode scanner or enter the barcode/SKU in the POS search field.");return;}
   const commonFormats=["aztec","codabar","code_39","code_93","code_128","data_matrix","ean_13","ean_8","itf","pdf417","qr_code","upc_a","upc_e"];
   const supported=await Detector.getSupportedFormats?.().catch(()=>commonFormats);
   const formats=(supported?.length?supported:commonFormats).filter(format=>commonFormats.includes(format));
   if(!formats.length)throw new Error("This browser cannot decode common retail barcodes or QR codes. Update Chrome or use a compatible USB/Bluetooth scanner.");
   const detector=new Detector({formats});
   if(!video.current)throw new Error("The camera preview could not be opened. Close the scanner and try again.");
   video.current.srcObject=camera;
   await video.current.play();
   if(!mounted.current)return;
   setCameraActive(true);setStatus("Camera is active. Scan EAN / UPC, Code 39 / 93 / 128, ITF, Codabar, PDF417, Data Matrix, Aztec or QR codes supported by this browser.");
   let detecting=false;
   const tick=async()=>{
    if(!mounted.current||detected.current||detecting||!video.current)return;
    detecting=true;
    try{
     const codes=await detector.detect(video.current);
     const value=codes.find(item=>item.rawValue?.trim())?.rawValue?.trim();
     if(value&&!detected.current){detected.current=true;stopCamera();callback.current(value);return;}
    }catch{/* A blurred frame is normal; continue scanning the next frame. */}
    finally{detecting=false;}
    if(mounted.current&&!detected.current)frame.current=requestAnimationFrame(()=>void tick());
   };
   frame.current=requestAnimationFrame(()=>void tick());
  }catch(caught){if(mounted.current){stopCamera();setError(cameraErrorMessage(caught));setStatus("Camera could not be started.");}else{stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;}}
  finally{if(mounted.current)setStarting(false);}
 };
 return <div className="barcode-camera-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
  <section className="barcode-camera-modal" role="dialog" aria-modal="true" aria-label={title === "POS scanner" ? "Scan product barcode" : "Scan product tag or QR code"} aria-labelledby="barcode-camera-title">
   <header><div><p className="admin-eyebrow">DE VERVE · {title.toUpperCase()}</p><h3 id="barcode-camera-title">Scan barcode or QR code</h3></div><button type="button" className="admin-close" aria-label="Close camera scanner" onClick={onClose}>×</button></header>
   <div className="barcode-camera-stage"><video ref={video} autoPlay muted playsInline className={cameraActive?"is-active":"is-idle"} aria-hidden={!cameraActive}/>{!cameraActive&&<p>{error||status}</p>}{cameraActive&&<span className="barcode-camera-reticle" aria-hidden="true"/>}</div>
   {error&&<p className="admin-error" role="alert">{error}</p>}
   <p className="admin-muted" role="status">{cameraActive?status:"Camera access is requested only when you press the start button."}</p>
   {!cameraActive&&<button type="button" className="admin-primary" disabled={starting} onClick={()=>void startCamera()}>{starting?"Requesting camera…":error?"Try camera again":"Allow camera access & start scanning"}</button>}
   <div className="barcode-manual-entry"><label htmlFor="barcode-manual-value">Or enter barcode / SKU manually</label><div><input id="barcode-manual-value" value={manualCode} onChange={event=>setManualCode(event.target.value)} maxLength={2048} autoComplete="off" placeholder="Scan or type product code"/><button type="button" className="admin-primary" disabled={!manualCode.trim()} onClick={()=>{const value=manualCode.trim();stopCamera();callback.current(value);onClose();}}>Use code</button></div></div><button type="button" className="admin-secondary" onClick={()=>{stopCamera();onClose();}}>Close scanner</button>
  </section>
 </div>;
}
