const { validateEnv, validateNominal, validateDaysBack } = require("../src/validators");

describe("validateEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("Missing env var throws", () => {
    delete process.env.GOOGLE_SHEET_ID;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_PRIVATE_KEY;
    expect(() => validateEnv()).toThrow("Missing required environment variables");
  });

  test("All env present does not throw", () => {
    process.env.GOOGLE_SHEET_ID = "test-id";
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "test@test.com";
    process.env.GOOGLE_PRIVATE_KEY = "test-key";
    expect(() => validateEnv()).not.toThrow();
  });

  test("Partial missing throws with specific names", () => {
    process.env.GOOGLE_SHEET_ID = "test-id";
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    process.env.GOOGLE_PRIVATE_KEY = "test-key";
    expect(() => validateEnv()).toThrow("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  });
});

describe("validateNominal", () => {
  test("Negative nominal", () => {
    const result = validateNominal(-100);
    expect(result.valid).toBe(false);
  });

  test("NaN nominal", () => {
    const result = validateNominal(NaN);
    expect(result.valid).toBe(false);
  });

  test("Zero nominal", () => {
    const result = validateNominal(0);
    expect(result.valid).toBe(false);
  });

  test("Normal nominal", () => {
    const result = validateNominal(15000);
    expect(result.valid).toBe(true);
    expect(result.value).toBe(15000);
  });

  test("Over limit", () => {
    const result = validateNominal(999999999999);
    expect(result.valid).toBe(false);
  });

  test("String number", () => {
    const result = validateNominal("15000");
    expect(result.valid).toBe(true);
    expect(result.value).toBe(15000);
  });
});

describe("validateDaysBack", () => {
  test("Valid days", () => {
    const result = validateDaysBack(5);
    expect(result.valid).toBe(true);
    expect(result.value).toBe(5);
  });

  test("NaN days", () => {
    const result = validateDaysBack("abc");
    expect(result.valid).toBe(false);
  });

  test("Negative days", () => {
    const result = validateDaysBack(-1);
    expect(result.valid).toBe(false);
  });

  test("Over max days", () => {
    const result = validateDaysBack(500);
    expect(result.valid).toBe(false);
  });

  test("Boundary 360", () => {
    const result = validateDaysBack(360);
    expect(result.valid).toBe(true);
  });
});
