import {useEffect,useRef,useState} from "react";
type DetectedBarcode={rawValue:string};
type DetectorLike={detect(source:HTMLVideoElement):Promise<DetectedBarcode[]>};
type DetectorConstructor=new(options:{formats:string[]})=>DetectorLike;
export default function BarcodeScanner({onDetected,onClose}:{onDetected:(value:string)=>void;onClose:()=>void}){
 const video=useRef<HTMLVideoElement|null>(null),stream=useRef<MediaStream|null>(null),callback=useRef(onDetected);
 const [status,setStatus]=useState("Starting camera…"),[error,setError]=useState("");
 callback.current=onDetected;
 useEffect(()=>{
  let active=true,frame=0,detecting=false;
  const stop=()=>{if(frame)cancelAnimationFrame(frame);stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;};
  const start=async()=>{
   const Detector=(window as Window&{BarcodeDetector?:DetectorConstructor}).BarcodeDetector;
   if(!Detector){setError("This browser does not support native camera barcode detection. Use a USB scanner or enter the SKU/barcode manually.");return;}
   if(!navigator.mediaDevices?.getUserMedia){setError("Camera access is unavailable in this browser. Check camera permissions or enter the barcode manually.");return;}
   try{
    const detector=new Detector({formats:["ean_13","ean_8","code_128","code_39","upc_a","upc_e","qr_code"]});
    const camera=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}}});
    if(!active){camera.getTracks().forEach(track=>track.stop());return;}
    stream.current=camera;
    if(!video.current){setError("Camera preview could not be opened.");return;}
    video.current.srcObject=camera;await video.current.play();setStatus("Point the rear camera at a product barcode");
    const tick=async()=>{
     if(!active||detecting)return;
     detecting=true;
     try{const codes=await detector.detect(video.current!);const value=codes.find(item=>item.rawValue?.trim())?.rawValue?.trim();if(value){callback.current(value);return;}}
     catch{/* Keep scanning; a blurred frame is normal. */}
     finally{detecting=false;}
     if(active)frame=requestAnimationFrame(()=>void tick());
    };
    frame=requestAnimationFrame(()=>void tick());
   }catch(caught){setError(caught instanceof Error?caught.message:"Camera permission was denied or the camera is unavailable.");}
  };
  void start();
  return()=>{active=false;stop();};
 },[]);
 return <div className="barcode-camera-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
  <section className="barcode-camera-modal" role="dialog" aria-modal="true" aria-labelledby="barcode-camera-title">
   <header><div><p className="admin-eyebrow">DE VERVE · POS SCANNER</p><h3 id="barcode-camera-title">Scan product barcode</h3></div><button type="button" className="admin-close" aria-label="Close camera scanner" onClick={onClose}>×</button></header>
   <div className="barcode-camera-stage">{error?<p role="alert">{error}</p>:<video ref={video} autoPlay muted playsInline/>}<span className="barcode-camera-reticle" aria-hidden="true"/></div>
   <p className="admin-muted" role="status">{error?"Manual barcode entry remains available in the POS search field.":status}</p>
   <button type="button" className="admin-secondary" onClick={onClose}>Close scanner</button>
  </section>
 </div>;
}
