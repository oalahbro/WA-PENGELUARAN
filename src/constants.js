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
};

const MAX_DAYS_BACK = 360;

module.exports = {
  DATE_FORMATS,
  BULAN_MAP,
  HELP_COMMANDS,
  SHEET_NAMES,
  MAX_DAYS_BACK,
};
