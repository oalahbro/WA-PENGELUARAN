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

function getHelpMessage() {
  return `\uD83D\uDCD8 *Panduan Penggunaan Bot Pengeluaran*

\u2705 *Tambah Pengeluaran*
Format:
\u00B7 _+<kategori> <jumlah> <deskripsi>_
Contoh:
\u00B7 +ngopi 15000 kopi susu
\u00B7 +belanja bulanan 250000 indomaret

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
Contoh:
\u00B7 hapus pengeluaran 27-06-2025
\u00B7 hapus pengeluaran 27/06
\u2022 Setelah daftar muncul, balas pesan tersebut dengan nomor transaksi
Contoh:
\u00B7 2

\uD83D\uDCBC *Set Income & Target Tabungan*
(Hanya 1x per bulan)
Format:
\u00B7 _set income <jumlah> tabungan <target_tabungan>_
Contoh:
\u00B7 set income 5000000 tabungan 1500000

\uD83D\uDCCA *Cek Progress Tabungan*
\u00B7 _progress tabungan_

\u2709\uFE0F Ketik *help* kapan saja untuk melihat panduan ini kembali.

\uD83D\uDE4F Terima kasih telah menggunakan bot ini!`;
}

module.exports = {
  formatCurrency,
  formatTransaksiList,
  formatRingkasanMessage,
  formatProgressMessage,
  getHelpMessage,
};
