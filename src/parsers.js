const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");
dayjs.extend(customParseFormat);

const { DATE_FORMATS, BULAN_MAP, SUPPORTED_CURRENCIES } = require("./constants");

function parseDateInput(input, today = dayjs()) {
  const parsed = dayjs(input, DATE_FORMATS, true);
  if (!parsed.isValid()) return null;

  if (/^(\d{1,2})[-/](\d{1,2})$/.test(input)) {
    return parsed.year(today.year());
  }
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

function parseAddExpenseLinesWithCurrency(text) {
  const lines = text.trim().split("\n").filter((line) => line.startsWith("+"));
  const results = [];

  for (const line of lines) {
    const cleanLine = line.substring(1).trim();

    // Try currency format: +kategori $5 deskripsi OR +kategori 5 USD deskripsi
    const symbolMatch = cleanLine.match(/(.+?)\s+(\$|S\$|RM|€|¥|£)(\d+(?:\.\d+)?)(?:\s+(.*))?$/);
    if (symbolMatch) {
      const symbol = symbolMatch[2];
      const currency = Object.entries(SUPPORTED_CURRENCIES).find(([, v]) => v.symbol === symbol);
      if (currency) {
        results.push({
          kategori: symbolMatch[1].trim(),
          nominal: parseFloat(symbolMatch[3]),
          deskripsi: (symbolMatch[4] || "-").trim(),
          currency: currency[0],
        });
        continue;
      }
    }

    const codeMatch = cleanLine.match(/(.+?)\s+(\d+(?:\.\d+)?)\s+(USD|EUR|SGD|MYR|JPY|GBP)(?:\s+(.*))?$/i);
    if (codeMatch) {
      results.push({
        kategori: codeMatch[1].trim(),
        nominal: parseFloat(codeMatch[2]),
        deskripsi: (codeMatch[4] || "-").trim(),
        currency: codeMatch[3].toUpperCase(),
      });
      continue;
    }

    // Standard IDR format
    const match = cleanLine.match(/(.+?)\s+(\d+(?:\.\d+)?)(?:\s+(.*))?$/);
    if (!match) {
      results.push({ error: `Format tidak valid: ${line}` });
      continue;
    }

    results.push({
      kategori: match[1].trim(),
      nominal: parseFloat(match[2]),
      deskripsi: (match[3] || "-").trim(),
      currency: null,
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

function parseSetBudgetCommand(text) {
  const regex = /^set budget\s+(.+?)\s+(\d+)$/i;
  const match = text.match(regex);
  if (!match) return null;
  return {
    kategori: match[1].trim().toLowerCase(),
    maxBulanan: parseInt(match[2]),
  };
}

function parseSetRecurringCommand(text) {
  const regex = /^set recurring\s+(.+?)\s+(\d+(?:\.\d+)?)(?:\s+(.+))?$/i;
  const match = text.match(regex);
  if (!match) return null;
  return {
    kategori: match[1].trim(),
    nominal: parseFloat(match[2]),
    deskripsi: (match[3] || "-").trim(),
  };
}

function parseExportCommand(text, today = dayjs()) {
  const parts = text.toLowerCase().trim().split(" ");
  // "export" or "export ringkasan" -> current month
  if (parts.length <= 2) {
    return today.startOf("month");
  }
  // "export ringkasan juli" or "export juli"
  const namaBulan = parts.length === 3 ? parts[2] : parts[1];
  if (BULAN_MAP[namaBulan] !== undefined) {
    return dayjs().month(BULAN_MAP[namaBulan]).year(today.year()).startOf("month");
  }
  return today.startOf("month");
}

module.exports = {
  parseDateInput,
  parseAddExpenseLines,
  parseAddExpenseLinesWithCurrency,
  parseSetIncomeCommand,
  parseProgressMonth,
  extractDateFromQuotedText,
  parseSetBudgetCommand,
  parseSetRecurringCommand,
  parseExportCommand,
};
