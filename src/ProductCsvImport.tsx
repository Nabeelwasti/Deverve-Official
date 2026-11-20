import { useState } from "react";
import { adminRequest as api } from "./adminApi";

type CsvVariant = { size: string; color: string; sku: string; barcode: string; stock: number; reorder: number; costPaisa: number };
type CsvProduct = { name: string; slug: string; description: string; category: string; audience: "men"|"women"|"kids"|"unisex"; retail: number|null; wholesale: number|null; seoTitle: string; seoDescription: string; variants: CsvVariant[]; line: number };
type ImportedProduct = { id: string; name: string; slug: string; variants: number };
type Props = { role: string; onImported: () => void };

function parseCsv(text: string): string[][] {
  if (text.length > 50_000_000) throw new Error("CSV exceeds the 50 MB safety limit.");
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false; let afterQuote = false;
  const pushCell=()=>{if(cell.length>10000)throw new Error("A CSV cell exceeds 10,000 characters.");row.push(cell);if(row.length>32)throw new Error("CSV is limited to 32 columns.");cell="";afterQuote=false;};
  const pushRow=()=>{pushCell();if(row.some(v=>v.trim()))rows.push(row);row=[];};
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==="\u0000")throw new Error("CSV contains a null character.");
    if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"'){quoted=false;afterQuote=true;}else cell+=ch;continue;}
    if(afterQuote){if(ch===" "||ch==="\t")continue;if(ch===","){pushCell();continue;}if(ch==="\n"||ch==="\r"){if(ch==="\r"&&text[i+1]==="\n")i++;pushRow();continue;}throw new Error("CSV contains unexpected text after a quoted field.");}
    if(ch==='"'){if(cell.length!==0)throw new Error("CSV contains a quote inside an unquoted field.");quoted=true;}
    else if(ch===",")pushCell();
    else if(ch==="\n"||ch==="\r"){if(ch==="\r"&&text[i+1]==="\n")i++;pushRow();}
    else cell+=ch;
    if(cell.length>10000)throw new Error("A CSV cell exceeds 10,000 characters.");
    if(rows.length>25000)throw new Error("Import is limited to 25,000 data rows per file. Split a larger catalogue into multiple files.");
  }
  if(quoted)throw new Error("CSV contains an unclosed quoted field.");
  pushRow();return rows;
}
const slugify=(v:string)=>v.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g,"").trim().replace(/[\s_-]+/g,"-").replace(/^-|-$/g,"").slice(0,120);
const money=(v:string):number|null=>{if(!v.trim())return null;if(!/^\d+(?:\.\d{1,2})?$/.test(v.trim()))throw new Error("Prices must be PKR amounts with up to two decimals.");const n=Number(v);if(!Number.isFinite(n)||n>1_000_000_000)throw new Error("Price is outside the supported range.");return Math.round(n*100);};

function buildProducts(raw:string):CsvProduct[] {
  const rows=parseCsv(raw);if(rows.length<2)throw new Error("CSV needs a header row and at least one product row.");
  if(rows.length>25001)throw new Error("Import is limited to 25,000 data rows per file.");
  const headers=rows[0].map((v,i)=>(i===0?v.replace(/^\uFEFF/,""):v).trim().toLowerCase().replace(/[\s-]+/g,"_"));
  if(new Set(headers).size!==headers.length)throw new Error("CSV contains duplicate column headings.");
  const required=["name","category","audience","size","color"];
  const missing=required.filter(h=>!headers.includes(h));if(missing.length)throw new Error("Missing required columns: "+missing.join(", "));
  const at=(r:string[],key:string)=>{const i=headers.indexOf(key);return i<0?"":(r[i]??"").trim();};
  const grouped=new Map<string,CsvProduct>(),allSkus=new Set<string>(),allBarcodes=new Set<string>();
  for(let i=1;i<rows.length;i++){
    const r=rows[i];if(r.length>headers.length)throw new Error("Row "+(i+1)+" has more values than the header.");
    const name=at(r,"name"),category=at(r,"category"),audience=at(r,"audience").toLowerCase();
    if(name.length<2||name.length>120||category.length<2||category.length>60)throw new Error("Row "+(i+1)+": product name or category is invalid.");
    if(!["men","women","kids","unisex"].includes(audience))throw new Error("Row "+(i+1)+": audience must be men, women, kids or unisex.");
    const slug=slugify(at(r,"slug")||name);if(!slug)throw new Error("Row "+(i+1)+": could not generate a valid product slug.");
    const key=slug.toLowerCase();
    let p=grouped.get(key);
    const retail=money(at(r,"retail_price_pkr")),wholesale=money(at(r,"wholesale_price_pkr"));
    const description=at(r,"description").slice(0,4000),seoTitle=at(r,"seo_title").slice(0,70),seoDescription=at(r,"seo_description").slice(0,160);
    if(!p){p={name,slug,description,category,audience:audience as CsvProduct["audience"],retail,wholesale,seoTitle,seoDescription,variants:[],line:i+1};grouped.set(key,p);}
    else if(p.name!==name||p.description!==description||p.category!==category||p.audience!==audience||p.retail!==retail||p.wholesale!==wholesale||p.seoTitle!==seoTitle||p.seoDescription!==seoDescription)throw new Error("Rows for "+name+" must repeat identical product-level fields.");
    const size=at(r,"size"),color=at(r,"color");
    const hasVariant=Boolean(size||color||at(r,"sku")||at(r,"barcode")||at(r,"stock")||at(r,"reorder_level")||at(r,"cost_price_pkr"));
    if(hasVariant){
      if(!size||!color||size.length>32||color.length>32||/[;,|\n]/.test(size+color))throw new Error("Row "+(i+1)+": each stock row needs one size and one colour.");
      const integer=(value:string,label:string,def:number)=>{if(!value)return def;if(!/^\d+$/.test(value))throw new Error("Row "+(i+1)+": "+label+" must be a whole number.");const n=Number(value);if(!Number.isSafeInteger(n)||n>1_000_000)throw new Error("Row "+(i+1)+": "+label+" is outside the supported range.");return n;};
      const sku=at(r,"sku"),barcode=at(r,"barcode");if(sku&&!/^[A-Za-z0-9._-]{2,64}$/.test(sku))throw new Error("Row "+(i+1)+": SKU must use 2–64 letters, numbers, dots, underscores or hyphens.");if(barcode&&!/^[A-Za-z0-9._:-]{3,64}$/.test(barcode))throw new Error("Row "+(i+1)+": barcode must use 3–64 letters, numbers or safe separators.");if(sku){const key=sku.toLowerCase();if(allSkus.has(key))throw new Error("Row "+(i+1)+": duplicate SKU "+sku+" in this file.");allSkus.add(key);}if(barcode){const key=barcode.toLowerCase();if(allBarcodes.has(key))throw new Error("Row "+(i+1)+": duplicate barcode "+barcode+" in this file.");allBarcodes.add(key);}
      p.variants.push({size,color,sku,barcode,stock:integer(at(r,"stock"),"stock",0),reorder:integer(at(r,"reorder_level"),"reorder level",5),costPaisa:money(at(r,"cost_price_pkr"))??0});
      if(p.variants.length>100)throw new Error(name+" exceeds 100 size/colour combinations.");
    }
  }
  if(grouped.size>1000)throw new Error("A file can contain up to 1,000 products. Split larger catalogues into additional files.");
  let totalVariants=0;
  for(const p of grouped.values()){
    totalVariants+=p.variants.length;
    if(p.variants.length===0)throw new Error(p.name+" has no size/colour stock rows. Add at least one variant row.");
    const seen=new Set<string>(),skus=new Set<string>(),barcodes=new Set<string>();for(const v of p.variants){const k=v.size.trim().toLowerCase()+"::"+v.color.trim().toLowerCase();if(seen.has(k))throw new Error(p.name+" has a duplicate "+v.size+" / "+v.color+" combination.");seen.add(k);if(v.sku){const key=v.sku.toLowerCase();if(skus.has(key))throw new Error(p.name+" has a duplicate SKU: "+v.sku);skus.add(key);}if(v.barcode){const key=v.barcode.toLowerCase();if(barcodes.has(key))throw new Error(p.name+" has a duplicate barcode: "+v.barcode);barcodes.add(key);}}
  }
  if(totalVariants>25000)throw new Error("Import is limited to 25,000 size/colour rows per file. Split the catalogue into multiple files.");
  return [...grouped.values()];
}

function makeBatches(products:CsvProduct[]):CsvProduct[][] {
  const batches:CsvProduct[][]=[];let current:CsvProduct[]=[],variants=0;
  for(const product of products){
    if(current.length&&(current.length>=20||variants+product.variants.length>250)){batches.push(current);current=[];variants=0;}
    current.push(product);variants+=product.variants.length;
  }
  if(current.length)batches.push(current);
  return batches;
}
async function stableAssetId(file:File):Promise<string>{
  const bytes=await file.arrayBuffer(),name=new TextEncoder().encode(file.name+"\u0000"),identity=new Uint8Array(name.length+bytes.byteLength);
  identity.set(name);identity.set(new Uint8Array(bytes),name.length);
  const digest=await crypto.subtle.digest("SHA-256",identity),hex=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
  return hex.slice(0,8)+"-"+hex.slice(8,12)+"-5"+hex.slice(13,16)+"-a"+hex.slice(17,20)+"-"+hex.slice(20,32);
}
function imageMatches(file:File,slug:string):boolean{
  const base=slugify(file.name.replace(/\.[^.]+$/,""));
  return base===slug||base.startsWith(slug+"-");
}

export default function ProductCsvImport({role,onImported}:Props){
 const [products,setProducts]=useState<CsvProduct[]>([]),[images,setImages]=useState<File[]>([]),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[report,setReport]=useState<string[]>([]),[progress,setProgress]=useState(""),[resumeIndex,setResumeIndex]=useState(0),[publishAfterImport,setPublishAfterImport]=useState(false),[importedProducts,setImportedProducts]=useState<ImportedProduct[]>([]);
 const canSetCost=["owner","manager"].includes(role);
 const template="name,slug,description,category,audience,retail_price_pkr,wholesale_price_pkr,seo_title,seo_description,size,color,sku,barcode,stock,reorder_level,cost_price_pkr\nPremium Hoodie,premium-hoodie,Imported quality hoodie,Hoodies,unisex,2500,1800,Premium Hoodie | De VERVE,Comfortable everyday hoodie,S,Black,DV-HOOD-S,8901234567890,12,3,1100\nPremium Hoodie,premium-hoodie,Imported quality hoodie,Hoodies,unisex,2500,1800,Premium Hoodie | De VERVE,Comfortable everyday hoodie,M,Black,DV-HOOD-M,8901234567891,18,3,1100\nPremium Hoodie,premium-hoodie,Imported quality hoodie,Hoodies,unisex,2500,1800,Premium Hoodie | De VERVE,Comfortable everyday hoodie,S,Navy,DV-HOOD-S-NAVY,8901234567892,7,2,1100";
 const batches=makeBatches(products);
 const load=async(f:File|null)=>{setProducts([]);setImages([]);setReport([]);setResumeIndex(0);setImportedProducts([]);setPublishAfterImport(false);setProgress("");setMessage("");if(!f)return;if(!f.name.toLowerCase().endsWith(".csv")||f.size>50_000_000){setMessage("Choose a CSV file no larger than 50 MB.");return;}try{const parsed=buildProducts(await f.text());if(!canSetCost&&parsed.some(p=>p.variants.some(v=>v.costPaisa>0)))throw new Error("Only owners and managers can import purchase costs. Remove cost_price_pkr values or ask an owner to import this file.");setProducts(parsed);setMessage("Validated "+parsed.length+" products and "+parsed.reduce((n,p)=>n+p.variants.length,0)+" unique size/colour combinations. The importer will commit safe atomic batches and keep every product unpublished until you publish it.");}catch(e){setMessage(e instanceof Error?e.message:"CSV validation failed.");}};
 const chooseImages=(files:File[])=>{const invalid=files.find(file=>!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size<1||file.size>5_000_000);if(invalid){setImages([]);setMessage(invalid.name+" must be a valid JPG, PNG or WebP image up to 5 MB.");return;}const unmatched=files.filter(file=>!products.some(p=>imageMatches(file,p.slug)));const tooMany=products.find(p=>files.filter(file=>imageMatches(file,p.slug)).length>100);if(tooMany){setImages([]);setMessage(tooMany.name+" has more than 100 matched photos. Select up to 100 images per product.");return;}setImages(files);setMessage(files.length+" product images selected. "+unmatched.length+" filename(s) do not match a product slug and will be reported, not attached.");};
 const uploadProductImages=async(product:ImportedProduct,files:File[])=>{
   let attached=0;const failures:string[]=[];
   for(let offset=0;offset<files.length;offset+=4){
     const batch=files.slice(offset,offset+4);
     try {
       const ids=await Promise.all(batch.map(stableAssetId)),form=new FormData();
       for(const file of batch)form.append("files",file,file.name);
       form.append("asset_ids",JSON.stringify(ids));form.append("alt_text",product.name+" · De VERVE product catalogue");
       const result=await api<{media?:Array<{id:string;status:string}>;failures?:Array<{name:string;error:string}>}>("/api/admin/media/bulk",{method:"POST",body:form});
       for(const failure of result.failures||[])failures.push(failure.name+": "+failure.error);
       for(let i=0;i<(result.media||[]).length;i++){
         const media=result.media![i];const file=batch.find(f=>ids[batch.indexOf(f)]===media.id)||batch[i];
         if(!media?.id){failures.push((file?.name||"Image")+": upload returned no media identifier.");continue;}
         try{await api("/api/admin/products/"+product.id+"/media",{method:"POST",body:JSON.stringify({media_id:media.id,color:"",is_primary:attached===0,position:attached})});attached++;}
         catch(e){failures.push((file?.name||"Image")+": "+(e instanceof Error?e.message:"Could not attach image."));}
       }
       if((result.media||[]).length+failures.length<batch.length)failures.push("Some images in "+product.name+" were not confirmed by the media service.");
     } catch(e) { for(const file of batch)failures.push(file.name+": "+(e instanceof Error?e.message:"Upload request failed.")); }
   }
   return {attached,failures};
 };
 const commit=async()=>{
   if(!products.length||busy)return;
   setBusy(true);setReport([]);const completed:ImportedProduct[]=[];const createdProducts:ImportedProduct[]=[...importedProducts];
   try{
     for(let index=resumeIndex;index<batches.length;index++){
       const batch=batches[index];setProgress("Importing catalogue batch "+(index+1)+" of "+batches.length+" · "+batch.length+" products…");
       const payload={products:batch.map(p=>({name:p.name,slug:p.slug,description:p.description,category:p.category,audience:p.audience,status:"draft",retail_price_paisa:p.retail,wholesale_price_paisa:p.wholesale,seo_title:p.seoTitle,seo_description:p.seoDescription,variants:p.variants.map(v=>({size:v.size,color:v.color,...(v.sku?{sku:v.sku}:{}),...(v.barcode?{barcode:v.barcode}:{}),initial_stock:v.stock,reorder_level:v.reorder,...(canSetCost?{cost_price_paisa:v.costPaisa}:{})}))}))};
       const result=await api<{imported:number;variants:number;atomic:boolean;products:ImportedProduct[]}>("/api/admin/products/import",{method:"POST",body:JSON.stringify(payload)});
       if(result.atomic!==true||result.imported!==batch.length||!Array.isArray(result.products)||result.products.length!==batch.length)throw new Error("The server did not confirm every product in batch "+(index+1)+". Stop here and verify the catalogue before retrying.");
       completed.push(...result.products);createdProducts.push(...result.products);setImportedProducts([...createdProducts]);setResumeIndex(index+1);
       setReport(current=>[...current,...completed.splice(0)]);
     }
     for(const imported of createdProducts){
       const matched=images.filter(file=>imageMatches(file,imported.slug));
       if(matched.length){setProgress("Uploading "+matched.length+" image(s) for "+imported.name+"…");const imageResult=await uploadProductImages(imported,matched);if(imageResult.failures.length)setReport(current=>[...current,imported.name+" · IMAGE REVIEW: "+imageResult.failures.join(" | ")]);else if(imageResult.attached)setReport(current=>[...current,imported.name+" · "+imageResult.attached+" image(s) attached"]);}
     }
     const unmatched=images.filter(file=>!products.some(p=>imageMatches(file,p.slug)));
     if(unmatched.length)setReport(current=>[...current,...unmatched.map(file=>"Unmatched image (not uploaded): "+file.name)]);
     let published=0;
     if(publishAfterImport){
       setProgress("Checking every product, stock combination and cover photo before publication…");
       const result=await api<{published:number}>("/api/admin/products/publish-bulk",{method:"POST",body:JSON.stringify({product_ids:createdProducts.map(p=>p.id)})});
       if(result.published!==createdProducts.length)throw new Error("The server did not confirm publication of the complete catalogue. Refresh Products & catalogue before retrying.");
       published=result.published;
     }
     setMessage("Import completed. "+products.length+" products and "+products.reduce((n,p)=>n+p.variants.length,0)+" variants were saved in "+batches.length+" atomic batches. "+(publishAfterImport?"Published "+published+" products after server-side checks.":"Products remain drafts; review details and images before publishing."));
     setProducts([]);setImages([]);setResumeIndex(0);setImportedProducts([]);onImported();
   }catch(e){setMessage((e instanceof Error?e.message:"Import stopped.")+" Completed batches are retained. Do not restart the entire file; verify the last batch in Products & catalogue before resuming.");}
   finally{setBusy(false);setProgress("");}
 };
 return <section className="admin-csv-import" aria-labelledby="csv-import-title">
  <div className="admin-panel-heading"><div><h2 id="csv-import-title">Bulk catalogue import</h2><p className="admin-muted">Import large catalogues from CSV, attach product photos by filename, and keep every batch auditable.</p></div><button type="button" className="admin-secondary" onClick={()=>{const blob=new Blob([template],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="deverve-product-import-template.csv";a.click();URL.revokeObjectURL(url);}}>Download template</button></div>
  <label>Choose catalogue CSV<input type="file" accept=".csv,text/csv" disabled={busy||importedProducts.length>0} onChange={e=>void load(e.target.files?.[0]??null)}/></label>
  <label>Choose matching product photos (optional)<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy||!products.length} onChange={e=>{chooseImages(Array.from(e.target.files??[]));e.currentTarget.value="";}}/><small>Name each photo with its product slug, for example premium-hoodie-front.jpg and premium-hoodie-back.jpg. Each file must be JPG, PNG or WebP up to 5 MB. Uploads use authenticated, content-verified, retry-safe media batches.</small></label>
  {message&&<p className="admin-message" role="status">{message}</p>}{progress&&<p className="admin-message" role="status" aria-live="polite">{progress}</p>}
  {products.length>0&&<>{canSetCost&&<label className="admin-csv-publish-option"><input type="checkbox" checked={publishAfterImport} disabled={busy} onChange={e=>setPublishAfterImport(e.target.checked)}/> Publish after import in one secure operation <small>Owner/manager only. Every product must have a valid retail price, a purchasable in-stock variant, and an attached cover photo. If even one product fails, none will be published.</small></label>}<p>{products.length} products · {products.reduce((n,p)=>n+p.variants.length,0)} variants · {batches.length} safe atomic batches · {images.length} photos selected · Draft first</p><div className="admin-table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Audience</th><th>Retail (PKR)</th><th>Variants</th><th>Opening stock</th><th>Matched photos</th></tr></thead><tbody>{products.slice(0,100).map(p=><tr key={p.slug}><td>{p.name}</td><td>{p.category}</td><td>{p.audience}</td><td>{p.retail===null?"—":(p.retail/100).toFixed(2)}</td><td>{p.variants.length}</td><td>{p.variants.reduce((n,v)=>n+v.stock,0)}</td><td>{images.filter(file=>imageMatches(file,p.slug)).length}</td></tr>)}</tbody></table></div>{products.length>100&&<p className="admin-muted">Showing first 100 rows in the preview. All {products.length} products are included in the import.</p>}<button type="button" className="admin-primary" disabled={busy||(resumeIndex>=batches.length&&!publishAfterImport)} onClick={()=>void commit()}>{busy?"Importing…":resumeIndex>=batches.length&&publishAfterImport?"Publish imported catalogue":resumeIndex>0?"Resume from batch "+(resumeIndex+1):"Import all products + attach matching photos"}</button></>}
  {report.length>0&&<ul>{report.map((line,i)=><li key={i}>{line}</li>)}</ul>}
  <p className="admin-muted">Required columns: name, category, audience, size, color. Optional: slug, description, retail_price_pkr, wholesale_price_pkr, seo_title, seo_description, sku, barcode, stock, reorder_level, cost_price_pkr. Up to 1,000 products / 25,000 size-colour rows per CSV. Each server transaction contains at most 20 products and 250 variants; a failed batch does not roll back earlier completed batches. Purchase costs are owner/manager only. SKU and barcode values are generated by the server. Products are drafts by default. The optional owner/manager publish action is a separate server-validated, all-or-none operation after image attachment.</p>
 </section>;
}
