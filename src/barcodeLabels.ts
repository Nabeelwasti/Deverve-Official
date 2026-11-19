import { BarcodeFormat, QRCodeWriter } from "@zxing/library";

const CODE128_PATTERNS = ["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"] as const;

function code128Values(value: string): number[] {
  if (!value || value.length > 80 || Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) > 126)) throw new Error("Code 128 supports 1–80 printable ASCII characters.");
  const values = Array.from(value, character => character.charCodeAt(0) - 32);
  const checksum = values.reduce((sum, code, index) => sum + code * (index + 1), 104) % 103;
  return [104, ...values, checksum, 106];
}

export function code128Svg(value: string, height = 76): string {
  const sequence = code128Values(value);
  const quiet = 10, module = 2;
  let x = quiet * module;
  const bars: string[] = [];
  for (const code of sequence) {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) throw new Error("Unsupported Code 128 symbol.");
    for (let index = 0; index < pattern.length; index++) {
      const width = Number(pattern[index]) * module;
      if (index % 2 === 0) bars.push('<rect x="' + x + '" y="0" width="' + width + '" height="' + height + '"/>');
      x += width;
    }
  }
  const totalWidth = x + quiet * module;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + totalWidth + ' ' + height + '" width="' + totalWidth + '" height="' + height + '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#111">' + bars.join("") + '</g></svg>';
}

export function qrCodeSvg(value: string, size = 240): string {
  const payload = value.trim();
  if (!payload || payload.length > 2048) throw new Error("QR labels support 1–2048 characters.");
  const matrix = new QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, size, size, new Map());
  const width = matrix.getWidth(), height = matrix.getHeight();
  const modules: string[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (matrix.get(x, y)) modules.push('<rect x="' + x + '" y="' + y + '" width="1" height="1"/>');
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#111">' + modules.join("") + '</g></svg>';
}

export function printInventoryBarcodeLabels(items: Array<{name:string;variant:string;sku:string|null;barcode:string|null}>, format: "code128" | "qr" = "code128"): void {
  const labelled = items.map(item => ({...item, code:(item.barcode||item.sku||"").trim()})).filter(item => item.code);
  if (!labelled.length) throw new Error("No visible variants have a barcode or SKU to print.");
  const labels = labelled.map(item => '<article class="label"><img class="brand" src="/brand/de-verve-logo.svg" alt="De VERVE"><div class="product">' + escapeHtml(item.name) + '</div><div class="variant">' + escapeHtml(item.variant||"Standard") + '</div><div class="bars">' + (format === "qr" ? qrCodeSvg(item.code, 220) : code128Svg(item.code,76)) + '</div><div class="code">' + escapeHtml(item.code) + '</div></article>').join("");
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Allow pop-ups for this site to open the barcode print sheet.");
  popup.opener = null;
  popup.document.open();
  popup.document.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="' + window.location.origin + '/"><title>De VERVE · Barcode labels</title><style>*{box-sizing:border-box}body{margin:0;padding:10mm;font-family:Arial,sans-serif;color:#142b43}.sheet{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6mm}.label{height:48mm;border:1px dashed #aab7c4;border-radius:2mm;padding:3mm;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;text-align:center;break-inside:avoid}.brand{width:24mm;height:8mm;object-fit:contain}.product{font-size:10pt;font-weight:700;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1mm}.variant{font-size:8pt;color:#53677c;margin-top:1mm}.bars{width:100%;display:flex;justify-content:center;margin-top:2mm}.bars svg{max-width:100%;height:15mm}.label .bars svg[viewBox^="0 0 2"]{height:24mm;width:24mm;max-width:24mm}.code{font-family:monospace;font-size:9pt;letter-spacing:.8px;margin-top:1mm}@page{size:A4;margin:10mm}@media print{body{padding:0}.label{border-color:#d6dde5}}@media screen{body{max-width:210mm;margin:20px auto;background:#f4f7fa}.label{background:#fff}}</style></head><body><main class="sheet">' + labels + '</main><script>window.addEventListener("load",()=>setTimeout(()=>window.print(),350))<\/script></body></html>');
  popup.document.close();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]||character));
}
