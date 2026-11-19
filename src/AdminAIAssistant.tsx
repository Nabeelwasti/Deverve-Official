import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { adminRequest as api } from "./adminApi";

type Message = { role: "user" | "model"; text: string };
type DraftVariant = { size: string; color: string; initial_stock: number; reorder_level: number; cost_price_pkr: number | null };
type ProductDraft = {
  name: string; category: string; audience: "men" | "women" | "kids" | "unisex"; description: string;
  retail_price_pkr: number | null; wholesale_price_pkr: number | null; seo_title: string; seo_description: string;
  brand: string | null; material: string | null; barcode: string | null; sku: string | null;
  sizes: string[]; colours: string[]; variants: DraftVariant[]; unknowns: string[];
};
type Props = { role: string; initialBarcode?: string; onProductCreated: () => void; onManualCreate: () => void };
type Source = { title: string; url: string };
type AssistantResponse = { ok: boolean; reply: string; model?: string; product_draft?: ProductDraft; sources?: Source[]; queries?: string[]; error?: string };

const greeting = "Assalamu Alaikum! I’m your De VERVE AI assistant. I can help with product analysis, research and supported direct business commands. Owner and manager publishing commands can execute without a separate approval form. What would you like me to do?";
const pkrToPaisa = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? null : Math.round(value * 100);
const attachmentMime = (file: File) => {
  if (file.type) return file.type;
  const extension = file.name.toLowerCase().split(".").pop();
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf", txt: "text/plain", csv: "text/csv", json: "application/json", md: "text/markdown" } as Record<string, string>)[extension || ""] || "";
};

async function fileToDataUrl(file: File): Promise<string> {
  if (file.size <= 1_450_000) return await new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onerror = () => reject(new Error("An image could not be read.")); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file);
  });
  if (typeof createImageBitmap !== "function") throw new Error(file.name + " is too large for AI analysis on this browser. Choose an image under 1.4 MB.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d"); if (!context) throw new Error("This browser cannot prepare the image for AI analysis.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  let blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.78));
  if (!blob || blob.size > 1_450_000) blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.62));
  if (!blob || blob.size > 1_450_000) throw new Error(file.name + " could not be compressed enough for AI analysis.");
  return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("An image could not be read.")); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob!); });
}

export default function AdminAIAssistant({ role, initialBarcode = "", onProductCreated, onManualCreate }: Props) {
  const [history, setHistory] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [model, setModel] = useState("");
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [researchQuery, setResearchQuery] = useState("");
  const [publishing, setPublishing] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const canSetCost = role === "owner" || role === "manager";
  const visibleMessages = useMemo(() => [{ role: "model" as const, text: greeting }, ...history], [history]);

  useEffect(() => {
    if (initialBarcode) { setMessage(current => current || "Please research this scanned barcode or SKU and help identify the exact product: " + initialBarcode); setResearchQuery(current => current || initialBarcode); }
  }, [initialBarcode]);
  useEffect(() => {
    const urls = files.map(file => URL.createObjectURL(file)); setPreviews(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [files]);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [history, busy]);

  const chooseFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files ?? []); event.target.value = "";
    if (!incoming.length) return;
    const next = [...files, ...incoming];
    if (next.length > 100) { setStatus("A single AI batch can contain up to 100 files. Remove some files or send another batch."); return; }
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain", "text/csv", "application/json", "text/markdown"];
    const invalid = next.find(file => !allowed.includes(attachmentMime(file)) || file.size < 1 || file.size > 5_000_000);
    if (invalid) { setStatus(invalid.name + " must be JPG, PNG, WebP, PDF, TXT, CSV, JSON or Markdown and no larger than 5 MB."); return; }
    setFiles(next); setStatus("");
  };

  const submit = async (task: "chat" | "product" | "research", event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const direct = message.trim().toLowerCase().replace(/[.!?]+$/,"").split(" ").filter(Boolean).join(" ").trim();
    if (task === "chat" && ["owner", "manager"].includes(role) && (/^(?:please )?publish product .+$/i.test(message.trim()) || /^(?:please )?publish all draft products$/i.test(direct) || /^(?:please )?publish all eligible draft products$/i.test(direct) || /^(?:please )?publish all drafts$/i.test(direct))) {
      await executeCommand();
      return;
    }
    const text = message.trim() || (task === "product" ? "Analyse these product images and prepare a reviewable catalogue draft. Do not invent missing facts." : task === "research" ? researchQuery.trim() : "");
    if (!text || busy) { if (!text) setStatus("Write a message or attach product images with an instruction."); return; }
    if (task === "product" && !files.length) { setStatus("Attach at least one product photo, label or barcode image first."); return; }
    setBusy(true); setStatus(""); setSources([]);
    try {
      let next = [...history, { role: "user" as const, text }].map(item => ({ ...item, text: item.text.slice(0, 2200) }));
      const historySize = () => next.reduce((sum, item) => sum + item.text.length, 0);
      while (next.length > 10 || historySize() > 9000) next.shift();
      if (next[0]?.role === "model") next.shift();
      const batches: File[][] = [];
      for (let index = 0; index < files.length;) {
        const current = files[index];
        const count = attachmentMime(current) === "application/pdf" ? 1 : Math.min(3, files.slice(index).filter(file => attachmentMime(file) !== "application/pdf").length);
        const batch = files.slice(index, index + Math.max(1, count));
        if (batch.some(file => attachmentMime(file) === "application/pdf") && batch.length > 1) {
          batches.push([current]); index++; continue;
        }
        batches.push(batch); index += batch.length;
      }
      const results: AssistantResponse[] = [];
      const totalBatches = Math.max(1, batches.length);
      if (!batches.length) batches.push([]);
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        setStatus(files.length ? "Analysing batch " + (batchIndex + 1) + " of " + totalBatches + " · " + files.length + " attachment(s) queued…" : "Working with the AI assistant…");
        const imageFiles = batch.filter(file => attachmentMime(file).startsWith("image/"));
        const images = await Promise.all(imageFiles.map(async file => {
          const dataUrl = await fileToDataUrl(file); const match = /^data:(image\\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
          if (!match) throw new Error(file.name + " could not be prepared for AI analysis.");
          return { mime_type: match[1], data: match[2] };
        }));
        const documentFiles = batch.filter(file => !attachmentMime(file).startsWith("image/"));
        const documents = await Promise.all(documentFiles.map(async file => {
          if (attachmentMime(file) === "application/pdf") {
            const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error(file.name + " could not be read.")); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file); });
            const match = /^data:application\\/pdf;base64,(.+)$/.exec(dataUrl);
            if (!match) throw new Error(file.name + " is not a valid PDF.");
            return { name: file.name, mime_type: attachmentMime(file), data: match[1] };
          }
          const content = await file.text();
          if (content.length > 120000) throw new Error(file.name + " contains too much text. Split it into smaller files.");
          return { name: file.name, mime_type: attachmentMime(file), text: content };
        }));
        const result = await api<AssistantResponse>("/api/admin/ai/assistant", {
          method: "POST", body: JSON.stringify({ task, messages: next, images, documents, query: task === "research" ? (researchQuery.trim() || text) : undefined })
        });
        results.push(result);
      }
      const replies = results.map((result, index) => (results.length > 1 ? "Batch " + (index + 1) + ":\\n" : "") + (result.reply || "The assistant returned no response."));
      const combinedReply = replies.join("\\n\\n");
      const result: AssistantResponse = {
        ok: true, reply: combinedReply,
        model: results.map(item => item.model).filter(Boolean).join(", "),
        sources: [...new Map(results.flatMap(item => item.sources || []).map(source => [source.url, source])).values()],
        product_draft: results.find(item => item.product_draft)?.product_draft
      };
      if (task === "product" && results.length > 1) {
        const drafts = results.map(item => item.product_draft).filter((item): item is ProductDraft => Boolean(item));
        if (drafts.length) {
          const first = drafts[0];
          const variants = new Map<string, DraftVariant>();
          for (const item of drafts.flatMap(draft => draft.variants || [])) variants.set(item.size.trim().toLowerCase() + "::" + item.color.trim().toLowerCase(), item);
          result.product_draft = {
            ...first,
            sizes: [...new Set(drafts.flatMap(item => item.sizes || []))],
            colours: [...new Set(drafts.flatMap(item => item.colours || []))],
            variants: [...variants.values()].slice(0, 100),
            unknowns: [...new Set(drafts.flatMap(item => item.unknowns || []))]
          };
        }
      }
      const reply = result.reply || "The assistant returned no response.";
      setHistory([...next, { role: "model", text: reply.slice(0, 12000) }]); setModel(result.model || "");
      if (task === "product" && result.product_draft) {
        const incoming = result.product_draft;
        setResearchQuery(incoming.barcode || incoming.name || "");
        setDraft({
          ...incoming,
          variants: Array.isArray(incoming.variants) ? incoming.variants.slice(0, 100).map(item => ({
            size: String(item.size || "").slice(0, 32), color: String(item.color || "").slice(0, 32),
            initial_stock: Number.isSafeInteger(item.initial_stock) && item.initial_stock >= 0 ? item.initial_stock : 0,
            reorder_level: Number.isSafeInteger(item.reorder_level) && item.reorder_level >= 0 ? item.reorder_level : 5,
            cost_price_pkr: typeof item.cost_price_pkr === "number" && Number.isFinite(item.cost_price_pkr) && item.cost_price_pkr >= 0 ? item.cost_price_pkr : null
          })) : [],
          unknowns: Array.isArray(incoming.unknowns) ? incoming.unknowns : []
        });
        setStatus("AI analysis completed across " + files.length + " attachment(s). Check the combined product details and stock quantities before creating the unpublished draft.");
      } else if (task === "research") {
        setSources(result.sources || []); setStatus("Research completed. Review the citations and verify facts before using them.");
      } else if (files.length) {
        setStatus("Analysis completed across " + files.length + " attachment(s) in " + totalBatches + " batches.");
      }
      setMessage(""); if (task === "chat") setFiles([]);
    } catch (error) { setStatus(error instanceof Error ? error.message : "The assistant could not complete this request."); }
    finally { setBusy(false); }
  };

  const executeCommand = async () => {
    const command = message.trim();
    if (!command || busy || !["owner", "manager"].includes(role)) return;
    setBusy(true); setStatus("Executing your written command…");
    try {
      const result = await api<{ ok: boolean; message: string; published?: number; error?: string }>("/api/admin/ai/execute", {
        method: "POST", body: JSON.stringify({ command })
      });
      setStatus(result.message || "Command completed.");
      setHistory(current => [...current, { role: "user", text: command }, { role: "model", text: result.message || "Command completed." }]);
      setMessage("");
      onProductCreated();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The command could not be completed.");
    } finally { setBusy(false); }
  };

  const updateDraft = (patch: Partial<ProductDraft>) => setDraft(current => current ? { ...current, ...patch } : current);
  const updateVariant = (index: number, patch: Partial<DraftVariant>) => setDraft(current => current ? { ...current, variants: current.variants.map((item, i) => i === index ? { ...item, ...patch } : item) } : current);
  const createDraft = async () => {
    if (!draft || publishing) return;
    if (draft.name.trim().length < 2 || draft.category.trim().length < 2) { setStatus("Product name and category are required."); return; }
    if (draft.variants.length > 100 || draft.variants.some(v => !v.size.trim() || !v.color.trim() || !Number.isSafeInteger(v.initial_stock) || v.initial_stock < 0 || !Number.isSafeInteger(v.reorder_level) || v.reorder_level < 0)) { setStatus("Check every size, colour, opening quantity and reorder level. Maximum 100 variants."); return; }
    const duplicate = new Set<string>(); for (const v of draft.variants) { const key = v.size.trim().toLowerCase() + "::" + v.color.trim().toLowerCase(); if (duplicate.has(key)) { setStatus("Duplicate size-and-colour combination: " + v.size + " / " + v.color); return; } duplicate.add(key); }
    setPublishing(true); setStatus("Creating an unpublished product draft…");
    let createdId = "";
    try {
      const created = await api<{ id: string }>("/api/admin/products", { method: "POST", body: JSON.stringify({
        name: draft.name.trim(), slug: draft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120) || "product-" + Date.now().toString(36),
        description: draft.description.trim(), category: draft.category.trim(), audience: draft.audience || "unisex", status: "draft",
        retail_price_paisa: pkrToPaisa(draft.retail_price_pkr), wholesale_price_paisa: pkrToPaisa(draft.wholesale_price_pkr),
        seo_title: draft.seo_title || draft.name, seo_description: draft.seo_description || draft.description.slice(0, 160)
      }) });
      createdId = created.id;
      if (draft.variants.length) {
        const variants = draft.variants.map(item => ({
          size: item.size.trim(), color: item.color.trim(), initial_stock: item.initial_stock, reorder_level: item.reorder_level,
          ...(canSetCost && item.cost_price_pkr !== null ? { cost_price_paisa: pkrToPaisa(item.cost_price_pkr) ?? 0 } : {})
        }));
        await api("/api/admin/products/" + createdId + "/variants/bulk", { method: "POST", body: JSON.stringify({ variants }) });
      } else if (draft.barcode || draft.sku) {
        await api("/api/admin/products/" + createdId + "/variants", { method: "POST", body: JSON.stringify({ size: "One Size", color: "Standard", barcode: draft.barcode || "", sku: draft.sku || "", initial_stock: 0, reorder_level: 5 }) });
      }
      let uploaded = 0;
      for (const file of files.filter(item => attachmentMime(item).startsWith("image/"))) {
        const data = new FormData(); data.append("file", file); data.append("alt_text", (draft.name + " · " + file.name).slice(0, 240));
        const result = await api<{ media?: { id: string } }>("/api/admin/media", { method: "POST", body: data });
        if (!result.media?.id) throw new Error("Image upload returned no media record.");
        await api("/api/admin/products/" + createdId + "/media", { method: "POST", body: JSON.stringify({ media_id: result.media.id, color: "", is_primary: uploaded === 0, position: uploaded }) });
        uploaded++;
      }
      setDraft(null); setFiles([]); setStatus("Draft created successfully. " + draft.variants.length + " variant combinations and " + uploaded + " product images saved. It is NOT published."); onProductCreated();
    } catch (error) {
      if (createdId) { setDraft(null); setFiles([]); onProductCreated(); }
      setStatus((createdId ? "Product draft " + createdId.slice(0, 8) + " was created, but a later variant or image step needs attention. Open Products & variants to finish it. " : "") + (error instanceof Error ? error.message : "The product draft could not be completed."));
    } finally { setPublishing(false); }
  };

  return <div className="admin-ai-command">
    <section className="admin-ai-welcome">
      <div><p className="admin-eyebrow">DE VERVE · PRIVATE AI OPERATIONS</p><h2>AI Command Centre</h2><p>Chat, analyse product images, research online and execute supported owner commands directly. Product analysis remains a preparation step; publishing commands run immediately when submitted by the owner or an authorized manager.</p></div>
      <div className="admin-ai-status"><span></span><strong>Requests use server-side Gemini keys</strong><small>{model ? "Last model: " + model : "Provider connectivity is checked when you send a request."}</small></div>
    </section>
    <div className="admin-ai-layout">
      <section className="admin-ai-chat-card">
        <header><div><strong>De VERVE AI assistant</strong><small>Private admin help · Urdu · Roman Urdu · English</small></div><div><button type="button" className="admin-secondary" onClick={() => { setHistory([]); setStatus("Conversation cleared."); setDraft(null); setSources([]); }}>New chat</button> <button type="button" className="admin-secondary" onClick={onManualCreate}>Manual product form</button></div></header>
        <div className="admin-ai-messages" ref={listRef} aria-live="polite">{visibleMessages.map((item, index) => <article key={index} className={"admin-ai-message " + item.role}><span>{item.role === "model" ? "AI" : "YOU"}</span><p>{item.text}</p></article>)}{busy && <p className="admin-ai-thinking">Working with Gemini…</p>}</div>
        {files.length > 0 && <div className="admin-ai-attachments">{files.map((file, index) => <figure key={file.name + index}>{attachmentMime(file).startsWith("image/") && previews[index] ? <img src={previews[index]} alt={"Selected image attachment " + (index + 1)}/> : <div className="admin-ai-file-preview" aria-label={file.type + " attachment"}>📄<strong>{attachmentMime(file) === "application/pdf" ? "PDF" : attachmentMime(file).split("/").pop()?.toUpperCase()}</strong></div>}<button type="button" aria-label={"Remove " + file.name} onClick={() => setFiles(current => current.filter((_, i) => i !== index))}>×</button><figcaption>{file.name}</figcaption></figure>)}</div>}
        <form className="admin-ai-composer" onSubmit={event => void submit("chat", event)}>
          <textarea rows={3} maxLength={2200} value={message} onChange={event => setMessage(event.target.value)} placeholder="Ask about products, your business, or write a direct command such as “publish product summer-hoodie” or “publish all draft products”…" disabled={busy}/>
          <div><label className="admin-ai-attach">＋ Attach files<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,text/csv,application/json,text/markdown,.md" multiple onChange={chooseFiles} disabled={busy || files.length >= 100}/></label><small>Images, PDF and text files · up to 100 per task · max 5 MB each</small><button type="submit" className="admin-primary" aria-label="Send message" disabled={busy || !message.trim()}>Ask AI</button>{["owner", "manager"].includes(role) && <button type="button" className="admin-primary" disabled={busy || !message.trim()} onClick={() => void executeCommand()}>Execute command</button>}</div>
        </form>
        <p className="admin-ai-privacy">Do not attach CNICs, customer identity documents, payment credentials, passwords or confidential financial records. Images are sent to the configured Gemini provider for analysis.</p>
      </section>
      <aside className="admin-ai-tools">
        <section><p className="admin-eyebrow">FAST CATALOGUE</p><h3>AI product intake</h3><p>Attach front, back, tag or label photos. AI extracts visible details and prepares a draft with size/colour combinations. You confirm prices and opening stock.</p><button type="button" className="admin-primary" disabled={busy || files.length === 0} onClick={() => void submit("product")}>Analyse images & prepare draft</button><small>AI product extraction prepares a reviewable product record. Owner and manager publishing commands can publish directly to the live catalogue.</small></section>
        <section><p className="admin-eyebrow">ONLINE RESEARCH</p><h3>Deep research</h3><p>Find official product information, compare sources and gather useful references before listing.</p><input value={researchQuery} onChange={event => setResearchQuery(event.target.value)} maxLength={500} placeholder="Product name, barcode or question…"/><button type="button" className="admin-secondary" disabled={busy || !researchQuery.trim()} onClick={() => void submit("research")}>Research online</button>{sources.length > 0 && <ul>{sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title || source.url}</a></li>)}</ul>}</section>
        <section><p className="admin-eyebrow">ACTION SAFETY</p><h3>Direct command execution</h3><ul><li>Owner and manager can execute supported written commands without a separate approval form.</li><li>Product publishing is recorded in the admin audit log.</li><li>Unsupported commands are reported clearly and are never presented as completed.</li></ul></section>
      </aside>
    </div>
    {status && <p className="admin-message" role="status">{status}</p>}
    {draft && <section className="admin-ai-draft">
      <div className="admin-panel-heading"><div><p className="admin-eyebrow">REVIEW BEFORE SAVING</p><h3>Prepared product draft</h3></div><button type="button" className="admin-secondary" onClick={() => setDraft(null)}>Discard draft</button></div>
      {draft.unknowns?.length > 0 && <p className="admin-ai-warning"><strong>Needs verification:</strong> {draft.unknowns.join(" · ")}</p>}
      <div className="admin-ai-draft-fields">
        <label>Product name<input value={draft.name || ""} onChange={event => updateDraft({name:event.target.value})}/></label>
        <label>Category<input value={draft.category || ""} onChange={event => updateDraft({category:event.target.value})}/></label>
        <label>Audience<select value={draft.audience || "unisex"} onChange={event => updateDraft({audience:event.target.value as ProductDraft["audience"]})}><option value="men">Men</option><option value="women">Women</option><option value="kids">Kids</option><option value="unisex">Unisex</option></select></label>
        <label>Retail price (PKR)<input type="number" min="0" step="0.01" value={draft.retail_price_pkr ?? ""} onChange={event => updateDraft({retail_price_pkr:event.target.value === "" ? null : Number(event.target.value)})}/></label>
        <label>Wholesale price (PKR)<input type="number" min="0" step="0.01" value={draft.wholesale_price_pkr ?? ""} onChange={event => updateDraft({wholesale_price_pkr:event.target.value === "" ? null : Number(event.target.value)})}/></label>
        <label className="admin-ai-full">Description<textarea rows={3} value={draft.description || ""} onChange={event => updateDraft({description:event.target.value})}/></label>
        <label>SEO title<input value={draft.seo_title || ""} onChange={event => updateDraft({seo_title:event.target.value})}/></label>
        <label>SEO description<input value={draft.seo_description || ""} onChange={event => updateDraft({seo_description:event.target.value})}/></label>
      </div>
      <div className="admin-ai-variant-heading"><h4>Size / colour stock matrix</h4><button type="button" className="admin-secondary" disabled={draft.variants.length >= 100} onClick={() => updateDraft({variants:[...draft.variants,{size:"",color:"",initial_stock:0,reorder_level:5,cost_price_pkr:null}]})}>＋ Add combination</button></div>{draft.sizes?.length > 0 && draft.colours?.length > 0 && <button type="button" className="admin-secondary" onClick={() => { const sizes=[...new Set(draft.sizes.map(value=>value.trim()).filter(Boolean))]; const colours=[...new Set(draft.colours.map(value=>value.trim()).filter(Boolean))]; if(sizes.length*colours.length>100){setStatus("The detected size-and-colour matrix exceeds 100 combinations. Split it into smaller batches.");return;} const existing=new Set(draft.variants.map(item=>item.size.trim().toLowerCase()+"::"+item.color.trim().toLowerCase())); const generated=sizes.flatMap(size=>colours.map(color=>({size,color,initial_stock:0,reorder_level:5,cost_price_pkr:null}))).filter(item=>!existing.has(item.size.toLowerCase()+"::"+item.color.toLowerCase())); updateDraft({variants:[...draft.variants,...generated]}); }}>Generate detected size × colour matrix</button>}
      {draft.variants.length === 0 ? <p className="admin-muted">No exact combinations were confirmed by AI. Add each size and colour you physically have; quantities start at zero.</p> : <div className="admin-ai-variant-list">{draft.variants.map((variant,index)=><div key={index}><label>Size<input value={variant.size} onChange={event=>updateVariant(index,{size:event.target.value})}/></label><label>Colour<input value={variant.color} onChange={event=>updateVariant(index,{color:event.target.value})}/></label><label>Opening qty<input type="number" min="0" step="1" value={variant.initial_stock} onChange={event=>updateVariant(index,{initial_stock:Number(event.target.value)})}/></label><label>Reorder at<input type="number" min="0" step="1" value={variant.reorder_level} onChange={event=>updateVariant(index,{reorder_level:Number(event.target.value)})}/></label>{canSetCost && <label>Cost (PKR)<input type="number" min="0" step="0.01" value={variant.cost_price_pkr ?? ""} onChange={event=>updateVariant(index,{cost_price_pkr:event.target.value===""?null:Number(event.target.value)})}/></label>}<button type="button" className="admin-danger" onClick={()=>updateDraft({variants:draft.variants.filter((_,i)=>i!==index)})}>Remove</button></div>)}</div>}
      <div className="admin-ai-create-actions"><span>{draft.variants.length} combinations · all products start unpublished</span><button type="button" className="admin-primary" disabled={publishing} onClick={()=>void createDraft()}>{publishing?"Saving…":"Create product draft & upload images"}</button></div>
    </section>}
  </div>;
}
