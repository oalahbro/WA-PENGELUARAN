const MAX_NOMINAL = 1_000_000_000;

function validateEnv() {
  const required = [
    "GOOGLE_SHEET_ID",
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
      `See .env.example for reference.`
    );
  }
}

function validateNominal(value) {
  const num = parseFloat(value);
  if (isNaN(num)) {
    return { valid: false, value: num, error: "Nominal bukan angka yang valid." };
  }
  if (num <= 0) {
    return { valid: false, value: num, error: "Nominal harus lebih dari 0." };
  }
  if (num > MAX_NOMINAL) {
    return { valid: false, value: num, error: `Nominal melebihi batas maksimum (${MAX_NOMINAL.toLocaleString()}).` };
  }
  return { valid: true, value: num, error: null };
}

function validateDaysBack(value) {
  const num = parseInt(value);
  if (isNaN(num)) {
    return { valid: false, value: num, error: "Jumlah hari bukan angka yang valid." };
  }
  if (num < 0 || num > 360) {
    return { valid: false, value: num, error: "Rentang hari harus antara 0 sampai 360." };
  }
  return { valid: true, value: num, error: null };
}

module.exports = { validateEnv, validateNominal, validateDaysBack };
