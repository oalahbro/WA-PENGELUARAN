const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");
const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");
dayjs.extend(customParseFormat);

function mapRow(row) {
  return {
    ID: row._rawData[0],
    Timestamp: row._rawData[1],
    User: row._rawData[2],
    Kategori: row._rawData[3],
    Nominal: row._rawData[4],
    Deskripsi: row._rawData[5],
  };
}

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
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

async function initDoc() {
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
  await doc.loadInfo();
  return doc;
}

async function appendTransaksi(user, kategori, nominal, deskripsi) {
  const doc = await initDoc();
  const sheet = doc.sheetsByTitle["Transaksi"];
  const now = new Date();
  const newRow= {
    ID: generateCustomID(now), // ← ID unik untuk tiap transaksi
    Timestamp: new Date().toISOString(),
    User: user,
    Kategori: kategori,
    Nominal: nominal,
    Deskripsi: deskripsi,
  };
  const row = await sheet.addRow(newRow);
  return mapRow(row);
}

async function getTarget(user) {
  const doc = await initDoc();
  const sheet = doc.sheetsByTitle["Target"];
  const rows = await sheet.getRows();
  return rows.find((r) => r.User === user);
}

async function laporanHariIni(user, tanggalInput = null) {
  const doc = await initDoc();
  const sheet = doc.sheetsByTitle["Transaksi"];
  const rows = await sheet.getRows();

  let targetDate = dayjs();
  if (tanggalInput) {
    targetDate = dayjs(tanggalInput);
  }

  const targetStr = targetDate.format("YYYY-MM-DD");

  return rows.filter((r) => {
    const rowUser = r.User || r._rawData[2];
    const timestamp = r.Timestamp || r._rawData[1];

    // Ambil hanya bagian tanggal dari timestamp (tanpa jam)
    const rowDate = timestamp?.split("T")[0];

    return rowUser === user && rowDate === targetStr;
  });
}

async function hapusTransaksiRow(transaksi) {
  const doc = await initDoc();
  const sheet = doc.sheetsByTitle["Transaksi"];
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
}

//session income
async function setIncome(user, totalIncome, targetTabungan, sendResponse) {
  const doc = await initDoc();
  const sheet = doc.sheetsByTitle["Income"];
  const rows = await sheet.getRows();

  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const maxHarian = Math.floor((totalIncome - targetTabungan) / daysInMonth);

  const existing = rows.find(
    (r) => (r.User || r._rawData[0]) === user && (r.BulanAwal || r._rawData[1]) === timestamp
  );
  
  

  if (existing) {
    const rowUp = existing._rowNumber - 2 ;
    rows[rowUp].assign({ IncomeBulan: totalIncome, TargetTabungan: targetTabungan, MaxHarian: maxHarian })
    await rows[rowUp].save();
    console.log("👉 Data terbaru:", existing?._rawData);

    if (sendResponse) {
      await sendResponse(
        `✅ Income bulan ${timestamp} diperbarui.\n💰 Income: Rp${totalIncome}\n🎯 Target tabungan: Rp${targetTabungan}\n💸 Max pengeluaran harian: Rp${maxHarian}`
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
        `✅ Income bulan ${timestamp} disimpan.\n💰 Income: Rp${totalIncome}\n🎯 Target tabungan: Rp${targetTabungan}\n💸 Max pengeluaran harian: Rp${maxHarian}`
      );
    }
  }
}

async function getTotalPengeluaranBulanIni(user, targetBulan) {
  const doc = await initDoc();
  const sheet = doc.sheetsByTitle["Transaksi"];
  const rows = await sheet.getRows();

  const now = targetBulan; // Bulan & tahun saat ini

  const filtered = rows.filter((r) => {
    const rowUser = r.User || r._rawData[2];       // kolom User
    const timestamp = r.Timestamp || r._rawData[1]; // kolom Timestamp

    if (rowUser !== user || !timestamp) return false;

    const tgl = dayjs(timestamp);
    return tgl.isValid() && tgl.month() === now.month() && tgl.year() === now.year();
  });

  const total = filtered.reduce(
    (acc, r) => acc + parseFloat(r.Nominal || r._rawData[4] || 0),
    0
  );

  return total;
}

async function getIncomeData(user, targetDate = dayjs()) {
  const doc = await initDoc();
  const sheet = doc.sheetsByTitle["Income"];
  const rows = await sheet.getRows();

  const bulanAwal = targetDate.startOf("month").format("YYYY-MM"); // contoh: 2025-07

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
}

async function tambahIncome(user, jumlah, sendResponse) {
  const doc = await initDoc();
  const sheet = doc.sheetsByTitle["Income"];
  const rows = await sheet.getRows();
  const bulanIni = dayjs().format("YYYY-MM");

  const row = rows.find(r => (r.User || r._rawData[0]) === user && (r.BulanAwal || r._rawData[1]) === bulanIni);
  // const existing = rows.find(
  //   (r) => (r.User || r._rawData[0]) === user && (r.BulanAwal || r._rawData[1]) === timestamp
  // );

  if (!row) {
    throw new Error("Data income bulan ini belum di-set.");
  }
  
  const incomeLama = parseInt(row.IncomeBulan || row._rawData[2]) || 0;
  const targetLama = parseInt(row.TargetTabungan || row._rawData[3]) || 0;

  const incomeBaru = incomeLama + jumlah;
  const targetBaru = targetLama + jumlah;

  const rowUp = row._rowNumber - 2 ;
  rows[rowUp].assign({ IncomeBulan: incomeBaru, TargetTabungan: targetBaru})
  await rows[rowUp].save();
  const bulan = dayjs().format("MMMM YYYY");

  if (sendResponse) {
      await sendResponse(
        `✅ Income bulan ${bulan} diperbarui.\n💰 Income: Rp${incomeBaru.toLocaleString()}\n🎯 Target tabungan: Rp${targetBaru.toLocaleString()}`
      );
    }
}

module.exports = {
  initDoc,
  appendTransaksi,
  getTarget,
  getTotalPengeluaranBulanIni,
  laporanHariIni,
  hapusTransaksiRow,
  setIncome,
  getIncomeData,
  tambahIncome,
};
