import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "worker/index.ts");
const source = readFileSync(sourcePath, "utf8");

function countSqlPlaceholders(sql) {
  let count = 0;
  let quote = null;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (quote) {
      if (char === quote) {
        if (quote === "'" && sql[i + 1] === "'") {
          i += 1;
          continue;
        }
        quote = null;
      } else if (char === "\\") {
        i += 1;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "[") {
      while (i + 1 < sql.length && sql[i + 1] !== "]") i += 1;
      i += 1;
      continue;
    }
    if (char === "?") count += 1;
  }
  return count;
}

function readBindArguments(text, openParen) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let commas = 0;
  let hasValue = false;
  for (let i = openParen; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      hasValue = true;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      hasValue = true;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      hasValue = true;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      if (char === ")" && depth === 0) return { count: hasValue ? commas + 1 : 0, end: i };
      depth -= 1;
      hasValue = true;
      continue;
    }
    if (char === "," && depth === 0) {
      commas += 1;
      continue;
    }
    if (!/\\s/.test(char)) hasValue = true;
  }
  return null;
}

const mismatches = [];
const prepare = /\\.prepare\("((?:\\\\.|[^"\\\\])*)"\)/g;
let match;
while ((match = prepare.exec(source))) {
  let cursor = prepare.lastIndex;
  while (/\\s/.test(source[cursor] || "")) cursor += 1;
  if (!source.startsWith(".bind(", cursor)) continue;
  const openParen = cursor + ".bind(".length;
  const parsed = readBindArguments(source, openParen);
  if (!parsed) continue;
  const sql = match[1].replace(/\\\\(["\\\\])/g, "$1");
  const placeholders = countSqlPlaceholders(sql);
  if (placeholders !== parsed.count) {
    const line = source.slice(0, match.index).split("\\n").length;
    mismatches.push({ line, placeholders, arguments: parsed.count, sql: sql.slice(0, 220) });
  }
  prepare.lastIndex = parsed.end + 1;
}

if (mismatches.length) {
  for (const mismatch of mismatches) {
    console.error(`SQL bind mismatch at worker/index.ts:${mismatch.line}: ${mismatch.placeholders} placeholders, ${mismatch.arguments} arguments\\n${mismatch.sql}`);
  }
  process.exitCode = 1;
} else {
  console.log("SQL binding audit passed: every literal prepared statement has a matching bind argument count.");
}
