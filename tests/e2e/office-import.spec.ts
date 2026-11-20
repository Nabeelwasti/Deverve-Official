import { test, expect, type Page } from "@playwright/test";

const owner = { id: "11111111-1111-4111-8111-111111111111", email: "owner@deverve.test", role: "owner" };
function crc32(data: Buffer) { let crc=0xffffffff; for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0; }
function zipStore(files: Record<string,string>): Buffer {
 const locals:Buffer[]=[],centrals:Buffer[]=[];let offset=0;
 for(const [name,value] of Object.entries(files)){
  const n=Buffer.from(name),d=Buffer.from(value),crc=crc32(d);
  const local=Buffer.alloc(30+n.length);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0,6);local.writeUInt16LE(0,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(d.length,18);local.writeUInt32LE(d.length,22);local.writeUInt16LE(n.length,26);n.copy(local,30);locals.push(local,d);
  const central=Buffer.alloc(46+n.length);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0,8);central.writeUInt16LE(0,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(d.length,20);central.writeUInt32LE(d.length,24);central.writeUInt16LE(n.length,28);central.writeUInt32LE(offset,42);n.copy(central,46);centrals.push(central);offset+=local.length+d.length;
 }
 const cd=Buffer.concat(centrals),localBytes=Buffer.concat(locals),eocd=Buffer.alloc(22);eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(Object.keys(files).length,8);eocd.writeUInt16LE(Object.keys(files).length,10);eocd.writeUInt32LE(cd.length,12);eocd.writeUInt32LE(localBytes.length,16);return Buffer.concat([localBytes,cd,eocd]);
}
async function mockAdmin(page:Page){
 await page.route("**/api/admin/**",async route=>{
  const url=new URL(route.request().url());let payload:Record<string,unknown>={products:[],users:[],invites:[],settings:{},enquiries:[],customers:[],orders:[],returns:[],exchanges:[],quotes:[],vehicles:[],rentals:[],reviews:[],events:[],items:[],accounts:[],registers:[],session:null,has_more:false,overview:{published_products:0,draft_products:0,new_enquiries:0,pending_orders:0,rental_requests:0}};
  if(url.pathname==="/api/admin/ai/execute"){await route.fulfill({status:422,contentType:"application/json",body:JSON.stringify({error:"No actionable business intent was identified."})});return;}
  if(url.pathname==="/api/admin/me")payload={admin:owner};
  else if(url.pathname==="/api/admin/ai/keys")payload={keys:[],environment_keys:[],encryption_ready:true,encryption_mode:"dedicated",model:"Gemini 3.8 Flash",models:[]};
  else if(url.pathname==="/api/admin/ai/tasks")payload={tasks:[]};
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(payload)});
 });
}
const docx=zipStore({"word/document.xml":'<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Premium cotton hoodie</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Size</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Stock</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Medium</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>12</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>'});
const xlsx=zipStore({
 "xl/workbook.xml":'<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Inventory" sheetId="1" r:id="rId1"/></sheets></workbook>',
 "xl/_rels/workbook.xml.rels":'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
 "xl/worksheets/sheet1.xml":'<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Product</t></is></c><c r="B1" t="inlineStr"><is><t>Quantity</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Black sweatshirt</t></is></c><c r="B2"><v>24</v></c></row></sheetData></worksheet>'
});
test("AI assistant extracts DOCX paragraphs/tables and XLSX worksheets before sending documents",async({page})=>{
 await mockAdmin(page);let sent:unknown=null;
 await page.route("**/api/admin/ai/assistant",async route=>{sent=route.request().postDataJSON();await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true,reply:"Read both office documents."})});});
 await page.goto("/admin?section=products");await page.getByRole("button",{name:"Create with AI"}).click();
 await expect(page.locator(".admin-dashboard")).toHaveAttribute("data-admin-screen","ai");
 await page.locator('input[type="file"][accept*=".docx"]').setInputFiles([
  {name:"catalogue.docx",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",buffer:docx},
  {name:"inventory.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:xlsx}
 ]);
 await page.locator(".admin-ai-composer textarea").fill("Read these catalogue and inventory files. Extract the product names, sizes and stock.");
 await page.locator(".admin-ai-composer button[type=submit]").click();
 await expect.poll(()=>sent).not.toBeNull();
 const body=sent as {documents:Array<{name:string;mime_type:string;text:string}>};
 expect(body.documents).toHaveLength(2);
 expect(body.documents[0].text).toContain("Premium cotton hoodie");
 expect(body.documents[0].text).toContain("Medium | 12");
 expect(body.documents[1].text).toContain("Worksheet: Inventory");
 expect(body.documents[1].text).toContain("Black sweatshirt");
 expect(body.documents[1].text).toContain("B2: 24");
 await expect(page.getByText("Read both office documents.")).toBeVisible();
});
