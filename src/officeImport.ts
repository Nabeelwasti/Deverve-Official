const MAX_ENTRIES=250,MAX_EXPANDED=12_000_000,MAX_RATIO=120;
const decoder=new TextDecoder("utf-8",{fatal:true});
type Entry={name:string;method:number;flags:number;crc:number;compressed:number;size:number;offset:number};
function u16(v:DataView,p:number){if(p<0||p+2>v.byteLength)throw new Error("Office archive is truncated.");return v.getUint16(p,true);}
function u32(v:DataView,p:number){if(p<0||p+4>v.byteLength)throw new Error("Office archive is truncated.");return v.getUint32(p,true);}
function crc32(a:Uint8Array){let c=0xffffffff;for(const b of a){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function safePath(s:string){return !!s&&s.length<=240&&!s.startsWith("/")&&!s.includes("\\")&&!s.split("/").some(x=>x===".."||x===".")&&!/^[A-Za-z]:/.test(s)&&!/[\u0000-\u001f]/.test(s);}
async function inflate(a:Uint8Array){if(typeof DecompressionStream==="undefined")throw new Error("Use a modern Chrome browser to read DOCX/XLSX files.");try{return new Uint8Array(await new Response(new Blob([a]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat))).arrayBuffer());}catch{throw new Error("Office document contains damaged or unsupported compressed data.");}}
async function unzip(file:File){
 if(file.size<22||file.size>5_000_000)throw new Error("Office documents must be no larger than 5 MB.");
 const bytes=new Uint8Array(await file.arrayBuffer()),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),min=Math.max(0,bytes.length-65557);let end=-1;
 for(let p=bytes.length-22;p>=min;p--)if(u32(v,p)===0x06054b50){end=p;break;}
 if(end<0)throw new Error("This is not a valid DOCX/XLSX ZIP package.");
 if(u16(v,end+4)!==0||u16(v,end+6)!==0)throw new Error("Multi-disk Office archives are not supported.");
 const count=u16(v,end+10),cdSize=u32(v,end+12),cdOffset=u32(v,end+16),comment=u16(v,end+20);
 if(count===0xffff||cdSize===0xffffffff||cdOffset===0xffffffff)throw new Error("ZIP64 Office files are not supported.");
 if(count<1||count>MAX_ENTRIES||cdOffset+cdSize>end||end+22+comment>bytes.length)throw new Error("Office archive directory exceeds safety limits.");
 const entries:Entry[]=[],names=new Set<string>();let p=cdOffset,total=0;
 for(let i=0;i<count;i++){
  if(u32(v,p)!==0x02014b50)throw new Error("Office archive directory is malformed.");
  const flags=u16(v,p+8),method=u16(v,p+10),crc=u32(v,p+16),compressed=u32(v,p+20),size=u32(v,p+24),nl=u16(v,p+28),el=u16(v,p+30),cl=u16(v,p+32),disk=u16(v,p+34),offset=u32(v,p+42);
  if(disk!==0||(flags&1)!==0||(flags&0x40)!==0)throw new Error("Encrypted or split Office archives are not accepted.");
  if(method!==0&&method!==8)throw new Error("Unsupported Office compression method.");
  if(nl<1||p+46+nl+el+cl>cdOffset+cdSize)throw new Error("Office archive entry is invalid.");
  const name=decoder.decode(bytes.subarray(p+46,p+46+nl));
  if(!safePath(name)||names.has(name))throw new Error("Office archive contains an unsafe or duplicate path.");names.add(name);
  if(size>MAX_EXPANDED||(compressed===0?size>0:size/compressed>MAX_RATIO))throw new Error("Office document has an unsafe compression ratio or oversized entry.");
  total+=size;if(total>MAX_EXPANDED)throw new Error("Office document expands beyond 12 MB.");
  entries.push({name,method,flags,crc,compressed,size,offset});p+=46+nl+el+cl;
 }
 if(p!==cdOffset+cdSize)throw new Error("Office archive directory length mismatch.");
 const files=new Map<string,Uint8Array>();
 for(const e of entries){
  if(e.name.endsWith("/"))continue;const o=e.offset;if(u32(v,o)!==0x04034b50)throw new Error("Office local file header is invalid.");
  const flags=u16(v,o+6),method=u16(v,o+8),nl=u16(v,o+26),el=u16(v,o+28),name=decoder.decode(bytes.subarray(o+30,o+30+nl));
  if(flags!==e.flags||method!==e.method||name!==e.name)throw new Error("Office archive headers do not match.");
  const start=o+30+nl+el,stop=start+e.compressed;if(start>stop||stop>cdOffset)throw new Error("Office entry overlaps its directory.");
  const packed=bytes.subarray(start,stop),data=e.method===0?new Uint8Array(packed):await inflate(packed);
  if(data.length!==e.size||crc32(data)!==e.crc)throw new Error("Office archive integrity check failed for "+e.name+".");files.set(e.name,data);
 }
 return files;
}
function xml(a:Uint8Array,label:string){const s=decoder.decode(a);if(/<!DOCTYPE|<!ENTITY/i.test(s))throw new Error(label+" contains a forbidden XML declaration.");const d=new DOMParser().parseFromString(s,"application/xml");if(d.querySelector("parsererror"))throw new Error(label+" contains invalid XML.");return d;}
const child=(e:Element,n:string)=>Array.from(e.children).find(x=>x.localName===n)||null;
const val=(e:Element|null)=>e?.textContent?.replace(/\u0000/g,"").trim()||"";
const tidy=(s:string)=>s.replace(/[\t\r ]+/g," ").replace(/\n{3,}/g,"\n\n").trim();
export async function extractOfficeText(file:File):Promise<{text:string;mime:string}>{
 const ext=file.name.toLowerCase().split(".").pop();if(ext!=="docx"&&ext!=="xlsx")throw new Error("Choose a DOCX or XLSX file.");const z=await unzip(file);
 if(ext==="docx"){
  const main=z.get("word/document.xml");if(!main)throw new Error("DOCX main document is missing.");const d=xml(main,"DOCX document"),body=d.getElementsByTagNameNS("*","body")[0];if(!body)throw new Error("DOCX document body is missing.");
  const blocks:string[]=[];for(const n of Array.from(body.children)){if(n.localName==="p"){const t=tidy(Array.from(n.getElementsByTagNameNS("*","t")).map(x=>x.textContent||"").join(""));if(t)blocks.push(t);}else if(n.localName==="tbl"){for(const tr of Array.from(n.getElementsByTagNameNS("*","tr"))){const cells=Array.from(tr.getElementsByTagNameNS("*","tc")).map(tc=>tidy(Array.from(tc.getElementsByTagNameNS("*","t")).map(x=>x.textContent||"").join("")));if(cells.some(Boolean))blocks.push(cells.join(" | "));}}}
  const text=blocks.join("\n");if(!text)throw new Error("No readable paragraphs or tables were found in this DOCX.");return{text:"[DOCX: "+file.name+"]\n"+text,mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"};
 }
 const wb=z.get("xl/workbook.xml"),rb=z.get("xl/_rels/workbook.xml.rels");if(!wb||!rb)throw new Error("XLSX workbook metadata is missing.");
 const workbook=xml(wb,"XLSX workbook"),rels=xml(rb,"XLSX relationships"),targets=new Map<string,string>();
 for(const r of Array.from(rels.getElementsByTagNameNS("*","Relationship"))){const id=r.getAttribute("Id")||"",target=r.getAttribute("Target")||"";if(!id||!target||target.startsWith("/")||target.includes("..")||target.includes("\\"))throw new Error("XLSX contains an unsafe worksheet relationship.");targets.set(id,"xl/"+target.replace(/^\.\//,"").replace(/^xl\//,""));}
 const ss=z.get("xl/sharedStrings.xml"),shared=ss?Array.from(xml(ss,"XLSX shared strings").getElementsByTagNameNS("*","si")).map(si=>Array.from(si.getElementsByTagNameNS("*","t")).map(t=>t.textContent||"").join("")):[];
 const sheets=Array.from(workbook.getElementsByTagNameNS("*","sheet"));if(!sheets.length||sheets.length>30)throw new Error("XLSX must contain 1–30 worksheets.");const output:string[]=[];
 for(const sheet of sheets){
  const name=sheet.getAttribute("name")||"Sheet",rid=sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id")||sheet.getAttribute("r:id")||"",target=targets.get(rid);if(!target)throw new Error("XLSX worksheet relationship is missing.");
  const bytes=z.get(target);if(!bytes)throw new Error("XLSX worksheet data is missing: "+name);const d=xml(bytes,"XLSX worksheet "+name),rows=Array.from(d.getElementsByTagNameNS("*","row"));if(rows.length>5000)throw new Error("Worksheet "+name+" exceeds 5,000 rows.");output.push("## Worksheet: "+tidy(name));
  for(const row of rows){const cells=Array.from(row.getElementsByTagNameNS("*","c")),values:string[]=[];for(const c of cells){const ref=c.getAttribute("r")||"",type=c.getAttribute("t")||"",raw=val(child(c,"v"));let decoded=raw;if(type==="s"){const i=Number(raw);if(!Number.isInteger(i)||i<0||i>=shared.length)throw new Error("XLSX shared-string reference is invalid.");decoded=shared[i];}else if(type==="inlineStr")decoded=Array.from(c.getElementsByTagNameNS("*","t")).map(t=>t.textContent||"").join("");else if(type==="b")decoded=raw==="1"?"TRUE":"FALSE";else if(type==="e")decoded="[Excel error: "+raw+"]";else if(!raw&&child(c,"f"))decoded="[Formula without cached value]";values.push((ref?ref+": ":"")+tidy(decoded));}if(values.length)output.push(values.join(" | "));}
 }
 const text=output.join("\n");if(!text.trim())throw new Error("No readable worksheet data was found.");return{text:"[XLSX: "+file.name+"]\n"+text,mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"};
}