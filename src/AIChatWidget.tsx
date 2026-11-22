import { useEffect, useRef, useState, type FormEvent } from "react";
import BrandLogo from "./BrandLogo";

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

const ROMAN_URDU_WORDS = new Set("aap apka apki apke assalam alaikum assalamualaikum hoon kaise kaisay hain hai ho kya kyun kahan kab mujhe mera meri mere hum tum aapka aapki nahi nahin acha achha theek thik bohat bahut shukriya me main mein aur ke ki ko se par per ghar zindagi dil dost madad batao bataye bata dein karo karna kar raha rahi rahe chahiye mil sakta sakti".split(/\s+/));
const ROMAN_URDU_SCRIPT: Record<string,string> = {
  aap:"آپ", apka:"آپ کا", apki:"آپ کی", apke:"آپ کے", assalam:"السلام", alaikum:"علیکم", assalamualaikum:"السلام علیکم", hoon:"ہوں",
  kaise:"کیسے", kaisay:"کیسے", hain:"ہیں", hai:"ہے", ho:"ہو", kya:"کیا", kyun:"کیوں",
  kahan:"کہاں", kab:"کب", mujhe:"مجھے", mera:"میرا", meri:"میری", mere:"میرے",
  hum:"ہم", tum:"تم", nahi:"نہیں", nahin:"نہیں", acha:"اچھا", achha:"اچھا", theek:"ٹھیک",
  thik:"ٹھیک", bohat:"بہت", bahut:"بہت", shukriya:"شکریہ", mein:"میں", main:"میں",
  aur:"اور", ke:"کے", ki:"کی", ko:"کو", se:"سے", par:"پر", per:"پر", ghar:"گھر",
  zindagi:"زندگی", dil:"دل", dost:"دوست", madad:"مدد", batao:"بتاؤ", bataye:"بتائیں",
  karo:"کرو", karna:"کرنا", raha:"رہا", rahi:"رہی", rahe:"رہے", chahiye:"چاہیے",
  mil:"مل", sakta:"سکتا", sakti:"سکتی",
  allah:"اللہ", inshallah:"ان شاء اللہ", mashallah:"ماشاءاللہ", kapray:"کپڑے", kapde:"کپڑے",
  khareedna:"خریدنا", paisa:"پیسہ", kitna:"کتنا", qeemat:"قیمت", salam:"سلام"
};
const SPEECH_LOCALE_OPTIONS = [
  ["auto","Auto detect"],["en-US","English"],["ur-PK","Urdu / Roman Urdu"],["ar-SA","Arabic"],
  ["hi-IN","Hindi"],["pa-IN","Punjabi"],["bn-BD","Bengali"],["fa-IR","Persian"],
  ["ps-AF","Pashto"],["es-ES","Spanish"],["fr-FR","French"],["de-DE","German"],
  ["tr-TR","Turkish"],["zh-CN","Chinese"],["ja-JP","Japanese"],["ko-KR","Korean"],
  ["ru-RU","Russian"],["pt-BR","Portuguese"],["it-IT","Italian"],["id-ID","Indonesian"],
  ["nl-NL","Dutch"],["ta-IN","Tamil"],["te-IN","Telugu"],["ml-IN","Malayalam"]
] as const;

function detectSpeechLocale(text: string, selected: string): string {
  if (selected !== "auto") return selected;
  if (/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/i.test(text)) {
    if (/[ٹڈڑںھہے]/.test(text) || /(آپ|ہے|ہیں|کیا|میں|نہیں|کا|کی|کے|اور|سے|کو)/.test(text)) return "ur-PK";
    if (/[ژ]/.test(text)) return "fa-IR";
    return "ar-SA";
  }
  const scripts: Array<[RegExp,string]> = [
    [/\p{Script=Devanagari}/u,"hi-IN"],[/\p{Script=Gurmukhi}/u,"pa-IN"],[/\p{Script=Bengali}/u,"bn-BD"],
    [/\p{Script=Tamil}/u,"ta-IN"],[/\p{Script=Telugu}/u,"te-IN"],[/\p{Script=Kannada}/u,"kn-IN"],
    [/\p{Script=Malayalam}/u,"ml-IN"],[/\p{Script=Thai}/u,"th-TH"],[/\p{Script=Hiragana}|\p{Script=Katakana}/u,"ja-JP"],
    [/\p{Script=Hangul}/u,"ko-KR"],[/\p{Script=Han}/u,"zh-CN"],[/\p{Script=Cyrillic}/u,"ru-RU"],
    [/\p{Script=Hebrew}/u,"he-IL"]
  ];
  for (const [pattern,locale] of scripts) if (pattern.test(text)) return locale;
  const words = (text.toLocaleLowerCase().match(/[a-z]+/g) || []);
  const romanUrduHits = words.filter(word => ROMAN_URDU_WORDS.has(word)).length;
  if (romanUrduHits >= 2 && romanUrduHits / Math.max(words.length,1) >= 0.12) return "ur-PK";
  const latinHints: Array<[RegExp,string]> = [
    [/\b(hola|gracias|buenos|buenas|usted|ustedes|porque|quiero|puedo|necesito)\b/i,"es-ES"],
    [/\b(bonjour|merci|avec|vous|nous|pourquoi|besoin)\b/i,"fr-FR"],
    [/\b(hallo|danke|bitte|ich|nicht|und|weil|brauche)\b/i,"de-DE"],
    [/\b(ciao|grazie|perche|perché|buongiorno|sono|vorrei)\b/i,"it-IT"],
    [/\b(olá|ola|obrigado|obrigada|voce|você|preciso|porque)\b/i,"pt-BR"],
    [/\b(merhaba|tesekkur|teşekkür|lutfen|lütfen|nasilsin|nasılsın)\b/i,"tr-TR"],
    [/\b(terima|kasih|selamat|saya|tidak|bagaimana)\b/i,"id-ID"],
    [/\b(dank je|alsjeblieft|goedemorgen)\b/i,"nl-NL"]
  ];
  for (const [pattern,locale] of latinHints) if (pattern.test(text)) return locale;
  return typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
}

function prepareSpeechText(text: string, locale: string): string {
  if (locale !== "ur-PK" || /[\u0600-\u06ff]/.test(text)) return text;
  return text.replace(/[A-Za-z]+/g, word => ROMAN_URDU_SCRIPT[word.toLowerCase()] || word);
}

function buildSpeechChunks(text: string, selected: string): Array<{ text: string; locale: string }> {
  const parts = selected === "auto" ? (text.match(/[^.!?؟\n]+[.!?؟\n]*/g) || [text]) : [text];
  return parts.map(part => {
    const locale = detectSpeechLocale(part, selected);
    return { locale, text: prepareSpeechText(part, locale) };
  }).filter(part => part.text.trim().length > 0);
}

async function availableSpeechVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const current = synth.getVoices();
  if (current.length) return current;
  return await new Promise<SpeechSynthesisVoice[]>(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      synth.removeEventListener("voiceschanged", finish);
      resolve(synth.getVoices());
    };
    const timer = window.setTimeout(finish, 900);
    synth.addEventListener("voiceschanged", finish, { once: true });
  });
}

const greeting: Message = { role: "model", text: "Assalamu Alaikum! Welcome to De VERVE. I can help with garments, wholesale and car rentals. You can type, speak, or attach files for me to understand. How may I help?" };

const TEXT_EXTENSIONS = new Set(["txt","md","markdown","csv","tsv","json","jsonl","xml","html","htm","css","js","jsx","ts","tsx","py","java","c","cpp","h","hpp","cs","go","rs","php","sql","yaml","yml","toml","ini","log","rtf","svg","sh","bat","ps1"]);
const MIME_BY_EXTENSION: Record<string,string> = { pdf:"application/pdf", txt:"text/plain", md:"text/plain", markdown:"text/plain", csv:"text/plain", tsv:"text/plain", json:"text/plain", jsonl:"text/plain", xml:"text/plain", html:"text/plain", htm:"text/plain", rtf:"text/plain", mp3:"audio/mpeg", m4a:"audio/mp4", wav:"audio/wav", aac:"audio/aac", flac:"audio/flac", opus:"audio/opus", mp4:"video/mp4", mov:"video/mov", avi:"video/avi", mpg:"video/mpeg", mpeg:"video/mpeg", jpg:"image/jpeg", jpeg:"image/jpeg", png:"image/png", webp:"image/webp" };
const DIRECT_MIME = new Set(["application/pdf","image/jpeg","image/png","image/webp","audio/aac","audio/flac","audio/mp3","audio/mp4","audio/mpeg","audio/mpga","audio/opus","audio/pcm","audio/wav","audio/webm","video/mov","video/mpeg","video/mp4","video/mpg","video/avi","video/wmv","video/mpegps","video/flv"]);
function fileExtension(name: string): string { return name.toLowerCase().split(".").pop() || ""; }

const OFFICE_EXTENSIONS = new Set(["docx","xlsx","pptx","odt","ods","odp"]);
async function extractOfficeText(file: File, ext: string): Promise<string> {
  // Read only the document XML entries we need. Bound entry count and expanded bytes
  // to avoid ZIP bombs; never extract paths to the user's device.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = Math.max(0, bytes.length - 22 - 65_535); i <= bytes.length - 22; i++) {
    if (view.getUint32(i, true) === 0x06054b50) eocd = i;
  }
  if (eocd < 0) throw new Error(file.name + " is not a valid Office/OpenDocument package.");
  const entries = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (entries > 500 || directoryOffset + directorySize > bytes.length) throw new Error(file.name + " contains an unsupported or unusually large document package.");
  const wanted = (name: string) => {
    if (ext === "docx") return name === "word/document.xml";
    if (ext === "pptx") return /^ppt\/slides\/slide\d+\.xml$/.test(name);
    if (ext === "xlsx") return name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(name);
    return name === "content.xml";
  };
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const chunks: string[] = [];
  let cursor = directoryOffset, expanded = 0, extracted = 0;
  for (let index = 0; index < entries; index++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) throw new Error("The document package directory is damaged.");
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!wanted(name)) continue;
    if (++extracted > 120 || uncompressedSize > 2_000_000 || expanded + uncompressedSize > 8_000_000) throw new Error("The document expands beyond the safe text-extraction limit.");
    if (method !== 0 && method !== 8) throw new Error("This document uses an unsupported compression method.");
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("The document package contains a damaged file entry.");
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const end = start + compressedSize;
    if (end > bytes.length) throw new Error("The document package contains an incomplete file entry.");
    let output: Uint8Array;
    if (method === 0) output = bytes.slice(start, end);
    else {
      if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot safely extract Office documents. Export the file as PDF.");
      const stream = new Blob([bytes.slice(start, end)]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
      output = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    if (output.byteLength !== uncompressedSize) throw new Error("A document component failed its integrity-size check.");
    expanded += output.byteLength;
    const xml = decoder.decode(output);
    const parsed = new DOMParser().parseFromString(xml, "application/xml");
    if (parsed.querySelector("parsererror")) throw new Error("A document component contains invalid XML.");
    const text = Array.from(parsed.getElementsByTagName("*"))
      .filter(node => ["t","v"].includes(node.localName))
      .map(node => node.textContent || "").filter(Boolean).join(" ");
    if (text) chunks.push(text);
  }
  const result = chunks.join("\n").replace(/[ \t]+\n/g, "\n").trim();
  if (!result) throw new Error(file.name + " contains no readable text, or is encrypted.");
  if (result.length > 180_000) throw new Error(file.name + " contains too much extracted text. Split it into smaller documents.");
  return result;
}
async function prepareAttachment(file: File): Promise<FileAttachment> {
  const ext = fileExtension(file.name);
  const mime = (file.type || MIME_BY_EXTENSION[ext] || "application/octet-stream").toLowerCase();
  if (!file.size) throw new Error(file.name + " is empty.");
  if (file.size > 4 * 1024 * 1024) throw new Error(file.name + " exceeds the 4 MB per-file limit. Compress it or export a smaller copy.");
  const safeName = file.name.replace(/[\\/]/g, "_").replace(/[\x00-\x1f]/g, "_").slice(0, 120) || "attachment";
  if (OFFICE_EXTENSIONS.has(ext)) {
    const text = await extractOfficeText(file, ext);
    return { name: safeName, mime_type: "text/plain", text, size: file.size };
  }
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
  const [speechLanguage, setSpeechLanguage] = useState("auto");
  const [installedSpeechLocales, setInstalledSpeechLocales] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return;
    const refresh = () => setInstalledSpeechLocales([...new Set(window.speechSynthesis.getVoices().map(voice => voice.lang.trim()).filter(Boolean))].sort());
    refresh();
    window.speechSynthesis.addEventListener("voiceschanged", refresh);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", refresh);
  }, []);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const attachWrapRef = useRef<HTMLDivElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceDraftPrefixRef = useRef("");

  useEffect(() => {
    if (!attachMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !attachWrapRef.current?.contains(event.target)) setAttachMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setAttachMenuOpen(false); };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [attachMenuOpen]);

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
      recognition.lang = speechLanguage === "auto" ? (navigator.language || "en-US") : speechLanguage;
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

  const speakMessage = async (message: Message, index: number) => {
    if (typeof window.speechSynthesis === "undefined" || typeof SpeechSynthesisUtterance === "undefined") {
      setNotice("Spoken responses are not supported by this browser. Try a browser with text-to-speech enabled.");
      return;
    }
    if (speakingIndex === index) { window.speechSynthesis.cancel(); setSpeakingIndex(null); return; }
    const synth = window.speechSynthesis;
    synth.cancel();
    const chunks = buildSpeechChunks(message.text, speechLanguage);
    if (!chunks.length) { setNotice("There is no readable text in this message."); return; }
    const voices = await availableSpeechVoices();
    const utterances: SpeechSynthesisUtterance[] = [];
    const missingLocales: string[] = [];
    for (const chunk of chunks) {
      const baseLanguage = chunk.locale.toLowerCase().split("-")[0];
      const voice = voices.find(item => item.lang.toLowerCase() === chunk.locale.toLowerCase())
        || voices.find(item => item.lang.toLowerCase().split("-")[0] === baseLanguage);
      if (voices.length && !voice) { missingLocales.push(chunk.locale); continue; }
      const utterance = new SpeechSynthesisUtterance(chunk.text);
      utterance.lang = chunk.locale;
      if (voice) utterance.voice = voice;
      utterance.rate = 0.94;
      utterance.pitch = 1;
      utterances.push(utterance);
    }
    if (missingLocales.length) {
      setNotice("Install speech voices for " + [...new Set(missingLocales)].join(", ") + " in your device's Text-to-speech settings, then try again.");
      setSpeakingIndex(null);
      return;
    }
    if (!utterances.length) { setNotice("No compatible speech voice is available on this device."); return; }
    let remaining = utterances.length;
    for (const utterance of utterances) {
      utterance.onstart = () => setNotice("");
      utterance.onend = () => {
        remaining -= 1;
        if (remaining === 0) setSpeakingIndex(null);
      };
      utterance.onerror = () => {
        synth.cancel();
        setSpeakingIndex(null);
        setNotice("Your device could not speak this language. Check its installed speech voices and try again.");
      };
    }
    setSpeakingIndex(index);
    utterances.forEach(utterance => synth.speak(utterance));
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
    <button type="button" className="ai-chat-launcher" aria-label={open ? "Close De VERVE AI chat" : "Open De VERVE AI chat"} aria-expanded={open} aria-controls="deverve-ai-chat-panel" onClick={() => setOpen(value => !value)}>
      <svg className="ai-chat-launcher-icon" viewBox="0 0 24 24" role="img" aria-label="Open customer support chat"><path d="M4.5 5.5A3.5 3.5 0 0 1 8 2h8a3.5 3.5 0 0 1 3.5 3.5v7A3.5 3.5 0 0 1 16 16h-4.2l-4.7 4v-4.2A3.5 3.5 0 0 1 4.5 12.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M8 8h8M8 11.5h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
      <span className="ai-chat-launcher-label" aria-hidden="true">AI HELP</span>
    </button>
    {open && <section id="deverve-ai-chat-panel" className="ai-chat-panel" role="dialog" aria-label="De VERVE AI customer support" aria-modal="false">
      <header className="ai-chat-head">
        <BrandLogo className="ai-chat-brand-logo" />
        <div className="ai-chat-identity"><strong>De VERVE Assistant</strong><small><span className="ai-chat-online-dot"/> Here to help · Usually replies instantly</small></div>
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
          <div className="ai-chat-attach-wrap" ref={attachWrapRef}>
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
        <div className="ai-chat-composer-caption"><span>Enter to send · Shift + Enter for a new line</span><label className="ai-chat-voice-language">Voice <select aria-label="Voice language" value={speechLanguage} onChange={event => setSpeechLanguage(event.target.value)}>{SPEECH_LOCALE_OPTIONS.map(([code,label]) => <option key={code} value={code}>{label}</option>)}{installedSpeechLocales.filter(locale => !SPEECH_LOCALE_OPTIONS.some(([code]) => code === locale)).map(locale => <option key={"installed-" + locale} value={locale}>{locale} · installed</option>)}</select></label><span>Up to 3 files</span></div>
      </form>
      {notice && <p className="ai-chat-note" role="status">{notice}</p>}
      <div className="ai-chat-note">Avoid sending CNIC images, OTPs, passwords or payment-card details in chat. Orders and rentals are completed through secure website forms.</div>
    </section>}
  </>;
}
