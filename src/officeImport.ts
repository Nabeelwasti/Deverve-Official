const MAX_ENTRIES = 250;
const MAX_UNCOMPRESSED = 12_000_000;
const MAX_RATIO = 120;
const decoder = new TextDecoder("utf-8", { fatal: true });

type ZipEntry = { name: string; method: number; flags: number; crc: number; compressed: number; size: number; offset: number };

function u16(v: DataView, p: number): number { if (p < 0 || p + 2 > v.byteLength) throw new Error("Office archive is truncated."); return v.getUint16(p, true); }
function u32(v: DataView, p: number): number { if (p < 0 || p + 4 > v.byteLength) throw new Error("Office archive is truncated."); return v.getUint32(p, true); }
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let k=0;k<8;k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function safeName(name: string): boolean {
  return !!name && name.length <= 240 && !name.startsWith("/") && !name.includes("\\") &&
    !name.split("/").some(part => part === ".." || part === ".") && !/^[A-Za-z]:/.test(name) &&
    !/[\u0000-\u001f]/.test(name);
}
async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error("This browser does not support secure Office document decompression. Use a modern Chrome browser.");
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
    const output = new Uint8Array(await new Response(stream).arrayBuffer());
    return output;
  } catch { throw new Error("The Office document contains a damaged or unsupported compressed archive."); }
}
async function readZip(file: File): Promise<Map<string, Uint8Array>> {
  if (file.size < 22 || file.size > 5_000_000) throw new Error("Office documents must be between 1 byte and 5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const min = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let p = bytes.length - 22; p >= min; p--) if (u32(view,p) === 0x06054b50) { eocd=p; break; }
  if (eocd < 0) throw new Error("This file is not a valid DOCX/XLSX ZIP package.");
  if (u16(view,eocd+4)!==0 || u16(view,eocd+6)!==0) throw new Error("Multi-disk Office archives are not supported.");
  const count = u16(view,eocd+10), cdSize=u32(view,eocd+12), cdOffset=u32(view,eocd+16), comment=u16(view,eocd+20);
  if (count===0xffff || cdSize===0xffffffff || cdOffset===0xffffffff) throw new Error("ZIP64 Office files are not supported.");
  if (count<1 || count>MAX_ENTRIES || cdOffset+cdSize>eocd || eocd+22+comment>bytes.length) throw new Error("Office archive directory is invalid or exceeds safety limits.");
  const entries:ZipEntry[]=[]; const names=new Set<string>(); let p=cdOffset; let total=0;
  for(let i=0;i<count;i++){
    if(u32(view,p)!==0x02014b50) throw new Error("Office archive directory is malformed.");
    const flags=u16(view,p+8),method=u16(view,p+10),crc=u32(view,p+16),compressed=u32(view,p+20),size=u32(view,p+24);
    const nameLen=u16(view,p+28),extraLen=u16(view,p+30),commentLen=u16(view,p+32),disk=u16(view,p+34),offset=u32(view,p+42);
    if(disk!==0 || (flags&1)!==0 || (flags&0x40)!==0) throw new Error("Encrypted or split Office archives are not accepted.");
    if(method!==0 && method!==8) throw new Error("Office archive uses an unsupported compression method.");
    if(nameLen<1 || p+46+nameLen+extraLen+commentLen>cdOffset+cdSize) throw new Error("Office archive directory entry is invalid.");
    const name=decoder.decode(bytes.subarray(p+46,p+46+nameLen));
    if(!safeName(name) || names.has(name)) throw new Error("Office archive contains an unsafe or duplicate file path.");
    names.add(name);
    if(size>MAX_UNCOMPRESSED || (compressed===0 ? size>0 : size/compressed>MAX_RATIO)) throw new Error("Office document has an unsafe compression ratio or oversized entry.");
    total+=size;if(total>MAX_UNCOMPRESSED)throw new Error("Office document expands beyond the 12 MB safety limit.");
    entries.push({name,method,flags,crc,compressed,size,offset});
    p+=46+nameLen+extraLen+commentLen;
  }
  if(p!==cdOffset+cdSize) throw new Error("Office archive directory length does not match.");
  const result=new Map<string,Uint8Array>();
  for(const entry of entries){
    if(entry.name.endsWith("/"))continue;
    const o=entry.offset;
    if(u32(view,o)!==0x04034b50)throw new Error("Office archive local file header is invalid.");
    const localFlags=u16(view,o+6),localMethod=u16(view,o+8),nameLen=u16(view,o+26),extraLen=u16(view,o+28);
    if(localFlags!==entry.flags || localMethod!==entry.method)throw new Error("Office archive headers do not match.");
    const localName=decoder.decode(bytes.subarray(o+30,o+30+nameLen));
    if(localName!==entry.name)throw new Error("Office archive entry name mismatch.");
    const start=o+30+nameLen+extraLen,end=start+entry.compressed;
    if(end>cdOffset || start>end)throw new Error("Office archive entry overlaps its directory.");
    const packed=bytes.subarray(start,end);
    const data=entry.method===0?new Uint8Array(packed):await inflateRaw(packed);
    if(data.length!==entry.size || crc32(data)!==entry.crc)throw new Error("Office archive integrity check failed for "+entry.name+".");
    result.set(entry.name,data);
  }
  return result;
}
function parseXml(bytes:Uint8Array,label:string):Document {
  const xml=decoder.decode(bytes);
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error(label+" contains a forbidden XML declaration.");
  const doc=new DOMParser().parseFromString(xml,"application/xml");
  if(doc.querySelector("parsererror"))throw new Error(label+" contains invalid XML.");
  return doc;
}
const local=(el:Element,name:string)=>Array.from(el.children).find(c=>c.localName===name)||null;
const textContent=(el:Element|null)=>el?.textContent?.replace(/\u0000/g,"").trim()||"";
function cleanText(v:string):string{return v.replace(/[\t\r ]+/g," ").replace(/\n{3,}/g,"\n\n").trim();}
export async function extractOfficeText(file:File):Promise<{text:string;mime:string}>{
  const ext=file.name.toLowerCase().split(".").pop();
  if(ext!=="docx"&&ext!=="xlsx")throw new Error("Choose a DOCX or XLSX file.");
  const zip=await readZip(file);
  if(ext==="docx"){
    const document=zip.get("word/document.xml");
    if(!document)throw new Error("DOCX package is missing its main document.");
    const xml=parseXml(document,"DOCX document");
    const body=xml.getElementsByTagNameNS("*","body")[0];
    if(!body)throw new Error("DOCX document body is missing.");
    const blocks:string[]=[];
    for(const node of Array.from(body.children)){
      if(node.localName==="p"){
        const value=cleanText(Array.from(node.getElementsByTagNameNS("*","t")).map(n=>n.textContent||"").join(""));
        if(value)blocks.push(value);
      }else if(node.localName==="tbl"){
        for(const tr of Array.from(node.getElementsByTagNameNS("*","tr"))){
          const cells=Array.from(tr.getElementsByTagNameNS("*","tc")).map(tc=>cleanText(Array.from(tc.getElementsByTagNameNS("*","t")).map(n=>n.textContent||"").join("")));
          if(cells.some(Boolean))blocks.push(cells.join(" | "));
        }
      }
    }
    const text=blocks.join("\n");
    if(!text.trim())throw new Error("No readable paragraphs or tables were found in this DOCX.");
    return {text:"[DOCX: "+file.name+"]\n"+text,mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"};
  }
  const workbookBytes=zip.get("xl/workbook.xml"),relsBytes=zip.get("xl/_rels/workbook.xml.rels");
  if(!workbookBytes||!relsBytes)throw new Error("XLSX package is missing workbook metadata.");
  const workbook=parseXml(workbookBytes,"XLSX workbook"),rels=parseXml(relsBytes,"XLSX relationships");
  const targets=new Map<string,string>();
  for(const rel of Array.from(rels.getElementsByTagNameNS("*","Relationship"))){
    const id=rel.getAttribute("Id")||"",target=rel.getAttribute("Target")||"";
    if(!id||!target||target.startsWith("/")||target.includes("..")||target.includes("\\"))throw new Error("XLSX contains an unsafe worksheet relationship.");
    targets.set(id,"xl/"+target.replace(/^\.\//,"").replace(/^xl\//,""));
  }
  const sharedBytes=zip.get("xl/sharedStrings.xml");
  const shared=sharedBytes?Array.from(parseXml(sharedBytes,"XLSX shared strings").getElementsByTagNameNS("*","si")).map(si=>Array.from(si.getElementsByTagNameNS("*","t")).map(t=>t.textContent||"").join("")):[];
  const sheets=Array.from(workbook.getElementsByTagNameNS("*","sheet"));
  if(!sheets.length||sheets.length>30)throw new Error("XLSX must contain between 1 and 30 worksheets.");
  const output:string[]=[];
  for(const sheet of sheets){
    const name=sheet.getAttribute("name")||"Sheet";
    const rid=sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id")||sheet.getAttribute("r:id")||"";
    const target=targets.get(rid);if(!target)throw new Error("XLSX worksheet relationship is missing.");
    const sheetBytes=zip.get(target);if(!sheetBytes)throw new Error("XLSX worksheet data is missing: "+name);
    const doc=parseXml(sheetBytes,"XLSX worksheet "+name);
    const rows=Array.from(doc.getElementsByTagNameNS("*","row"));
    if(rows.length>5000)throw new Error("Worksheet "+name+" exceeds 5,000 rows.");
    output.push("## Worksheet: "+cleanText(name));
    for(const row of rows){
      const cells=Array.from(row.getElementsByTagNameNS("*","c"));
      const values:string[]=[];
      for(const cell of cells){
        const ref=cell.getAttribute("r")||"";
        const type=cell.getAttribute("t")||"";
        const value=textContent(local(cell,"v"));
        let decoded=value;
        if(type==="s"){const index=Number(value);if(!Number.isInteger(index)||index<0||index>=shared.length)throw new Error("XLSX contains an invalid shared-string reference.");decoded=shared[index];}
        else if(type==="inlineStr")decoded=Array.from(cell.getElementsByTagNameNS("*","t")).map(t=>t.textContent||"").join("");
        else if(type==="b")decoded=value==="1"?"TRUE":"FALSE";
        else if(type==="e")decoded="[Excel error: "+value+"]";
        else if(!value && local(cell,"f"))decoded="[Formula without cached value]";
        values.push((ref?ref+": ":"")+cleanText(decoded));
      }
      if(values.length)output.push(values.join(" | "));
    }
  }
  const text=output.join("\n");
  if(text.length<1)throw new Error("No readable worksheet data was found in this XLSX.");
  return {text:"[XLSX: "+file.name+"]\n"+text,mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"};
}
