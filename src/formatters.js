function formatCurrency(amount) {
  const num = parseFloat(amount) || 0;
  if (num < 0) {
    return `-Rp${Math.abs(num).toLocaleString()}`;
  }
  return `Rp${num.toLocaleString()}`;
}

function formatTransaksiList(data) {
  if (!data || data.length === 0) return "Tidak ada transaksi.";

  return data
    .map((r, i) => {
      const kategori = r.Kategori || r._rawData?.[3] || "-";
      const nominal = r.Nominal || r._rawData?.[4] || "0";
      const deskripsi = r.Deskripsi || r._rawData?.[5] || "-";
      return `${i + 1}. ${kategori} - Rp${nominal} (${deskripsi})`;
    })
    .join("\n");
}

function formatRingkasanMessage(header, data, maxHarian) {
  const total = data.reduce(
    (acc, item) => acc + parseFloat(item.Nominal || item._rawData?.[4] || 0),
    0
  );

  let summary = data
    .map((r) => {
      const kategori = r.Kategori || r._rawData?.[3] || "-";
      const nominal = r.Nominal || r._rawData?.[4] || 0;
      const deskripsi = r.Deskripsi || r._rawData?.[5] || "-";
      return `\u2022 ${kategori} - ${formatCurrency(nominal)} (${deskripsi})`;
    })
    .join("\n");

  summary = summary || "Tidak ada transaksi.";
  const sisa = maxHarian - total;
  return `${header}\n${summary}\n\n\uD83D\uDCB0 *Total: ${formatCurrency(total)}*\n\uD83D\uDC5B *Sisa: ${formatCurrency(sisa)}*`;
}

function formatProgressMessage(bulan, income, target, totalPengeluaran) {
  const tabunganSaatIni = income - totalPengeluaran;
  const sisaTarget = target - tabunganSaatIni;
  const sisaBudget = tabunganSaatIni - target;

  const status =
    sisaTarget <= 0
      ? "\u2705 Target tabungan tercapai atau melebihi!"
      : `\u26A0\uFE0F Target tabungan belum tercapai. Kurang ${formatCurrency(sisaTarget)}`;

  return `\uD83D\uDCCA *Progress Tabungan (${bulan}):*\n
    \uD83D\uDCB0 Income Bulanan: *${formatCurrency(income)}*
    \uD83C\uDFAF Target Tabungan: *${formatCurrency(target)}*
    \uD83D\uDCB8 Total Pengeluaran: *${formatCurrency(totalPengeluaran)}*
    \uD83D\uDCBC Tabungan Saat Ini: *${formatCurrency(tabunganSaatIni)}*
    \uD83D\uDC5B Sisa Budget: *${formatCurrency(sisaBudget)}*

    ${status}`;
}

function formatCategoryBreakdown(categoryData, totalAll) {
  if (!categoryData || categoryData.length === 0) {
    return "Tidak ada data pengeluaran.";
  }

  const BAR_WIDTH = 15;
  const maxAmount = Math.max(...categoryData.map((c) => c.total));

  const lines = categoryData.map((c) => {
    const pct = totalAll > 0 ? ((c.total / totalAll) * 100).toFixed(1) : 0;
    const barLen = maxAmount > 0 ? Math.round((c.total / maxAmount) * BAR_WIDTH) : 0;
    const bar = "\u2588".repeat(barLen) + "\u2591".repeat(BAR_WIDTH - barLen);
    return `${bar} ${c.kategori}: ${formatCurrency(c.total)} (${pct}%)`;
  });

  return lines.join("\n");
}

function formatExportReport(bulan, incomeData, categoryData, totalPengeluaran, transactions) {
  let report = `\uD83D\uDCCB *LAPORAN BULANAN — ${bulan}*\n`;
  report += `${"=".repeat(30)}\n\n`;

  if (incomeData) {
    const income = parseFloat(incomeData.IncomeBulan || 0);
    const target = parseFloat(incomeData.TargetTabungan || 0);
    report += `\uD83D\uDCB0 Income: *${formatCurrency(income)}*\n`;
    report += `\uD83C\uDFAF Target Tabungan: *${formatCurrency(target)}*\n`;
    report += `\uD83D\uDCB8 Total Pengeluaran: *${formatCurrency(totalPengeluaran)}*\n`;
    report += `\uD83D\uDCBC Sisa: *${formatCurrency(income - totalPengeluaran)}*\n\n`;
  }

  report += `\uD83D\uDCCA *Breakdown per Kategori:*\n`;
  if (categoryData.length > 0) {
    report += formatCategoryBreakdown(categoryData, totalPengeluaran);
  } else {
    report += "Tidak ada pengeluaran.\n";
  }

  report += `\n\n\uD83D\uDCC3 *Detail Transaksi (${transactions.length}):*\n`;
  if (transactions.length > 0) {
    transactions.forEach((t, i) => {
      const tgl = (t.Timestamp || t._rawData?.[1] || "").split("T")[0] || "-";
      const kat = t.Kategori || t._rawData?.[3] || "-";
      const nom = t.Nominal || t._rawData?.[4] || 0;
      const desc = t.Deskripsi || t._rawData?.[5] || "-";
      report += `${i + 1}. [${tgl}] ${kat} - ${formatCurrency(nom)} (${desc})\n`;
    });
  } else {
    report += "Tidak ada transaksi.\n";
  }

  return report;
}

function formatBudgetStatus(budgets, categorySpending) {
  if (!budgets || budgets.length === 0) {
    return "Belum ada budget yang di-set.";
  }

  const lines = budgets.map((b) => {
    const kategori = b.Kategori || b._rawData?.[1] || "-";
    const maxBulanan = parseFloat(b.MaxBulanan || b._rawData?.[2] || 0);
    const spent = categorySpending[kategori.toLowerCase()] || 0;
    const sisa = maxBulanan - spent;
    const pct = maxBulanan > 0 ? ((spent / maxBulanan) * 100).toFixed(0) : 0;

    let statusIcon;
    if (pct >= 100) statusIcon = "\uD83D\uDD34";
    else if (pct >= 80) statusIcon = "\uD83D\uDFE1";
    else statusIcon = "\uD83D\uDFE2";

    const BAR_WIDTH = 10;
    const filled = Math.min(Math.round((spent / maxBulanan) * BAR_WIDTH), BAR_WIDTH);
    const bar = "\u2588".repeat(filled) + "\u2591".repeat(BAR_WIDTH - filled);

    return `${statusIcon} *${kategori}*\n   ${bar} ${pct}%\n   Terpakai: ${formatCurrency(spent)} / ${formatCurrency(maxBulanan)}\n   Sisa: ${formatCurrency(sisa)}`;
  });

  return lines.join("\n\n");
}

function formatRecurringList(items) {
  if (!items || items.length === 0) return "Belum ada pengeluaran rutin.";

  return items
    .map((r, i) => {
      const kategori = r.Kategori || r._rawData?.[1] || "-";
      const nominal = r.Nominal || r._rawData?.[2] || 0;
      const deskripsi = r.Deskripsi || r._rawData?.[3] || "-";
      const aktif = (r.Aktif || r._rawData?.[4] || "true") === "true" ? "\u2705" : "\u274C";
      return `${i + 1}. ${aktif} ${kategori} - ${formatCurrency(nominal)} (${deskripsi})`;
    })
    .join("\n");
}

function formatWeeklyReport(bulan, weekData, totalWeek, totalMonth, budgetAlerts) {
  let report = `\uD83D\uDCC5 *Laporan Mingguan (${bulan}):*\n\n`;

  if (weekData.length === 0) {
    report += "Tidak ada pengeluaran minggu ini.\n";
  } else {
    weekData.forEach((d) => {
      report += `\u2022 ${d.tanggal}: ${formatCurrency(d.total)} (${d.count} transaksi)\n`;
    });
    report += `\n\uD83D\uDCB0 *Total Minggu Ini: ${formatCurrency(totalWeek)}*\n`;
    report += `\uD83D\uDCB8 *Total Bulan Ini: ${formatCurrency(totalMonth)}*\n`;
  }

  if (budgetAlerts && budgetAlerts.length > 0) {
    report += `\n\u26A0\uFE0F *Peringatan Budget:*\n`;
    budgetAlerts.forEach((a) => {
      report += `\u2022 ${a.kategori}: ${a.pct}% terpakai (${formatCurrency(a.spent)}/${formatCurrency(a.limit)})\n`;
    });
  }

  return report;
}

function formatEditableTransaksiList(data) {
  if (!data || data.length === 0) return "Tidak ada transaksi.";

  return data
    .map((r, i) => {
      const kategori = r.Kategori || r._rawData?.[3] || "-";
      const nominal = r.Nominal || r._rawData?.[4] || "0";
      const deskripsi = r.Deskripsi || r._rawData?.[5] || "-";
      return `${i + 1}. ${kategori} | Rp${nominal} | ${deskripsi}`;
    })
    .join("\n");
}

function getHelpMessage() {
  return `\uD83D\uDCD8 *Panduan Penggunaan Bot Pengeluaran*

\u2705 *Tambah Pengeluaran*
Format:
\u00B7 _+<kategori> <jumlah> <deskripsi>_
Contoh:
\u00B7 +ngopi 15000 kopi susu
\u00B7 +belanja bulanan 250000 indomaret
Multi-currency:
\u00B7 +ngopi $5 coffee (USD)
\u00B7 +makan 10 SGD nasi lemak

\uD83D\uDCC5 *Cek Ringkasan Pengeluaran*
\u2022 Hari ini:
\u00B7 _ringkasan_
\u2022 Hari ini + X hari ke belakang (1\u2013360):
\u00B7 _ringkasan 3_
\u2022 Tanggal tertentu (format fleksibel):
\u00B7 _ringkasan 05-06_
\u00B7 _ringkasan 05/06/2024_

\uD83D\uDDD1\uFE0F *Hapus Pengeluaran*
\u2022 Untuk hari ini:
\u00B7 _hapus pengeluaran_
\u2022 Untuk tanggal tertentu:
\u00B7 _hapus pengeluaran <tanggal>_
\u2022 Setelah daftar muncul, balas dengan nomor transaksi

\u270F\uFE0F *Edit Pengeluaran*
\u00B7 _edit pengeluaran_ (hari ini)
\u00B7 _edit pengeluaran <tanggal>_
\u2022 Setelah daftar muncul, balas: _<nomor> <kategori/nominal/deskripsi> <nilai baru>_
Contoh: _2 nominal 20000_

\uD83D\uDCBC *Set Income & Target Tabungan*
(Hanya 1x per bulan)
\u00B7 _set income <jumlah> tabungan <target_tabungan>_
Contoh: set income 5000000 tabungan 1500000

\uD83D\uDCCA *Cek Progress Tabungan*
\u00B7 _progress tabungan_
\u00B7 _progress tabungan <bulan>_

\uD83D\uDCB0 *Tambah Income*
\u00B7 _add income <jumlah>_

\uD83D\uDCC8 *Budget per Kategori*
\u00B7 _set budget <kategori> <jumlah>_ — atur batas bulanan
\u00B7 _list budget_ — lihat semua budget & status
\u00B7 _hapus budget <kategori>_ — hapus budget

\uD83D\uDD01 *Pengeluaran Rutin (Recurring)*
\u00B7 _set recurring <kategori> <nominal> <deskripsi>_
\u00B7 _list recurring_ — lihat daftar recurring
\u00B7 _hapus recurring <nomor>_ — hapus recurring

\uD83D\uDCCA *Breakdown Kategori*
\u00B7 _breakdown_ — breakdown bulan ini
\u00B7 _breakdown <bulan>_ — breakdown bulan tertentu

\uD83D\uDCCB *Export Laporan Bulanan*
\u00B7 _export_ — laporan bulan ini
\u00B7 _export <bulan>_ — laporan bulan tertentu

\u2709\uFE0F Ketik *help* kapan saja untuk melihat panduan ini kembali.

\uD83D\uDE4F Terima kasih telah menggunakan bot ini!`;
}

module.exports = {
  formatCurrency,
  formatTransaksiList,
  formatRingkasanMessage,
  formatProgressMessage,
  formatCategoryBreakdown,
  formatExportReport,
  formatBudgetStatus,
  formatRecurringList,
  formatWeeklyReport,
  formatEditableTransaksiList,
  getHelpMessage,
};
