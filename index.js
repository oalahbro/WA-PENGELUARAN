require("dotenv").config();
const { validateEnv } = require("./src/validators");
validateEnv();

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

const { HELP_COMMANDS } = require("./src/constants");
const { validateNominal } = require("./src/validators");
const { parseDateInput, parseAddExpenseLines, parseSetIncomeCommand, parseProgressMonth, extractDateFromQuotedText } = require("./src/parsers");
const { formatCurrency, formatTransaksiList, formatRingkasanMessage, formatProgressMessage, getHelpMessage } = require("./src/formatters");

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

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

    try {
      if (HELP_COMMANDS.includes(text.toLowerCase())) {
        await sock.sendMessage(sender, { text: getHelpMessage() });
      }
      else if (text.toLowerCase().startsWith("ringkasan")) {
        const args = text.trim().split(" ");
        const today = dayjs();
        let allData = [];
        let header = "📅 Ringkasan:";
        const incomeData = await getIncomeData(sender);
        const maxHarian = parseFloat(incomeData?.MaxHarian || incomeData?._rawData?.[4] || 0);

        if (args.length === 1) {
          const data = await laporanHariIni(sender, today.format("YYYY-MM-DD"));
          allData = data;
          header = `📅 Ringkasan: Hari ini (${today.format("DD/MM/YYYY")})`;

        } else if (/^\d+$/.test(args[1])) {
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
          const parsed = parseDateInput(args[1], today);

          if (parsed) {
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

        const message = formatRingkasanMessage(header, allData, maxHarian);
        await sock.sendMessage(sender, { text: message });
      }
      else if (text.toLowerCase().startsWith("hapus pengeluaran")) {
        const parts = text.trim().split(" ");

        let tanggal = null;
        if (parts.length >= 3) {
          tanggal = parts.slice(2).join(" ");
        }

        if (tanggal) {
          const parsed = parseDateInput(tanggal);

          if (!parsed) {
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

          const list = formatTransaksiList(data);

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

        const list = formatTransaksiList(data);

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

          const tanggalInput = extractDateFromQuotedText(quotedText);

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
        const parsed = parseSetIncomeCommand(text);

        if (!parsed) {
          await sock.sendMessage(sender, { text: "❗ Format salah.\nContoh: set income 5000000 tabungan 1000000" });
          return;
        }

        const { totalIncome, targetTabungan } = parsed;

        const incomeCheck = validateNominal(totalIncome);
        if (!incomeCheck.valid) {
          await sock.sendMessage(sender, { text: `❗ Income tidak valid: ${incomeCheck.error}` });
          return;
        }

        const tabunganCheck = validateNominal(targetTabungan);
        if (!tabunganCheck.valid) {
          await sock.sendMessage(sender, { text: `❗ Target tabungan tidak valid: ${tabunganCheck.error}` });
          return;
        }

        if (targetTabungan >= totalIncome) {
          await sock.sendMessage(sender, { text: "❗ Target tabungan harus lebih kecil dari total income." });
          return;
        }

        await setIncome(sender, totalIncome, targetTabungan, (msg) =>
          sock.sendMessage(sender, { text: msg })
        );
      }
      else if (text.toLowerCase().startsWith("progress tabungan")) {
        const targetBulan = parseProgressMonth(text);

        const incomeData = await getIncomeData(sender, targetBulan);

        if (!incomeData) {
          await sock.sendMessage(sender, {
            text: `❗ Belum ada data income untuk ${targetBulan.format("MMMM YYYY")}.`
          });
          return;
        }

        const income = parseFloat(incomeData.IncomeBulan || incomeData._rawData?.[2] || 0);
        const target = parseFloat(incomeData.TargetTabungan || incomeData._rawData?.[3] || 0);

        const totalPengeluaran = await getTotalPengeluaranBulanIni(sender, targetBulan);
        const bulan = targetBulan.format("MMMM YYYY");

        const message = formatProgressMessage(bulan, income, target, totalPengeluaran);
        await sock.sendMessage(sender, { text: message });
      }


      else if (text.startsWith("+")) {
        const parsedLines = parseAddExpenseLines(text);

        const hasil = [];

        for (const entry of parsedLines) {
          if (entry.error) {
            hasil.push(`❗ ${entry.error}`);
            continue;
          }

          const { kategori, nominal, deskripsi } = entry;

          const nominalCheck = validateNominal(nominal);
          if (!nominalCheck.valid) {
            hasil.push(`❗ [${kategori}] ${nominalCheck.error}`);
            continue;
          }

          // Validasi income dulu
          const incomeData = await getIncomeData(sender);
          if (!incomeData) {
            await sock.sendMessage(sender, {
              text: "❗ Belum ada data income bulan ini. Gunakan perintah: `set income <jumlah> tabungan <target>`"
            });
            return;
          }

          // Cek limit harian
          const maxHarian = parseFloat(incomeData.MaxHarian || incomeData._rawData?.[4] || 0);
          const transaksiHariIni = await laporanHariIni(sender);
          const totalHariIni = transaksiHariIni.reduce((acc, r) => acc + parseFloat(r.Nominal || r._rawData?.[4] || 0), 0);
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

        const jumlahCheck = validateNominal(jumlah);
        if (!jumlahCheck.valid) {
          await sock.sendMessage(sender, { text: `❗ Jumlah tidak valid: ${jumlahCheck.error}` });
          return;
        }

        try {
          await tambahIncome(sender, jumlah, (msg) =>
            sock.sendMessage(sender, { text: msg }))
        } catch (e) {
          await sock.sendMessage(sender, { text: `❌ ${e.message}` });
        }
      }

      else if (text.toLowerCase() === "!ping") {
        const start = Date.now();

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

  const cronSchedule = process.env.REMINDER_CRON || '0 0 15 * * *';
  schedule.scheduleJob(cronSchedule, async () => {
    console.log("🔔 Menjalankan broadcast reminder pengeluaran...");
    await broadcastReminderPengeluaran(sock);
  });
}

startBot();
