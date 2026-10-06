"""Template RAB awal per Jenis Project: struktur pekerjaan umum (kelompok → item, dengan satuan, tanpa harga).

Kode WBS: angka tunggal = kelompok pekerjaan, "n.m" = item. Dipakai sebagai isi awal tabel Template RAB di master
Jenis Project (hanya bila tabelnya masih kosong) — selanjutnya bisa diubah sendiri di master."""

import frappe

PERSIAPAN = (
	"Pekerjaan Persiapan",
	[
		("Mobilisasi dan demobilisasi", "ls"),
		("Direksi keet dan gudang material", "ls"),
		("Pengukuran dan pemasangan bouwplank / patok", "ls"),
		("Papan nama proyek", "bh"),
		("Air dan listrik kerja", "ls"),
	],
)
SMKK = (
	"Sistem Manajemen Keselamatan Konstruksi (SMKK)",
	[
		("Penyiapan RKK (Rencana Keselamatan Konstruksi)", "ls"),
		("Sosialisasi, promosi, dan pelatihan K3", "ls"),
		("Alat pelindung kerja dan alat pelindung diri", "ls"),
		("Asuransi dan perizinan", "ls"),
		("Personel keselamatan konstruksi", "OB"),
		("Fasilitas sarana, prasarana, dan alat kesehatan", "ls"),
		("Rambu dan perlengkapan lalu lintas", "ls"),
	],
)
AKHIR = ("Pekerjaan Akhir", [("Pembersihan akhir dan serah terima", "ls")])

TEMPLATE = {
	"Gedung": [
		PERSIAPAN,
		SMKK,
		("Pekerjaan Tanah dan Pondasi", [
			("Galian tanah pondasi", "m3"), ("Urugan pasir bawah pondasi", "m3"), ("Pasangan pondasi batu kali", "m3"),
			("Pondasi footplat beton bertulang", "m3"), ("Urugan tanah kembali dipadatkan", "m3"),
		]),
		("Pekerjaan Struktur Beton", [
			("Beton sloof", "m3"), ("Beton kolom", "m3"), ("Beton balok", "m3"), ("Beton plat lantai", "m3"),
			("Beton tangga", "m3"), ("Pembesian", "kg"), ("Bekisting", "m2"),
		]),
		("Pekerjaan Dinding dan Plesteran", [("Pasangan dinding bata", "m2"), ("Plesteran", "m2"), ("Acian", "m2")]),
		("Pekerjaan Atap", [("Rangka atap baja ringan", "m2"), ("Penutup atap", "m2"), ("Lisplang", "m'"), ("Talang air", "m'")]),
		("Pekerjaan Kusen, Pintu, dan Jendela", [
			("Kusen aluminium", "m'"), ("Daun pintu", "unit"), ("Daun jendela kaca", "m2"), ("Kunci dan penggantung", "set"),
		]),
		("Pekerjaan Lantai dan Keramik", [("Lantai kerja", "m3"), ("Keramik lantai", "m2"), ("Keramik dinding KM/WC", "m2")]),
		("Pekerjaan Plafon", [("Rangka plafon hollow", "m2"), ("Penutup plafon gypsum", "m2"), ("List plafon", "m'")]),
		("Pekerjaan Pengecatan", [("Cat dinding interior", "m2"), ("Cat dinding eksterior", "m2"), ("Cat plafon", "m2")]),
		("Pekerjaan Sanitasi", [
			("Kloset", "bh"), ("Wastafel", "bh"), ("Instalasi air bersih", "ls"), ("Instalasi air kotor", "ls"), ("Septictank", "unit"),
		]),
		("Pekerjaan Instalasi Listrik", [("Panel listrik", "unit"), ("Titik lampu", "ttk"), ("Titik stop kontak", "ttk"), ("Armatur lampu", "bh")]),
		AKHIR,
	],
	"Jalan & Jembatan": [
		PERSIAPAN,
		SMKK,
		("Manajemen dan Keselamatan Lalu Lintas", [("Rambu dan perlengkapan lalu lintas sementara", "ls"), ("Petugas pengatur lalu lintas", "OB")]),
		("Pekerjaan Drainase", [
			("Galian untuk selokan dan saluran air", "m3"), ("Pasangan batu dengan mortar", "m3"), ("Gorong-gorong pipa beton", "m'"),
		]),
		("Pekerjaan Tanah", [
			("Galian biasa", "m3"), ("Timbunan biasa", "m3"), ("Timbunan pilihan", "m3"), ("Penyiapan badan jalan", "m2"),
		]),
		("Pelebaran Perkerasan dan Bahu Jalan", [("Lapis pondasi agregat kelas S", "m3")]),
		("Perkerasan Berbutir", [("Lapis pondasi agregat kelas A", "m3"), ("Lapis pondasi agregat kelas B", "m3")]),
		("Perkerasan Aspal", [
			("Lapis resap pengikat (prime coat)", "liter"), ("Lapis perekat (tack coat)", "liter"),
			("Laston lapis aus (AC-WC)", "ton"), ("Laston lapis antara (AC-BC)", "ton"),
		]),
		("Struktur Jembatan", [
			("Tiang pancang", "m'"), ("Beton abutment / pilar", "m3"), ("Baja tulangan", "kg"), ("Gelagar (girder)", "bh"),
			("Beton lantai jembatan", "m3"), ("Sandaran (railing) jembatan", "m'"),
		]),
		("Pekerjaan Pelengkap Jalan", [("Marka jalan termoplastik", "m2"), ("Rambu jalan", "bh"), ("Rel pengaman (guardrail)", "m'"), ("Patok kilometer", "bh")]),
		AKHIR,
	],
	"Sumber Daya Air": [
		PERSIAPAN,
		SMKK,
		("Pengeringan dan Pengalihan Air", [("Dewatering / pompa pengeringan", "ls"), ("Kisdam / tanggul sementara", "m3")]),
		("Pekerjaan Tanah", [("Galian tanah", "m3"), ("Timbunan tanah dipadatkan", "m3"), ("Pembuangan tanah hasil galian", "m3")]),
		("Pekerjaan Pasangan", [("Pasangan batu kali", "m3"), ("Plesteran", "m2"), ("Siaran", "m2")]),
		("Pekerjaan Beton Struktur Air", [("Lantai kerja", "m3"), ("Beton bertulang", "m3"), ("Bekisting", "m2"), ("Pembesian", "kg")]),
		("Pekerjaan Lapisan Kedap Air", [("Geomembran / waterproofing", "m2"), ("Water stop", "m'")]),
		("Pekerjaan Pintu Air dan Perpipaan", [("Pintu air", "unit"), ("Pipa", "m'"), ("Katup (valve)", "bh")]),
		("Pekerjaan Pelengkap", [("Tangga dan railing pengaman", "m'"), ("Papan duga muka air (peil schaal)", "bh")]),
		AKHIR,
	],
	"Interior & Renovasi": [
		("Pekerjaan Persiapan", [("Mobilisasi dan demobilisasi", "ls"), ("Proteksi area kerja", "ls"), ("Pengukuran", "ls")]),
		("Sistem Manajemen Keselamatan Konstruksi (SMKK)", [
			("Alat pelindung kerja dan alat pelindung diri", "ls"), ("Personel keselamatan konstruksi", "OB"),
		]),
		("Pekerjaan Pembongkaran", [
			("Bongkar dinding / partisi", "m2"), ("Bongkar lantai", "m2"), ("Bongkar plafon", "m2"), ("Buang puing", "m3"),
		]),
		("Pekerjaan Partisi dan Dinding", [("Partisi gypsum", "m2"), ("Partisi kaca", "m2"), ("Wall panel / cladding", "m2")]),
		("Pekerjaan Plafon", [("Rangka plafon", "m2"), ("Penutup plafon gypsum", "m2"), ("Drop ceiling", "m'")]),
		("Pekerjaan Lantai", [("Granit / homogeneous tile", "m2"), ("Vinyl / parket", "m2"), ("Plint", "m'")]),
		("Pekerjaan Furnitur dan Built-in", [("Kabinet", "m'"), ("Meja kerja", "unit"), ("Backdrop / feature wall", "m2")]),
		("Pekerjaan Pengecatan dan Finishing", [("Cat dinding", "m2"), ("Cat plafon", "m2"), ("Wallpaper", "m2")]),
		("Pekerjaan Listrik dan Pencahayaan", [("Panel listrik", "unit"), ("Titik lampu", "ttk"), ("Downlight", "bh"), ("Titik stop kontak", "ttk")]),
		("Pekerjaan Tata Udara", [("AC split", "unit"), ("Instalasi pipa AC", "m'")]),
		AKHIR,
	],
	"Mekanikal & Elektrikal": [
		PERSIAPAN,
		SMKK,
		("Panel dan Distribusi Listrik", [("Panel utama (LVMDP)", "unit"), ("Panel distribusi (SDP)", "unit"), ("Kabel feeder", "m'")]),
		("Instalasi Penerangan dan Stop Kontak", [("Titik lampu", "ttk"), ("Armatur lampu", "bh"), ("Titik stop kontak", "ttk")]),
		("Genset dan UPS", [("Genset", "unit"), ("ATS / AMF", "unit"), ("UPS", "unit")]),
		("Tata Udara", [("Unit AC", "unit"), ("Instalasi pipa refrigerant", "m'"), ("Ducting", "m2")]),
		("Plumbing", [("Pompa air", "unit"), ("Pipa air bersih", "m'"), ("Pipa air kotor", "m'"), ("Tangki air / roof tank", "unit")]),
		("Sistem Pemadam Kebakaran", [("Hydrant box", "unit"), ("Kepala sprinkler", "bh"), ("Pompa hydrant", "unit"), ("APAR", "bh")]),
		("Sistem Elektronik", [("Titik CCTV", "ttk"), ("Titik fire alarm", "ttk"), ("Titik jaringan data", "ttk")]),
		("Testing dan Commissioning", [("Testing dan commissioning sistem", "ls")]),
		AKHIR,
	],
	"Lainnya": [
		PERSIAPAN,
		SMKK,
		("Pekerjaan Utama", [("Pekerjaan utama (sesuaikan)", "ls")]),
		("Pekerjaan Pelengkap", [("Pekerjaan pelengkap (sesuaikan)", "ls")]),
		AKHIR,
	],
}


def baris_template(jenis):
	"""[{kode_wbs, uraian_pekerjaan, satuan}] dari TEMPLATE untuk satu jenis project."""
	baris = []
	for i, (kelompok, items) in enumerate(TEMPLATE.get(jenis) or [], 1):
		baris.append({"kode_wbs": str(i), "uraian_pekerjaan": kelompok, "satuan": ""})
		for j, (uraian, satuan) in enumerate(items, 1):
			baris.append({"kode_wbs": f"{i}.{j}", "uraian_pekerjaan": uraian, "satuan": satuan})
	return baris


def isi_template_rab_default():
	"""Isi tabel Template RAB master Jenis Project yang masih kosong."""
	for jenis in TEMPLATE:
		if not frappe.db.exists("Jenis Project", jenis):
			continue
		doc = frappe.get_doc("Jenis Project", jenis)
		if doc.get("rab"):
			continue
		for row in baris_template(jenis):
			doc.append("rab", row)
		doc.save(ignore_permissions=True)
