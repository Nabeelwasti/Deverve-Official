import { useEffect, useRef, useState, type FormEvent } from "react";

type Message = { role: "user" | "model"; text: string };
type Attachment = { name: string; mime_type: "image/jpeg" | "application/pdf" | "text/plain"; data: string; preview?: string };
type SpeechRecognitionResult = { 0?: { transcript?: string }; isFinal?: boolean };
type SpeechRecognitionEventLike = Event & { results?: ArrayLike<SpeechRecognitionResult> };
type SpeechRecognitionLike = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };

const greeting: Message = { role: "model", text: "Assalamu Alaikum! Welcome to De VERVE. I can help with garments, wholesale and car rentals. You can also attach a photo or document. How may I help?" };

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  return btoa(binary);
}

async function prepareAttachment(file: File): Promise<Attachment> {
  if (file.size < 1 || file.size > 12 * 1024 * 1024) throw new Error("Choose a file smaller than 12 MB.");
  if (file.type.startsWith("image/")) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Use a JPG, PNG or WebP image.");
    let bitmap: ImageBitmap | null = null, objectUrl = "";
    try {
      let source: CanvasImageSource, width = 0, height = 0;
      if (typeof createImageBitmap === "function") {
        try { bitmap = await createImageBitmap(file); } catch { /* fallback */ }
      }
      if (bitmap) { source = bitmap; width = bitmap.width; height = bitmap.height; }
      else {
        objectUrl = URL.createObjectURL(file);
        const image = new Image(); image.decoding = "async"; image.src = objectUrl; await image.decode();
        source = image; width = image.naturalWidth; height = image.naturalHeight;
      }
      if (!width || !height) throw new Error("The image could not be decoded.");
      const scale = Math.min(1, 1600 / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser could not prepare the image.");
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      let dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      if (dataUrl.length > 2_000_000) dataUrl = canvas.toDataURL("image/jpeg", 0.68);
      if (dataUrl.length > 2_000_000) throw new Error("This image is too large after compression. Please crop it and try again.");
      return { name: file.name.slice(0, 120), mime_type: "image/jpeg", data: dataUrl.split(",")[1], preview: dataUrl };
    } finally { bitmap?.close(); if (objectUrl) URL.revokeObjectURL(objectUrl); }
  }
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    if (file.size > 5 * 1024 * 1024) throw new Error("PDF files must be 5 MB or smaller.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("This PDF file appears to be invalid.");
    return { name: file.name.slice(0, 120), mime_type: "application/pdf", data: toBase64(bytes) };
  }
  if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
    if (file.size > 512 * 1024) throw new Error("Text files must be 512 KB or smaller.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { name: file.name.slice(0, 120), mime_type: "text/plain", data: toBase64(bytes) };
  }
  throw new Error("For customer chat, attach JPG, PNG, WebP, PDF or TXT files only.");
}

function speakText(text: string, onEnd: () => void, onError: () => void) {
  if (typeof speechSynthesis === "undefined" || typeof SpeechSynthesisUtterance === "undefined") return false;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = /[\u0600-\u06FF]/.test(text) ? "ur-PK" : /\b(?:aap|hai|hain|mujhe|chahiye|karna|mera|meri)\b/i.test(text) ? "ur-PK" : "en-PK";
  utterance.onend = onEnd; utterance.onerror = onError;
  speechSynthesis.cancel(); speechSynthesis.speak(utterance); return true;
}

export default function AIChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [history, setHistory] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const logoUrl = "/api/brand/logo";
  const listRef = useRef<HTMLDivElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceDraftPrefixRef = useRef("");

  useEffect(() => { if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [open, messages, sending, attachments]);
  useEffect(() => () => { recognitionRef.current?.abort(); if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); }, []);

  const attach = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = 3 - attachments.length;
    if (remaining <= 0) { setNotice("You can attach up to three files per message."); return; }
    try {
      const prepared = await Promise.all(Array.from(files).slice(0, remaining).map(prepareAttachment));
      setAttachments(current => [...current, ...prepared].slice(0, 3)); setNotice("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "The file could not be attached."); }
    for (const input of [galleryRef.current, cameraRef.current, fileRef.current]) if (input) input.value = "";
    setAttachMenuOpen(false);
  };

  const toggleVoice = () => {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const Speech = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!Speech) { setNotice("Voice input is not available in this browser. You can still type or attach a photo."); return; }
    try {
      const recognition = new Speech();
      recognition.lang = navigator.language || "en-PK";
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

  const copyMessage = async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const field = document.createElement("textarea"); field.value = text; field.style.position = "fixed"; field.style.opacity = "0";
        document.body.appendChild(field); field.select(); const copied = document.execCommand("copy"); field.remove();
        if (!copied) throw new Error("Copy is not available in this browser.");
      }
      setNotice("Message copied.");
    } catch { setNotice("Could not copy automatically. Select the message text to copy it."); }
  };

  const speakMessage = (text: string, index: number) => {
    if (speakingIndex === index) { speechSynthesis.cancel(); setSpeakingIndex(null); return; }
    const started = speakText(text, () => setSpeakingIndex(null), () => setSpeakingIndex(null));
    if (started) setSpeakingIndex(index); else setNotice("Spoken playback is not supported in this browser.");
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim() || (attachments.length ? "Please inspect the attached file(s) and help me understand them." : "");
    if (!text || sending) return;
    const nextHistory = [...history, { role: "user" as const, text }];
    while (nextHistory.length > 12) nextHistory.splice(0, 2);
    const attached = attachments;
    setMessages(current => [...current, { role: "user", text }]);
    setDraft(""); setAttachments([]); setSending(true); setNotice("");
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ messages: nextHistory, images: attached.map(({ name, mime_type, data }) => ({ name, mime_type, data })) })
      });
      const result = await response.json() as { reply?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "The assistant is temporarily unavailable.");
      if (!result.reply) throw new Error("The assistant did not return a response.");
      const reply: Message = { role: "model", text: result.reply };
      setHistory([...nextHistory, reply]); setMessages(current => [...current, reply]);
    } catch (error) {
      setMessages(current => [...current, { role: "model", text: error instanceof Error ? error.message : "Please try again shortly." }]);
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
        {messages.map((message, index) => <article key={index} className={"ai-chat-message " + message.role}>
          <span className="ai-chat-message-label">{message.role === "user" ? "YOU" : "DE VERVE"}</span>
          <p>{message.text}</p>
          <div className="ai-chat-message-actions">
            <button type="button" aria-label={speakingIndex === index ? "Stop speaking message" : "Speak message"} title="Read this message aloud" onClick={() => speakMessage(message.text, index)}>{speakingIndex === index ? "Ⅱ" : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Zm12-1a5 5 0 0 1 0 6m2-9a9 9 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>}</button>
            <button type="button" aria-label="Copy message" title="Copy message" onClick={() => void copyMessage(message.text)}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" fill="none" stroke="currentColor" strokeWidth="1.7"/></svg></button>
          </div>
        </article>)}
        {sending && <span className="ai-chat-typing" role="status"><i/><i/><i/> Thinking…</span>}
      </div>
      {attachments.length > 0 && <div className="ai-chat-attachments" aria-label="Attached files">{attachments.map((item, index) => <figure key={item.name + index}>{item.preview ? <img src={item.preview} alt={"Photo attachment " + (index + 1)} /> : <div className="ai-chat-file-preview" aria-hidden="true">{item.mime_type==="application/pdf"?"PDF":"TXT"}</div>}<button type="button" aria-label="Remove attachment" onClick={() => setAttachments(current => current.filter((_, i) => i !== index))}>×</button><figcaption>{item.name}</figcaption></figure>)}</div>}
      <form className="ai-chat-form" onSubmit={send}>
        <div className="ai-chat-composer">
          <div className="ai-chat-attach-wrap">
            <button type="button" className="ai-chat-icon-button" aria-label="Add attachment" aria-expanded={attachMenuOpen} onClick={() => setAttachMenuOpen(value => !value)} disabled={sending || attachments.length >= 3}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            </button>
            {attachMenuOpen && <div className="ai-chat-attach-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => fileRef.current?.click()}><span>▤</span> Attach a file</button>
              <button type="button" role="menuitem" onClick={() => cameraRef.current?.click()}><span>◎</span> Take a photo</button>
              <button type="button" role="menuitem" onClick={() => galleryRef.current?.click()}><span>▧</span> Choose from gallery</button>
            </div>}
          </div>
          <input ref={fileRef} type="file" accept="application/pdf,text/plain,.pdf,.txt" hidden onChange={event => void attach(event.currentTarget.files)} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={event => void attach(event.currentTarget.files)} />
          <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" multiple hidden onChange={event => void attach(event.currentTarget.files)} />
          <textarea rows={1} maxLength={1800} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Message De VERVE…" aria-label="Your message" disabled={sending}/>
          <button type="button" className={"ai-chat-icon-button ai-chat-mic " + (listening ? "is-active" : "")} onClick={toggleVoice} disabled={sending} aria-pressed={listening} aria-label={listening ? "Stop voice input" : "Speak your message"} title={listening ? "Stop recording" : "Voice input"}>
            {listening ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21m-3 0h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
          </button>
          <button type="submit" className="ai-chat-send" disabled={sending || (!draft.trim() && !attachments.length)} aria-label="Send message" title="Send message">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 8-16 8 3-8-3-8Zm3 8h13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="ai-chat-composer-caption"><span>Enter to send · Shift + Enter for a new line</span><span>Up to 3 attachments</span></div>
      </form>
      {notice && <p className="ai-chat-note" role="status">{notice}</p>}
      <div className="ai-chat-note">Avoid sending CNIC images, OTPs, passwords or payment-card details in chat. Orders and rentals are completed through secure website forms.</div>
    </section>}
  </>;
}
