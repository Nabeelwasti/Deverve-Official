type OfficeCell = string | number | boolean | null | undefined;
type OfficeRow = OfficeCell[];

const xmlEntities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
const xmlEscape = (value: string): string => value.replace(/[&<>"']/g, character => xmlEntities[character] ?? character);

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files: Array<{ path: string; content: string }>): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  let centralSize = 0;
  const date = 0x0021;
  for (const file of files) {
    const name = utf8(file.path);
    const data = utf8(file.content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.length;
    centralSize += central.length;
  }
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, localOffset, true);
  ev.setUint16(20, 0, true);
  const output = new Uint8Array(localOffset + centralSize + end.length);
  let offset = 0;
  for (const part of localParts) { output.set(part, offset); offset += part.length; }
  for (const part of centralParts) { output.set(part, offset); offset += part.length; }
  output.set(end, offset);
  return output;
}

function downloadOfficeFile(filename: string, mime: string, bytes: Uint8Array): void {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function columnName(index: number): string {
  let number = index + 1;
  let result = "";
  while (number > 0) {
    const remainder = (number - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    number = Math.floor((number - 1) / 26);
  }
  return result;
}

export function exportOfficeSpreadsheet(filename: string, sheetName: string, rows: OfficeRow[]): void {
  const safeSheet = sheetName.replace(/[\[\]:*?\/\\]/g, " ").trim().slice(0, 31) || "Report";
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = columnName(columnIndex) + (rowIndex + 1);
      if (typeof value === "number" && Number.isFinite(value)) return "<c r=\"" + reference + "\"><v>" + value + "</v></c>";
      if (typeof value === "boolean") return "<c r=\"" + reference + "\" t=\"b\"><v>" + (value ? 1 : 0) + "</v></c>";
      return "<c r=\"" + reference + "\" t=\"inlineStr\"><is><t xml:space=\"preserve\">" + xmlEscape(String(value ?? "")) + "</t></is></c>";
    }).join("");
    return "<row r=\"" + (rowIndex + 1) + "\">" + cells + "</row>";
  }).join("");
  const files = [
    { path: "[Content_Types].xml", content: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>" },
    { path: "_rels/.rels", content: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>" },
    { path: "xl/workbook.xml", content: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"" + xmlEscape(safeSheet) + "\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>" },
    { path: "xl/_rels/workbook.xml.rels", content: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>" },
    { path: "xl/worksheets/sheet1.xml", content: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>" + sheetRows + "</sheetData></worksheet>" },
  ];
  downloadOfficeFile(filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", zipStore(files));
}

export function exportOfficeDocument(filename: string, title: string, subtitle: string, rows: OfficeRow[]): void {
  const columnCount = Math.max(1, ...rows.map(row => row.length));
  const grid = Array.from({ length: columnCount }, () => "<w:gridCol w:w=\"2400\"/>").join("");
  const tableRows = rows.map((row, rowIndex) => {
    const cells = Array.from({ length: columnCount }, (_, columnIndex) => {
      const text = xmlEscape(String(row[columnIndex] ?? ""));
      const bold = rowIndex === 0 ? "<w:rPr><w:b/></w:rPr>" : "";
      return "<w:tc><w:tcPr><w:tcW w:w=\"2400\" w:type=\"dxa\"/></w:tcPr><w:p><w:r>" + bold + "<w:t xml:space=\"preserve\">" + text + "</w:t></w:r></w:p></w:tc>";
    }).join("");
    return "<w:tr>" + cells + "</w:tr>";
  }).join("");
  const documentXml = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:pPr><w:pStyle w:val=\"Title\"/></w:pPr><w:r><w:t>" + xmlEscape(title) + "</w:t></w:r></w:p><w:p><w:r><w:t>" + xmlEscape(subtitle) + "</w:t></w:r></w:p><w:tbl><w:tblPr><w:tblStyle w:val=\"TableGrid\"/><w:tblW w:w=\"0\" w:type=\"auto\"/></w:tblPr><w:tblGrid>" + grid + "</w:tblGrid>" + tableRows + "</w:tbl><w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"900\" w:right=\"900\" w:bottom=\"900\" w:left=\"900\" w:header=\"450\" w:footer=\"450\" w:gutter=\"0\"/></w:sectPr></w:body></w:document>";
  const files = [
    { path: "[Content_Types].xml", content: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>" },
    { path: "_rels/.rels", content: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>" },
    { path: "word/document.xml", content: documentXml },
  ];
  downloadOfficeFile(filename, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", zipStore(files));
}
