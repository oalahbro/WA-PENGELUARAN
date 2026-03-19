const DATE_FORMATS = [
  "DD-MM-YYYY",
  "DD-MM-YY",
  "DD-MM",
  "DD/MM/YYYY",
  "DD/MM/YY",
  "DD/MM",
  "D/M",
  "D-M",
];

const BULAN_MAP = {
  januari: 0,
  februari: 1,
  maret: 2,
  april: 3,
  mei: 4,
  juni: 5,
  juli: 6,
  agustus: 7,
  september: 8,
  oktober: 9,
  november: 10,
  desember: 11,
};

const HELP_COMMANDS = ["help", "?", "menu", "panduan"];

const SHEET_NAMES = {
  TRANSAKSI: "Transaksi",
  INCOME: "Income",
  BUDGET: "Budget",
  RECURRING: "Recurring",
};

const MAX_DAYS_BACK = 360;

const SUPPORTED_CURRENCIES = {
  USD: { symbol: "$", name: "US Dollar" },
  EUR: { symbol: "\u20AC", name: "Euro" },
  SGD: { symbol: "S$", name: "Singapore Dollar" },
  MYR: { symbol: "RM", name: "Malaysian Ringgit" },
  JPY: { symbol: "\u00A5", name: "Japanese Yen" },
  GBP: { symbol: "\u00A3", name: "British Pound" },
};

const FALLBACK_RATES = {
  USD: 15500,
  EUR: 17000,
  SGD: 11500,
  MYR: 3500,
  JPY: 105,
  GBP: 19500,
};

module.exports = {
  DATE_FORMATS,
  BULAN_MAP,
  HELP_COMMANDS,
  SHEET_NAMES,
  MAX_DAYS_BACK,
  SUPPORTED_CURRENCIES,
  FALLBACK_RATES,
};
