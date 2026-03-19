const dayjs = require("dayjs");

jest.mock("google-spreadsheet", () => {
  const mockSheets = {};
  const mockDoc = {
    loadInfo: jest.fn(),
    sheetsByTitle: new Proxy(mockSheets, {
      get: (target, prop) => {
        if (!target[prop]) {
          target[prop] = {
            getRows: jest.fn().mockResolvedValue([]),
            addRow: jest.fn().mockResolvedValue({ _rawData: [] }),
          };
        }
        return target[prop];
      },
    }),
    addSheet: jest.fn(({ title, headerValues }) => {
      const newSheet = {
        getRows: jest.fn().mockResolvedValue([]),
        addRow: jest.fn().mockResolvedValue({ _rawData: [] }),
      };
      mockSheets[title] = newSheet;
      return newSheet;
    }),
  };
  return {
    GoogleSpreadsheet: jest.fn(() => mockDoc),
    _mockDoc: mockDoc,
    _mockSheets: mockSheets,
  };
});

jest.mock("google-auth-library", () => ({
  JWT: jest.fn(() => ({})),
}));

process.env.GOOGLE_SHEET_ID = "test-sheet-id";
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "test@test.com";
process.env.GOOGLE_PRIVATE_KEY = "test-key";

const { _mockDoc, _mockSheets } = require("google-spreadsheet");
const {
  appendTransaksi, laporanHariIni, hapusTransaksiRow, editTransaksiRow,
  setIncome, getTotalPengeluaranBulanIni, tambahIncome,
  getMonthlyTransactions, getCategorySpending,
  setBudget, getBudgets, deleteBudget, checkBudgetAlert,
  setRecurring, getRecurringExpenses, deleteRecurring,
} = require("../googleSheet");

beforeEach(() => {
  jest.clearAllMocks();
  _mockDoc.loadInfo.mockResolvedValue();
  // Reset mock sheets
  for (const key of Object.keys(_mockSheets)) {
    delete _mockSheets[key];
  }
});

describe("appendTransaksi", () => {
  test("Calls addRow with correct shape", async () => {
    const sheet = _mockDoc.sheetsByTitle["Transaksi"];
    sheet.addRow.mockResolvedValue({
      _rawData: ["ID", "2024-06-15T00:00:00Z", "user@test", "ngopi", "15000", "latte"],
    });

    const result = await appendTransaksi("user@test", "ngopi", 15000, "latte");
    const calledWith = sheet.addRow.mock.calls[0][0];
    expect(calledWith.User).toBe("user@test");
    expect(calledWith.Kategori).toBe("ngopi");
    expect(calledWith.Nominal).toBe(15000);
    expect(result.Kategori).toBe("ngopi");
  });
});

describe("laporanHariIni", () => {
  test("Filters by user and date", async () => {
    const sheet = _mockDoc.sheetsByTitle["Transaksi"];
    sheet.getRows.mockResolvedValue([
      { User: "user@test", Timestamp: "2024-06-15T08:00:00Z", _rawData: ["", "2024-06-15T08:00:00Z", "user@test"] },
      { User: "user@test", Timestamp: "2024-06-14T08:00:00Z", _rawData: ["", "2024-06-14T08:00:00Z", "user@test"] },
      { User: "other@test", Timestamp: "2024-06-15T08:00:00Z", _rawData: ["", "2024-06-15T08:00:00Z", "other@test"] },
    ]);

    const result = await laporanHariIni("user@test", "2024-06-15");
    expect(result).toHaveLength(1);
  });
});

describe("hapusTransaksiRow", () => {
  test("Finds and deletes row by ID", async () => {
    const deleteFn = jest.fn();
    const sheet = _mockDoc.sheetsByTitle["Transaksi"];
    sheet.getRows.mockResolvedValue([
      { ID: "ABC123", _rawData: ["ABC123"], delete: deleteFn },
    ]);

    expect(await hapusTransaksiRow({ ID: "ABC123" })).toBe(true);
    expect(deleteFn).toHaveBeenCalled();
  });

  test("Returns false if not found", async () => {
    const sheet = _mockDoc.sheetsByTitle["Transaksi"];
    sheet.getRows.mockResolvedValue([]);
    expect(await hapusTransaksiRow({ ID: "NOTFOUND" })).toBe(false);
  });
});

describe("editTransaksiRow", () => {
  test("Edits kategori field", async () => {
    const saveFn = jest.fn();
    const assignFn = jest.fn();
    const sheet = _mockDoc.sheetsByTitle["Transaksi"];
    sheet.getRows.mockResolvedValue([
      { ID: "ABC123", _rawData: ["ABC123"], assign: assignFn, save: saveFn },
    ]);

    const result = await editTransaksiRow({ ID: "ABC123" }, "kategori", "makan");
    expect(result).toBe(true);
    expect(assignFn).toHaveBeenCalledWith({ Kategori: "makan" });
    expect(saveFn).toHaveBeenCalled();
  });

  test("Edits nominal field", async () => {
    const saveFn = jest.fn();
    const assignFn = jest.fn();
    const sheet = _mockDoc.sheetsByTitle["Transaksi"];
    sheet.getRows.mockResolvedValue([
      { ID: "ABC123", _rawData: ["ABC123"], assign: assignFn, save: saveFn },
    ]);

    const result = await editTransaksiRow({ ID: "ABC123" }, "nominal", 25000);
    expect(result).toBe(true);
    expect(assignFn).toHaveBeenCalledWith({ Nominal: 25000 });
  });

  test("Returns false for invalid field", async () => {
    const sheet = _mockDoc.sheetsByTitle["Transaksi"];
    sheet.getRows.mockResolvedValue([
      { ID: "ABC123", _rawData: ["ABC123"], assign: jest.fn(), save: jest.fn() },
    ]);

    expect(await editTransaksiRow({ ID: "ABC123" }, "invalid", "x")).toBe(false);
  });

  test("Returns false if not found", async () => {
    const sheet = _mockDoc.sheetsByTitle["Transaksi"];
    sheet.getRows.mockResolvedValue([]);
    expect(await editTransaksiRow({ ID: "NOTFOUND" }, "kategori", "x")).toBe(false);
  });
});

describe("setIncome", () => {
  test("Creates new row when none exists", async () => {
    const sheet = _mockDoc.sheetsByTitle["Income"];
    sheet.getRows.mockResolvedValue([]);
    sheet.addRow.mockResolvedValue({});
    const sendResponse = jest.fn();

    await setIncome("user@test", 5000000, 1500000, sendResponse);
    expect(sheet.addRow).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalled();
  });

  test("Updates existing row", async () => {
    const saveFn = jest.fn();
    const assignFn = jest.fn();
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const sheet = _mockDoc.sheetsByTitle["Income"];
    sheet.getRows.mockResolvedValue([{
      User: "user@test", BulanAwal: timestamp,
      _rawData: ["user@test", timestamp], assign: assignFn, save: saveFn,
    }]);
    const sendResponse = jest.fn();

    await setIncome("user@test", 5000000, 1500000, sendResponse);
    expect(assignFn).toHaveBeenCalled();
    expect(saveFn).toHaveBeenCalled();
  });
});

describe("getTotalPengeluaranBulanIni", () => {
  test("Sums matching rows", async () => {
    const sheet = _mockDoc.sheetsByTitle["Transaksi"];
    sheet.getRows.mockResolvedValue([
      { User: "user@test", Timestamp: "2024-06-10T08:00:00Z", Nominal: "15000", _rawData: ["", "2024-06-10T08:00:00Z", "user@test", "", "15000"] },
      { User: "user@test", Timestamp: "2024-06-12T08:00:00Z", Nominal: "25000", _rawData: ["", "2024-06-12T08:00:00Z", "user@test", "", "25000"] },
      { User: "user@test", Timestamp: "2024-05-10T08:00:00Z", Nominal: "10000", _rawData: ["", "2024-05-10T08:00:00Z", "user@test", "", "10000"] },
    ]);

    expect(await getTotalPengeluaranBulanIni("user@test", dayjs("2024-06-15"))).toBe(40000);
  });
});

describe("getMonthlyTransactions", () => {
  test("Returns transactions for given month", async () => {
    const sheet = _mockDoc.sheetsByTitle["Transaksi"];
    sheet.getRows.mockResolvedValue([
      { User: "user@test", Timestamp: "2024-06-10T08:00:00Z", _rawData: ["", "2024-06-10T08:00:00Z", "user@test"] },
      { User: "user@test", Timestamp: "2024-05-10T08:00:00Z", _rawData: ["", "2024-05-10T08:00:00Z", "user@test"] },
    ]);

    const result = await getMonthlyTransactions("user@test", dayjs("2024-06-15"));
    expect(result).toHaveLength(1);
  });
});

describe("getCategorySpending", () => {
  test("Groups and sorts by category", async () => {
    const sheet = _mockDoc.sheetsByTitle["Transaksi"];
    sheet.getRows.mockResolvedValue([
      { User: "u", Timestamp: "2024-06-10T00:00:00Z", Kategori: "ngopi", Nominal: "15000", _rawData: ["", "2024-06-10T00:00:00Z", "u", "ngopi", "15000"] },
      { User: "u", Timestamp: "2024-06-11T00:00:00Z", Kategori: "ngopi", Nominal: "10000", _rawData: ["", "2024-06-11T00:00:00Z", "u", "ngopi", "10000"] },
      { User: "u", Timestamp: "2024-06-12T00:00:00Z", Kategori: "makan", Nominal: "50000", _rawData: ["", "2024-06-12T00:00:00Z", "u", "makan", "50000"] },
    ]);

    const result = await getCategorySpending("u", dayjs("2024-06-15"));
    expect(result).toHaveLength(2);
    expect(result[0].kategori).toBe("makan"); // sorted desc
    expect(result[0].total).toBe(50000);
    expect(result[1].kategori).toBe("ngopi");
    expect(result[1].total).toBe(25000);
  });
});

describe("setBudget", () => {
  test("Creates new budget", async () => {
    const sheet = _mockDoc.sheetsByTitle["Budget"];
    sheet.getRows.mockResolvedValue([]);

    await setBudget("user@test", "ngopi", 500000);
    expect(sheet.addRow).toHaveBeenCalledWith({ User: "user@test", Kategori: "ngopi", MaxBulanan: 500000 });
  });

  test("Updates existing budget", async () => {
    const saveFn = jest.fn();
    const assignFn = jest.fn();
    const sheet = _mockDoc.sheetsByTitle["Budget"];
    sheet.getRows.mockResolvedValue([{
      User: "user@test", Kategori: "ngopi",
      _rawData: ["user@test", "ngopi", "300000"],
      assign: assignFn, save: saveFn,
    }]);

    await setBudget("user@test", "ngopi", 500000);
    expect(assignFn).toHaveBeenCalledWith({ MaxBulanan: 500000 });
    expect(saveFn).toHaveBeenCalled();
    expect(sheet.addRow).not.toHaveBeenCalled();
  });
});

describe("deleteBudget", () => {
  test("Deletes existing budget", async () => {
    const deleteFn = jest.fn();
    const sheet = _mockDoc.sheetsByTitle["Budget"];
    sheet.getRows.mockResolvedValue([{
      User: "user@test", Kategori: "ngopi",
      _rawData: ["user@test", "ngopi"], delete: deleteFn,
    }]);

    expect(await deleteBudget("user@test", "ngopi")).toBe(true);
    expect(deleteFn).toHaveBeenCalled();
  });

  test("Returns false if not found", async () => {
    const sheet = _mockDoc.sheetsByTitle["Budget"];
    sheet.getRows.mockResolvedValue([]);
    expect(await deleteBudget("user@test", "ngopi")).toBe(false);
  });
});

describe("setRecurring", () => {
  test("Creates new recurring", async () => {
    const sheet = _mockDoc.sheetsByTitle["Recurring"];
    sheet.getRows.mockResolvedValue([]);

    await setRecurring("user@test", "listrik", 500000, "PLN");
    expect(sheet.addRow).toHaveBeenCalledWith({
      User: "user@test", Kategori: "listrik", Nominal: 500000, Deskripsi: "PLN", Aktif: "true",
    });
  });
});

describe("tambahIncome", () => {
  test("Adds to existing income", async () => {
    const saveFn = jest.fn();
    const assignFn = jest.fn();
    const bulanIni = dayjs().format("YYYY-MM");
    const sheet = _mockDoc.sheetsByTitle["Income"];
    sheet.getRows.mockResolvedValue([{
      User: "user@test", BulanAwal: bulanIni, IncomeBulan: "5000000", TargetTabungan: "1500000",
      _rawData: ["user@test", bulanIni, "5000000", "1500000"],
      assign: assignFn, save: saveFn,
    }]);
    const sendResponse = jest.fn();

    await tambahIncome("user@test", 50000, sendResponse);
    expect(assignFn).toHaveBeenCalledWith({ IncomeBulan: 5050000, TargetTabungan: 1550000 });
    expect(saveFn).toHaveBeenCalled();
  });

  test("Throws if no income data", async () => {
    const sheet = _mockDoc.sheetsByTitle["Income"];
    sheet.getRows.mockResolvedValue([]);
    await expect(tambahIncome("user@test", 50000)).rejects.toThrow("Data income bulan ini belum di-set.");
  });
});
