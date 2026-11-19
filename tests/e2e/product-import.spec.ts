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
 await expect(page.getByRole("heading",{name:"Bulk product import (CSV)"})).toBeVisible();
 const csv="\uFEFFname,slug,description,category,audience,retail_price_pkr,wholesale_price_pkr,size,color,stock,reorder_level,cost_price_pkr\nPremium Hoodie,premium-hoodie,Imported quality hoodie,Hoodies,unisex,2500,1800,S,Black,12,3,1100\nPremium Hoodie,premium-hoodie,Imported quality hoodie,Hoodies,unisex,2500,1800,M,Black,18,3,1100\nPremium Hoodie,premium-hoodie,Imported quality hoodie,Hoodies,unisex,2500,1800,S,Navy,7,2,1100";
 await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({name:"products.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});
 await expect(page.getByText(/Validated 1 products and 3 unique size\/colour combinations/)).toBeVisible();
 await expect(page.getByRole("button",{name:"Import validated drafts"})).toBeEnabled();
 await page.getByRole("button",{name:"Import validated drafts"}).click();
 await expect.poll(()=>submitted).not.toBeNull();
 const payload=submitted as {products:Array<{status:string;variants:Array<{size:string;color:string;initial_stock:number;cost_price_paisa:number}>}>};
 expect(payload.products).toHaveLength(1);expect(payload.products[0].status).toBe("draft");
 expect(payload.products[0].variants).toHaveLength(3);expect(payload.products[0].variants[0]).toMatchObject({size:"S",color:"Black",initial_stock:12,cost_price_paisa:110000});
 await expect(page.getByText(/Atomic import completed: 1 products and 3 variants/)).toBeVisible();
});
test("CSV importer rejects duplicate size/colour combinations before making an API request",async({page})=>{
 await mockAdmin(page);let requested=false;
 await page.route("**/api/admin/products/import",async route=>{requested=true;await route.fulfill({status:201,contentType:"application/json",body:"{}"});});
 await page.goto("/admin?section=products");
 const csv="name,category,audience,size,color\nPremium Hoodie,Hoodies,unisex,M,Black\nPremium Hoodie,Hoodies,unisex,M,black";
 await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({name:"duplicate.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});
 await expect(page.getByText(/duplicate M \\/ black combination/i)).toBeVisible();
 expect(requested).toBe(false);
});
