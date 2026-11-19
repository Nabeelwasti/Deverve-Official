import { useState } from "react";
import { adminRequest as api } from "./adminApi";

type CsvVariant = { size: string; color: string; stock: number; reorder: number; costPaisa: number };
type CsvProduct = { name: string; slug: string; description: string; category: string; audience: "men"|"women"|"kids"|"unisex"; retail: number|null; wholesale: number|null; variants: CsvVariant[]; line: number };
type Props = { role: string; onImported: () => void };

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i=0;i<text.length;i++) {
    const ch=text[i];
    if (quoted) { if(ch === '"' && text[i+1] === '"'){cell+='"';i++;} else if(ch === '"') quoted=false; else cell+=ch; }
    else if(ch === '"' && cell.length===0) quoted=true;
    else if(ch === ","){row.push(cell);cell="";}
    else if(ch === "\n" || ch === "\r"){ if(ch==="\r"&&text[i+1]==="\n")i++;row.push(cell);cell="";if(row.some(v=>v.trim()))rows.push(row);row=[]; }
    else cell+=ch;
  }
  if(quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
  return rows;
}
const slugify=(v:string)=>v.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g,"").trim().replace(/[\s_-]+/g,"-").replace(/^-|-$/g,"").slice(0,120);
const money=(v:string):number|null=>{if(!v.trim())return null;if(!/^\d+(?:\.\d{1,2})?$/.test(v.trim()))throw new Error("Prices must be PKR amounts with up to two decimals.");const n=Number(v);if(!Number.isFinite(n)||n>1_000_000_000)throw new Error("Price is outside the supported range.");return Math.round(n*100);};

function buildProducts(raw:string):CsvProduct[] {
  if(raw.length>5_000_000)throw new Error("CSV file exceeds the 5 MB limit.");
  const rows=parseCsv(raw);if(rows.length<2)throw new Error("CSV needs a header row and at least one product row.");
  if(rows.length>501)throw new Error("Import is limited to 500 data rows per file.");
  const headers=rows[0].map(v=>v.trim().toLowerCase().replace(/[\s-]+/g,"_"));
  const required=["name","category","audience"];
  const missing=required.filter(h=>!headers.includes(h));if(missing.length)throw new Error("Missing required columns: "+missing.join(", "));
  const at=(r:string[],key:string)=>{const i=headers.indexOf(key);return i<0?"":(r[i]??"").trim();};
  const grouped=new Map<string,CsvProduct>();
  for(let i=1;i<rows.length;i++){
    const r=rows[i];if(r.length>headers.length)throw new Error("Row "+(i+1)+" has more values than the header.");
    const name=at(r,"name");const category=at(r,"category");const audience=at(r,"audience").toLowerCase();
    if(name.length<2||name.length>120||category.length<2||category.length>60)throw new Error("Row "+(i+1)+": product name or category is invalid.");
    if(!["men","women","kids","unisex"].includes(audience))throw new Error("Row "+(i+1)+": audience must be men, women, kids or unisex.");
    const slug=slugify(at(r,"slug")||name);if(!slug)throw new Error("Row "+(i+1)+": could not generate a valid product slug.");
    const key=slug.toLowerCase();
    let p=grouped.get(key);
    const retail=money(at(r,"retail_price_pkr")),wholesale=money(at(r,"wholesale_price_pkr"));
    if(!p){p={name,slug,description:at(r,"description").slice(0,4000),category,audience:audience as CsvProduct["audience"],retail,wholesale,variants:[],line:i+1};grouped.set(key,p);}
    else if(p.name!==name||p.category!==category||p.audience!==audience||p.retail!==retail||p.wholesale!==wholesale)throw new Error("Rows for "+name+" must repeat identical product-level fields.");
    const size=at(r,"size"),color=at(r,"color");
    const hasVariant=Boolean(size||color||at(r,"stock")||at(r,"reorder_level")||at(r,"cost_price_pkr"));
    if(hasVariant){
      if(!size||!color||size.length>32||color.length>32||/[;,|\n]/.test(size+color))throw new Error("Row "+(i+1)+": each stock row needs one size and one colour.");
      const integer=(value:string,label:string,def:number)=>{if(!value)return def;if(!/^\d+$/.test(value))throw new Error("Row "+(i+1)+": "+label+" must be a whole number.");const n=Number(value);if(!Number.isSafeInteger(n)||n>1_000_000)throw new Error("Row "+(i+1)+": "+label+" is outside the supported range.");return n;};
      p.variants.push({size,color,stock:integer(at(r,"stock"),"stock",0),reorder:integer(at(r,"reorder_level"),"reorder level",5),costPaisa:money(at(r,"cost_price_pkr"))??0});
      if(p.variants.length>100)throw new Error(name+" exceeds 100 size/colour combinations.");
    }
  }
  for(const p of grouped.values()){
    if(p.variants.length===0)throw new Error(p.name+" has no size/colour stock rows. Add at least one variant row.");
    const seen=new Set<string>();for(const v of p.variants){const k=v.size.trim().toLowerCase()+"::"+v.color.trim().toLowerCase();if(seen.has(k))throw new Error(p.name+" has a duplicate "+v.size+" / "+v.color+" combination.");seen.add(k);}
  }
  return [...grouped.values()];
}

export default function ProductCsvImport({role,onImported}:Props){
 const [products,setProducts]=useState<CsvProduct[]>([]),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[report,setReport]=useState<string[]>([]);
 const canSetCost=["owner","manager"].includes(role);
 const template="name,slug,description,category,audience,retail_price_pkr,wholesale_price_pkr,size,color,stock,reorder_level,cost_price_pkr\nPremium Hoodie,premium-hoodie,Imported quality hoodie,Hoodies,unisex,2500,1800,S,Black,12,3,1100\nPremium Hoodie,premium-hoodie,Imported quality hoodie,Hoodies,unisex,2500,1800,M,Black,18,3,1100\nPremium Hoodie,premium-hoodie,Imported quality hoodie,Hoodies,unisex,2500,1800,S,Navy,7,2,1100";
 const load=async(f:File|null)=>{setProducts([]);setReport([]);setMessage("");if(!f)return;if(!f.name.toLowerCase().endsWith(".csv")||f.size>5_000_000){setMessage("Choose a CSV file no larger than 5 MB.");return;}try{const parsed=buildProducts(await f.text());setProducts(parsed);setMessage("Validated "+parsed.length+" products and "+parsed.reduce((n,p)=>n+p.variants.length,0)+" unique size/colour combinations. All imports will be created as drafts.");}catch(e){setMessage(e instanceof Error?e.message:"CSV validation failed.");}};
 const commit=async()=>{if(!products.length||busy)return;setBusy(true);setReport([]);try{const payload={products:products.map(p=>({name:p.name,slug:p.slug,description:p.description,category:p.category,audience:p.audience,status:"draft",retail_price_paisa:p.retail,wholesale_price_paisa:p.wholesale,variants:p.variants.map(v=>({size:v.size,color:v.color,initial_stock:v.stock,reorder_level:v.reorder,...(canSetCost?{cost_price_paisa:v.costPaisa}:{})}))}))};const result=await api<{imported:number;variants:number;atomic:boolean;products:Array<{name:string;variants:number}>}>("/api/admin/products/import",{method:"POST",body:JSON.stringify(payload)});if(result.atomic!==true||result.imported!==products.length)throw new Error("Server did not confirm a complete atomic import.");setReport(result.products.map(p=>"Imported draft: "+p.name+" · "+p.variants+" variants"));setMessage("Atomic import completed: "+result.imported+" products and "+result.variants+" variants. All products remain unpublished drafts.");onImported();}catch(e){setMessage(e instanceof Error?e.message:"Atomic CSV import failed. No partial batch was accepted.");}finally{setBusy(false);}};
 return <section className="admin-panel" aria-labelledby="csv-import-title"><div className="admin-panel-heading"><div><h2 id="csv-import-title">Bulk product import (CSV)</h2><p className="admin-muted">One row per size/colour combination. Repeated product details are grouped automatically.</p></div><button type="button" className="admin-secondary" onClick={()=>{const blob=new Blob([template],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="deverve-product-import-template.csv";a.click();URL.revokeObjectURL(url);}}>Download template</button></div><label>Choose CSV file<input type="file" accept=".csv,text/csv" disabled={busy} onChange={e=>void load(e.target.files?.[0]??null)}/></label>{message&&<p className="admin-message" role="status">{message}</p>}{products.length>0&&<><p>{products.length} products · {products.reduce((n,p)=>n+p.variants.length,0)} variants · Draft only</p><div className="admin-table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Audience</th><th>Price (PKR)</th><th>Variants</th><th>Opening stock</th></tr></thead><tbody>{products.map(p=><tr key={p.slug}><td>{p.name}</td><td>{p.category}</td><td>{p.audience}</td><td>{p.retail===null?"—":(p.retail/100).toFixed(2)}</td><td>{p.variants.length}</td><td>{p.variants.reduce((n,v)=>n+v.stock,0)}</td></tr>)}</tbody></table></div><button type="button" className="admin-primary" disabled={busy} onClick={()=>void commit()}>{busy?"Importing…":"Import validated drafts"}</button></>}{report.length>0&&<ul>{report.map((line,i)=><li key={i}>{line}</li>)}</ul>}<p className="admin-muted">Required columns: name, category, audience, size, color. Optional: slug, description, retail_price_pkr, wholesale_price_pkr, stock, reorder_level, cost_price_pkr. SKU/barcode identifiers are generated by the system; assign supplier codes after import. The complete import batch is committed atomically: either every product, variant, opening-stock movement and audit event is saved, or none are. Products are always drafts.</p></section>;
}
