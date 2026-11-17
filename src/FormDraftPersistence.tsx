import { useEffect } from "react";

type DraftEntry = { field: string; kind: string; value: string | boolean | string[] };
type DraftPayload = { savedAt: number; entries: DraftEntry[] };

const STORAGE_PREFIX = "deverve:form-draft:v1:";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SENSITIVE = /password|token|secret|cnic|identity|authorization|otp|verification/i;

function excluded(element: Element): boolean {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) return true;
  const inputType = element instanceof HTMLInputElement ? element.type.toLowerCase() : "";
  const identity = [element.name, element.id, element.getAttribute("autocomplete"), element.getAttribute("aria-label")].join(" ");
  return ["password", "file", "hidden", "submit", "button", "reset", "image"].includes(inputType)
    || SENSITIVE.test(identity)
    || element.hasAttribute("data-no-draft");
}

function formKey(form: HTMLFormElement): string {
  const heading = form.querySelector("legend, h1, h2, h3")?.textContent?.trim() || "";
  const identity = form.dataset.draftKey || [form.id, form.className, form.getAttribute("aria-label"), heading].filter(Boolean).join("|");
  return STORAGE_PREFIX + window.location.pathname + ":" + identity;
}

function controls(form: HTMLFormElement): Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> {
  return Array.from(form.elements).filter((element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
    element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement);
}

function fieldKey(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, index: number): string {
  return field.name || field.id || field.getAttribute("aria-label") || `field:${index}:${field.type || field.tagName.toLowerCase()}`;
}

function restore(form: HTMLFormElement, key: string): void {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    const draft = JSON.parse(raw) as DraftPayload;
    if (!draft || !Number.isFinite(draft.savedAt) || Date.now() - draft.savedAt > MAX_AGE_MS || !Array.isArray(draft.entries)) {
      sessionStorage.removeItem(key);
      return;
    }
    const fields = controls(form);
    for (const entry of draft.entries) {
      const field = fields.find((candidate, index) => fieldKey(candidate, index) === entry.field);
      if (!field || excluded(field)) continue;
      if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
        setter?.call(field, entry.value === true);
      } else if (field instanceof HTMLSelectElement && field.multiple && Array.isArray(entry.value)) {
        for (const option of Array.from(field.options)) option.selected = entry.value.includes(option.value);
      } else if (typeof entry.value === "string") {
        const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
          : field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
        setter?.call(field, entry.value);
      }
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
    form.dataset.draftRestored = "true";
  } catch {
    try { sessionStorage.removeItem(key); } catch { /* storage may be unavailable */ }
  }
}

function save(form: HTMLFormElement, key: string): void {
  try {
    const entries: DraftEntry[] = [];
    controls(form).forEach((field, index) => {
      if (excluded(field)) return;
      if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
        entries.push({ field: fieldKey(field, index), kind: field.type, value: field.checked });
      } else if (field instanceof HTMLSelectElement && field.multiple) {
        entries.push({ field: fieldKey(field, index), kind: "select-multiple", value: Array.from(field.selectedOptions, option => option.value) });
      } else {
        entries.push({ field: fieldKey(field, index), kind: field.tagName.toLowerCase(), value: field.value });
      }
    });
    const payload: DraftPayload = { savedAt: Date.now(), entries };
    const serialized = JSON.stringify(payload);
    if (serialized.length <= 256_000) sessionStorage.setItem(key, serialized);
  } catch {
    // Private browsing or storage quota restrictions must never interrupt form use.
  }
}

export default function FormDraftPersistence() {
  useEffect(() => {
    const restored = new WeakSet<HTMLFormElement>();
    const scan = () => {
      const forms = Array.from(document.forms);
      forms.forEach((form) => {
        if (restored.has(form)) return;
        const key = formKey(form);
        restore(form, key);
        restored.add(form);
      });
    };
    const onEdit = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const form = target.closest("form");
      if (form instanceof HTMLFormElement) {
        save(form, formKey(form));
      }
    };
    const onReset = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      try { sessionStorage.removeItem(formKey(form)); } catch { /* ignore storage errors */ }
    };
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    document.addEventListener("reset", onReset, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
      document.removeEventListener("reset", onReset, true);
    };
  }, []);
  return null;
}
