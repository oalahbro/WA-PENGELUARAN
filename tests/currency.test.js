jest.mock("axios");
const axios = require("axios");
const { convertToIDR, fetchRates } = require("../src/currency");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("convertToIDR", () => {
  test("Converts USD using fallback rates", async () => {
    axios.get.mockRejectedValue(new Error("Network error"));
    const result = await convertToIDR(5, "USD");
    expect(result).not.toBeNull();
    expect(result.currency).toBe("USD");
    expect(result.amountIDR).toBe(5 * 15500);
    expect(result.rate).toBe(15500);
  });

  test("Converts EUR using fallback rates", async () => {
    axios.get.mockRejectedValue(new Error("Network error"));
    const result = await convertToIDR(10, "EUR");
    expect(result.amountIDR).toBe(10 * 17000);
  });

  test("Returns null for unsupported currency", async () => {
    axios.get.mockRejectedValue(new Error("Network error"));
    const result = await convertToIDR(10, "XYZ");
    expect(result).toBeNull();
  });

  test("Case insensitive currency code", async () => {
    axios.get.mockRejectedValue(new Error("Network error"));
    const result = await convertToIDR(5, "usd");
    expect(result).not.toBeNull();
    expect(result.currency).toBe("USD");
  });

  test("Rounds to integer", async () => {
    axios.get.mockRejectedValue(new Error("Network error"));
    const result = await convertToIDR(1.5, "USD");
    expect(result.amountIDR).toBe(Math.round(1.5 * 15500));
  });
});

describe("fetchRates", () => {
  test("Returns fallback rates on API failure", async () => {
    axios.get.mockRejectedValue(new Error("timeout"));
    const rates = await fetchRates();
    expect(rates.USD).toBe(15500);
    expect(rates.EUR).toBe(17000);
  });
});
