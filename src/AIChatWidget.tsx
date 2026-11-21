import { useEffect, useRef, useState, type FormEvent } from "react";

type Message = { role: "user" | "model"; text: string };
type ImageAttachment = { name: string; mime_type: "image/jpeg"; data: string; preview: string };
type SpeechRecognitionResult = { 0?: { transcript?: string }; isFinal?: boolean };
type SpeechRecognitionEventLike = Event & { results?: ArrayLike<SpeechRecognitionResult>; resultIndex?: number };
type SpeechRecognitionLike = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
const greeting: Message = { role: "model", text: "Assalamu Alaikum! Welcome to De VERVE. I can help with garments, wholesale and car rentals. You can type, speak, or attach a product photo. How may I help?" };

async function prepareImage(file: File): Promise<ImageAttachment> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose an image smaller than 12 MB.");
  let bitmap: ImageBitmap | null = null;
  let source: CanvasImageSource;
  let width = 0, height = 0;
  let objectUrl = "";
  try {
    if (typeof createImageBitmap === "function") {
      try { bitmap = await createImageBitmap(file); } catch { /* Use the HTML image fallback below. */ }
    }
    if (bitmap) { source = bitmap; width = bitmap.width; height = bitmap.height; }
    else {
      objectUrl = URL.createObjectURL(file);
      const image = new Image(); image.decoding = "async"; image.src = objectUrl; await image.decode();
      source = image; width = image.naturalWidth; height = image.naturalHeight;
    }
    if (!width || !height) throw new Error("The image could not be decoded. Please choose another photo.");
    const scale = Math.min(1, 1600 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the image.");
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    let dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    if (dataUrl.length > 2_000_000) dataUrl = canvas.toDataURL("image/jpeg", 0.68);
    if (dataUrl.length > 2_000_000) throw new Error("This image is still too large. Please crop it and try again.");
    return { name: file.name.slice(0, 120), mime_type: "image/jpeg", data: dataUrl.split(",")[1], preview: dataUrl };
  } finally { bitmap?.close(); if (objectUrl) URL.revokeObjectURL(objectUrl); }
}

export default function AIChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [history, setHistory] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState("ur-PK");
  const [notice, setNotice] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceDraftPrefixRef = useRef("");

  useEffect(() => { if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [open, messages, sending, images]);
  useEffect(() => () => { recognitionRef.current?.abort(); if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); }, []);

  const attach = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = 3 - images.length;
    if (remaining <= 0) { setNotice("You can attach up to three photos per message."); return; }
    try {
      const prepared = await Promise.all(Array.from(files).slice(0, remaining).map(prepareImage));
      setImages(current => [...current, ...prepared].slice(0, 3)); setNotice("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "The image could not be attached."); }
    if (fileRef.current) fileRef.current.value = "";
  };

  const toggleVoice = () => {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const Speech = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!Speech) { setNotice("Voice input is not available in this browser. You can still type or attach a photo."); return; }
    try {
      const recognition = new Speech(); recognition.lang = voiceLanguage; recognition.continuous = false; recognition.interimResults = true;
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

  const speakLatest = () => {
    if (typeof speechSynthesis === "undefined") { setNotice("Spoken responses are not supported in this browser."); return; }
    if (speaking) { speechSynthesis.cancel(); setSpeaking(false); return; }
    const latest = [...messages].reverse().find(message => message.role === "model")?.text;
    if (!latest) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(latest);
    utterance.lang = /[\u0600-\u06FF]/.test(latest) ? "ur-PK" : /\b(?:aap|hai|hain|mujhe|chahiye|karna)\b/i.test(latest) ? "ur-PK" : "en-PK";
    utterance.onend = () => setSpeaking(false); utterance.onerror = () => setSpeaking(false);
    setSpeaking(true); speechSynthesis.speak(utterance);
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim() || (images.length ? "Please inspect these photo(s) and help me understand the product or item." : "");
    if (!text || sending) return;
    const next = [...messages, { role: "user" as const, text }];
    const nextHistory = [...history, { role: "user" as const, text }];
    while (nextHistory.length > 12) nextHistory.splice(0, 2);
    const attached = images;
    setMessages(next); setDraft(""); setImages([]); setSending(true); setNotice("");
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ messages: nextHistory, images: attached.map(({ name, mime_type, data }) => ({ name, mime_type, data })) })
      });
      const result = await response.json() as { reply?: string; error?: string; model?: string };
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
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-9.5A7.5 7.5 0 0 1 10.5 4h2A7.5 7.5 0 0 1 20 11.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M8 11h8M8 14.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
    </button>
    {open && <section className="ai-chat-panel" role="dialog" aria-label="De VERVE AI customer support" aria-modal="false">
      <header className="ai-chat-head">
        <div className="ai-chat-avatar" aria-hidden="true">DV</div>
        <div className="ai-chat-identity"><strong>De VERVE assistant</strong><small><span className="ai-chat-online-dot"/> Here to help · Usually replies instantly</small></div>
        <button type="button" aria-label="Close chat" onClick={() => { setOpen(false); recognitionRef.current?.stop(); }}>×</button>
      </header>
      <div className="ai-chat-messages" ref={listRef} aria-live="polite">
        {messages.map((message, index) => <div key={index} className={"ai-chat-message " + message.role}><span>{message.role === "user" ? "YOU" : "DE VERVE"}</span>{message.text}</div>)}
        {sending && <span className="ai-chat-typing" role="status"><i/><i/><i/> Thinking…</span>}
      </div>
      {images.length > 0 && <div className="ai-chat-attachments" aria-label="Attached photos">{images.map((item, index) => <figure key={item.name + index}><img src={item.preview} alt={"Photo attachment " + (index + 1)} /><button type="button" aria-label="Remove photo" onClick={() => setImages(current => current.filter((_, i) => i !== index))}>×</button><figcaption>{item.name}</figcaption></figure>)}</div>}
      <form className="ai-chat-form" onSubmit={send}>
        <div className="ai-chat-composer">
          <label className="ai-chat-icon-button" title="Attach a product photo" aria-label="Attach a product photo">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" multiple hidden onChange={event => void attach(event.currentTarget.files)} disabled={sending || images.length >= 3}/>
          </label>
          <textarea rows={1} maxLength={1800} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Message De VERVE…" aria-label="Your message" disabled={sending}/>
          <select className="ai-chat-language" aria-label="Voice recognition language" value={voiceLanguage} onChange={event => setVoiceLanguage(event.target.value)} title="Voice language"><option value="ur-PK">اردو</option><option value="en-PK">EN</option></select>
          <button type="button" className={"ai-chat-icon-button " + (listening ? "is-active" : "")} onClick={toggleVoice} disabled={sending} aria-pressed={listening} aria-label={listening ? "Stop voice input" : "Speak your message"} title={listening ? "Stop recording" : "Voice input"}>
            {listening ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21m-3 0h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
          </button>
          <button type="submit" className="ai-chat-send" disabled={sending || (!draft.trim() && !images.length)} aria-label="Send message" title="Send message">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 8-16 8 3-8-3-8Zm3 8h13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="ai-chat-composer-caption"><span>Enter to send · Shift + Enter for a new line</span><button type="button" onClick={speakLatest} disabled={sending || !messages.some(message => message.role === "model")} aria-label={speaking ? "Stop spoken response" : "Listen to latest response"}>{speaking ? "Stop audio" : "Listen"}</button></div>
      </form>
      {notice && <p className="ai-chat-note" role="status">{notice}</p>}
      <div className="ai-chat-note">You can speak or attach product photos. Avoid sending CNIC images, OTPs, passwords or payment-card details in chat. Orders and rentals are completed through secure website forms.</div>
    </section>}
  </>;
}
