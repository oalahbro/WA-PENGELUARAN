const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");
dayjs.extend(customParseFormat);

const {
  parseDateInput,
  parseAddExpenseLines,
  parseAddExpenseLinesWithCurrency,
  parseSetIncomeCommand,
  parseProgressMonth,
  extractDateFromQuotedText,
  parseSetBudgetCommand,
  parseSetRecurringCommand,
  parseExportCommand,
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
    expect(parseDateInput("abc", today)).toBeNull();
  });

  test("Valid DD/MM/YYYY", () => {
    const result = parseDateInput("05/06/2024", today);
    expect(result.format("YYYY-MM-DD")).toBe("2024-06-05");
  });

  test("Valid D/M short format", () => {
    const result = parseDateInput("5/6", today);
    expect(result.month()).toBe(5);
  });
});

describe("parseAddExpenseLines", () => {
  test("Valid expense line", () => {
    const results = parseAddExpenseLines("+ngopi 15000 kopi susu");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ kategori: "ngopi", nominal: 15000, deskripsi: "kopi susu" });
  });

  test("Multi-line expense", () => {
    const results = parseAddExpenseLines("+ngopi 15000 kopi susu\n+makan 25000 nasi goreng");
    expect(results).toHaveLength(2);
  });

  test("Missing nominal", () => {
    const results = parseAddExpenseLines("+ngopi");
    expect(results[0].error).toBeDefined();
  });

  test("Expense without description", () => {
    const results = parseAddExpenseLines("+ngopi 15000");
    expect(results[0].deskripsi).toBe("-");
  });
});

describe("parseAddExpenseLinesWithCurrency", () => {
  test("Standard IDR expense", () => {
    const results = parseAddExpenseLinesWithCurrency("+ngopi 15000 kopi susu");
    expect(results[0].currency).toBeNull();
    expect(results[0].nominal).toBe(15000);
  });

  test("USD with $ symbol", () => {
    const results = parseAddExpenseLinesWithCurrency("+ngopi $5 coffee");
    expect(results[0].currency).toBe("USD");
    expect(results[0].nominal).toBe(5);
    expect(results[0].deskripsi).toBe("coffee");
  });

  test("SGD with code", () => {
    const results = parseAddExpenseLinesWithCurrency("+makan 10 SGD nasi lemak");
    expect(results[0].currency).toBe("SGD");
    expect(results[0].nominal).toBe(10);
  });

  test("EUR with code case insensitive", () => {
    const results = parseAddExpenseLinesWithCurrency("+belanja 20 eur souvenirs");
    expect(results[0].currency).toBe("EUR");
    expect(results[0].nominal).toBe(20);
  });

  test("Invalid format", () => {
    const results = parseAddExpenseLinesWithCurrency("+ngopi");
    expect(results[0].error).toBeDefined();
  });

  test("S$ symbol for SGD", () => {
    const results = parseAddExpenseLinesWithCurrency("+makan S$15 chicken rice");
    expect(results[0].currency).toBe("SGD");
    expect(results[0].nominal).toBe(15);
  });
});

describe("parseSetIncomeCommand", () => {
  test("Valid set income", () => {
    expect(parseSetIncomeCommand("set income 5000000 tabungan 1500000")).toEqual({
      totalIncome: 5000000, targetTabungan: 1500000,
    });
  });

  test("Invalid set income", () => {
    expect(parseSetIncomeCommand("set income abc")).toBeNull();
  });

  test("Case insensitive", () => {
    expect(parseSetIncomeCommand("Set Income 5000000 Tabungan 1500000")).not.toBeNull();
  });
});

describe("parseProgressMonth", () => {
  const today = dayjs("2024-06-15");

  test('Month "juli"', () => {
    expect(parseProgressMonth("progress tabungan juli", today).month()).toBe(6);
  });

  test("No month (defaults to current)", () => {
    expect(parseProgressMonth("progress tabungan", today).month()).toBe(today.month());
  });
});

describe("extractDateFromQuotedText", () => {
  test("Extract date from quote", () => {
    expect(extractDateFromQuotedText("Daftar Pengeluaran Tanggal 27-06-2025:")).toBe("2025-06-27");
  });

  test("No date in quote", () => {
    expect(extractDateFromQuotedText("Daftar Pengeluaran Hari Ini:")).toBeNull();
  });
});

describe("parseSetBudgetCommand", () => {
  test("Valid set budget", () => {
    const result = parseSetBudgetCommand("set budget ngopi 500000");
    expect(result).toEqual({ kategori: "ngopi", maxBulanan: 500000 });
  });

  test("Multi-word category", () => {
    const result = parseSetBudgetCommand("set budget makan siang 1000000");
    expect(result).toEqual({ kategori: "makan siang", maxBulanan: 1000000 });
  });

  test("Invalid format", () => {
    expect(parseSetBudgetCommand("set budget")).toBeNull();
  });

  test("No amount", () => {
    expect(parseSetBudgetCommand("set budget ngopi")).toBeNull();
  });
});

describe("parseSetRecurringCommand", () => {
  test("Valid recurring with description", () => {
    const result = parseSetRecurringCommand("set recurring listrik 500000 token PLN");
    expect(result).toEqual({ kategori: "listrik", nominal: 500000, deskripsi: "token PLN" });
  });

  test("Valid recurring without description", () => {
    const result = parseSetRecurringCommand("set recurring spotify 59000");
    expect(result).toEqual({ kategori: "spotify", nominal: 59000, deskripsi: "-" });
  });

  test("Invalid format", () => {
    expect(parseSetRecurringCommand("set recurring")).toBeNull();
  });
});

describe("parseExportCommand", () => {
  const today = dayjs("2024-06-15");

  test("export with no args", () => {
    const result = parseExportCommand("export", today);
    expect(result.month()).toBe(5); // June
  });

  test("export ringkasan", () => {
    const result = parseExportCommand("export ringkasan", today);
    expect(result.month()).toBe(5);
  });

  test("export ringkasan juli", () => {
    const result = parseExportCommand("export ringkasan juli", today);
    expect(result.month()).toBe(6);
  });

  test("export with invalid month defaults to current", () => {
    const result = parseExportCommand("export xyz", today);
    expect(result.month()).toBe(5);
  });
});
