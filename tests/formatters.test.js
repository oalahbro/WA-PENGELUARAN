const {
  formatCurrency,
  formatTransaksiList,
  formatRingkasanMessage,
  formatProgressMessage,
  getHelpMessage,
} = require("../src/formatters");

describe("formatCurrency", () => {
  test("Positive currency", () => {
    expect(formatCurrency(5000)).toBe("Rp5,000");
  });

  test("Negative currency", () => {
    expect(formatCurrency(-5000)).toBe("-Rp5,000");
  });

  test("Zero", () => {
    expect(formatCurrency(0)).toBe("Rp0");
  });

  test("String number", () => {
    expect(formatCurrency("15000")).toBe("Rp15,000");
  });
});

describe("formatTransaksiList", () => {
  test("Empty transaction list", () => {
    expect(formatTransaksiList([])).toBe("Tidak ada transaksi.");
  });

  test("Null input", () => {
    expect(formatTransaksiList(null)).toBe("Tidak ada transaksi.");
  });

  test("Transaction list with named properties", () => {
    const data = [
      { Kategori: "ngopi", Nominal: 15000, Deskripsi: "latte" },
    ];
    const result = formatTransaksiList(data);
    expect(result).toBe("1. ngopi - Rp15000 (latte)");
  });

  test("Transaction list with _rawData", () => {
    const data = [
      { _rawData: [null, null, null, "makan", "25000", "nasi goreng"] },
    ];
    const result = formatTransaksiList(data);
    expect(result).toBe("1. makan - Rp25000 (nasi goreng)");
  });
});

describe("formatRingkasanMessage", () => {
  test("Formats summary with data", () => {
    const data = [
      { Kategori: "ngopi", Nominal: 15000, Deskripsi: "latte" },
    ];
    const result = formatRingkasanMessage("Header", data, 100000);
    expect(result).toContain("Header");
    expect(result).toContain("Rp15,000");
    expect(result).toContain("Total");
    expect(result).toContain("Sisa");
  });

  test("Formats summary with empty data", () => {
    const result = formatRingkasanMessage("Header", [], 100000);
    expect(result).toContain("Tidak ada transaksi.");
  });
});

describe("formatProgressMessage", () => {
  test("Target reached", () => {
    const result = formatProgressMessage("Juni 2024", 5000000, 1500000, 3000000);
    expect(result).toContain("Target tabungan tercapai");
  });

  test("Target not reached", () => {
    const result = formatProgressMessage("Juni 2024", 5000000, 1500000, 4500000);
    expect(result).toContain("belum tercapai");
  });
});

describe("getHelpMessage", () => {
  test("Returns non-empty help text", () => {
    const msg = getHelpMessage();
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).toContain("Panduan");
  });
});
