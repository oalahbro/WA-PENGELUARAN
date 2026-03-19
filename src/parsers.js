const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");
dayjs.extend(customParseFormat);

const { DATE_FORMATS, BULAN_MAP } = require("./constants");

function parseDateInput(input, today = dayjs()) {
  const parsed = dayjs(input, DATE_FORMATS, true);
  if (!parsed.isValid()) return null;

  // If only DD-MM or DD/MM (no year), set current year
  if (/^(\d{1,2})[-/](\d{1,2})$/.test(input)) {
    return parsed.year(today.year());
  }
  // dayjs defaults missing year to 2001 for 2-digit-less formats
  if (parsed.year() === 2001) {
    return parsed.year(today.year());
  }
  return parsed;
}

function parseAddExpenseLines(text) {
  const lines = text.trim().split("\n").filter((line) => line.startsWith("+"));
  const results = [];

  for (const line of lines) {
    const cleanLine = line.substring(1).trim();
    const match = cleanLine.match(/(.+?)\s+(\d+(?:\.\d+)?)(?:\s+(.*))?$/);

    if (!match) {
      results.push({ error: `Format tidak valid: ${line}` });
      continue;
    }

    results.push({
      kategori: match[1].trim(),
      nominal: parseFloat(match[2]),
      deskripsi: (match[3] || "-").trim(),
    });
  }

  return results;
}

function parseSetIncomeCommand(text) {
  const regex = /^set income (\d+)\s+tabungan\s+(\d+)/i;
  const match = text.match(regex);
  if (!match) return null;
  return {
    totalIncome: parseInt(match[1]),
    targetTabungan: parseInt(match[2]),
  };
}

function parseProgressMonth(text, today = dayjs()) {
  const parts = text.toLowerCase().split(" ");
  if (parts.length >= 3) {
    const namaBulan = parts[2];
    if (BULAN_MAP[namaBulan] !== undefined) {
      return dayjs().month(BULAN_MAP[namaBulan]).year(today.year()).startOf("month");
    }
  }
  return today.startOf("month");
}

function extractDateFromQuotedText(quotedText) {
  const match = quotedText.match(/Tanggal (\d{2}[-/]\d{2}(?:[-/]\d{2,4})?)/);
  if (!match) return null;
  const parsed = dayjs(match[1], DATE_FORMATS, true);
  if (!parsed.isValid()) return null;
  return parsed.format("YYYY-MM-DD");
}

module.exports = {
  parseDateInput,
  parseAddExpenseLines,
  parseSetIncomeCommand,
  parseProgressMonth,
  extractDateFromQuotedText,
};
