const GOLDEN_QUOTES = [
  { text: "Wear confidence. Every day.", author: "DE VERVE" },
  { text: "Style is how you express your story.", author: "DE VERVE" },
  { text: "Everyday comfort. Effortless confidence.", author: "DE VERVE" },
  { text: "Make every day your own.", author: "DE VERVE" },
  { text: "Good style begins with feeling good.", author: "DE VERVE" },
  { text: "Confidence never goes out of style.", author: "DE VERVE" },
  { text: "Find your fit. Own your moment.", author: "DE VERVE" },
  { text: "Made for movement. Chosen by you.", author: "DE VERVE" },
  { text: "Your everyday deserves better.", author: "DE VERVE" },
  { text: "Simple choices. Strong personal style.", author: "DE VERVE" },
  { text: "Wear what moves you forward.", author: "DE VERVE" },
  { text: "Comfort is always in good taste.", author: "DE VERVE" },
] as const;

export function selectGoldenQuote() {
  const storageKey = "deverve:golden-quote:last:v1";
  let previous = "";
  try { previous = localStorage.getItem(storageKey) || ""; } catch { /* Storage may be unavailable. */ }
  const choices = GOLDEN_QUOTES.filter((quote) => quote.text !== previous);
  const pool = choices.length ? choices : GOLDEN_QUOTES;
  return pool[Math.floor(Math.random() * pool.length)] || GOLDEN_QUOTES[0];
}

export function persistGoldenQuote(quote: { text: string; author: string }) {
  try { localStorage.setItem("deverve:golden-quote:last:v1", quote.text); } catch { /* Quote rotation must never block the storefront. */ }
}
