require("dotenv").config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("baileys");
const pino = require("pino");
const schedule = require("node-schedule");
const {initDoc, appendTransaksi, getTotalPengeluaranBulanIni, laporanHariIni, hapusTransaksiRow, setIncome, getIncomeData, tambahIncome} = require("./googleSheet");
const qrcode = require("qrcode-terminal");
const os = require("os");
const axios = require("axios");
const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");
dayjs.extend(customParseFormat);

async function broadcastReminderPengeluaran(sock) {
  const doc = await initDoc();
  const sheet = doc.sheetsByTitle["Income"];
  const rows = await sheet.getRows();

  const todayStr = dayjs().format("YYYY-MM-DD");

  const userSudahDiingatkan = new Set();

  for (const row of rows) {
    const user = row.User || row._rawData[0];
    const bulan = row.BulanAwal || row._rawData[1];

    const isBulanIni = bulan === dayjs().format("YYYY-MM");
    if (!isBulanIni || userSudahDiingatkan.has(user)) continue;

    // Cek apakah user sudah input pengeluaran hari ini
    const transaksiHariIni = await laporanHariIni(user, todayStr);
    const totalTransaksi = transaksiHariIni.length;

    if (totalTransaksi === 0) {
      await sock.sendMessage(user, {
        text: `👋 Hai! Kamu belum mencatat pengeluaran hari ini (${dayjs().format("DD-MM-YYYY")}).

Ketik _+<kategori> <jumlah> <deskripsi>_ untuk mencatat.
Contoh:
+ngopi 15000 kopi susu`
      });
      userSudahDiingatkan.add(user);
    }
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    markOnlineOnConnect: true,
    browser: ["PengeluaranBot", "Chrome", "1.0"],
  });

  sock.ev.on("creds.update", saveCreds);

sock.ev.on("connection.update", (update) => {
  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    console.log("📱 Scan QR berikut untuk login:\n");
     qrcode.generate(qr, { small: true });
    console.log(qr);
  }

  if (connection === "close") {
    const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
    console.log("❗ Connection closed. Reconnecting:", shouldReconnect);
    if (shouldReconnect) startBot();
  } else if (connection === "open") {
    console.log("✅ Connected to WhatsApp");
  }
});
function parseTanggalRingkasan(input) {
  const formats = [
    "DD-MM-YYYY",
    "DD-MM-YY",
    "DD-MM",
    "DD/MM/YYYY",
    "DD/MM/YY",
    "DD/MM"
  ];
  for (const format of formats) {
    const parsed = dayjs(input, format, true);
    if (parsed.isValid()) {
      // Jika tahun tidak ditulis, asumsikan tahun sekarang
      const now = dayjs();
      return parsed.year() === 2001 ? parsed.year(now.year()) : parsed;
    }
  }
  return null;
}
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
// console.log("📩 Message received:", messages);

    if (type !== "notify") return;

    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

    try {
      if (["help", "?", "menu", "panduan"].includes(text.toLowerCase())) {
        const helpMessage = `📘 *Panduan Penggunaan Bot Pengeluaran*

✅ *Tambah Pengeluaran*  
Format:  
· _+<kategori> <jumlah> <deskripsi>_  
Contoh:  
· +ngopi 15000 kopi susu  
· +belanja bulanan 250000 indomaret

📅 *Cek Ringkasan Pengeluaran*  
• Hari ini:  
· _ringkasan_  
• Hari ini + X hari ke belakang (1–360):  
· _ringkasan 3_  
• Tanggal tertentu (format fleksibel):  
· _ringkasan 05-06_  
· _ringkasan 05/06/2024_

🗑️ *Hapus Pengeluaran*  
• Untuk hari ini:  
· _hapus pengeluaran_  
• Untuk tanggal tertentu:  
· _hapus pengeluaran <tanggal>_  
Contoh:  
· hapus pengeluaran 27-06-2025  
· hapus pengeluaran 27/06  
• Setelah daftar muncul, balas pesan tersebut dengan nomor transaksi  
Contoh:  
· 2

💼 *Set Income & Target Tabungan*  
(Hanya 1x per bulan)  
Format:  
· _set income <jumlah> tabungan <target_tabungan>_  
Contoh:  
· set income 5000000 tabungan 1500000

📊 *Cek Progress Tabungan*  
· _progress tabungan_

✉️ Ketik *help* kapan saja untuk melihat panduan ini kembali.  

🙏 Terima kasih telah menggunakan bot ini!`;
        await sock.sendMessage(sender, { text: helpMessage });
      }
      else if (text.toLowerCase().startsWith("ringkasan")) {
            const args = text.trim().split(" ");
            const today = dayjs();
            let allData = [];
            let header = "📅 Ringkasan:";
            const incomeData = await getIncomeData(sender);
            const maxHarian = parseFloat(incomeData.MaxHarian || incomeData._rawData[4] || 0);

            // ringkasan (tanpa argumen): hanya hari ini
            if (args.length === 1) {
              const data = await laporanHariIni(sender, today.format("YYYY-MM-DD"));
              allData = data;
              header = `📅 Ringkasan: Hari ini (${today.format("DD/MM/YYYY")})`;

            } else if (/^\d+$/.test(args[1])) {
              // ringkasan <jumlah hari> → total hari ini + hari sebelumnya sebanyak X hari
              const daysBack = parseInt(args[1]);
              if (daysBack < 0 || daysBack > 360) {
                await sock.sendMessage(sender, { text: "❗ Rentang hari harus antara 0 sampai 360." });
                return;
              }

              for (let i = 0; i <= daysBack; i++) {
                const tanggal = today.subtract(i, "day").format("YYYY-MM-DD");
                const data = await laporanHariIni(sender, tanggal);
                allData.push(...data);
              }
              header = `📅 Ringkasan: ${daysBack} hari terakhir`;
            } else {
              // ringkasan <tanggal spesifik>
              const tanggalRaw = args[1];
              let parsed = dayjs(tanggalRaw, ["DD-MM-YYYY", "DD-MM-YY", "DD-MM", "DD/MM/YYYY", "DD/MM/YY", "DD/MM", "D/M", "D-M"], true);

              if (parsed.isValid()) {
                // Jika hanya DD-MM atau DD/MM, tambahkan tahun saat ini
                if (tanggalRaw.match(/^(\d{1,2})[-/](\d{1,2})$/)) {
                  parsed = parsed.set("year", today.year()); // ini penting!
                }

                const data = await laporanHariIni(sender, parsed.format("YYYY-MM-DD"));
                allData = data;
                header = `📅 Ringkasan: ${parsed.format("DD/MM/YYYY")}`;
              } else {
                await sock.sendMessage(sender, {
                  text: "❗ Format tanggal tidak dikenali. Contoh: 05-06-2024, 05-06, atau 05/06/24."
                });
                return;
              }
            }

            // Proses hasil
            const total = allData.reduce((acc, item) => acc + parseFloat(item.Nominal || item._rawData?.[4] || 0), 0);
            let summary = allData.map((r) => {
              const kategori = r.Kategori || r._rawData?.[3] || "-";
              const nominal = r.Nominal || r._rawData?.[4] || 0;
              const deskripsi = r.Deskripsi || r._rawData?.[5] || "-";
              return `• ${kategori} - Rp${nominal.toLocaleString()} (${deskripsi})`;
            }).join("\n");

            summary = summary || "Tidak ada transaksi.";
            let sisa = maxHarian - total
            await sock.sendMessage(sender, {
              text: `${header}\n${summary}\n\n💰 *Total: Rp${total.toLocaleString()}*\n👛 *Sisa: Rp${sisa.toLocaleString()}*`
            });
          }
    else if (text.toLowerCase().startsWith("hapus pengeluaran")) {
      const parts = text.trim().split(" ");

      let tanggal = null;
      if (parts.length >= 3) {
        tanggal = parts.slice(2).join(" ");
      }

      if (tanggal) {
        const parsed = dayjs(tanggal, ["DD-MM-YYYY", "DD-MM-YY", "DD-MM", "DD/MM/YYYY", "DD/MM/YY", "DD/MM", "D/M", "D-M"], true);

        if (!parsed.isValid()) {
          await sock.sendMessage(sender, { text: "❗ Format salah. Contoh: hapus pengeluaran 05-07-2024" });
          return;
        }

        const data = await laporanHariIni(sender, parsed.format("YYYY-MM-DD"));

        if (data.length === 0) {
          await sock.sendMessage(sender, {
            text: `⚠️ Tidak ada pengeluaran di tanggal ${parsed.format("DD-MM-YYYY")}.`
          });
          return;
        }

        const list = data
        .map((r, i) => {
          const kategori = r.Kategori || r._rawData[3] || "-";
          const nominal = r.Nominal || r._rawData[4] || "0";
          const deskripsi = r.Deskripsi || r._rawData[5] || "-";
          return `${i + 1}. ${kategori} - Rp${nominal} (${deskripsi})`;
        })
        .join("\n");

        await sock.sendMessage(sender, {
          text: `🗑️ *Daftar Pengeluaran Tanggal ${parsed.format("DD-MM-YYYY")}:*\n\n${list}\n\n➡️ *Balas pesan ini* dengan nomor transaksi untuk menghapus.`
        });
        return;
      }

      // Default: hapus hari ini
      const data = await laporanHariIni(sender);
      if (data.length === 0) {
        await sock.sendMessage(sender, { text: "⚠️ Tidak ada pengeluaran hari ini." });
        return;
      }

      const list = data
        .map((r, i) => {
          const kategori = r.Kategori || r._rawData[3] || "-";
          const nominal = r.Nominal || r._rawData[4] || "0";
          const deskripsi = r.Deskripsi || r._rawData[5] || "-";
          return `${i + 1}. ${kategori} - Rp${nominal} (${deskripsi})`;
        })
        .join("\n");

      await sock.sendMessage(sender, {
        text: `🗑️ *Daftar Pengeluaran Hari Ini:*\n\n${list}\n\n➡️ *Balas pesan ini* dengan nomor transaksi untuk menghapus.`
      });
    }


    else if (msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      const quoted = msg.message.extendedTextMessage.contextInfo.quotedMessage;

      let quotedText = "";
      if (quoted.conversation) {
        quotedText = quoted.conversation;
      } else if (quoted.extendedTextMessage?.text) {
        quotedText = quoted.extendedTextMessage.text;
      }

      if (/Daftar Pengeluaran (Hari Ini|Tanggal )/i.test(quotedText)) {
        const nomor = parseInt(text.trim());
        if (isNaN(nomor)) {
          await sock.sendMessage(sender, { text: "❗ Format tidak valid. Contoh: 2" });
          return;
        }

        // Ambil tanggal dari isi quoted
        const matchTanggal = quotedText.match(/Tanggal (\d{2}[-/]\d{2}(?:[-/]\d{2,4})?)/);
        let tanggalInput = null;

        if (matchTanggal) {
          const parsed = dayjs(matchTanggal[1], ["DD-MM-YYYY", "DD-MM-YY", "DD-MM", "DD/MM/YYYY", "DD/MM/YY", "DD/MM"]);
          if (parsed.isValid()) {
            tanggalInput = parsed.format("YYYY-MM-DD");
          }
        }

        const data = await laporanHariIni(sender, tanggalInput);
        const transaksi = data[nomor - 1];

        if (!transaksi) {
          await sock.sendMessage(sender, { text: `❗ Transaksi nomor ${nomor} tidak ditemukan.` });
          return;
        }

        const success = await hapusTransaksiRow(transaksi);
        if (success) {
          const kategori = transaksi.Kategori || transaksi._rawData?.[3] || "-";
          const nominal = transaksi.Nominal || transaksi._rawData?.[4] || 0;
          const deskripsi = transaksi.Deskripsi || transaksi._rawData?.[5] || "-";

          await sock.sendMessage(sender, {
            text: `✅ Transaksi berhasil dihapus:\n${kategori} - Rp${nominal} (${deskripsi})`
          });
        } else {
          await sock.sendMessage(sender, { text: `❗ Gagal menghapus transaksi.` });
        }
        return;
      }
    }

    //income session
    else if (text.toLowerCase().startsWith("set income")) {
      const regex = /^set income (\d+)\s+tabungan\s+(\d+)/i;
      const match = text.match(regex);

      if (!match) {
        await sock.sendMessage(sender, { text: "❗ Format salah.\nContoh: set income 5000000 tabungan 1000000" });
        return;
      }

      const [, totalIncome, targetTabungan] = match;
      await setIncome(sender, parseInt(totalIncome), parseInt(targetTabungan), (msg) =>
        sock.sendMessage(sender, { text: msg })
      );
    }
    else if (text.toLowerCase().startsWith("progress tabungan")) {
      let targetBulan = dayjs().startOf("month"); // default bulan ini
      const parts = text.toLowerCase().split(" ");

  // Cek apakah ada nama bulan setelah "progress tabungan"
  if (parts.length >= 3) {
    const namaBulan = parts[2]; // misalnya: "juli"
    const bulanMap = {
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
      desember: 11
    };

    if (bulanMap[namaBulan] !== undefined) {
      const tahunSekarang = dayjs().year();
      targetBulan = dayjs().month(bulanMap[namaBulan]).year(tahunSekarang).startOf("month");
    }
  }
      const incomeData = await getIncomeData(sender, targetBulan);

      if (!incomeData) {
        await sock.sendMessage(sender, {
          text: `❗ Belum ada data income untuk ${targetBulan.format("MMMM YYYY")}.`
        });
        return;
      }

      const income = parseFloat(incomeData.IncomeBulan || incomeData._rawData[2] || 0);
      const target = parseFloat(incomeData.TargetTabungan || incomeData._rawData[3] || 0);

      const totalPengeluaran = await getTotalPengeluaranBulanIni(sender, targetBulan);
      const tabunganSaatIni = income - totalPengeluaran;
      const sisaTarget = target - tabunganSaatIni;
      const sisaBudget = tabunganSaatIni - target;
      const bulan = targetBulan.format("MMMM YYYY");

      const status =
        sisaTarget <= 0
          ? "✅ Target tabungan tercapai atau melebihi!"
          : `⚠️ Target tabungan belum tercapai. Kurang Rp${sisaTarget.toLocaleString()}`;

      await sock.sendMessage(sender, {
        text: `📊 *Progress Tabungan (${bulan}):*\n
    💰 Income Bulanan: *Rp${income.toLocaleString()}*
    🎯 Target Tabungan: *Rp${target.toLocaleString()}*
    💸 Total Pengeluaran: *Rp${totalPengeluaran.toLocaleString()}*
    💼 Tabungan Saat Ini: *Rp${tabunganSaatIni.toLocaleString()}*
    👛 Sisa Budget: *Rp${sisaBudget.toLocaleString()}*

    ${status}`
      });
    }


    else if (text.startsWith("+")) {
      const lines = text.trim().split("\n").filter(line => line.startsWith("+"));

      const hasil = [];

      for (const line of lines) {
        const cleanLine = line.substring(1).trim();

        // Regex untuk mencari angka pertama sebagai nominal
        const match = cleanLine.match(/(.+?)\s+(\d+(?:\.\d+)?)(?:\s+(.*))?$/);

        if (!match) {
          hasil.push(`❗ Format tidak valid: ${line}`);
          continue;
        }

        const kategori = match[1].trim();
        const nominal = parseFloat(match[2]);
        const deskripsi = (match[3] || "-").trim();

        // Validasi income dulu (tidak bisa input jika belum set income bulan ini)
        const incomeData = await getIncomeData(sender);
        if (!incomeData) {
          await sock.sendMessage(sender, {
            text: "❗ Belum ada data income bulan ini. Gunakan perintah: `set income <jumlah> tabungan <target>`"
          });
          return;
        }

        // Cek limit harian
        const maxHarian = parseFloat(incomeData.MaxHarian || incomeData._rawData[4] || 0);
        const transaksiHariIni = await laporanHariIni(sender);
        const totalHariIni = transaksiHariIni.reduce((acc, r) => acc + parseFloat(r.Nominal || r._rawData[4] || 0), 0);
        const totalSetelah = totalHariIni + nominal;

        if (totalSetelah > maxHarian) {
          hasil.push(`⚠️ [${kategori}] Pengeluaran melebihi limit harian!\nLimit: Rp${maxHarian}\nHari ini: Rp${totalHariIni}\nAkan dicatat: Rp${nominal}`);
        }

        await appendTransaksi(sender, kategori, nominal, deskripsi);
        hasil.push(`✔ Pengeluaran dicatat:\n✅ ${kategori} - Rp${nominal.toLocaleString()} (${deskripsi})`);
      }

      const hasilText = hasil.join("\n\n");
      await sock.sendMessage(sender, { text: hasilText });
    }

    else if (text.toLowerCase().startsWith("add income")) {
      const incomeData = await getIncomeData(sender);
        if (!incomeData) {
          await sock.sendMessage(sender, {
            text: "❗ Belum ada data income bulan ini. Gunakan perintah: `set income <jumlah> tabungan <target>`"
          });
          return;
        }
      const args = text.split(" ");
      if (args.length < 3 || isNaN(args[2])) {
        await sock.sendMessage(sender, { text: "❌ Format salah. Gunakan: *add income <jumlah>*\nContoh: add income 50000" });
        return;
      }

      const jumlah = parseInt(args[2]);
      try {
        await tambahIncome(sender, jumlah, (msg) =>
        sock.sendMessage(sender, { text: msg }))
      } catch (e) {
        await sock.sendMessage(sender, { text: `❌ ${e.message}` });
      }
    }

    else if (text.toLowerCase() === "!ping") {
      const start = Date.now();

      // IP Lokal
      const interfaces = os.networkInterfaces();
      let ipLocal = "Tidak diketahui";

      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === "IPv4" && !iface.internal) {
            ipLocal = iface.address;
            break;
          }
        }
        if (ipLocal !== "Tidak diketahui") break;
      }

      // IP Publik
      let ipPublic = "Gagal mendapatkan IP publik";
      try {
        const res = await axios.get("https://api.ipify.org?format=json");
        ipPublic = res.data.ip;
      } catch (err) {
        console.error("Gagal ambil IP publik:", err.message);
      }

      const waktu = new Date().toLocaleString("id-ID");
      const latency = Date.now() - start;

      await sock.sendMessage(sender, {
        text: `🏓 *Pong!*\nBot aktif dan responsif.

    🕒 Waktu Server: ${waktu}
    🌐 IP Lokal: ${ipLocal}
    🌍 IP Publik: ${ipPublic}
    📶 Ping: ${latency} ms`
      });
    }
    } catch (error) {
      console.error("❌ Error handling message:", error);
      await sock.sendMessage(sender, { text: "❗ Terjadi kesalahan, coba lagi nanti." });
    }
  });

  // Jadwal analisis AI setiap jam 9 malam
schedule.scheduleJob('0 0 15 * * *', async () => {
  console.log("🔔 Menjalankan broadcast reminder pengeluaran...");
  await broadcastReminderPengeluaran(sock);
});
}

startBot();
