const axios = require("axios");
const { FALLBACK_RATES, SUPPORTED_CURRENCIES } = require("./constants");

let cachedRates = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours

async function fetchRates() {
  const now = Date.now();
  if (cachedRates && now - cacheTimestamp < CACHE_DURATION) {
    return cachedRates;
  }

  try {
    const res = await axios.get(
      "https://api.exchangerate-data.com/v1/latest?base=IDR",
      { timeout: 5000 }
    );
    if (res.data && res.data.rates) {
      // API returns IDR-based rates (1 IDR = X foreign), we need inverse
      const rates = {};
      for (const code of Object.keys(SUPPORTED_CURRENCIES)) {
        if (res.data.rates[code]) {
          rates[code] = Math.round(1 / res.data.rates[code]);
        }
      }
      if (Object.keys(rates).length > 0) {
        cachedRates = rates;
        cacheTimestamp = now;
        return rates;
      }
    }
  } catch {
    // fall through to fallback
  }

  return FALLBACK_RATES;
}

async function convertToIDR(amount, currencyCode) {
  const rates = await fetchRates();
  const rate = rates[currencyCode.toUpperCase()];
  if (!rate) return null;
  return {
    amountIDR: Math.round(amount * rate),
    rate,
    currency: currencyCode.toUpperCase(),
  };
}

module.exports = { fetchRates, convertToIDR };
