const { mapTransaksiRow, mapIncomeRow } = require("../src/rowMapper");

describe("mapTransaksiRow", () => {
  test("Maps row with named properties", () => {
    const row = {
      ID: "JUN202406150830",
      Timestamp: "2024-06-15T08:30:00Z",
      User: "user@test",
      Kategori: "ngopi",
      Nominal: 15000,
      Deskripsi: "latte",
      _rawData: ["raw0", "raw1", "raw2", "raw3", "raw4", "raw5"],
    };
    const result = mapTransaksiRow(row);
    expect(result.ID).toBe("JUN202406150830");
    expect(result.Kategori).toBe("ngopi");
    expect(result.Nominal).toBe(15000);
  });

  test("Maps row with only _rawData", () => {
    const row = {
      _rawData: ["ID123", "2024-06-15T08:30:00Z", "user@test", "makan", "25000", "nasi"],
    };
    const result = mapTransaksiRow(row);
    expect(result.ID).toBe("ID123");
    expect(result.Kategori).toBe("makan");
    expect(result.Nominal).toBe("25000");
    expect(result.Deskripsi).toBe("nasi");
  });

  test("Handles missing/undefined fields", () => {
    const row = { _rawData: [] };
    const result = mapTransaksiRow(row);
    expect(result.ID).toBeUndefined();
    expect(result.Kategori).toBeUndefined();
  });
});

describe("mapIncomeRow", () => {
  test("Maps income row with named properties", () => {
    const row = {
      User: "user@test",
      BulanAwal: "2024-06",
      IncomeBulan: 5000000,
      TargetTabungan: 1500000,
      MaxHarian: 116666,
      _rawData: ["raw0", "raw1", "raw2", "raw3", "raw4"],
    };
    const result = mapIncomeRow(row);
    expect(result.User).toBe("user@test");
    expect(result.IncomeBulan).toBe(5000000);
    expect(result.MaxHarian).toBe(116666);
  });

  test("Maps income row with only _rawData", () => {
    const row = {
      _rawData: ["user@test", "2024-06", "5000000", "1500000", "116666"],
    };
    const result = mapIncomeRow(row);
    expect(result.User).toBe("user@test");
    expect(result.IncomeBulan).toBe("5000000");
  });
});
