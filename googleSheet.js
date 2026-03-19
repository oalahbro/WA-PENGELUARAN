const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");
const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");
dayjs.extend(customParseFormat);

const { SHEET_NAMES } = require("./src/constants");
const { mapTransaksiRow } = require("./src/rowMapper");

function generateCustomID(date = new Date()) {
  const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const month = monthNames[date.getMonth()];

  const year = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const HH = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  return `${month}${year}${MM}${dd}${HH}${mm}${ss}`;
}

const serviceAccountAuth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

async function initDoc() {
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
  await doc.loadInfo();
  return doc;
}

async function ensureSheet(doc, sheetName, headerValues) {
  if (doc.sheetsByTitle[sheetName]) return doc.sheetsByTitle[sheetName];
  return await doc.addSheet({ title: sheetName, headerValues });
}

async function appendTransaksi(user, kategori, nominal, deskripsi) {
  try {
    const doc = await initDoc();
    const sheet = doc.sheetsByTitle[SHEET_NAMES.TRANSAKSI];
    const now = new Date();
    const newRow = {
      ID: generateCustomID(now),
      Timestamp: new Date().toISOString(),
      User: user,
      Kategori: kategori,
      Nominal: nominal,
      Deskripsi: deskripsi,
    };
    const row = await sheet.addRow(newRow);
    return mapTransaksiRow(row);
  } catch (error) {
    console.error("Error in appendTransaksi:", error);
    throw error;
  }
}

async function laporanHariIni(user, tanggalInput = null) {
  try {
    const doc = await initDoc();
    const sheet = doc.sheetsByTitle[SHEET_NAMES.TRANSAKSI];
    const rows = await sheet.getRows();

    let targetDate = dayjs();
    if (tanggalInput) {
      targetDate = dayjs(tanggalInput);
    }

    const targetStr = targetDate.format("YYYY-MM-DD");

    return rows.filter((r) => {
      const rowUser = r.User || r._rawData[2];
      const timestamp = r.Timestamp || r._rawData[1];
      const rowDate = timestamp?.split("T")[0];
      return rowUser === user && rowDate === targetStr;
    });
  } catch (error) {
    console.error("Error in laporanHariIni:", error);
    throw error;
  }
}

async function hapusTransaksiRow(transaksi) {
  try {
    const doc = await initDoc();
    const sheet = doc.sheetsByTitle[SHEET_NAMES.TRANSAKSI];
    const rows = await sheet.getRows();

    const idTarget = transaksi.ID || transaksi._rawData?.[0];

    const row = rows.find(
      (r) => (r.ID || r._rawData[0]) === idTarget
    );

    if (row) {
      await row.delete();
      return true;
    }

    return false;
  } catch (error) {
    console.error("Error in hapusTransaksiRow:", error);
    throw error;
  }
}

async function editTransaksiRow(transaksi, field, value) {
  try {
    const doc = await initDoc();
    const sheet = doc.sheetsByTitle[SHEET_NAMES.TRANSAKSI];
    const rows = await sheet.getRows();

    const idTarget = transaksi.ID || transaksi._rawData?.[0];

    const row = rows.find(
      (r) => (r.ID || r._rawData[0]) === idTarget
    );

    if (!row) return false;

    const fieldMap = {
      kategori: "Kategori",
      nominal: "Nominal",
      deskripsi: "Deskripsi",
    };

    const sheetField = fieldMap[field.toLowerCase()];
    if (!sheetField) return false;

    row.assign({ [sheetField]: value });
    await row.save();
    return true;
  } catch (error) {
    console.error("Error in editTransaksiRow:", error);
    throw error;
  }
}

async function setIncome(user, totalIncome, targetTabungan, sendResponse) {
  try {
    const doc = await initDoc();
    const sheet = doc.sheetsByTitle[SHEET_NAMES.INCOME];
    const rows = await sheet.getRows();

    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const maxHarian = Math.floor((totalIncome - targetTabungan) / daysInMonth);

    const existing = rows.find(
      (r) => (r.User || r._rawData[0]) === user && (r.BulanAwal || r._rawData[1]) === timestamp
    );

    if (existing) {
      existing.assign({ IncomeBulan: totalIncome, TargetTabungan: targetTabungan, MaxHarian: maxHarian });
      await existing.save();

      if (sendResponse) {
        await sendResponse(
          `\u2705 Income bulan ${timestamp} diperbarui.\n\uD83D\uDCB0 Income: Rp${totalIncome}\n\uD83C\uDFAF Target tabungan: Rp${targetTabungan}\n\uD83D\uDCB8 Max pengeluaran harian: Rp${maxHarian}`
        );
      }
    } else {
      await sheet.addRow({
        User: user,
        BulanAwal: timestamp,
        IncomeBulan: totalIncome,
        TargetTabungan: targetTabungan,
        MaxHarian: maxHarian,
      });

      if (sendResponse) {
        await sendResponse(
          `\u2705 Income bulan ${timestamp} disimpan.\n\uD83D\uDCB0 Income: Rp${totalIncome}\n\uD83C\uDFAF Target tabungan: Rp${targetTabungan}\n\uD83D\uDCB8 Max pengeluaran harian: Rp${maxHarian}`
        );
      }
    }
  } catch (error) {
    console.error("Error in setIncome:", error);
    throw error;
  }
}

async function getTotalPengeluaranBulanIni(user, targetBulan) {
  try {
    const doc = await initDoc();
    const sheet = doc.sheetsByTitle[SHEET_NAMES.TRANSAKSI];
    const rows = await sheet.getRows();

    const now = targetBulan;

    const filtered = rows.filter((r) => {
      const rowUser = r.User || r._rawData[2];
      const timestamp = r.Timestamp || r._rawData[1];

      if (rowUser !== user || !timestamp) return false;

      const tgl = dayjs(timestamp);
      return tgl.isValid() && tgl.month() === now.month() && tgl.year() === now.year();
    });

    const total = filtered.reduce(
      (acc, r) => acc + parseFloat(r.Nominal || r._rawData[4] || 0),
      0
    );

    return total;
  } catch (error) {
    console.error("Error in getTotalPengeluaranBulanIni:", error);
    throw error;
  }
}

async function getMonthlyTransactions(user, targetBulan) {
  try {
    const doc = await initDoc();
    const sheet = doc.sheetsByTitle[SHEET_NAMES.TRANSAKSI];
    const rows = await sheet.getRows();

    return rows.filter((r) => {
      const rowUser = r.User || r._rawData[2];
      const timestamp = r.Timestamp || r._rawData[1];

      if (rowUser !== user || !timestamp) return false;

      const tgl = dayjs(timestamp);
      return tgl.isValid() && tgl.month() === targetBulan.month() && tgl.year() === targetBulan.year();
    });
  } catch (error) {
    console.error("Error in getMonthlyTransactions:", error);
    throw error;
  }
}

async function getCategorySpending(user, targetBulan) {
  try {
    const transactions = await getMonthlyTransactions(user, targetBulan);

    const categoryMap = {};
    for (const r of transactions) {
      const kategori = (r.Kategori || r._rawData?.[3] || "-").toLowerCase();
      const nominal = parseFloat(r.Nominal || r._rawData?.[4] || 0);
      categoryMap[kategori] = (categoryMap[kategori] || 0) + nominal;
    }

    const sorted = Object.entries(categoryMap)
      .map(([kategori, total]) => ({ kategori, total }))
      .sort((a, b) => b.total - a.total);

    return sorted;
  } catch (error) {
    console.error("Error in getCategorySpending:", error);
    throw error;
  }
}

async function getIncomeData(user, targetDate = dayjs()) {
  try {
    const doc = await initDoc();
    const sheet = doc.sheetsByTitle[SHEET_NAMES.INCOME];
    const rows = await sheet.getRows();

    const bulanAwal = targetDate.startOf("month").format("YYYY-MM");

    const foundRow = rows.find((r) => {
      const rowUser = r.User || r._rawData[0];
      const rowBulan = r.BulanAwal || r._rawData[1];
      return rowUser === user && rowBulan === bulanAwal;
    });

    if (!foundRow) return null;

    const headers = foundRow._worksheet._headerValues;

    const dataObj = {};
    headers.forEach((header, index) => {
      dataObj[header] = foundRow._rawData[index];
    });

    return dataObj;
  } catch (error) {
    console.error("Error in getIncomeData:", error);
    throw error;
  }
}

async function tambahIncome(user, jumlah, sendResponse) {
  try {
    const doc = await initDoc();
    const sheet = doc.sheetsByTitle[SHEET_NAMES.INCOME];
    const rows = await sheet.getRows();
    const bulanIni = dayjs().format("YYYY-MM");

    const row = rows.find(r => (r.User || r._rawData[0]) === user && (r.BulanAwal || r._rawData[1]) === bulanIni);

    if (!row) {
      throw new Error("Data income bulan ini belum di-set.");
    }

    const incomeLama = parseInt(row.IncomeBulan || row._rawData[2]) || 0;
    const targetLama = parseInt(row.TargetTabungan || row._rawData[3]) || 0;

    const incomeBaru = incomeLama + jumlah;
    const targetBaru = targetLama + jumlah;

    row.assign({ IncomeBulan: incomeBaru, TargetTabungan: targetBaru });
    await row.save();
    const bulan = dayjs().format("MMMM YYYY");

    if (sendResponse) {
      await sendResponse(
        `\u2705 Income bulan ${bulan} diperbarui.\n\uD83D\uDCB0 Income: Rp${incomeBaru.toLocaleString()}\n\uD83C\uDFAF Target tabungan: Rp${targetBaru.toLocaleString()}`
      );
    }
  } catch (error) {
    console.error("Error in tambahIncome:", error);
    throw error;
  }
}

// Budget functions
async function setBudget(user, kategori, maxBulanan) {
  try {
    const doc = await initDoc();
    const sheet = await ensureSheet(doc, SHEET_NAMES.BUDGET, ["User", "Kategori", "MaxBulanan"]);
    const rows = await sheet.getRows();

    const existing = rows.find(
      (r) => (r.User || r._rawData[0]) === user && (r.Kategori || r._rawData[1])?.toLowerCase() === kategori.toLowerCase()
    );

    if (existing) {
      existing.assign({ MaxBulanan: maxBulanan });
      await existing.save();
    } else {
      await sheet.addRow({ User: user, Kategori: kategori, MaxBulanan: maxBulanan });
    }
  } catch (error) {
    console.error("Error in setBudget:", error);
    throw error;
  }
}

async function getBudgets(user) {
  try {
    const doc = await initDoc();
    const sheet = await ensureSheet(doc, SHEET_NAMES.BUDGET, ["User", "Kategori", "MaxBulanan"]);
    const rows = await sheet.getRows();
    return rows.filter((r) => (r.User || r._rawData[0]) === user);
  } catch (error) {
    console.error("Error in getBudgets:", error);
    throw error;
  }
}

async function deleteBudget(user, kategori) {
  try {
    const doc = await initDoc();
    const sheet = await ensureSheet(doc, SHEET_NAMES.BUDGET, ["User", "Kategori", "MaxBulanan"]);
    const rows = await sheet.getRows();

    const row = rows.find(
      (r) => (r.User || r._rawData[0]) === user && (r.Kategori || r._rawData[1])?.toLowerCase() === kategori.toLowerCase()
    );

    if (row) {
      await row.delete();
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error in deleteBudget:", error);
    throw error;
  }
}

async function checkBudgetAlert(user, kategori, nominalBaru) {
  try {
    const budgets = await getBudgets(user);
    const budget = budgets.find(
      (b) => (b.Kategori || b._rawData?.[1])?.toLowerCase() === kategori.toLowerCase()
    );
    if (!budget) return null;

    const maxBulanan = parseFloat(budget.MaxBulanan || budget._rawData?.[2] || 0);
    const categoryData = await getCategorySpending(user, dayjs());
    const currentSpent = categoryData.find((c) => c.kategori === kategori.toLowerCase())?.total || 0;
    const afterSpent = currentSpent + nominalBaru;

    if (afterSpent > maxBulanan) {
      return { exceeded: true, spent: afterSpent, limit: maxBulanan, kategori };
    }
    if (afterSpent >= maxBulanan * 0.8) {
      return { warning: true, spent: afterSpent, limit: maxBulanan, kategori };
    }
    return null;
  } catch (error) {
    console.error("Error in checkBudgetAlert:", error);
    return null;
  }
}

// Recurring functions
async function setRecurring(user, kategori, nominal, deskripsi) {
  try {
    const doc = await initDoc();
    const sheet = await ensureSheet(doc, SHEET_NAMES.RECURRING, ["User", "Kategori", "Nominal", "Deskripsi", "Aktif"]);
    const rows = await sheet.getRows();

    const existing = rows.find(
      (r) => (r.User || r._rawData[0]) === user && (r.Kategori || r._rawData[1])?.toLowerCase() === kategori.toLowerCase()
    );

    if (existing) {
      existing.assign({ Nominal: nominal, Deskripsi: deskripsi, Aktif: "true" });
      await existing.save();
    } else {
      await sheet.addRow({ User: user, Kategori: kategori, Nominal: nominal, Deskripsi: deskripsi, Aktif: "true" });
    }
  } catch (error) {
    console.error("Error in setRecurring:", error);
    throw error;
  }
}

async function getRecurringExpenses(user) {
  try {
    const doc = await initDoc();
    const sheet = await ensureSheet(doc, SHEET_NAMES.RECURRING, ["User", "Kategori", "Nominal", "Deskripsi", "Aktif"]);
    const rows = await sheet.getRows();
    return rows.filter((r) => (r.User || r._rawData[0]) === user);
  } catch (error) {
    console.error("Error in getRecurringExpenses:", error);
    throw error;
  }
}

async function deleteRecurring(user, index) {
  try {
    const items = await getRecurringExpenses(user);
    if (index < 0 || index >= items.length) return false;
    await items[index].delete();
    return true;
  } catch (error) {
    console.error("Error in deleteRecurring:", error);
    throw error;
  }
}

async function processRecurringExpenses() {
  try {
    const doc = await initDoc();
    const sheet = await ensureSheet(doc, SHEET_NAMES.RECURRING, ["User", "Kategori", "Nominal", "Deskripsi", "Aktif"]);
    const rows = await sheet.getRows();

    const today = dayjs().date();
    // Only process on the 1st of each month
    if (today !== 1) return [];

    const processed = [];
    for (const row of rows) {
      const aktif = (row.Aktif || row._rawData?.[4] || "true");
      if (aktif !== "true") continue;

      const user = row.User || row._rawData[0];
      const kategori = row.Kategori || row._rawData[1];
      const nominal = parseFloat(row.Nominal || row._rawData[2] || 0);
      const deskripsi = (row.Deskripsi || row._rawData[3] || "recurring");

      await appendTransaksi(user, kategori, nominal, `[Recurring] ${deskripsi}`);
      processed.push({ user, kategori, nominal, deskripsi });
    }

    return processed;
  } catch (error) {
    console.error("Error in processRecurringExpenses:", error);
    throw error;
  }
}

// Weekly report data
async function getWeeklyData(user) {
  try {
    const doc = await initDoc();
    const sheet = doc.sheetsByTitle[SHEET_NAMES.TRANSAKSI];
    const rows = await sheet.getRows();

    const today = dayjs();
    const weekStart = today.subtract(6, "day");

    const dailyMap = {};
    for (let i = 0; i <= 6; i++) {
      const d = weekStart.add(i, "day").format("YYYY-MM-DD");
      dailyMap[d] = { tanggal: weekStart.add(i, "day").format("DD/MM"), total: 0, count: 0 };
    }

    for (const r of rows) {
      const rowUser = r.User || r._rawData[2];
      const timestamp = r.Timestamp || r._rawData[1];
      if (rowUser !== user || !timestamp) continue;

      const rowDate = timestamp.split("T")[0];
      if (dailyMap[rowDate]) {
        dailyMap[rowDate].total += parseFloat(r.Nominal || r._rawData[4] || 0);
        dailyMap[rowDate].count++;
      }
    }

    return Object.values(dailyMap).filter((d) => d.count > 0);
  } catch (error) {
    console.error("Error in getWeeklyData:", error);
    throw error;
  }
}

module.exports = {
  initDoc,
  appendTransaksi,
  getTotalPengeluaranBulanIni,
  getMonthlyTransactions,
  getCategorySpending,
  laporanHariIni,
  hapusTransaksiRow,
  editTransaksiRow,
  setIncome,
  getIncomeData,
  tambahIncome,
  setBudget,
  getBudgets,
  deleteBudget,
  checkBudgetAlert,
  setRecurring,
  getRecurringExpenses,
  deleteRecurring,
  processRecurringExpenses,
  getWeeklyData,
};
