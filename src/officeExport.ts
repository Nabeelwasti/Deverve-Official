type OfficeCell = string | number | boolean | null | undefined;
type OfficeRow = OfficeCell[];

const xmlEntities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
const xmlEscape = (value: string): string => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/[&<>"\']/g, character => xmlEntities[character] ?? character);

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

function officeHeaderIndex(rows: OfficeRow[]): number {
  const labels = new Set(["description","product","item","date","receipt","order","sku","category","expense","reference","vehicle","service","name"]);
  const index = rows.findIndex(row => labels.has(String(row[0] ?? "").trim().toLowerCase()));
  return index >= 0 ? index : 0;
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
  if (!rows.length) return;
  const safeSheet = Array.from(sheetName, character => "[]:*?/\\\\".includes(character) ? " " : character).join("").trim().slice(0, 31) || "Report";
  const columnCount = Math.max(1, ...rows.map(row => row.length));
  const headerIndex = officeHeaderIndex(rows);
  const lastColumn = columnName(columnCount - 1);
  const lastRow = rows.length;
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = Array.from({ length: columnCount }, (_, columnIndex) => {
      const value = row[columnIndex];
      const reference = columnName(columnIndex) + (rowIndex + 1);
      const style = rowIndex === headerIndex ? ' s="1"' : "";
      if (typeof value === "number" && Number.isFinite(value)) return "<c r=\"" + reference + "\"" + style + "><v>" + value + "</v></c>";
      if (typeof value === "boolean") return "<c r=\"" + reference + "\" t=\"b\"" + style + "><v>" + (value ? 1 : 0) + "</v></c>";
      return "<c r=\"" + reference + "\" t=\"inlineStr\"" + style + "><is><t xml:space=\"preserve\">" + xmlEscape(String(value ?? "")) + "</t></is></c>";
    }).join("");
    const height = rowIndex === headerIndex ? ' ht="30" customHeight="1"' : "";
    return "<row r=\"" + (rowIndex + 1) + "\"" + height + ">" + cells + "</row>";
  }).join("");
  const widths = Array.from({ length: columnCount }, (_, column) => {
    const longest = Math.max(10, ...rows.slice(0, 250).map(row => String(row[column] ?? "").length));
    return Math.max(12, Math.min(38, longest + 3));
  });
  const columns = widths.map((width, index) => "<col min=\"" + (index + 1) + "\" max=\"" + (index + 1) + "\" width=\"" + width + "\" customWidth=\"1\"/>").join("");
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><color rgb="FF263B50"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF163A5F"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD7E0E8"/></left><right style="thin"><color rgb="FFD7E0E8"/></right><top style="thin"><color rgb="FFD7E0E8"/></top><bottom style="thin"><color rgb="FFD7E0E8"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:' + lastColumn + lastRow + '"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="' + (headerIndex + 1) + '" topLeftCell="A' + (headerIndex + 2) + '" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A' + (headerIndex + 2) + '" sqref="A' + (headerIndex + 2) + '"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols>' + columns + '</cols><sheetData>' + sheetRows + '</sheetData><autoFilter ref="A' + (headerIndex + 1) + ':' + lastColumn + lastRow + '"/><pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
  const files = [
    { path: "[Content_Types].xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { path: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { path: "xl/workbook.xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + xmlEscape(safeSheet) + '" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { path: "xl/_rels/workbook.xml.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { path: "xl/worksheets/sheet1.xml", content: sheet },
    { path: "xl/styles.xml", content: styles },
  ];
  downloadOfficeFile(filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", zipStore(files));
}

export function exportOfficeDocument(filename: string, title: string, subtitle: string, rows: OfficeRow[]): void {
  const columnCount = Math.max(1, ...rows.map(row => row.length));
  const headerIndex = officeHeaderIndex(rows);
  const cellWidth = Math.floor(9360 / columnCount);
  const grid = Array.from({ length: columnCount }, () => '<w:gridCol w:w="' + cellWidth + '"/>').join("");
  const tableRows = rows.map((row, rowIndex) => {
    const cells = Array.from({ length: columnCount }, (_, columnIndex) => {
      const text = xmlEscape(String(row[columnIndex] ?? ""));
      const header = rowIndex === headerIndex;
      const fill = header ? "163A5F" : rowIndex % 2 === 0 ? "F1F5F9" : "FFFFFF";
      const runStyle = header ? '<w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr>' : '<w:rPr><w:color w:val="263B50"/></w:rPr>';
      return '<w:tc><w:tcPr><w:tcW w:w="' + cellWidth + '" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="' + fill + '"/><w:tcMar><w:top w:w="90" w:type="dxa"/><w:start w:w="110" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:end w:w="110" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:spacing w:after="40"/></w:pPr><w:r>' + runStyle + '<w:t xml:space="preserve">' + text + '</w:t></w:r></w:p></w:tc>';
    }).join("");
    const header = rowIndex === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : "";
    return "<w:tr>" + header + cells + "</w:tr>";
  }).join("");
  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:pPr><w:pStyle w:val="BrandLine"/></w:pPr><w:r><w:t>DE VERVE  ·  JHELUM, PAKISTAN</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>' + xmlEscape(title) + '</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Subtitle"/></w:pPr><w:r><w:t>' + xmlEscape(subtitle) + '</w:t></w:r></w:p><w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="9360" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D7E0E8"/><w:left w:val="single" w:sz="4" w:color="D7E0E8"/><w:bottom w:val="single" w:sz="4" w:color="D7E0E8"/><w:right w:val="single" w:sz="4" w:color="D7E0E8"/><w:insideH w:val="single" w:sz="4" w:color="D7E0E8"/><w:insideV w:val="single" w:sz="4" w:color="D7E0E8"/></w:tblBorders></w:tblPr><w:tblGrid>' + grid + '</w:tblGrid>' + tableRows + '</w:tbl><w:p><w:pPr><w:spacing w:before="240" w:after="80"/></w:pPr><w:r><w:rPr><w:color w:val="60758A"/><w:sz w:val="18"/></w:rPr><w:t>De VERVE  ·  +92 319 7553705  ·  deverve-official.pages.dev</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900" w:header="450" w:footer="450" w:gutter="0"/><w:footerReference w:type="default" r:id="rId2"/></w:sectPr></w:body></w:document>';
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="20"/><w:color w:val="263B50"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="120" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="34"/><w:color w:val="102A43"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="20"/><w:color w:val="60758A"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="BrandLine"><w:name w:val="Brand line"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="163A5F"/></w:rPr></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style></w:styles>';
  const footer = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="60758A"/><w:sz w:val="16"/></w:rPr><w:t>De VERVE · Business document · Page </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>';
  const files = [
    { path: "[Content_Types].xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>' },
    { path: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { path: "word/document.xml", content: documentXml },
    { path: "word/styles.xml", content: styles },
    { path: "word/footer1.xml", content: footer },
    { path: "word/_rels/document.xml.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>' },
  ];
  downloadOfficeFile(filename, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", zipStore(files));
}

export function exportOfficeImage(filename: string, title: string, subtitle: string, rows: OfficeRow[], format: "jpeg" | "png" = "jpeg"): void {
  if (!rows.length) return;
  const canvas = document.createElement("canvas");
  const width = 1800;
  const padding = 88;
  const tableWidth = width - padding * 2;
  const columnCount = Math.max(1, ...rows.map(row => row.length));
  const headerIndex = officeHeaderIndex(rows);
  const rowHeight = 58;
  const headerHeight = 68;
  const headerBand = 250;
  const footerHeight = 110;
  const height = headerBand + headerHeight + Math.max(0, rows.length - 1) * rowHeight + footerHeight + padding;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not prepare the document image.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#102a43";
  context.fillRect(0, 0, width, 18);
  context.fillStyle = "#102a43";
  context.font = "700 42px Arial, sans-serif";
  context.fillText("DE VERVE", padding, 86);
  context.fillStyle = "#60758a";
  context.font = "18px Arial, sans-serif";
  context.fillText("JHELUM · PAKISTAN", padding, 122);
  context.fillStyle = "#102a43";
  context.font = "700 34px Arial, sans-serif";
  context.fillText(title, padding, 190, tableWidth);
  context.fillStyle = "#60758a";
  context.font = "18px Arial, sans-serif";
  context.fillText(subtitle, padding, 224, tableWidth);
  const widths = Array.from({ length: columnCount }, (_, column) => {
    const longest = Math.max(8, ...rows.slice(0, 100).map(row => String(row[column] ?? "").length));
    return Math.max(tableWidth / columnCount * 0.65, Math.min(tableWidth / columnCount * 1.5, longest * 11));
  });
  const widthTotal = widths.reduce((sum, value) => sum + value, 0);
  const normalized = widths.map(value => value / widthTotal * tableWidth);
  const fit = (value: string, maxWidth: number): string => {
    let result = value;
    while (result.length > 1 && context.measureText(result).width > maxWidth - 28) result = result.slice(0, -2) + "…";
    return result;
  };
  let y = headerBand;
  rows.forEach((row, rowIndex) => {
    const rowH = rowIndex === headerIndex ? headerHeight : rowHeight;
    context.fillStyle = rowIndex === headerIndex ? "#163a5f" : rowIndex % 2 === 0 ? "#f1f5f9" : "#ffffff";
    context.fillRect(padding, y, tableWidth, rowH);
    context.strokeStyle = "#d7e0e8";
    context.lineWidth = 1;
    context.strokeRect(padding, y, tableWidth, rowH);
    let x = padding;
    for (let column = 0; column < columnCount; column++) {
      const cellWidth = normalized[column];
      context.fillStyle = rowIndex === headerIndex ? "#ffffff" : "#263b50";
      context.font = rowIndex === headerIndex ? "700 18px Arial, sans-serif" : "16px Arial, sans-serif";
      const value = String(row[column] ?? "");
      context.save();
      context.beginPath();
      context.rect(x + 12, y + 6, Math.max(0, cellWidth - 24), rowH - 12);
      context.clip();
      context.fillText(fit(value, cellWidth), x + 14, y + (rowH + 6) / 2);
      context.restore();
      if (column > 0) {
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, y + rowH);
        context.stroke();
      }
      x += cellWidth;
    }
    y += rowH;
  });
  context.fillStyle = "#60758a";
  context.font = "16px Arial, sans-serif";
  context.fillText("De VERVE · +92 319 7553705 · deverve-official.pages.dev", padding, y + 54);
  context.textAlign = "right";
  context.fillText("Generated " + new Date().toLocaleString("en-PK"), width - padding, y + 54);
  context.textAlign = "left";
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }, format === "png" ? "image/png" : "image/jpeg", 0.94);
}
