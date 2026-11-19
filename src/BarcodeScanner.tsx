import {useEffect,useRef,useState} from "react";
import {BrowserMultiFormatReader} from "@zxing/browser";
import {BarcodeFormat,DecodeHintType} from "@zxing/library";
type DetectedBarcode={rawValue:string};
type DetectorLike={detect(source:HTMLVideoElement|ImageBitmap):Promise<DetectedBarcode[]>};
type DetectorConstructor=(new(options:{formats:string[]})=>DetectorLike)&{getSupportedFormats?:()=>Promise<string[]>};
type BrowserWithBarcodeDetector=Window&{BarcodeDetector?:DetectorConstructor};
function createZxingReader(){
 const hints=new Map<DecodeHintType,any>();
 hints.set(DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.AZTEC,BarcodeFormat.CODABAR,BarcodeFormat.CODE_39,BarcodeFormat.CODE_93,BarcodeFormat.CODE_128,BarcodeFormat.DATA_MATRIX,BarcodeFormat.EAN_13,BarcodeFormat.EAN_8,BarcodeFormat.ITF,BarcodeFormat.MAXICODE,BarcodeFormat.PDF_417,BarcodeFormat.QR_CODE,BarcodeFormat.RSS_14,BarcodeFormat.RSS_EXPANDED,BarcodeFormat.UPC_A,BarcodeFormat.UPC_E,BarcodeFormat.MICRO_QR_CODE]);
 hints.set(DecodeHintType.TRY_HARDER,true);
 return new BrowserMultiFormatReader(hints,{delayBetweenScanAttempts:250,delayBetweenScanSuccess:800,tryPlayVideoTimeout:5000});
}
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
export default function BarcodeScanner({onDetected,onClose,title="POS scanner",onDetectedWithImage,onImageCaptured}:{onDetected:(value:string)=>void;onClose:()=>void;title?:string;onDetectedWithImage?:(value:string,imageDataUrl:string)=>void|Promise<void>;onImageCaptured?:(imageDataUrl:string)=>void|Promise<void>}){
 const video=useRef<HTMLVideoElement|null>(null),stream=useRef<MediaStream|null>(null),zxingControls=useRef<{stop:()=>void}|null>(null),fileInput=useRef<HTMLInputElement|null>(null),callback=useRef(onDetected),frame=useRef<number|null>(null),mounted=useRef(false),detected=useRef(false);
 const [status,setStatus]=useState("Allow camera access to scan product barcodes. Your camera is used only while this scanner is open.");
 const [error,setError]=useState(""),[starting,setStarting]=useState(false),[cameraActive,setCameraActive]=useState(false),[manualCode,setManualCode]=useState(""),[capturing,setCapturing]=useState(false),[readingFile,setReadingFile]=useState(false);
 const detectedImageCallback=useRef(onDetectedWithImage),imageCallback=useRef(onImageCaptured);
 detectedImageCallback.current=onDetectedWithImage;imageCallback.current=onImageCaptured;
 const captureFrame=()=>{const current=video.current;if(!current||!current.videoWidth||!current.videoHeight)return "";const canvas=document.createElement("canvas");canvas.width=current.videoWidth;canvas.height=current.videoHeight;const context=canvas.getContext("2d");if(!context)return "";context.drawImage(current,0,0,canvas.width,canvas.height);return canvas.toDataURL("image/jpeg",0.84);};
 callback.current=onDetected;
 const processImageFile=async(file:File)=>{
  if(!file.type.startsWith("image/")){setError("Choose a JPG, PNG, WebP or another supported image file.");return;}
  if(file.size>15*1024*1024){setError("Choose an image smaller than 15 MB. Large images are compressed on this device before upload.");return;}
  setError("");setReadingFile(true);detected.current=false;
  try{
   let bitmap:ImageBitmap|null=null;
   let source:CanvasImageSource;
   let sourceWidth=0,sourceHeight=0;
   let fallbackUrl="";
   try{
    if(typeof createImageBitmap==="function"){
     try{bitmap=await createImageBitmap(file);}catch{/* Older mobile browsers can still decode through HTMLImageElement. */}
    }
    if(bitmap){source=bitmap;sourceWidth=bitmap.width;sourceHeight=bitmap.height;}
    else{
     fallbackUrl=URL.createObjectURL(file);
     const imageSource=new Image();imageSource.decoding="async";imageSource.src=fallbackUrl;
     await imageSource.decode();
     source=imageSource;sourceWidth=imageSource.naturalWidth;sourceHeight=imageSource.naturalHeight;
    }
    if(!sourceWidth||!sourceHeight)throw new Error("The selected image has no readable dimensions. Choose another photo.");
    const scale=Math.min(1,1800/Math.max(sourceWidth,sourceHeight));
    const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(sourceWidth*scale));canvas.height=Math.max(1,Math.round(sourceHeight*scale));
    const context=canvas.getContext("2d");if(!context)throw new Error("This browser could not prepare the selected image.");
    context.drawImage(source,0,0,canvas.width,canvas.height);
    let image=canvas.toDataURL("image/jpeg",0.86);
    if(image.length>6_800_000)image=canvas.toDataURL("image/jpeg",0.72);
    if(image.length>6_800_000)throw new Error("This image is still too large after compression. Choose a smaller or clearer crop.");
    let code="";
    const Detector=(window as BrowserWithBarcodeDetector).BarcodeDetector;
    if(Detector){
     try{
      const commonFormats=["aztec","codabar","code_39","code_93","code_128","data_matrix","ean_13","ean_8","itf","pdf417","qr_code","upc_a","upc_e"];
      const supported=await Detector.getSupportedFormats?.().catch(()=>commonFormats);
      const formats=(supported?.length?supported:commonFormats).filter(format=>commonFormats.includes(format));
      if(formats.length){const detector=new Detector({formats});const results=await detector.detect(source);code=results.find(item=>item.rawValue?.trim())?.rawValue?.trim()||"";}
     }catch{/* The bundled ZXing decoder below is the compatibility fallback. */}
    }
    if(!code){
     try{const imageElement=new Image();imageElement.src=image;await imageElement.decode();const result=await createZxingReader().decodeFromImageElement(imageElement);code=result.getText().trim();}catch{/* If the image has no decodable code, let Gemini inspect its printed product label. */}
    }
    stopCamera();
    if(code){detected.current=true;if(detectedImageCallback.current)await detectedImageCallback.current(code,image);else callback.current(code);return;}
    if(imageCallback.current){await imageCallback.current(image);return;}
    setError("No barcode or QR code could be decoded from this image. Try a clearer crop or enter the code manually.");
   }finally{bitmap?.close();if(fallbackUrl)URL.revokeObjectURL(fallbackUrl);}
  }catch(caught){setError(caught instanceof Error?caught.message:"The selected image could not be read. Try another image.");}
  finally{if(mounted.current)setReadingFile(false);}
 };
 const stopCamera=()=>{
  if(frame.current!==null){cancelAnimationFrame(frame.current);frame.current=null;}
  const controls=zxingControls.current;zxingControls.current=null;try{controls?.stop();}catch{}
  stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;
  if(video.current)video.current.srcObject=null;
  setCameraActive(false);
 };
 useEffect(()=>{mounted.current=true;return()=>{
  mounted.current=false;
  if(frame.current!==null){cancelAnimationFrame(frame.current);frame.current=null;}
  const controls=zxingControls.current;zxingControls.current=null;
  try{controls?.stop();}catch{}
  const activeStream=stream.current;stream.current=null;
  activeStream?.getTracks().forEach(track=>{try{track.stop();}catch{}});
  if(video.current)video.current.srcObject=null;
 };},[]);
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
   if(!video.current)throw new Error("The camera preview could not be opened. Close the scanner and try again.");
   video.current.srcObject=camera;
   await video.current.play();
   if(!mounted.current)return;
   setCameraActive(true);setStatus("Camera is active. The bundled ZXing multi-format scanner is running, with native barcode detection acceleration where your browser supports it. Supported formats include EAN, UPC, Code 39/93/128, ITF, Codabar, PDF417, Data Matrix, Aztec, MaxiCode, RSS and QR.");
   const deliver=(value:string,stopNative?:()=>void)=>{
    if(!value||detected.current)return;
    detected.current=true;
    const image=captureFrame();
    stopNative?.();stopCamera();
    if(detectedImageCallback.current&&image)void Promise.resolve(detectedImageCallback.current(value,image)).catch(()=>{});
    else callback.current(value);
   };
   const Detector=(window as BrowserWithBarcodeDetector).BarcodeDetector;
   let nativeScannerReady=false;
   if(Detector){
    try{
     const commonFormats=["aztec","codabar","code_39","code_93","code_128","data_matrix","ean_13","ean_8","itf","maxicode","pdf417","qr_code","rss_14","rss_expanded","upc_a","upc_e"];
     const supported=await Detector.getSupportedFormats?.().catch(()=>commonFormats);
     const formats=(supported?.length?supported:commonFormats).filter(format=>commonFormats.includes(format));
     if(formats.length){
      const detector=new Detector({formats});
      nativeScannerReady=true;
      let detecting=false;
      const tick=async()=>{
       if(!mounted.current||detected.current||detecting||!video.current)return;
       detecting=true;
       try{const codes=await detector.detect(video.current);const value=codes.find(item=>item.rawValue?.trim())?.rawValue?.trim();if(value){deliver(value);return;}}
       catch{/* Frame-level failures are expected on moving or blurred video. ZXing remains the primary fallback. */}
       finally{detecting=false;}
       if(mounted.current&&!detected.current)frame.current=requestAnimationFrame(()=>void tick());
      };
      frame.current=requestAnimationFrame(()=>void tick());
     }
    }catch{/* Continue with the bundled ZXing engine. */}
   }
   // Native BarcodeDetector is optional and not supported by every browser.
   // A failure to initialise the optional native engine must never cancel the
   // camera stream when the ZXing compatibility engine is available.
   try{
    const reader=createZxingReader();
    const controls=await reader.decodeFromStream(camera,video.current,(result,_decodeError,scanControls)=>{
     const value=result?.getText()?.trim();
     if(value)deliver(value,()=>scanControls.stop());
    });
    if(!mounted.current||detected.current){controls.stop();return;}
    zxingControls.current=controls;
   }catch(zxingError){
    if(!nativeScannerReady)throw zxingError;
    setStatus("Camera is active. Native barcode detection is running. If your code is not detected, choose a clear photo or enter it manually.");
   }
  }catch(caught){if(mounted.current&&!detected.current){stopCamera();setError(cameraErrorMessage(caught));setStatus("Camera could not be started.");}else if(!mounted.current){stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;}}
  finally{if(mounted.current)setStarting(false);}
 };
 return <div className="barcode-camera-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
  <section className="barcode-camera-modal" role="dialog" aria-modal="true" aria-label={title === "POS scanner" ? "Scan product barcode" : "Scan product tag or QR code"}>
   <header><div><p className="admin-eyebrow">DE VERVE · {title.toUpperCase()}</p><h3 id="barcode-camera-title">Scan barcode or QR code</h3></div><button type="button" className="admin-close" aria-label="Close camera scanner" onClick={onClose}>×</button></header>
   <div className="barcode-camera-stage"><video ref={video} autoPlay muted playsInline className={cameraActive?"is-active":"is-idle"} aria-hidden={!cameraActive}/>{!cameraActive&&<p>{error||status}</p>}{cameraActive&&<span className="barcode-camera-reticle" aria-hidden="true"/>}</div>
   {error&&<p className="admin-error" role="alert">{error}</p>}
   <p className="admin-muted" role="status">{cameraActive?status:"Camera access is requested only when you press the start button."}</p>
   {!cameraActive&&<button type="button" className="admin-primary" disabled={starting||readingFile} onClick={()=>void startCamera()}>{starting?"Requesting camera…":error?"Try camera again":"Allow camera access & start scanning"}</button>}<input ref={fileInput} type="file" accept="image/*" hidden onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value="";if(file)void processImageFile(file);}}/><button type="button" className="admin-secondary" disabled={readingFile||capturing} onClick={()=>{stopCamera();fileInput.current?.click();}}>{readingFile?"Preparing image…":"Choose product / QR / barcode photo"}</button>
   {cameraActive&&imageCallback.current&&<button type="button" className="admin-primary" disabled={capturing} onClick={()=>{const image=captureFrame();if(!image){setError("The camera image is not ready. Wait a moment and try again.");return;}stopCamera();setCapturing(true);void Promise.resolve(imageCallback.current?.(image)).catch(()=>{}).finally(()=>setCapturing(false));}}>{capturing?"Reading product label…":"Read printed label with AI"}</button>}<div className="barcode-manual-entry"><label htmlFor="barcode-manual-value">Or enter barcode / SKU manually</label><div><input id="barcode-manual-value" value={manualCode} onChange={event=>setManualCode(event.target.value)} maxLength={2048} autoComplete="off" placeholder="Scan or type product code"/><button type="button" className="admin-primary" disabled={!manualCode.trim()} onClick={()=>{const value=manualCode.trim();stopCamera();callback.current(value);onClose();}}>Use code</button></div></div><button type="button" className="admin-secondary" onClick={()=>{stopCamera();onClose();}}>Close scanner</button>
  </section>
 </div>;
}
