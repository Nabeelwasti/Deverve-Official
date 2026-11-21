import { useEffect, useRef, useState, type FormEvent } from "react";

type Message = { role: "user" | "model"; text: string };
type FileAttachment = { name: string; mime_type: string; data?: string; text?: string; preview?: string; size: number };
type SpeechRecognitionResult = { 0?: { transcript?: string } };
type SpeechRecognitionEventLike = Event & { results?: ArrayLike<SpeechRecognitionResult> };
type SpeechRecognitionLike = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };

const greeting: Message = { role: "model", text: "Assalamu Alaikum! Welcome to De VERVE. I can help with garments, wholesale and car rentals. You can type, speak, or attach files for me to understand. How may I help?" };

const TEXT_EXTENSIONS = new Set(["txt","md","markdown","csv","tsv","json","jsonl","xml","html","htm","css","js","jsx","ts","tsx","py","java","c","cpp","h","hpp","cs","go","rs","php","sql","yaml","yml","toml","ini","log","rtf","svg","sh","bat","ps1"]);
const MIME_BY_EXTENSION: Record<string,string> = { pdf:"application/pdf", txt:"text/plain", md:"text/plain", markdown:"text/plain", csv:"text/plain", tsv:"text/plain", json:"text/plain", jsonl:"text/plain", xml:"text/plain", html:"text/plain", htm:"text/plain", rtf:"text/plain", mp3:"audio/mpeg", m4a:"audio/mp4", wav:"audio/wav", aac:"audio/aac", flac:"audio/flac", opus:"audio/opus", mp4:"video/mp4", mov:"video/mov", avi:"video/avi", mpg:"video/mpeg", mpeg:"video/mpeg", jpg:"image/jpeg", jpeg:"image/jpeg", png:"image/png", webp:"image/webp" };
const DIRECT_MIME = new Set(["application/pdf","image/jpeg","image/png","image/webp","audio/aac","audio/flac","audio/mp3","audio/mp4","audio/mpeg","audio/mpga","audio/opus","audio/pcm","audio/wav","audio/webm","video/mov","video/mpeg","video/mp4","video/mpg","video/avi","video/wmv","video/mpegps","video/flv"]);
function fileExtension(name: string): string { return name.toLowerCase().split(".").pop() || ""; }
async function prepareAttachment(file: File): Promise<FileAttachment> {
  const ext = fileExtension(file.name);
  const mime = (file.type || MIME_BY_EXTENSION[ext] || "application/octet-stream").toLowerCase();
  if (!file.size) throw new Error(file.name + " is empty.");
  if (file.size > 4 * 1024 * 1024) throw new Error(file.name + " exceeds the 4 MB per-file limit. Compress it or export a smaller copy.");
  const safeName = file.name.replace(/[\\/]/g, "_").replace(/[\\x00-\\x1f]/g, "_").slice(0, 120) || "attachment";
  if (mime.startsWith("text/") || TEXT_EXTENSIONS.has(ext) || ["application/json","application/xml","application/rtf","application/x-ndjson"].includes(mime)) {
    const text = await file.text();
    if (text.includes(String.fromCharCode(0))) throw new Error(file.name + " appears to be binary. Export it as PDF or text and attach again.");
    if (text.length > 180_000) throw new Error(file.name + " contains too much text for one chat attachment. Split it into smaller files.");
    return { name: safeName, mime_type: "text/plain", text: text.slice(0,180_000), size: file.size };
  }
  if (!DIRECT_MIME.has(mime)) {
    throw new Error(file.name + " (" + (mime || "unknown format") + ") cannot be interpreted directly by the current Gemini model. Export it as PDF, plain text, image, audio or video and attach that version.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (mime === "application/pdf" && !(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) throw new Error(file.name + " is not a valid PDF file.");
  if (mime === "image/jpeg" && !(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) throw new Error(file.name + " is not a valid JPEG image.");
  if (mime === "image/png" && !(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) throw new Error(file.name + " is not a valid PNG image.");
  if (mime === "image/webp" && (String.fromCharCode(...bytes.slice(0,4)) !== "RIFF" || String.fromCharCode(...bytes.slice(8,12)) !== "WEBP")) throw new Error(file.name + " is not a valid WebP image.");
  let binary = ""; for (let offset=0; offset<bytes.length; offset+=0x8000) binary += String.fromCharCode(...bytes.subarray(offset,Math.min(offset+0x8000,bytes.length)));
  const data = btoa(binary);
  if (data.length > 5_700_000) throw new Error(file.name + " is too large after encoding. Compress it and try again.");
  let preview: string | undefined;
  if (mime.startsWith("image/")) preview = "data:"+mime+";base64,"+data;
  return { name:safeName, mime_type:mime, data, preview, size:file.size };
}

export default function AIChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [history, setHistory] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState("/brand/de-verve-logo.svg");
  const listRef = useRef<HTMLDivElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceDraftPrefixRef = useRef("");

  useEffect(() => {
    let active = true;
    void fetch("/api/storefront/settings", { headers: { accept: "application/json" } })
      .then(response => response.ok ? response.json() : null)
      .then((value: unknown) => {
        if (!active || !value || typeof value !== "object") return;
        const data = value as { brand_assets?: { logo_id?: string | null }; settings?: { brand_assets?: { logo_id?: string | null } }; logo_id?: string | null };
        const id = data.brand_assets?.logo_id ?? data.settings?.brand_assets?.logo_id ?? data.logo_id;
        if (typeof id === "string" && id.trim()) setLogoUrl("/media/" + encodeURIComponent(id));
      }).catch(() => { /* keep the bundled brand fallback */ });
    return () => { active = false; };
  }, []);

  useEffect(() => { if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [open, messages, sending, attachments]);
  useEffect(() => () => { recognitionRef.current?.abort(); if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); }, []);

  const attach = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = 3 - attachments.length;
    if (remaining <= 0) { setNotice("You can attach up to three files per message."); return; }
    try {
      const prepared = await Promise.all(Array.from(files).slice(0, remaining).map(prepareAttachment));
      const total = [...attachments, ...prepared].reduce((sum,item)=>sum+item.size,0);
      if (total > 6 * 1024 * 1024) throw new Error("Keep all attachments together under 6 MB.");
      setAttachments(current => [...current, ...prepared].slice(0, 3)); setNotice("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "The image could not be attached."); }
    if (galleryRef.current) galleryRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
    if (fileRef.current) fileRef.current.value = "";
    setAttachMenuOpen(false);
  };

  const toggleVoice = () => {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const speech = window as SpeechWindow;
    const Speech = speech.SpeechRecognition || speech.webkitSpeechRecognition;
    if (!Speech) { setNotice("Voice input is not available in this browser. You can still type or attach a photo."); return; }
    try {
      const recognition = new Speech();
      recognition.lang = navigator.language || "ur-PK";
      recognition.continuous = false; recognition.interimResults = true;
      voiceDraftPrefixRef.current = draft.trim() ? draft.trimEnd() + " " : "";
      recognition.onresult = event => {
        let transcript = "";
        for (let i = 0; i < (event.results?.length || 0); i++) transcript += event.results?.[i]?.[0]?.transcript || "";
        setDraft(voiceDraftPrefixRef.current + transcript.trim());
      };
      recognition.onerror = () => { setNotice("Microphone access or speech recognition failed. Check browser permission and try again."); setListening(false); };
      recognition.onend = () => { setListening(false); recognitionRef.current = null; };
      recognitionRef.current = recognition; recognition.start(); setListening(true); setNotice("Listening… speak naturally, then tap the microphone again to finish.");
    } catch { setListening(false); setNotice("Voice input could not start. Check microphone permission."); }
  };

  const speakMessage = (message: Message, index: number) => {
    if (typeof speechSynthesis === "undefined") { setNotice("Spoken responses are not supported in this browser."); return; }
    if (speakingIndex === index) { speechSynthesis.cancel(); setSpeakingIndex(null); return; }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message.text);
    utterance.lang = /[\u0600-\u06FF]/.test(message.text) ? "ur-PK" : "en-PK";
    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);
    setSpeakingIndex(index); speechSynthesis.speak(utterance);
  };

  const copyMessage = async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const area = document.createElement("textarea"); area.value = text; area.style.position = "fixed"; area.style.opacity = "0";
        document.body.appendChild(area); area.select();
        const copied = document.execCommand("copy"); area.remove();
        if (!copied) throw new Error("Copy is unavailable");
      }
      setNotice("Message copied."); window.setTimeout(() => setNotice(current => current === "Message copied." ? "" : current), 1800);
    } catch { setNotice("Could not copy this message. Please select and copy the text manually."); }
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim() || (attachments.length ? "Please inspect and explain the attached file(s)." : "");
    if (!text || sending) return;
    const nextHistory = [...history, { role: "user" as const, text }];
    while (nextHistory.length > 12) nextHistory.splice(0, 2);
    const attached = attachments;
    setMessages(current => [...current, { role: "user", text }]); setDraft(""); setAttachments([]); setSending(true); setNotice("");
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ messages: nextHistory, attachments: attached.map(({ name, mime_type, data, text }) => ({ name, mime_type, data, text })) })
      });
      const result = await response.json() as { reply?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "The assistant is temporarily unavailable.");
      if (!result.reply) throw new Error("The assistant did not return a response.");
      const reply: Message = { role: "model", text: result.reply };
      setHistory([...nextHistory, reply]); setMessages(current => [...current, reply]);
    } catch (error) {
      const failure: Message = { role: "model", text: error instanceof Error ? error.message : "Please try again shortly." };
      setMessages(current => [...current, failure]);
    } finally { setSending(false); }
  };

  return <>
    <button type="button" className="ai-chat-launcher" aria-label={open ? "Close De VERVE AI chat" : "Open De VERVE AI chat"} onClick={() => setOpen(value => !value)}>
      <img src={logoUrl} alt="" aria-hidden="true" />
    </button>
    {open && <section className="ai-chat-panel" role="dialog" aria-label="De VERVE AI customer support" aria-modal="false">
      <header className="ai-chat-head">
        <img className="ai-chat-brand-logo" src={logoUrl} alt="De VERVE" />
        <div className="ai-chat-identity"><strong>De VERVE assistant</strong><small><span className="ai-chat-online-dot"/> Here to help · Usually replies instantly</small></div>
        <button type="button" aria-label="Close chat" onClick={() => { setOpen(false); recognitionRef.current?.stop(); }}>×</button>
      </header>
      <div className="ai-chat-messages" ref={listRef} aria-live="polite">
        {messages.map((message, index) => <article key={index} className={"ai-chat-message-wrap " + message.role}>
          <div className={"ai-chat-message " + message.role}><span>{message.role === "user" ? "YOU" : "DE VERVE"}</span><p>{message.text}</p></div>
          <div className="ai-chat-message-actions">
            <button type="button" aria-label={"Copy " + (message.role === "user" ? "your" : "assistant") + " message"} title="Copy message" onClick={() => void copyMessage(message.text)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/></svg>
            </button>
            <button type="button" aria-label={(speakingIndex === index ? "Stop" : "Speak") + " message"} title={speakingIndex === index ? "Stop speaking" : "Read message aloud"} onClick={() => speakMessage(message, index)}>
              {speakingIndex === index ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M17 9a5 5 0 0 1 0 6m2-9a9 9 0 0 1 0 12"/></svg>}
            </button>
          </div>
        </article>)}
        {sending && <span className="ai-chat-typing" role="status"><i/><i/><i/> Thinking…</span>}
      </div>
      {attachments.length > 0 && <div className="ai-chat-attachments" aria-label="Attached files">{attachments.map((item,index)=><figure key={item.name+index}>{item.preview?<img src={item.preview} alt={"Image attachment "+(index+1)}/>:<div className="ai-chat-file-preview" aria-hidden="true">{item.mime_type==="application/pdf"?"PDF":item.mime_type.startsWith("audio/")?"♪":item.mime_type.startsWith("video/")?"▶":"TXT"}</div>}<button type="button" aria-label={"Remove "+item.name} onClick={()=>setAttachments(current=>current.filter((_,i)=>i!==index))}>×</button><figcaption>{item.name}</figcaption></figure>)}</div>}
      <form className="ai-chat-form" onSubmit={send}>
        <div className="ai-chat-composer">
          <div className="ai-chat-attach-wrap">
            <button type="button" className="ai-chat-icon-button ai-chat-plus" aria-label="Add attachment" aria-expanded={attachMenuOpen} onClick={() => setAttachMenuOpen(value => !value)} disabled={sending || attachments.length >= 3}>＋</button>
            {attachMenuOpen && <div className="ai-chat-attach-menu" role="menu" aria-label="Attachment options">
              <button type="button" role="menuitem" onClick={() => cameraRef.current?.click()}><span>▣</span> Take a photo</button>
              <button type="button" role="menuitem" onClick={() => galleryRef.current?.click()}><span>▧</span> Choose from gallery</button>
              <button type="button" role="menuitem" onClick={() => fileRef.current?.click()}><span>↥</span> Attach any file</button>
            </div>}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={event => void attach(event.currentTarget.files)} />
            <input ref={galleryRef} type="file" multiple hidden onChange={event => void attach(event.currentTarget.files)} />
            <input ref={fileRef} type="file" multiple hidden onChange={event => void attach(event.currentTarget.files)} />
          </div>
          <textarea rows={1} maxLength={1800} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Message De VERVE…" aria-label="Your message" disabled={sending}/>
          <button type="button" className={"ai-chat-icon-button ai-chat-mic " + (listening ? "is-active" : "")} onClick={toggleVoice} disabled={sending} aria-pressed={listening} aria-label={listening ? "Stop voice input" : "Speak your message"} title={listening ? "Stop recording" : "Voice input"}>
            {listening ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21m-3 0h6"/></svg>}
          </button>
          <button type="submit" className="ai-chat-send" disabled={sending || (!draft.trim() && !attachments.length)} aria-label="Send message" title="Send message">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 8-16 8 3-8-3-8Zm3 8h13"/></svg>
          </button>
        </div>
        <div className="ai-chat-composer-caption"><span>Enter to send · Shift + Enter for a new line</span><span>Up to 3 files</span></div>
      </form>
      {notice && <p className="ai-chat-note" role="status">{notice}</p>}
      <div className="ai-chat-note">Avoid sending CNIC images, OTPs, passwords or payment-card details in chat. Orders and rentals are completed through secure website forms.</div>
    </section>}
  </>;
}
