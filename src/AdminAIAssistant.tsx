import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { adminRequest as api } from "./adminApi";

type Message = { role: "user" | "model"; text: string };
type DraftVariant = { size: string; color: string; initial_stock: number; reorder_level: number; cost_price_pkr: number | null };
type ProductDraft = {
  name: string; category: string; audience: "men" | "women" | "kids" | "unisex"; description: string;
  retail_price_pkr: number | null; wholesale_price_pkr: number | null; seo_title: string; seo_description: string;
  brand: string | null; material: string | null; barcode: string | null; sku: string | null;
  sizes: string[]; colours: string[]; variants: DraftVariant[]; unknowns: string[]; source_files?: string[];
};
type Props = { role: string; initialBarcode?: string; onProductCreated: () => void; onManualCreate: () => void };
type Source = { title: string; url: string };
type AssistantResponse = { ok: boolean; reply: string; model?: string; product_draft?: ProductDraft; product_drafts?: ProductDraft[]; sources?: Source[]; queries?: string[]; error?: string };
type AITaskSummary = { id: string; task_type: string; status: string; current_step: string; completed_batches: number; failed_batches: number; updated_at: string };

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

async function buildCatalogueContactSheets(files: File[]): Promise<Array<{ name: string; mime_type: string; data: string }>> {
  const imageFiles = files.filter(file => attachmentMime(file).startsWith("image/"));
  const sheets: Array<{ name: string; mime_type: string; data: string }> = [];
  for (let offset = 0; offset < imageFiles.length; offset += 16) {
    const page = imageFiles.slice(offset, offset + 16);
    const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 1120;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot create the catalogue visual overview.");
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < page.length; index++) {
      const file = page[index]; const bitmap = await createImageBitmap(file);
      const x = (index % 4) * 256, y = Math.floor(index / 4) * 280;
      const scale = Math.min(232 / bitmap.width, 232 / bitmap.height);
      const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
      context.fillStyle = "#f1f3f5"; context.fillRect(x + 8, y + 6, 240, 240);
      context.drawImage(bitmap, x + 8 + (240 - width) / 2, y + 6 + (240 - height) / 2, width, height); bitmap.close();
      context.fillStyle = "#111827"; context.font = "12px sans-serif";
      context.fillText((String(offset + index + 1).padStart(3, "0") + " · " + file.name).slice(0, 38), x + 8, y + 263, 240);
    }
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.65));
    if (!blob || blob.size > 600000) throw new Error("A catalogue contact sheet could not be compressed safely.");
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("A catalogue contact sheet could not be read.")); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob); });
    const prefix = "data:image/jpeg;base64,";
    if (!dataUrl.startsWith(prefix)) throw new Error("A catalogue contact sheet has an invalid image format.");
    sheets.push({ name: "catalogue-overview-" + (sheets.length + 1) + ".jpg", mime_type: "image/jpeg", data: dataUrl.slice(prefix.length) });
  }
  return sheets;
}
async function stableMediaAssetId(file: File): Promise<string> {
  const content = new Uint8Array(await file.arrayBuffer());
  const identity = new Uint8Array(new TextEncoder().encode(file.name + "\\u0000").length + content.length);
  const prefix = new TextEncoder().encode(file.name + "\\u0000");
  identity.set(prefix, 0); identity.set(content, prefix.length);
  const digest = await crypto.subtle.digest("SHA-256", identity);
  const hex = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-5" + hex.slice(13, 16) + "-a" + hex.slice(17, 20) + "-" + hex.slice(20, 32);
}

async function fileBatchFingerprint(files: File[], task: string, prompt: string): Promise<string> {
  const fileDigests = await Promise.all(files.map(async file => {
    const contentDigest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const contentHash = Array.from(new Uint8Array(contentDigest), value => value.toString(16).padStart(2, "0")).join("");
    return file.name + "\\u0000" + file.size + "\\u0000" + contentHash;
  }));
  const identity = [task, prompt, ...fileDigests.sort()].join("\\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
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
  const [draftQueue, setDraftQueue] = useState<Array<{ draft: ProductDraft; files: File[] }>>([]);
  const [draftSourceFiles, setDraftSourceFiles] = useState<File[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [recentTasks, setRecentTasks] = useState<AITaskSummary[]>([]);
  const taskIdRef = useRef<string | null>(null);
  const [researchQuery, setResearchQuery] = useState("");
  const [publishing, setPublishing] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const canSetCost = role === "owner" || role === "manager";
  const visibleMessages = useMemo(() => [{ role: "model" as const, text: greeting }, ...history], [history]);

  useEffect(() => {
    let active = true;
    api<{ tasks?: AITaskSummary[] }>("/api/admin/ai/tasks").then(result => { if (active) setRecentTasks(Array.isArray(result.tasks) ? result.tasks : []); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

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
    if (task === "chat" && ["owner", "manager"].includes(role) && (/^(?:please )?publish product .+$/i.test(message.trim()) || /^(?:please )?publish all draft products$/i.test(direct) || /^(?:please )?publish all eligible draft products$/i.test(direct) || /^(?:please )?publish all drafts$/i.test(direct) || /^(?:please )?(?:set|update) stock for sku [a-z0-9._-]{2,80} to [0-9]{1,8}$/i.test(direct))) {
      await executeCommand();
      return;
    }
    const text = message.trim() || (task === "product" ? "Analyse these product images and prepare a reviewable catalogue draft. Do not invent missing facts." : task === "research" ? researchQuery.trim() : "");
    if (!text || busy) { if (!text) setStatus("Write a message or attach product images with an instruction."); return; }
    if (task === "product" && !files.length) { setStatus("Attach at least one product photo, label or barcode image first."); return; }
    setBusy(true); setStatus(""); setSources([]);
    const resumedTask = Boolean(taskIdRef.current);
    const taskId = taskIdRef.current || crypto.randomUUID();
    taskIdRef.current = taskId;
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
      let savedTaskEvents: Array<{ event_type: string; payload?: Record<string, unknown> }> = [];
      if (resumedTask) {
        try {
          const saved = await api<{ events?: Array<{ event_type: string; payload?: Record<string, unknown> }> }>("/api/admin/ai/tasks/" + taskId);
          savedTaskEvents = Array.isArray(saved.events) ? saved.events : [];
        } catch { /* A task without saved history simply starts with fresh batches. */ }
      }
      const results: AssistantResponse[] = [];
      const batchRecords: Array<{ response: AssistantResponse; files: File[] }> = [];
      const totalBatches = Math.max(1, batches.length);
      if (!batches.length) batches.push([]);
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        try {
        const fingerprint = await fileBatchFingerprint(batch, task, text);
        const savedEvent = batch.length ? savedTaskEvents.find(event => event.event_type === "batch_completed" && event.payload?.fingerprint === fingerprint) : undefined;
        if (savedEvent) {
          const rawDrafts = Array.isArray(savedEvent.payload?.product_draft) ? savedEvent.payload?.product_draft as ProductDraft[] : [];
          const restored: AssistantResponse = {
            ok: true, reply: String(savedEvent.payload?.reply || "Restored a completed batch from durable task memory."),
            model: String(savedEvent.payload?.model || ""),
            product_drafts: rawDrafts, product_draft: rawDrafts[0]
          };
          results.push(restored); batchRecords.push({ response: restored, files: batch });
          setStatus("Restored completed batch " + (batchIndex + 1) + " from saved task memory; no Gemini request was repeated.");
          continue;
        }
        setStatus(files.length ? "Analysing batch " + (batchIndex + 1) + " of " + totalBatches + " · " + files.length + " attachment(s) queued…" : "Working with the AI assistant…");
        const imageFiles = batch.filter(file => attachmentMime(file).startsWith("image/"));
        const images = await Promise.all(imageFiles.map(async file => {
          const dataUrl = await fileToDataUrl(file); const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
          if (!match) throw new Error(file.name + " could not be prepared for AI analysis.");
          return { name: file.name, mime_type: match[1], data: match[2] };
        }));
        const documentFiles = batch.filter(file => !attachmentMime(file).startsWith("image/"));
        const documents = await Promise.all(documentFiles.map(async file => {
          if (attachmentMime(file) === "application/pdf") {
            const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error(file.name + " could not be read.")); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file); });
            const match = /^data:application\/pdf;base64,(.+)$/.exec(dataUrl);
            if (!match) throw new Error(file.name + " is not a valid PDF.");
            return { name: file.name, mime_type: attachmentMime(file), data: match[1] };
          }
          const content = await file.text();
          if (content.length > 120000) throw new Error(file.name + " contains too much text. Split it into smaller files.");
          return { name: file.name, mime_type: attachmentMime(file), text: content };
        }));
        const result = await api<AssistantResponse>("/api/admin/ai/assistant", {
          method: "POST", body: JSON.stringify({ task, task_id: taskId, task_complete: batchIndex === batches.length - 1, task_has_failures: results.some(item => !item.ok), batch_fingerprint: fingerprint, messages: next, images, documents, query: task === "research" ? (researchQuery.trim() || text) : undefined })
        });
        results.push(result);
        batchRecords.push({ response: result, files: batch });
        } catch (batchError) {
          const names = batch.map(file => file.name).join(", ");
          const failed = { ok: false, reply: "Batch " + (batchIndex + 1) + " failed for " + names + ": " + (batchError instanceof Error ? batchError.message : "provider error") };
          results.push(failed);
          batchRecords.push({ response: failed, files: batch });
        }
      }
      if (!results.some(item => item.ok)) throw new Error(results.map(item => item.reply).join("\n"));
      const replies = results.map((result, index) => (results.length > 1 ? "Batch " + (index + 1) + ":\n" : "") + (result.reply || "The assistant returned no response."));
      const combinedReply = replies.join("\n\n");
      let globalPlan = "";
      let globalGroups: Array<{ candidate_ids: string[]; product_name: string; confidence: "high" | "medium" | "low"; rationale: string }> = [];
      if (task === "product" && batchRecords.length > 1) {
        const summaries = batchRecords.map((item, batchIndex) => {
          const drafts = item.response.ok ? (item.response.product_drafts || (item.response.product_draft ? [item.response.product_draft] : [])) : [];
          return {
            batch: batchIndex + 1,
            files: item.files.map(file => file.name.slice(0, 56)),
            candidates: drafts.slice(0, 3).map((draft, candidateIndex) => ({
              candidate_id: String(batchIndex + 1) + "." + String(candidateIndex + 1),
              source_files: (draft.source_files || []).slice(0, 3).map(name => String(name).slice(0, 56)),
              name: String(draft.name || "Unidentified product").slice(0, 48),
              category: String(draft.category || "").slice(0, 28),
              colours: (draft.colours || []).slice(0, 4).map(value => String(value).slice(0, 20)),
              sizes: (draft.sizes || []).slice(0, 4).map(value => String(value).slice(0, 12)),
              description: String(draft.description || "").slice(0, 180)
            }))
          };
        });
        try {
          setStatus("Comparing every successful image batch in one catalogue plan…");
          const chunkGroups: Array<{ candidate_ids: string[]; product_name: string; confidence: "high" | "medium" | "low" }> = [];
          for (let offset = 0; offset < summaries.length; offset += 4) {
            const chunk = summaries.slice(offset, offset + 4);
            const plan = await api<AssistantResponse>("/api/admin/ai/assistant", {
              method: "POST",
              body: JSON.stringify({
                task: "chat", task_id: taskId, task_complete: false, task_has_failures: results.some(item => !item.ok),
                messages: [{ role: "user", text: "Return valid JSON only: {groups:[{candidate_ids:string[],product_name:string,confidence:'high'|'medium'|'low'}]}. Compare all candidates. Put multiple candidate IDs in one group ONLY when they show the same underlying product, including that exact product in different colours. Similar-looking but distinct styles must remain separate. Use high confidence only with clear visual/source evidence. Never combine uncertain candidates. Every candidate ID must appear in exactly one group. Keep product_name under 36 characters. Do not create records. Candidates: " + JSON.stringify(chunk) }]
              })
            });
            const chunkMatch = plan.reply.match(/\{[\s\S]*\}/);
            let parsedChunk: { groups?: unknown[] } | null = null;
            if (chunkMatch) try { parsedChunk = JSON.parse(chunkMatch[0]) as { groups?: unknown[] }; } catch { parsedChunk = null; }
            const parsedGroups = Array.isArray(parsedChunk?.groups) ? parsedChunk!.groups! : [];
            const validGroups: Array<{ candidate_ids: string[]; product_name: string; confidence: "high" | "medium" | "low" }> = parsedGroups.flatMap(value => {
              if (!value || typeof value !== "object") return [];
              const group = value as Record<string, unknown>;
              if (!Array.isArray(group.candidate_ids) || typeof group.product_name !== "string") return [];
              const confidence: "high" | "medium" | "low" = group.confidence === "high" || group.confidence === "medium" ? group.confidence : "low";
              return [{ candidate_ids: group.candidate_ids.filter((id): id is string => typeof id === "string").slice(0, 30), product_name: group.product_name.slice(0, 36), confidence }];
            });
            if (validGroups.length) chunkGroups.push(...validGroups);
            else for (const batch of chunk) for (const candidate of batch.candidates) chunkGroups.push({ candidate_ids: [candidate.candidate_id], product_name: candidate.name.slice(0, 36), confidence: "low" });
          }
          const imagePositionByFile = new Map<File, number>();
          files.filter(file => attachmentMime(file).startsWith("image/")).forEach((file, index) => imagePositionByFile.set(file, index + 1));
          const globalCandidateMap = summaries.flatMap(batch => {
            const batchFiles = (batchRecords[batch.batch - 1]?.files || []).filter(file => attachmentMime(file).startsWith("image/"));
            return batch.candidates.map(candidate => {
              const sourceNames = candidate.source_files.length ? candidate.source_files : batch.files;
              const sourceFiles = sourceNames.length ? batchFiles.filter(file => sourceNames.includes(file.name)) : batchFiles;
              const imageIndexes = sourceFiles.map(file => imagePositionByFile.get(file)).filter((index): index is number => typeof index === "number").slice(0, 3);
              return [candidate.candidate_id, candidate.name.slice(0, 28), imageIndexes];
            });
          });
          const preliminaryMatches = chunkGroups
            .filter(group => group.confidence === "high" && group.candidate_ids.length > 1)
            .slice(0, 20)
            .map(group => [group.candidate_ids.slice(0, 6), group.product_name.slice(0, 28)]);
          let visualOverview: Array<{ name: string; mime_type: string; data: string }> = [];
          try { visualOverview = await buildCatalogueContactSheets(files); }
          catch (overviewError) { setStatus("Visual overview unavailable; using individual image analyses and source filenames. " + (overviewError instanceof Error ? overviewError.message : "")); }
          const finalPlan = await api<AssistantResponse>("/api/admin/ai/assistant", {
            method: "POST",
            body: JSON.stringify({
              task: "chat", task_id: taskId, task_complete: true, task_has_failures: results.some(item => !item.ok), images: visualOverview,
              messages: [{ role: "user", text: "Return valid JSON only: {groups:[{candidate_ids:string[],product_name:string,confidence:'high'|'medium'|'low',rationale:string}]}. You are receiving a labelled visual contact-sheet overview of ALL selected images in this task. Compare the images visually across the entire set, not just within earlier batches. Use candidate source filenames to connect each image to its candidate. Group front/back/detail views of one item together. Group colourways only when the garment design is clearly the same. Keep similar but distinct styles separate. Only merge cross-batch candidates with high confidence; otherwise keep separate. Include every candidate ID exactly once. Keep rationale short. Compact candidate map (candidate ID, product name, numbered source images): " + JSON.stringify(globalCandidateMap) + " Preliminary high-confidence matches: " + JSON.stringify(preliminaryMatches) }]
            })
          });
          globalPlan = finalPlan.reply || "";
          const jsonMatch = globalPlan.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsedPlan = JSON.parse(jsonMatch[0]) as { groups?: unknown[] };
            if (Array.isArray(parsedPlan.groups)) {
              globalGroups = parsedPlan.groups.flatMap(value => {
                if (!value || typeof value !== "object") return [];
                const group = value as Record<string, unknown>;
                if (!Array.isArray(group.candidate_ids) || typeof group.product_name !== "string") return [];
                const confidence = group.confidence === "high" || group.confidence === "medium" ? group.confidence : "low";
                return [{ candidate_ids: group.candidate_ids.filter((id): id is string => typeof id === "string").slice(0, 30), product_name: group.product_name.slice(0, 100), confidence, rationale: typeof group.rationale === "string" ? group.rationale.slice(0, 500) : "" }];
              });
            }
          }
        } catch (planningError) {
          globalPlan = "Global grouping pass could not complete: " + (planningError instanceof Error ? planningError.message : "provider unavailable") + ". Individual batch analyses and product drafts are preserved; no uncertain cross-batch merge has been made.";
          globalGroups = [];
        }
      }
      const result: AssistantResponse = {
        ok: results.every(item => item.ok), reply: combinedReply + (globalPlan ? "\n\nGLOBAL PRODUCT GROUPING PLAN\n" + globalPlan : ""),
        model: results.map(item => item.model).filter(Boolean).join(", "),
        sources: [...new Map(results.flatMap(item => item.sources || []).map(source => [source.url, source])).values()],
        product_draft: results.flatMap(item => item.product_drafts || (item.product_draft ? [item.product_draft] : []))[0]
      };
      let productDraftEntries: Array<{ draft: ProductDraft; files: File[] }> = [];
      if (task === "product") {
        const candidates = batchRecords.flatMap((record, batchIndex) => {
          const batchDrafts = record.response.ok ? (record.response.product_drafts || (record.response.product_draft ? [record.response.product_draft] : [])) : [];
          return batchDrafts.slice(0, 3).map((draft, candidateIndex) => ({
            id: String(batchIndex + 1) + "." + String(candidateIndex + 1),
            draft,
            files: record.files
          }));
        });
        if (candidates.length) {
          const assigned = new Set<string>();
          const groups: Array<{ key: string; name: string; items: typeof candidates }> = [];
          for (const plan of globalGroups) {
            const items = plan.candidate_ids.map(id => candidates.find(candidate => candidate.id === id)).filter((item): item is typeof candidates[number] => item !== undefined && !assigned.has(item.id));
            if (!items.length) continue;
            items.forEach(item => assigned.add(item.id));
            if (plan.confidence !== "high" && items.length > 1) {
              for (const item of items) groups.push({ key: "uncertain:" + item.id, name: item.draft.name, items: [item] });
            } else {
              groups.push({ key: "planned:" + items[0].id, name: plan.product_name, items });
            }
          }
          for (const item of candidates) {
            if (assigned.has(item.id)) continue;
            // If the global planner omitted a candidate or failed to return a
            // trustworthy grouping, preserve it as its own product draft.
            groups.push({ key: "unplanned:" + item.id, name: item.draft.name, items: [item] });
            assigned.add(item.id);
          }
          for (const group of groups) {
            const first = group.items[0].draft;
            const variants = new Map<string, DraftVariant>();
            const duplicateStockKeys = new Set<string>();
            for (const item of group.items.flatMap(value => value.draft.variants || [])) {
              const key = item.size.trim().toLocaleLowerCase() + "::" + item.color.trim().toLocaleLowerCase();
              const previous = variants.get(key);
              if (previous) {
                if (previous.initial_stock !== item.initial_stock) duplicateStockKeys.add(key);
                variants.set(key, { ...previous, initial_stock: Math.max(previous.initial_stock, item.initial_stock), cost_price_pkr: previous.cost_price_pkr ?? item.cost_price_pkr });
              } else variants.set(key, item);
            }
            const merged: ProductDraft = {
              ...first,
              name: group.name,
              sizes: [...new Set(group.items.flatMap(item => item.draft.sizes || []))],
              colours: [...new Set(group.items.flatMap(item => item.draft.colours || []))],
              variants: [...variants.values()].slice(0, 100),
              unknowns: [...new Set([...group.items.flatMap(item => item.draft.unknowns || []), ...(duplicateStockKeys.size ? ["Repeated stock figures were not added together; verify opening quantities for repeated size/colour combinations."] : []), ...(globalGroups.some(plan => plan.confidence !== "high" && plan.candidate_ids.some(id => group.items.some(item => item.id === id))) ? ["Cross-batch match was not high-confidence; candidates were kept separate. Verify product identity before manually combining them."] : [])])]
            };
            const matchingFiles = [...new Map(group.items.flatMap(item => {
              const sourceNames = Array.isArray(item.draft.source_files) ? item.draft.source_files : [];
              return sourceNames.length ? item.files.filter(file => sourceNames.includes(file.name)) : group.items.length === 1 && item.files.length === 1 ? item.files : [];
            }).map(file => [file.name + "::" + file.size, file])).values()];
            if (!matchingFiles.length) merged.unknowns = [...merged.unknowns, "Source photos could not be confidently mapped to this product; no photos were auto-attached. Upload the correct images manually before publishing."];
            productDraftEntries.push({ draft: merged, files: matchingFiles });
          }
          result.product_draft = productDraftEntries[0]?.draft;
          result.product_drafts = productDraftEntries.map(item => item.draft);
          if (productDraftEntries.length > 1) result.reply += "\n\nI identified " + productDraftEntries.length + " separate product candidates. Their size/colour matrices have been kept separate. Review and create each unpublished draft one at a time.";
        }
      }
      const planFailed = globalPlan.startsWith("Global grouping pass could not complete:");
      if (results.every(item => item.ok) && !planFailed) taskIdRef.current = null;
      const reply = result.reply || "The assistant returned no response.";
      setHistory([...next, { role: "model", text: reply.slice(0, 12000) }]); setModel(result.model || "");
      if (results.some(item => !item.ok)) setStatus("Partial analysis completed. Some batches failed; successful results are preserved. Retry the failed files only. " + results.filter(item => !item.ok).length + " batch(es) failed.");
      if (task === "product" && result.product_draft) {
        const incoming = result.product_draft;
        setResearchQuery(incoming.barcode || incoming.name || "");
        setDraftQueue(productDraftEntries.slice(1));
        setDraftSourceFiles(productDraftEntries[0]?.files ?? files);
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
      void api<{ tasks?: AITaskSummary[] }>("/api/admin/ai/tasks").then(value => setRecentTasks(Array.isArray(value.tasks) ? value.tasks : [])).catch(() => undefined);
    } catch (error) { setStatus(error instanceof Error ? error.message : "The assistant could not complete this request."); }
    finally { setBusy(false); }
  };

  const resumeTaskMemory = async (task: AITaskSummary) => {
    setBusy(true); setStatus("Restoring saved task decisions and completed work…");
    try {
      const result = await api<{ task: AITaskSummary; events?: Array<{ event_type: string; model?: string; payload?: { reply?: string; attachments?: string[]; step?: string } }> }>("/api/admin/ai/tasks/" + task.id);
      taskIdRef.current = task.id;
      const recovered = (result.events || []).map((event, index) => {
        const payload = event.payload || {};
        return (index + 1) + ". " + (payload.step || event.event_type) + " · " + (event.model || "model unknown") + "\nFiles: " + (payload.attachments || []).join(", ") + "\n" + (payload.reply || "Saved task event");
      }).join("\n\n");
      setHistory(current => [...current, { role: "model", text: "Recovered durable task memory (" + task.status + "). Previous analysis and decisions:\n\n" + recovered + "\n\nI will include this saved context in the next request. Reattach any files that still need processing." }]);
      setStatus("Previous task context restored. The same task ID will be reused so Gemini model/key fallback can continue with its saved memory.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Saved task memory could not be restored."); }
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
      const productImages = draftSourceFiles.filter(item => attachmentMime(item).startsWith("image/"));
      for (let offset = 0; offset < productImages.length; offset += 4) {
        const batch = productImages.slice(offset, offset + 4);
        const data = new FormData();
        const assetIds = await Promise.all(batch.map(stableMediaAssetId));
        batch.forEach(file => data.append("files", file, file.name));
        data.append("asset_ids", JSON.stringify(assetIds));
        data.append("alt_text", draft.name);
        const result = await api<{ media?: Array<{ id: string }>; failures?: Array<{ name: string; error: string }> }>("/api/admin/media/bulk", { method: "POST", body: data });
        for (const media of result.media || []) {
          if (!media.id) continue;
          await api("/api/admin/products/" + createdId + "/media", { method: "POST", body: JSON.stringify({ media_id: media.id, color: "", is_primary: uploaded === 0, position: uploaded }) });
          uploaded++;
        }
        if (result.failures?.length) throw new Error(result.failures.map(item => item.name + ": " + item.error).join(" · "));
        if ((result.media || []).length !== batch.length) throw new Error("Some product images were not confirmed by the media service. Retry the remaining images from the product workspace.");
      }
      if (draftQueue.length) {
        const next = draftQueue[0];
        setDraftQueue(draftQueue.slice(1));
        setDraftSourceFiles(next.files);
        setDraft(next.draft);
        setStatus("Draft saved. " + draftQueue.length + " more separate product candidate(s) are ready for review. The next draft's photos are isolated from the previous product.");
      } else {
        setDraft(null); setDraftQueue([]); setDraftSourceFiles([]); setFiles([]);
        setStatus("Draft created successfully. " + draft.variants.length + " variant combinations and " + uploaded + " matching product images saved. It is NOT published.");
      }
      onProductCreated();
    } catch (error) {
      if (createdId) {
        if (draftQueue.length) {
          const next = draftQueue[0];
          setDraftQueue(draftQueue.slice(1)); setDraftSourceFiles(next.files); setDraft(next.draft);
        } else { setDraft(null); setDraftQueue([]); setDraftSourceFiles([]); setFiles([]); }
        onProductCreated();
      }
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
        <header><div><strong>De VERVE AI assistant</strong><small>Private admin help · Urdu · Roman Urdu · English</small></div><div><button type="button" className="admin-secondary" onClick={() => { setHistory([]); setStatus("Conversation cleared."); setDraft(null); setDraftQueue([]); setDraftSourceFiles([]); setSources([]); taskIdRef.current = null; }}>New chat</button> <button type="button" className="admin-secondary" onClick={onManualCreate}>Manual product form</button></div></header>
        {recentTasks.length > 0 && <div className="admin-ai-task-history"><strong>Saved AI task memory</strong><small>Continue previous work without repeating completed analysis</small><div>{recentTasks.slice(0, 5).map(task => <button key={task.id} type="button" className="admin-secondary" disabled={busy} onClick={() => void resumeTaskMemory(task)}>{task.task_type} · {task.status} · {task.completed_batches} completed / {task.failed_batches} failed</button>)}</div></div>}
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
      <div className="admin-panel-heading"><div><p className="admin-eyebrow">REVIEW BEFORE SAVING</p><h3>Prepared product draft</h3></div><button type="button" className="admin-secondary" onClick={() => { if (draftQueue.length) { const next = draftQueue[0]; setDraftQueue(draftQueue.slice(1)); setDraftSourceFiles(next.files); setDraft(next.draft); setStatus("Skipped the current candidate. The next separate product draft is ready."); } else { setDraft(null); setDraftSourceFiles([]); } }}>Discard draft</button></div>
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
