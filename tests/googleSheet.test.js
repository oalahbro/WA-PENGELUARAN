const dayjs = require("dayjs");

// Mock google-spreadsheet and google-auth-library before requiring the module
jest.mock("google-spreadsheet", () => {
  const mockSheet = {
    getRows: jest.fn(),
    addRow: jest.fn(),
  };
  const mockDoc = {
    loadInfo: jest.fn(),
    sheetsByTitle: {
      Transaksi: mockSheet,
      Income: mockSheet,
    },
  };
  return {
    GoogleSpreadsheet: jest.fn(() => mockDoc),
    _mockDoc: mockDoc,
    _mockSheet: mockSheet,
  };
});

jest.mock("google-auth-library", () => ({
  JWT: jest.fn(() => ({})),
}));

// Set env vars before requiring googleSheet
process.env.GOOGLE_SHEET_ID = "test-sheet-id";
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "test@test.com";
process.env.GOOGLE_PRIVATE_KEY = "test-key";

const { _mockDoc, _mockSheet } = require("google-spreadsheet");
const {
  appendTransaksi,
  laporanHariIni,
  hapusTransaksiRow,
  setIncome,
  getTotalPengeluaranBulanIni,
  tambahIncome,
} = require("../googleSheet");

beforeEach(() => {
  jest.clearAllMocks();
  _mockDoc.loadInfo.mockResolvedValue();
});

describe("appendTransaksi", () => {
  test("Calls addRow with correct shape", async () => {
    _mockSheet.addRow.mockResolvedValue({
      _rawData: ["ID", "2024-06-15T00:00:00Z", "user@test", "ngopi", "15000", "latte"],
    });

    const result = await appendTransaksi("user@test", "ngopi", 15000, "latte");

    expect(_mockSheet.addRow).toHaveBeenCalledTimes(1);
    const calledWith = _mockSheet.addRow.mock.calls[0][0];
    expect(calledWith.User).toBe("user@test");
    expect(calledWith.Kategori).toBe("ngopi");
    expect(calledWith.Nominal).toBe(15000);
    expect(calledWith.Deskripsi).toBe("latte");
    expect(calledWith.ID).toBeDefined();
    expect(result.Kategori).toBe("ngopi");
  });
});

describe("laporanHariIni", () => {
  test("Filters by user and date", async () => {
    const mockRows = [
      { User: "user@test", Timestamp: "2024-06-15T08:00:00Z", _rawData: ["", "2024-06-15T08:00:00Z", "user@test"] },
      { User: "user@test", Timestamp: "2024-06-14T08:00:00Z", _rawData: ["", "2024-06-14T08:00:00Z", "user@test"] },
      { User: "other@test", Timestamp: "2024-06-15T08:00:00Z", _rawData: ["", "2024-06-15T08:00:00Z", "other@test"] },
    ];
    _mockSheet.getRows.mockResolvedValue(mockRows);

    const result = await laporanHariIni("user@test", "2024-06-15");

    expect(result).toHaveLength(1);
    expect(result[0].Timestamp).toBe("2024-06-15T08:00:00Z");
  });
});

describe("hapusTransaksiRow", () => {
  test("Finds and deletes row by ID", async () => {
    const deleteFn = jest.fn();
    const mockRows = [
      { ID: "ABC123", _rawData: ["ABC123"], delete: deleteFn },
      { ID: "DEF456", _rawData: ["DEF456"], delete: jest.fn() },
    ];
    _mockSheet.getRows.mockResolvedValue(mockRows);

    const result = await hapusTransaksiRow({ ID: "ABC123" });

    expect(result).toBe(true);
    expect(deleteFn).toHaveBeenCalled();
  });

  test("Returns false if not found", async () => {
    _mockSheet.getRows.mockResolvedValue([]);

    const result = await hapusTransaksiRow({ ID: "NOTFOUND" });

    expect(result).toBe(false);
  });
});

describe("setIncome", () => {
  test("Creates new income row when none exists", async () => {
    _mockSheet.getRows.mockResolvedValue([]);
    _mockSheet.addRow.mockResolvedValue({});
    const sendResponse = jest.fn();

    await setIncome("user@test", 5000000, 1500000, sendResponse);

    expect(_mockSheet.addRow).toHaveBeenCalledTimes(1);
    const calledWith = _mockSheet.addRow.mock.calls[0][0];
    expect(calledWith.User).toBe("user@test");
    expect(calledWith.IncomeBulan).toBe(5000000);
    expect(calledWith.TargetTabungan).toBe(1500000);
    expect(calledWith.MaxHarian).toBeDefined();
    expect(sendResponse).toHaveBeenCalled();
  });

  test("Updates existing income row", async () => {
    const saveFn = jest.fn();
    const assignFn = jest.fn();
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const existingRow = {
      User: "user@test",
      BulanAwal: timestamp,
      _rawData: ["user@test", timestamp, "3000000", "1000000", "66666"],
      _rowNumber: 2,
      assign: assignFn,
      save: saveFn,
    };
    _mockSheet.getRows.mockResolvedValue([existingRow]);
    const sendResponse = jest.fn();

    await setIncome("user@test", 5000000, 1500000, sendResponse);

    expect(_mockSheet.addRow).not.toHaveBeenCalled();
    expect(assignFn).toHaveBeenCalled();
    expect(saveFn).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalled();
  });
});

describe("getTotalPengeluaranBulanIni", () => {
  test("Sums nominal for matching user and month", async () => {
    const targetBulan = dayjs("2024-06-15");
    const mockRows = [
      { User: "user@test", Timestamp: "2024-06-10T08:00:00Z", Nominal: "15000", _rawData: ["", "2024-06-10T08:00:00Z", "user@test", "", "15000"] },
      { User: "user@test", Timestamp: "2024-06-12T08:00:00Z", Nominal: "25000", _rawData: ["", "2024-06-12T08:00:00Z", "user@test", "", "25000"] },
      { User: "user@test", Timestamp: "2024-05-10T08:00:00Z", Nominal: "10000", _rawData: ["", "2024-05-10T08:00:00Z", "user@test", "", "10000"] },
      { User: "other@test", Timestamp: "2024-06-10T08:00:00Z", Nominal: "30000", _rawData: ["", "2024-06-10T08:00:00Z", "other@test", "", "30000"] },
    ];
    _mockSheet.getRows.mockResolvedValue(mockRows);

    const result = await getTotalPengeluaranBulanIni("user@test", targetBulan);

    expect(result).toBe(40000);
  });
});

describe("tambahIncome", () => {
  test("Adds to existing income values", async () => {
    const saveFn = jest.fn();
    const assignFn = jest.fn();
    const bulanIni = dayjs().format("YYYY-MM");
    const existingRow = {
      User: "user@test",
      BulanAwal: bulanIni,
      IncomeBulan: "5000000",
      TargetTabungan: "1500000",
      _rawData: ["user@test", bulanIni, "5000000", "1500000", "116666"],
      _rowNumber: 2,
      assign: assignFn,
      save: saveFn,
    };
    _mockSheet.getRows.mockResolvedValue([existingRow]);
    const sendResponse = jest.fn();

    await tambahIncome("user@test", 50000, sendResponse);

    expect(assignFn).toHaveBeenCalledWith({
      IncomeBulan: 5050000,
      TargetTabungan: 1550000,
    });
    expect(saveFn).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalled();
  });

  test("Throws if no income data exists", async () => {
    _mockSheet.getRows.mockResolvedValue([]);

    await expect(tambahIncome("user@test", 50000)).rejects.toThrow(
      "Data income bulan ini belum di-set."
    );
  });
});
