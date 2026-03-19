const {
  formatCurrency,
  formatTransaksiList,
  formatRingkasanMessage,
  formatProgressMessage,
  formatCategoryBreakdown,
  formatExportReport,
  formatBudgetStatus,
  formatRecurringList,
  formatWeeklyReport,
  formatEditableTransaksiList,
  getHelpMessage,
} = require("../src/formatters");

describe("formatCurrency", () => {
  test("Positive currency", () => expect(formatCurrency(5000)).toBe("Rp5,000"));
  test("Negative currency", () => expect(formatCurrency(-5000)).toBe("-Rp5,000"));
  test("Zero", () => expect(formatCurrency(0)).toBe("Rp0"));
  test("String number", () => expect(formatCurrency("15000")).toBe("Rp15,000"));
});

describe("formatTransaksiList", () => {
  test("Empty", () => expect(formatTransaksiList([])).toBe("Tidak ada transaksi."));
  test("Null", () => expect(formatTransaksiList(null)).toBe("Tidak ada transaksi."));
  test("With data", () => {
    const result = formatTransaksiList([{ Kategori: "ngopi", Nominal: 15000, Deskripsi: "latte" }]);
    expect(result).toBe("1. ngopi - Rp15000 (latte)");
  });
});

describe("formatRingkasanMessage", () => {
  test("With data", () => {
    const result = formatRingkasanMessage("Header", [{ Kategori: "ngopi", Nominal: 15000, Deskripsi: "latte" }], 100000);
    expect(result).toContain("Header");
    expect(result).toContain("Total");
  });

  test("Empty data", () => {
    const result = formatRingkasanMessage("Header", [], 100000);
    expect(result).toContain("Tidak ada transaksi.");
  });
});

describe("formatProgressMessage", () => {
  test("Target reached", () => {
    expect(formatProgressMessage("Juni 2024", 5000000, 1500000, 3000000)).toContain("tercapai");
  });
  test("Target not reached", () => {
    expect(formatProgressMessage("Juni 2024", 5000000, 1500000, 4500000)).toContain("belum tercapai");
  });
});

describe("formatCategoryBreakdown", () => {
  test("Empty data", () => {
    expect(formatCategoryBreakdown([], 0)).toBe("Tidak ada data pengeluaran.");
  });

  test("Single category", () => {
    const result = formatCategoryBreakdown([{ kategori: "ngopi", total: 50000 }], 50000);
    expect(result).toContain("ngopi");
    expect(result).toContain("100.0%");
    expect(result).toContain("Rp50,000");
  });

  test("Multiple categories", () => {
    const data = [
      { kategori: "ngopi", total: 30000 },
      { kategori: "makan", total: 70000 },
    ];
    const result = formatCategoryBreakdown(data, 100000);
    expect(result).toContain("ngopi");
    expect(result).toContain("makan");
    expect(result).toContain("30.0%");
    expect(result).toContain("70.0%");
  });
});

describe("formatExportReport", () => {
  test("With income and transactions", () => {
    const incomeData = { IncomeBulan: "5000000", TargetTabungan: "1500000" };
    const categoryData = [{ kategori: "ngopi", total: 50000 }];
    const transactions = [{ Timestamp: "2024-06-15T08:00:00Z", Kategori: "ngopi", Nominal: 50000, Deskripsi: "latte" }];
    const result = formatExportReport("Juni 2024", incomeData, categoryData, 50000, transactions);
    expect(result).toContain("LAPORAN BULANAN");
    expect(result).toContain("Juni 2024");
    expect(result).toContain("ngopi");
  });

  test("Without income data", () => {
    const result = formatExportReport("Juni 2024", null, [], 0, []);
    expect(result).toContain("LAPORAN BULANAN");
    expect(result).toContain("Tidak ada pengeluaran");
  });
});

describe("formatBudgetStatus", () => {
  test("No budgets", () => {
    expect(formatBudgetStatus([], {})).toBe("Belum ada budget yang di-set.");
  });

  test("With budgets", () => {
    const budgets = [{ Kategori: "ngopi", MaxBulanan: "500000" }];
    const spending = { ngopi: 200000 };
    const result = formatBudgetStatus(budgets, spending);
    expect(result).toContain("ngopi");
    expect(result).toContain("Rp200,000");
    expect(result).toContain("Rp500,000");
  });

  test("Over budget shows red", () => {
    const budgets = [{ Kategori: "ngopi", MaxBulanan: "100000" }];
    const spending = { ngopi: 150000 };
    const result = formatBudgetStatus(budgets, spending);
    expect(result).toContain("\uD83D\uDD34"); // red circle
  });
});

describe("formatRecurringList", () => {
  test("Empty", () => {
    expect(formatRecurringList([])).toBe("Belum ada pengeluaran rutin.");
  });

  test("With items", () => {
    const items = [{ Kategori: "listrik", Nominal: 500000, Deskripsi: "PLN", Aktif: "true" }];
    const result = formatRecurringList(items);
    expect(result).toContain("listrik");
    expect(result).toContain("Rp500,000");
  });
});

describe("formatWeeklyReport", () => {
  test("With data", () => {
    const weekData = [{ tanggal: "01/06", total: 50000, count: 3 }];
    const result = formatWeeklyReport("Juni 2024", weekData, 50000, 200000, []);
    expect(result).toContain("Laporan Mingguan");
    expect(result).toContain("01/06");
    expect(result).toContain("Rp50,000");
  });

  test("With budget alerts", () => {
    const result = formatWeeklyReport("Juni 2024", [], 0, 0, [
      { kategori: "ngopi", pct: 90, spent: 450000, limit: 500000 },
    ]);
    expect(result).toContain("Peringatan Budget");
    expect(result).toContain("ngopi");
  });

  test("Empty week", () => {
    const result = formatWeeklyReport("Juni 2024", [], 0, 0, []);
    expect(result).toContain("Tidak ada pengeluaran minggu ini");
  });
});

describe("formatEditableTransaksiList", () => {
  test("Empty", () => {
    expect(formatEditableTransaksiList([])).toBe("Tidak ada transaksi.");
  });

  test("With data uses pipe separator", () => {
    const data = [{ Kategori: "ngopi", Nominal: 15000, Deskripsi: "latte" }];
    const result = formatEditableTransaksiList(data);
    expect(result).toContain("|");
    expect(result).toContain("ngopi");
  });
});

describe("getHelpMessage", () => {
  test("Contains all feature sections", () => {
    const msg = getHelpMessage();
    expect(msg).toContain("Panduan");
    expect(msg).toContain("Edit Pengeluaran");
    expect(msg).toContain("Budget");
    expect(msg).toContain("Recurring");
    expect(msg).toContain("Breakdown");
    expect(msg).toContain("Export");
    expect(msg).toContain("Multi-currency");
  });
});
