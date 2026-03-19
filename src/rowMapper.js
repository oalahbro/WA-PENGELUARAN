function mapTransaksiRow(row) {
  return {
    ID: row.ID || row._rawData?.[0],
    Timestamp: row.Timestamp || row._rawData?.[1],
    User: row.User || row._rawData?.[2],
    Kategori: row.Kategori || row._rawData?.[3],
    Nominal: row.Nominal || row._rawData?.[4],
    Deskripsi: row.Deskripsi || row._rawData?.[5],
  };
}

function mapIncomeRow(row) {
  return {
    User: row.User || row._rawData?.[0],
    BulanAwal: row.BulanAwal || row._rawData?.[1],
    IncomeBulan: row.IncomeBulan || row._rawData?.[2],
    TargetTabungan: row.TargetTabungan || row._rawData?.[3],
    MaxHarian: row.MaxHarian || row._rawData?.[4],
  };
}

module.exports = { mapTransaksiRow, mapIncomeRow };
