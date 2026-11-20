import { test, expect, type Page } from "@playwright/test";
const owner={id:"11111111-1111-4111-8111-111111111111",email:"owner@deverve.test",role:"owner"};
async function mockAdmin(page:Page){
 await page.route("**/api/admin/**",async route=>{
  const path=new URL(route.request().url()).pathname;
  const payload=path==="/api/admin/me"?{admin:owner}:path==="/api/admin/products"?{products:[]}:
   {products:[],users:[],invites:[],settings:{},enquiries:[],customers:[],orders:[],returns:[],exchanges:[],quotes:[],vehicles:[],rentals:[],reviews:[],events:[],items:[],accounts:[],registers:[],session:null,has_more:false,overview:{published_products:0,draft_products:0,new_enquiries:0,pending_orders:0,rental_requests:0}};
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(payload)});
 });
}
test("CSV product import previews and atomically submits grouped size/colour variants as drafts",async({page})=>{
 await mockAdmin(page);let submitted:unknown=null;
 await page.route("**/api/admin/products/import",async route=>{
  submitted=route.request().postDataJSON();
  await route.fulfill({status:201,contentType:"application/json",body:JSON.stringify({atomic:true,imported:1,variants:3,status:"draft",products:[{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",name:"Premium Hoodie",slug:"premium-hoodie",variants:3}]})});
 });
 await page.goto("/admin?section=products");
 await expect(page.getByRole("heading",{name:"Bulk catalogue import"})).toBeVisible();
 const csv="\\uFEFFname,slug,description,category,audience,retail_price_pkr,wholesale_price_pkr,size,color,sku,barcode,stock,reorder_level,cost_price_pkr\\nPremium Hoodie,premium-hoodie,Imported quality hoodie,Hoodies,unisex,2500,1800,S,Black,DV-HOOD-S,8901234567890,12,3,1100\\nPremium Hoodie,premium-hoodie,Imported quality hoodie,Hoodies,unisex,2500,1800,M,Black,DV-HOOD-M,8901234567891,18,3,1100\\nPremium Hoodie,premium-hoodie,Imported quality hoodie,Hoodies,unisex,2500,1800,S,Navy,DV-HOOD-S-NAVY,8901234567892,7,2,1100";
 await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({name:"products.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});
 await expect(page.getByText(/Validated 1 products and 3 unique size\/colour combinations/)).toBeVisible();
 await expect(page.getByRole("button",{name:"Import all products + attach matching photos"})).toBeEnabled();
 await page.getByRole("button",{name:"Import all products + attach matching photos"}).click();
 await expect.poll(()=>submitted).not.toBeNull();
 const payload=submitted as {products:Array<{status:string;variants:Array<{size:string;color:string;sku:string;barcode:string;initial_stock:number;cost_price_paisa:number}>}>};
 expect(payload.products).toHaveLength(1);expect(payload.products[0].status).toBe("draft");
 expect(payload.products[0].variants).toHaveLength(3);expect(payload.products[0].variants[0]).toMatchObject({size:"S",color:"Black",sku:"DV-HOOD-S",barcode:"8901234567890",initial_stock:12,cost_price_paisa:110000});
 await expect(page.getByText(/Import completed. 1 products and 3 variants/)).toBeVisible();
});
test("CSV importer rejects duplicate size/colour combinations before making an API request",async({page})=>{
 await mockAdmin(page);let requested=false;
 await page.route("**/api/admin/products/import",async route=>{requested=true;await route.fulfill({status:201,contentType:"application/json",body:"{}"});});
 await page.goto("/admin?section=products");
 const csv="name,category,audience,size,color\nPremium Hoodie,Hoodies,unisex,M,Black\nPremium Hoodie,Hoodies,unisex,M,black";
 await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({name:"duplicate.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});
 await expect(page.getByText(/duplicate M \/ black combination/i)).toBeVisible();
 expect(requested).toBe(false);
});

test("large CSV catalogues are split into bounded atomic server batches",async({page})=>{
 await mockAdmin(page);const batches:Array<Array<{name:string;variants:unknown[]}>>=[];
 await page.route("**/api/admin/products/import",async route=>{
  const body=route.request().postDataJSON() as {products:Array<{name:string;slug:string;variants:unknown[]}>};batches.push(body.products);
  await route.fulfill({status:201,contentType:"application/json",body:JSON.stringify({atomic:true,imported:body.products.length,variants:body.products.reduce((n,p)=>n+p.variants.length,0),products:body.products.map((p,i)=>({id:(String(batches.length)+String(i)).padStart(8,"0")+"-aaaa-4aaa-8aaa-aaaaaaaaaaaa",name:p.name,slug:p.slug,variants:p.variants.length}))})});
 });
 await page.goto("/admin?section=products");
 const rows=["name,slug,category,audience,size,color,stock"];
 for(let i=1;i<=21;i++)rows.push(["Hoodie "+i,"hoodie-"+i,"Hoodies","unisex","M","Black","2"].join(","));
 await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({name:"large-catalogue.csv",mimeType:"text/csv",buffer:Buffer.from(rows.join("\n"))});
 await expect(page.getByText(/Validated 21 products and 21 unique size\/colour combinations/)).toBeVisible();
 await page.getByRole("button",{name:"Import all products + attach matching photos"}).click();
 await expect.poll(()=>batches.length).toBe(2);
 expect(batches[0]).toHaveLength(20);expect(batches[1]).toHaveLength(1);
 await expect(page.getByText(/21 products and 21 variants were saved in 2 atomic batches/)).toBeVisible();
});

test("owner can import matching photos and request all-or-none publication",async({page})=>{
 await mockAdmin(page);let publishedPayload:unknown=null;
 await page.route("**/api/admin/products/import",async route=>{
  await route.fulfill({status:201,contentType:"application/json",body:JSON.stringify({atomic:true,imported:1,variants:1,products:[{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",name:"Premium Hoodie",slug:"premium-hoodie",variants:1}]})});
 });
 await page.route("**/api/admin/media/bulk",async route=>{
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({uploaded:1,failed:0,media:[{id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",status:"ready"}],failures:[]})});
 });
 await page.route("**/api/admin/products/*/media",async route=>{
  if(route.request().method()==="POST")await route.fulfill({status:201,contentType:"application/json",body:JSON.stringify({attached:true})});
 });
 await page.route("**/api/admin/products/publish-bulk",async route=>{
  publishedPayload=route.request().postDataJSON();
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true,atomic:true,published:1})});
 });
 await page.goto("/admin?section=products");
 const csv="name,slug,category,audience,retail_price_pkr,size,color,stock\nPremium Hoodie,premium-hoodie,Hoodies,unisex,2500,M,Black,3";
 await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({name:"products.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});
 await page.locator('input[type="file"][accept^="image/"]').setInputFiles({name:"premium-hoodie-front.jpg",mimeType:"image/jpeg",buffer:Buffer.from([255,216,255,217])});
 await page.getByLabel(/Publish after import in one secure operation/).check();
 await page.getByRole("button",{name:"Import all products + attach matching photos"}).click();
 await expect.poll(()=>publishedPayload).not.toBeNull();
 expect(publishedPayload).toEqual({product_ids:["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]});
 await expect(page.getByText(/Published 1 products after server-side checks/)).toBeVisible();
});

test("CSV importer rejects duplicate supplier SKUs across different products before upload",async({page})=>{
 await mockAdmin(page);let requested=false;
 await page.route("**/api/admin/products/import",async route=>{requested=true;await route.fulfill({status:201,contentType:"application/json",body:"{}"});});
 await page.goto("/admin?section=products");
 const csv="name,category,audience,size,color,sku\\nHoodie One,Hoodies,unisex,M,Black,DV-DUP-001\\nHoodie Two,Hoodies,unisex,L,Navy,DV-DUP-001";
 await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({name:"duplicate-sku.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});
 await expect(page.getByText(/duplicate SKU DV-DUP-001 in this file/i)).toBeVisible();
 expect(requested).toBe(false);
});
