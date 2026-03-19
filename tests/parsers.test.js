const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");
dayjs.extend(customParseFormat);

const {
  parseDateInput,
  parseAddExpenseLines,
  parseSetIncomeCommand,
  parseProgressMonth,
  extractDateFromQuotedText,
} = require("../src/parsers");

describe("parseDateInput", () => {
  const today = dayjs("2024-06-15");

  test("Valid DD-MM-YYYY", () => {
    const result = parseDateInput("05-06-2024", today);
    expect(result).not.toBeNull();
    expect(result.format("YYYY-MM-DD")).toBe("2024-06-05");
  });

  test("Valid DD/MM (current year)", () => {
    const result = parseDateInput("05/06", today);
    expect(result).not.toBeNull();
    expect(result.format("YYYY-MM-DD")).toBe("2024-06-05");
  });

  test("Valid DD-MM (current year)", () => {
    const result = parseDateInput("05-06", today);
    expect(result).not.toBeNull();
    expect(result.year()).toBe(2024);
  });

  test("Invalid date", () => {
    const result = parseDateInput("abc", today);
    expect(result).toBeNull();
  });

  test("Valid DD/MM/YYYY", () => {
    const result = parseDateInput("05/06/2024", today);
    expect(result).not.toBeNull();
    expect(result.format("YYYY-MM-DD")).toBe("2024-06-05");
  });

  test("Valid D/M short format", () => {
    const result = parseDateInput("5/6", today);
    expect(result).not.toBeNull();
    expect(result.month()).toBe(5); // June = 5
  });
});

describe("parseAddExpenseLines", () => {
  test("Valid expense line", () => {
    const results = parseAddExpenseLines("+ngopi 15000 kopi susu");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      kategori: "ngopi",
      nominal: 15000,
      deskripsi: "kopi susu",
    });
  });

  test("Multi-line expense", () => {
    const results = parseAddExpenseLines("+ngopi 15000 kopi susu\n+makan 25000 nasi goreng");
    expect(results).toHaveLength(2);
    expect(results[0].kategori).toBe("ngopi");
    expect(results[1].kategori).toBe("makan");
  });

  test("Missing nominal", () => {
    const results = parseAddExpenseLines("+ngopi");
    expect(results).toHaveLength(1);
    expect(results[0].error).toBeDefined();
  });

  test("Expense without description", () => {
    const results = parseAddExpenseLines("+ngopi 15000");
    expect(results).toHaveLength(1);
    expect(results[0].kategori).toBe("ngopi");
    expect(results[0].nominal).toBe(15000);
    expect(results[0].deskripsi).toBe("-");
  });
});

describe("parseSetIncomeCommand", () => {
  test("Valid set income", () => {
    const result = parseSetIncomeCommand("set income 5000000 tabungan 1500000");
    expect(result).toEqual({
      totalIncome: 5000000,
      targetTabungan: 1500000,
    });
  });

  test("Invalid set income", () => {
    const result = parseSetIncomeCommand("set income abc");
    expect(result).toBeNull();
  });

  test("Case insensitive", () => {
    const result = parseSetIncomeCommand("Set Income 5000000 Tabungan 1500000");
    expect(result).toEqual({
      totalIncome: 5000000,
      targetTabungan: 1500000,
    });
  });
});

describe("parseProgressMonth", () => {
  const today = dayjs("2024-06-15");

  test('Month "juli"', () => {
    const result = parseProgressMonth("progress tabungan juli", today);
    expect(result.month()).toBe(6); // July = 6
  });

  test("No month (defaults to current)", () => {
    const result = parseProgressMonth("progress tabungan", today);
    expect(result.month()).toBe(today.month());
  });

  test('Month "januari"', () => {
    const result = parseProgressMonth("progress tabungan januari", today);
    expect(result.month()).toBe(0);
  });
});

describe("extractDateFromQuotedText", () => {
  test("Extract date from quote", () => {
    const result = extractDateFromQuotedText(
      "Daftar Pengeluaran Tanggal 27-06-2025:"
    );
    expect(result).toBe("2025-06-27");
  });

  test("No date in quote", () => {
    const result = extractDateFromQuotedText("Daftar Pengeluaran Hari Ini:");
    expect(result).toBeNull();
  });
});
