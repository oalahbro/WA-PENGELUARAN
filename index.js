require("dotenv").config();
const { validateEnv } = require("./src/validators");
validateEnv();

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("baileys");
const pino = require("pino");
const schedule = require("node-schedule");
const {
  initDoc, appendTransaksi, getTotalPengeluaranBulanIni, getMonthlyTransactions,
  getCategorySpending, laporanHariIni, hapusTransaksiRow, editTransaksiRow,
  setIncome, getIncomeData, tambahIncome,
  setBudget, getBudgets, deleteBudget, checkBudgetAlert,
  setRecurring, getRecurringExpenses, deleteRecurring, processRecurringExpenses,
  getWeeklyData,
} = require("./googleSheet");
const qrcode = require("qrcode-terminal");
const os = require("os");
const axios = require("axios");
const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");
dayjs.extend(customParseFormat);

const { HELP_COMMANDS, BULAN_MAP } = require("./src/constants");
const { validateNominal } = require("./src/validators");
const {
  parseDateInput, parseAddExpenseLinesWithCurrency, parseSetIncomeCommand,
  parseProgressMonth, extractDateFromQuotedText,
  parseSetBudgetCommand, parseSetRecurringCommand, parseExportCommand,
} = require("./src/parsers");
const {
  formatCurrency, formatTransaksiList, formatRingkasanMessage, formatProgressMessage,
  formatCategoryBreakdown, formatExportReport, formatBudgetStatus,
  formatRecurringList, formatWeeklyReport, formatEditableTransaksiList,
  getHelpMessage,
} = require("./src/formatters");
const { convertToIDR } = require("./src/currency");

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
    if (transaksiHariIni.length === 0) {
      await sock.sendMessage(user, {
        text: `\uD83D\uDC4B Hai! Kamu belum mencatat pengeluaran hari ini (${dayjs().format("DD-MM-YYYY")}).

Ketik _+<kategori> <jumlah> <deskripsi>_ untuk mencatat.
Contoh:
+ngopi 15000 kopi susu`
      });
      userSudahDiingatkan.add(user);
    }
  }
}

async function broadcastWeeklyReport(sock) {
  const doc = await initDoc();
  const sheet = doc.sheetsByTitle["Income"];
  const rows = await sheet.getRows();
  const usersSent = new Set();

  for (const row of rows) {
    const user = row.User || row._rawData[0];
    const bulan = row.BulanAwal || row._rawData[1];
    if (bulan !== dayjs().format("YYYY-MM") || usersSent.has(user)) continue;

    const weekData = await getWeeklyData(user);
    const totalWeek = weekData.reduce((acc, d) => acc + d.total, 0);
    const totalMonth = await getTotalPengeluaranBulanIni(user, dayjs());

    const budgets = await getBudgets(user);
    const categorySpending = await getCategorySpending(user, dayjs());
    const spendingMap = {};
    categorySpending.forEach((c) => { spendingMap[c.kategori] = c.total; });

    const budgetAlerts = [];
    for (const b of budgets) {
      const kat = (b.Kategori || b._rawData?.[1] || "").toLowerCase();
      const max = parseFloat(b.MaxBulanan || b._rawData?.[2] || 0);
      const spent = spendingMap[kat] || 0;
      const pct = max > 0 ? Math.round((spent / max) * 100) : 0;
      if (pct >= 80) {
        budgetAlerts.push({ kategori: kat, pct, spent, limit: max });
      }
    }

    const bulanStr = dayjs().format("MMMM YYYY");
    const message = formatWeeklyReport(bulanStr, weekData, totalWeek, totalMonth, budgetAlerts);
    await sock.sendMessage(user, { text: message });
    usersSent.add(user);
  }
}

async function broadcastMonthlyReport(sock) {
  const doc = await initDoc();
  const sheet = doc.sheetsByTitle["Income"];
  const rows = await sheet.getRows();
  const usersSent = new Set();

  const targetBulan = dayjs().subtract(1, "day").startOf("month"); // last day of prev month -> prev month

  for (const row of rows) {
    const user = row.User || row._rawData[0];
    const bulan = row.BulanAwal || row._rawData[1];
    if (bulan !== targetBulan.format("YYYY-MM") || usersSent.has(user)) continue;

    const incomeData = await getIncomeData(user, targetBulan);
    const transactions = await getMonthlyTransactions(user, targetBulan);
    const categoryData = await getCategorySpending(user, targetBulan);
    const totalPengeluaran = transactions.reduce(
      (acc, r) => acc + parseFloat(r.Nominal || r._rawData?.[4] || 0), 0
    );

    const bulanStr = targetBulan.format("MMMM YYYY");
    const message = formatExportReport(bulanStr, incomeData, categoryData, totalPengeluaran, transactions);
    await sock.sendMessage(user, { text: message });
    usersSent.add(user);
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
      console.log("\uD83D\uDCF1 Scan QR berikut untuk login:\n");
      qrcode.generate(qr, { small: true });
      console.log(qr);
    }

    if (connection === "close") {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
      console.log("\u2757 Connection closed. Reconnecting:", shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === "open") {
      console.log("\u2705 Connected to WhatsApp");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    const lowerText = text.toLowerCase().trim();

    try {
      // ===== HELP =====
      if (HELP_COMMANDS.includes(lowerText)) {
        await sock.sendMessage(sender, { text: getHelpMessage() });
      }

      // ===== RINGKASAN =====
      else if (lowerText.startsWith("ringkasan")) {
        const args = text.trim().split(" ");
        const today = dayjs();
        let allData = [];
        let header = "\uD83D\uDCC5 Ringkasan:";
        const incomeData = await getIncomeData(sender);
        const maxHarian = parseFloat(incomeData?.MaxHarian || incomeData?._rawData?.[4] || 0);

        if (args.length === 1) {
          allData = await laporanHariIni(sender, today.format("YYYY-MM-DD"));
          header = `\uD83D\uDCC5 Ringkasan: Hari ini (${today.format("DD/MM/YYYY")})`;
        } else if (/^\d+$/.test(args[1])) {
          const daysBack = parseInt(args[1]);
          if (daysBack < 0 || daysBack > 360) {
            await sock.sendMessage(sender, { text: "\u2757 Rentang hari harus antara 0 sampai 360." });
            return;
          }
          for (let i = 0; i <= daysBack; i++) {
            const tanggal = today.subtract(i, "day").format("YYYY-MM-DD");
            const data = await laporanHariIni(sender, tanggal);
            allData.push(...data);
          }
          header = `\uD83D\uDCC5 Ringkasan: ${daysBack} hari terakhir`;
        } else {
          const parsed = parseDateInput(args[1], today);
          if (parsed) {
            allData = await laporanHariIni(sender, parsed.format("YYYY-MM-DD"));
            header = `\uD83D\uDCC5 Ringkasan: ${parsed.format("DD/MM/YYYY")}`;
          } else {
            await sock.sendMessage(sender, { text: "\u2757 Format tanggal tidak dikenali. Contoh: 05-06-2024, 05-06, atau 05/06/24." });
            return;
          }
        }

        const message = formatRingkasanMessage(header, allData, maxHarian);
        await sock.sendMessage(sender, { text: message });
      }

      // ===== HAPUS PENGELUARAN =====
      else if (lowerText.startsWith("hapus pengeluaran")) {
        const parts = text.trim().split(" ");
        let tanggal = parts.length >= 3 ? parts.slice(2).join(" ") : null;

        if (tanggal) {
          const parsed = parseDateInput(tanggal);
          if (!parsed) {
            await sock.sendMessage(sender, { text: "\u2757 Format salah. Contoh: hapus pengeluaran 05-07-2024" });
            return;
          }
          const data = await laporanHariIni(sender, parsed.format("YYYY-MM-DD"));
          if (data.length === 0) {
            await sock.sendMessage(sender, { text: `\u26A0\uFE0F Tidak ada pengeluaran di tanggal ${parsed.format("DD-MM-YYYY")}.` });
            return;
          }
          const list = formatTransaksiList(data);
          await sock.sendMessage(sender, {
            text: `\uD83D\uDDD1\uFE0F *Daftar Pengeluaran Tanggal ${parsed.format("DD-MM-YYYY")}:*\n\n${list}\n\n\u27A1\uFE0F *Balas pesan ini* dengan nomor transaksi untuk menghapus.`
          });
        } else {
          const data = await laporanHariIni(sender);
          if (data.length === 0) {
            await sock.sendMessage(sender, { text: "\u26A0\uFE0F Tidak ada pengeluaran hari ini." });
            return;
          }
          const list = formatTransaksiList(data);
          await sock.sendMessage(sender, {
            text: `\uD83D\uDDD1\uFE0F *Daftar Pengeluaran Hari Ini:*\n\n${list}\n\n\u27A1\uFE0F *Balas pesan ini* dengan nomor transaksi untuk menghapus.`
          });
        }
      }

      // ===== EDIT PENGELUARAN =====
      else if (lowerText.startsWith("edit pengeluaran")) {
        const parts = text.trim().split(" ");
        let tanggal = parts.length >= 3 ? parts.slice(2).join(" ") : null;

        let data;
        let dateLabel;
        if (tanggal) {
          const parsed = parseDateInput(tanggal);
          if (!parsed) {
            await sock.sendMessage(sender, { text: "\u2757 Format salah. Contoh: edit pengeluaran 05-07-2024" });
            return;
          }
          data = await laporanHariIni(sender, parsed.format("YYYY-MM-DD"));
          dateLabel = `Tanggal ${parsed.format("DD-MM-YYYY")}`;
        } else {
          data = await laporanHariIni(sender);
          dateLabel = "Hari Ini";
        }

        if (data.length === 0) {
          await sock.sendMessage(sender, { text: "\u26A0\uFE0F Tidak ada pengeluaran." });
          return;
        }

        const list = formatEditableTransaksiList(data);
        await sock.sendMessage(sender, {
          text: `\u270F\uFE0F *Edit Pengeluaran ${dateLabel}:*\n\n${list}\n\n\u27A1\uFE0F *Balas pesan ini* dengan format:\n_<nomor> <kategori/nominal/deskripsi> <nilai baru>_\nContoh: _2 nominal 20000_`
        });
      }

      // ===== QUOTED MESSAGE REPLY (DELETE / EDIT) =====
      else if (msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quoted = msg.message.extendedTextMessage.contextInfo.quotedMessage;
        let quotedText = quoted.conversation || quoted.extendedTextMessage?.text || "";

        // Handle DELETE reply
        if (/Daftar Pengeluaran (Hari Ini|Tanggal )/i.test(quotedText)) {
          const nomor = parseInt(text.trim());
          if (isNaN(nomor)) {
            await sock.sendMessage(sender, { text: "\u2757 Format tidak valid. Contoh: 2" });
            return;
          }

          const tanggalInput = extractDateFromQuotedText(quotedText);
          const data = await laporanHariIni(sender, tanggalInput);
          const transaksi = data[nomor - 1];

          if (!transaksi) {
            await sock.sendMessage(sender, { text: `\u2757 Transaksi nomor ${nomor} tidak ditemukan.` });
            return;
          }

          const success = await hapusTransaksiRow(transaksi);
          if (success) {
            const kategori = transaksi.Kategori || transaksi._rawData?.[3] || "-";
            const nominal = transaksi.Nominal || transaksi._rawData?.[4] || 0;
            const deskripsi = transaksi.Deskripsi || transaksi._rawData?.[5] || "-";
            await sock.sendMessage(sender, {
              text: `\u2705 Transaksi berhasil dihapus:\n${kategori} - Rp${nominal} (${deskripsi})`
            });
          } else {
            await sock.sendMessage(sender, { text: "\u2757 Gagal menghapus transaksi." });
          }
          return;
        }

        // Handle EDIT reply
        if (/Edit Pengeluaran (Hari Ini|Tanggal )/i.test(quotedText)) {
          const editParts = text.trim().split(/\s+/);
          if (editParts.length < 3) {
            await sock.sendMessage(sender, { text: "\u2757 Format: _<nomor> <kategori/nominal/deskripsi> <nilai baru>_\nContoh: _2 nominal 20000_" });
            return;
          }

          const nomor = parseInt(editParts[0]);
          const field = editParts[1].toLowerCase();
          const newValue = editParts.slice(2).join(" ");

          if (isNaN(nomor) || !["kategori", "nominal", "deskripsi"].includes(field)) {
            await sock.sendMessage(sender, { text: "\u2757 Format: _<nomor> <kategori/nominal/deskripsi> <nilai baru>_" });
            return;
          }

          if (field === "nominal") {
            const check = validateNominal(newValue);
            if (!check.valid) {
              await sock.sendMessage(sender, { text: `\u2757 ${check.error}` });
              return;
            }
          }

          const tanggalInput = extractDateFromQuotedText(quotedText);
          const data = await laporanHariIni(sender, tanggalInput);
          const transaksi = data[nomor - 1];

          if (!transaksi) {
            await sock.sendMessage(sender, { text: `\u2757 Transaksi nomor ${nomor} tidak ditemukan.` });
            return;
          }

          const success = await editTransaksiRow(transaksi, field, field === "nominal" ? parseFloat(newValue) : newValue);
          if (success) {
            await sock.sendMessage(sender, {
              text: `\u2705 Transaksi #${nomor} berhasil diubah.\n${field}: ${newValue}`
            });
          } else {
            await sock.sendMessage(sender, { text: "\u2757 Gagal mengedit transaksi." });
          }
          return;
        }
      }

      // ===== SET INCOME =====
      else if (lowerText.startsWith("set income")) {
        const parsed = parseSetIncomeCommand(text);
        if (!parsed) {
          await sock.sendMessage(sender, { text: "\u2757 Format salah.\nContoh: set income 5000000 tabungan 1000000" });
          return;
        }

        const { totalIncome, targetTabungan } = parsed;
        const incomeCheck = validateNominal(totalIncome);
        if (!incomeCheck.valid) {
          await sock.sendMessage(sender, { text: `\u2757 Income tidak valid: ${incomeCheck.error}` });
          return;
        }
        const tabunganCheck = validateNominal(targetTabungan);
        if (!tabunganCheck.valid) {
          await sock.sendMessage(sender, { text: `\u2757 Target tabungan tidak valid: ${tabunganCheck.error}` });
          return;
        }
        if (targetTabungan >= totalIncome) {
          await sock.sendMessage(sender, { text: "\u2757 Target tabungan harus lebih kecil dari total income." });
          return;
        }

        await setIncome(sender, totalIncome, targetTabungan, (m) => sock.sendMessage(sender, { text: m }));
      }

      // ===== PROGRESS TABUNGAN =====
      else if (lowerText.startsWith("progress tabungan")) {
        const targetBulan = parseProgressMonth(text);
        const incomeData = await getIncomeData(sender, targetBulan);

        if (!incomeData) {
          await sock.sendMessage(sender, { text: `\u2757 Belum ada data income untuk ${targetBulan.format("MMMM YYYY")}.` });
          return;
        }

        const income = parseFloat(incomeData.IncomeBulan || incomeData._rawData?.[2] || 0);
        const target = parseFloat(incomeData.TargetTabungan || incomeData._rawData?.[3] || 0);
        const totalPengeluaran = await getTotalPengeluaranBulanIni(sender, targetBulan);
        const bulan = targetBulan.format("MMMM YYYY");

        await sock.sendMessage(sender, { text: formatProgressMessage(bulan, income, target, totalPengeluaran) });
      }

      // ===== ADD EXPENSE (+ command) with multi-currency =====
      else if (text.startsWith("+")) {
        const parsedLines = parseAddExpenseLinesWithCurrency(text);
        const hasil = [];

        for (const entry of parsedLines) {
          if (entry.error) {
            hasil.push(`\u2757 ${entry.error}`);
            continue;
          }

          let { kategori, nominal, deskripsi, currency } = entry;

          // Multi-currency conversion
          let currencyNote = "";
          if (currency) {
            const conversion = await convertToIDR(nominal, currency);
            if (!conversion) {
              hasil.push(`\u2757 [${kategori}] Mata uang ${currency} tidak didukung.`);
              continue;
            }
            currencyNote = ` (${nominal} ${currency} x ${formatCurrency(conversion.rate)})`;
            deskripsi = deskripsi === "-" ? `${currency} ${nominal}` : `${deskripsi} [${currency} ${nominal}]`;
            nominal = conversion.amountIDR;
          }

          const nominalCheck = validateNominal(nominal);
          if (!nominalCheck.valid) {
            hasil.push(`\u2757 [${kategori}] ${nominalCheck.error}`);
            continue;
          }

          const incomeData = await getIncomeData(sender);
          if (!incomeData) {
            await sock.sendMessage(sender, {
              text: "\u2757 Belum ada data income bulan ini. Gunakan perintah: `set income <jumlah> tabungan <target>`"
            });
            return;
          }

          // Budget alert check
          const budgetAlert = await checkBudgetAlert(sender, kategori, nominal);
          if (budgetAlert) {
            if (budgetAlert.exceeded) {
              hasil.push(`\uD83D\uDD34 [${kategori}] Budget bulanan terlampaui! ${formatCurrency(budgetAlert.spent)}/${formatCurrency(budgetAlert.limit)}`);
            } else if (budgetAlert.warning) {
              hasil.push(`\uD83D\uDFE1 [${kategori}] Mendekati batas budget: ${formatCurrency(budgetAlert.spent)}/${formatCurrency(budgetAlert.limit)}`);
            }
          }

          // Daily limit check
          const maxHarian = parseFloat(incomeData.MaxHarian || incomeData._rawData?.[4] || 0);
          const transaksiHariIni = await laporanHariIni(sender);
          const totalHariIni = transaksiHariIni.reduce((acc, r) => acc + parseFloat(r.Nominal || r._rawData?.[4] || 0), 0);
          const totalSetelah = totalHariIni + nominal;

          if (totalSetelah > maxHarian) {
            hasil.push(`\u26A0\uFE0F [${kategori}] Pengeluaran melebihi limit harian!\nLimit: Rp${maxHarian}\nHari ini: Rp${totalHariIni}\nAkan dicatat: Rp${nominal}`);
          }

          await appendTransaksi(sender, kategori, nominal, deskripsi);
          hasil.push(`\u2714 Pengeluaran dicatat:\n\u2705 ${kategori} - ${formatCurrency(nominal)} (${deskripsi})${currencyNote}`);
        }

        await sock.sendMessage(sender, { text: hasil.join("\n\n") });
      }

      // ===== ADD INCOME =====
      else if (lowerText.startsWith("add income")) {
        const incomeData = await getIncomeData(sender);
        if (!incomeData) {
          await sock.sendMessage(sender, {
            text: "\u2757 Belum ada data income bulan ini. Gunakan perintah: `set income <jumlah> tabungan <target>`"
          });
          return;
        }
        const args = text.split(" ");
        if (args.length < 3 || isNaN(args[2])) {
          await sock.sendMessage(sender, { text: "\u274C Format salah. Gunakan: *add income <jumlah>*\nContoh: add income 50000" });
          return;
        }

        const jumlah = parseInt(args[2]);
        const jumlahCheck = validateNominal(jumlah);
        if (!jumlahCheck.valid) {
          await sock.sendMessage(sender, { text: `\u2757 Jumlah tidak valid: ${jumlahCheck.error}` });
          return;
        }

        try {
          await tambahIncome(sender, jumlah, (m) => sock.sendMessage(sender, { text: m }));
        } catch (e) {
          await sock.sendMessage(sender, { text: `\u274C ${e.message}` });
        }
      }

      // ===== SET BUDGET =====
      else if (lowerText.startsWith("set budget")) {
        const parsed = parseSetBudgetCommand(text);
        if (!parsed) {
          await sock.sendMessage(sender, { text: "\u2757 Format salah.\nContoh: set budget ngopi 500000" });
          return;
        }

        const nomCheck = validateNominal(parsed.maxBulanan);
        if (!nomCheck.valid) {
          await sock.sendMessage(sender, { text: `\u2757 ${nomCheck.error}` });
          return;
        }

        await setBudget(sender, parsed.kategori, parsed.maxBulanan);
        await sock.sendMessage(sender, {
          text: `\u2705 Budget untuk *${parsed.kategori}* di-set: ${formatCurrency(parsed.maxBulanan)}/bulan`
        });
      }

      // ===== LIST BUDGET =====
      else if (lowerText === "list budget") {
        const budgets = await getBudgets(sender);
        const categorySpending = await getCategorySpending(sender, dayjs());
        const spendingMap = {};
        categorySpending.forEach((c) => { spendingMap[c.kategori] = c.total; });

        const message = formatBudgetStatus(budgets, spendingMap);
        await sock.sendMessage(sender, {
          text: `\uD83D\uDCC8 *Status Budget Bulan Ini:*\n\n${message}`
        });
      }

      // ===== HAPUS BUDGET =====
      else if (lowerText.startsWith("hapus budget")) {
        const kategori = text.trim().split(" ").slice(2).join(" ").toLowerCase();
        if (!kategori) {
          await sock.sendMessage(sender, { text: "\u2757 Format: hapus budget <kategori>" });
          return;
        }

        const success = await deleteBudget(sender, kategori);
        if (success) {
          await sock.sendMessage(sender, { text: `\u2705 Budget untuk *${kategori}* berhasil dihapus.` });
        } else {
          await sock.sendMessage(sender, { text: `\u2757 Budget untuk *${kategori}* tidak ditemukan.` });
        }
      }

      // ===== SET RECURRING =====
      else if (lowerText.startsWith("set recurring")) {
        const parsed = parseSetRecurringCommand(text);
        if (!parsed) {
          await sock.sendMessage(sender, { text: "\u2757 Format salah.\nContoh: set recurring listrik 500000 token PLN" });
          return;
        }

        const nomCheck = validateNominal(parsed.nominal);
        if (!nomCheck.valid) {
          await sock.sendMessage(sender, { text: `\u2757 ${nomCheck.error}` });
          return;
        }

        await setRecurring(sender, parsed.kategori, parsed.nominal, parsed.deskripsi);
        await sock.sendMessage(sender, {
          text: `\u2705 Pengeluaran rutin di-set:\n\uD83D\uDD01 ${parsed.kategori} - ${formatCurrency(parsed.nominal)} (${parsed.deskripsi})\n\nAkan otomatis dicatat setiap tanggal 1.`
        });
      }

      // ===== LIST RECURRING =====
      else if (lowerText === "list recurring") {
        const items = await getRecurringExpenses(sender);
        const list = formatRecurringList(items);
        await sock.sendMessage(sender, {
          text: `\uD83D\uDD01 *Pengeluaran Rutin:*\n\n${list}`
        });
      }

      // ===== HAPUS RECURRING =====
      else if (lowerText.startsWith("hapus recurring")) {
        const nomor = parseInt(text.trim().split(" ").pop());
        if (isNaN(nomor) || nomor < 1) {
          await sock.sendMessage(sender, { text: "\u2757 Format: hapus recurring <nomor>\nLihat nomor dengan: list recurring" });
          return;
        }

        const success = await deleteRecurring(sender, nomor - 1);
        if (success) {
          await sock.sendMessage(sender, { text: `\u2705 Pengeluaran rutin #${nomor} berhasil dihapus.` });
        } else {
          await sock.sendMessage(sender, { text: `\u2757 Pengeluaran rutin #${nomor} tidak ditemukan.` });
        }
      }

      // ===== BREAKDOWN KATEGORI =====
      else if (lowerText.startsWith("breakdown")) {
        const parts = text.toLowerCase().trim().split(" ");
        let targetBulan = dayjs().startOf("month");

        if (parts.length >= 2 && BULAN_MAP[parts[1]] !== undefined) {
          targetBulan = dayjs().month(BULAN_MAP[parts[1]]).startOf("month");
        }

        const categoryData = await getCategorySpending(sender, targetBulan);
        const totalAll = categoryData.reduce((acc, c) => acc + c.total, 0);
        const bulanStr = targetBulan.format("MMMM YYYY");

        const chart = formatCategoryBreakdown(categoryData, totalAll);
        await sock.sendMessage(sender, {
          text: `\uD83D\uDCCA *Breakdown Pengeluaran ${bulanStr}:*\n\n${chart}\n\n\uD83D\uDCB0 *Total: ${formatCurrency(totalAll)}*`
        });
      }

      // ===== EXPORT LAPORAN =====
      else if (lowerText.startsWith("export")) {
        const targetBulan = parseExportCommand(text);
        const bulanStr = targetBulan.format("MMMM YYYY");

        const incomeData = await getIncomeData(sender, targetBulan);
        const transactions = await getMonthlyTransactions(sender, targetBulan);
        const categoryData = await getCategorySpending(sender, targetBulan);
        const totalPengeluaran = transactions.reduce(
          (acc, r) => acc + parseFloat(r.Nominal || r._rawData?.[4] || 0), 0
        );

        const report = formatExportReport(bulanStr, incomeData, categoryData, totalPengeluaran, transactions);
        await sock.sendMessage(sender, { text: report });
      }

      // ===== PING =====
      else if (lowerText === "!ping") {
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
          text: `\uD83C\uDFD3 *Pong!*\nBot aktif dan responsif.

    \uD83D\uDD52 Waktu Server: ${waktu}
    \uD83C\uDF10 IP Lokal: ${ipLocal}
    \uD83C\uDF0D IP Publik: ${ipPublic}
    \uD83D\uDCF6 Ping: ${latency} ms`
        });
      }

    } catch (error) {
      console.error("\u274C Error handling message:", error);
      await sock.sendMessage(sender, { text: "\u2757 Terjadi kesalahan, coba lagi nanti." });
    }
  });

  // Daily reminder at 3 PM
  const cronSchedule = process.env.REMINDER_CRON || '0 0 15 * * *';
  schedule.scheduleJob(cronSchedule, async () => {
    console.log("\uD83D\uDD14 Menjalankan broadcast reminder pengeluaran...");
    await broadcastReminderPengeluaran(sock);
  });

  // Weekly report every Sunday at 8 PM
  const weeklyCron = process.env.WEEKLY_REPORT_CRON || '0 0 20 * * 0';
  schedule.scheduleJob(weeklyCron, async () => {
    console.log("\uD83D\uDCC5 Menjalankan broadcast laporan mingguan...");
    await broadcastWeeklyReport(sock);
  });

  // Monthly report on 1st of each month at 9 AM
  const monthlyCron = process.env.MONTHLY_REPORT_CRON || '0 0 9 1 * *';
  schedule.scheduleJob(monthlyCron, async () => {
    console.log("\uD83D\uDCCB Menjalankan broadcast laporan bulanan...");
    await broadcastMonthlyReport(sock);
  });

  // Process recurring expenses on 1st of each month at 1 AM
  const recurringCron = process.env.RECURRING_CRON || '0 0 1 1 * *';
  schedule.scheduleJob(recurringCron, async () => {
    console.log("\uD83D\uDD01 Memproses pengeluaran rutin...");
    const processed = await processRecurringExpenses();
    console.log(`\u2705 ${processed.length} pengeluaran rutin dicatat.`);
  });
}

startBot();
