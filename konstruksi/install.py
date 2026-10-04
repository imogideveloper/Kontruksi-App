import frappe

# Data awal master Jenis Project; dipakai saat install app dan oleh patch migrate.
JENIS_PROJECT_DEFAULT = (
	"Gedung",
	"Jalan & Jembatan",
	"Sumber Daya Air",
	"Mekanikal & Elektrikal",
	"Lainnya",
)

# Data awal section Dokumen Tender: (nama, subjudul, tidak dikunci saat penawaran diajukan).
KATEGORI_DOKUMEN_DEFAULT = (
	("Dokumen Pemilihan", "dari pemberi kerja", 0),
	("Administrasi", "dokumen penawaran", 0),
	("Teknis", "dokumen penawaran", 0),
	("Harga", "dokumen penawaran", 0),
	("Hasil", "setelah pengumuman", 1),
)

# Template dokumen awal tiap Jenis Project: (section, nama dokumen, wajib, keterangan).
TEMPLATE_DOKUMEN_DEFAULT = (
	("Dokumen Pemilihan", "Dokumen pemilihan / RKS & gambar", 1, "Syarat, spesifikasi teknis, gambar, dan daftar kuantitas dari pemberi kerja."),
	("Dokumen Pemilihan", "BA penjelasan (aanwijzing)", 0, "Berita acara rapat penjelasan & tanya jawab."),
	("Dokumen Pemilihan", "Adendum dokumen pemilihan", 0, "Bila ada perubahan dokumen setelah rapat penjelasan."),
	("Administrasi", "Surat penawaran", 1, "Ditandatangani direktur, mencantumkan harga & masa berlaku penawaran."),
	("Administrasi", "Izin usaha (NIB / SBU)", 1, "Sesuai subklasifikasi & kualifikasi yang diminta."),
	("Administrasi", "Jaminan penawaran", 0, "Bila disyaratkan dokumen pemilihan."),
	("Teknis", "Metode pelaksanaan", 1, "Urutan & cara kerja tiap pekerjaan utama."),
	("Teknis", "Jadwal pelaksanaan / kurva S", 1, "Tidak melebihi masa pelaksanaan yang diminta."),
	("Teknis", "Daftar personel manajerial", 1, "Beserta SKK / sertifikat kompetensi."),
	("Teknis", "Daftar peralatan utama", 1, "Bukti kepemilikan / sewa."),
	("Teknis", "Rencana Keselamatan Konstruksi (RKK)", 1, "Identifikasi bahaya & pengendaliannya."),
	("Harga", "RAB / daftar kuantitas & harga bertanda tangan", 1, "Unduh dari menu RAB Penawaran, tanda tangani, lalu unggah."),
	("Harga", "Analisa harga satuan", 0, "Bila diminta / untuk klarifikasi kewajaran harga."),
	("Hasil", "Pengumuman / BA hasil pemilihan", 0, "Dasar mencatat menang atau kalah."),
	("Hasil", "SPPBJ / surat penunjukan pemenang", 0, "Bila menang, dasar penandatanganan kontrak."),
)


# Tarif PPh Final jasa konstruksi (PP 9/2022, berlaku 21 Feb 2022): (jenis jasa, kualifikasi, tarif %).
TARIF_PPH_FINAL_DEFAULT = (
	("Pekerjaan Konstruksi", "Kecil / Perseorangan", 1.75),
	("Pekerjaan Konstruksi", "Menengah / Besar", 2.65),
	("Pekerjaan Konstruksi", "Tidak Memiliki Sertifikat", 4),
	("Pekerjaan Konstruksi Terintegrasi", "Bersertifikat", 2.65),
	("Pekerjaan Konstruksi Terintegrasi", "Tidak Memiliki Sertifikat", 4),
	("Konsultansi Konstruksi", "Bersertifikat", 3.5),
	("Konsultansi Konstruksi", "Tidak Memiliki Sertifikat", 6),
)
TARIF_PPH_FINAL_BERLAKU = "2022-02-21"


# Data awal Penerbit Jaminan (bank & asuransi penerbit jaminan konstruksi yang umum); tambah / nonaktifkan dari menu.
PENERBIT_JAMINAN_DEFAULT = (
	("PT Bank Mandiri (Persero) Tbk", "Bank"),
	("PT Bank Rakyat Indonesia (Persero) Tbk", "Bank"),
	("PT Bank Negara Indonesia (Persero) Tbk", "Bank"),
	("PT Bank Tabungan Negara (Persero) Tbk", "Bank"),
	("PT Bank Central Asia Tbk", "Bank"),
	("PT Bank Pembangunan Daerah Jawa Barat dan Banten Tbk (bank bjb)", "Bank"),
	("PT Jaminan Kredit Indonesia (Jamkrindo)", "Asuransi"),
	("PT Asuransi Kredit Indonesia (Askrindo)", "Asuransi"),
)


# Field konstruksi di Project bawaan ERPNext (Project Master); diisi dari Kontrak Project (project_konstruksi.py).
CUSTOM_FIELD_PROJECT = [
	{"fieldname": "konstruksi_section", "fieldtype": "Section Break", "label": "Data Kontrak", "insert_after": "department"},
	{"fieldname": "kontrak_project", "fieldtype": "Link", "label": "Kontrak Project", "options": "Kontrak Project",
		"read_only": 1, "unique": 1, "insert_after": "konstruksi_section"},
	{"fieldname": "tender", "fieldtype": "Link", "label": "Tender", "options": "Tender", "read_only": 1, "insert_after": "kontrak_project"},
	{"fieldname": "jenis_project", "fieldtype": "Link", "label": "Jenis Project", "options": "Jenis Project", "read_only": 1,
		"in_standard_filter": 1, "insert_after": "tender"},
	{"fieldname": "lokasi", "fieldtype": "Data", "label": "Lokasi Project", "read_only": 1, "insert_after": "jenis_project"},
	{"fieldname": "status_proyek", "fieldtype": "Select", "label": "Status Proyek", "default": "Perencanaan",
		"options": "Perencanaan\nBerjalan\nPemeliharaan\nSelesai\nDitunda\nBatal", "in_standard_filter": 1,
		"depends_on": "eval:doc.kontrak_project", "insert_after": "lokasi",
		"description": "Otomatis dari tanggal kontrak; pilih Ditunda / Batal untuk mengubah manual."},
	{"fieldname": "konstruksi_column", "fieldtype": "Column Break", "insert_after": "status_proyek"},
	{"fieldname": "nilai_kontrak", "fieldtype": "Currency", "label": "Nilai Kontrak (termasuk PPN)", "options": "IDR",
		"read_only": 1, "insert_after": "konstruksi_column", "description": "Nilai terkini, termasuk addendum yang disetujui."},
	{"fieldname": "nilai_sebelum_ppn", "fieldtype": "Currency", "label": "Nilai Sebelum PPN", "options": "IDR", "read_only": 1,
		"insert_after": "nilai_kontrak"},
	{"fieldname": "tarif_ppn", "fieldtype": "Percent", "label": "Tarif PPN (%)", "read_only": 1, "insert_after": "nilai_sebelum_ppn"},
	{"fieldname": "project_manager", "fieldtype": "Link", "label": "Project Manager", "options": "User", "read_only": 1,
		"in_standard_filter": 1, "insert_after": "tarif_ppn"},
	{"fieldname": "akhir_pemeliharaan", "fieldtype": "Date", "label": "Akhir Pemeliharaan", "read_only": 1, "insert_after": "project_manager"},
]


def buat_custom_field_project():
	from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

	create_custom_fields({"Project": CUSTOM_FIELD_PROJECT}, update=True)


def after_install():
	buat_custom_field_project()
	buat_jenis_project_default()
	buat_template_dokumen_default()
	buat_tarif_pph_final_default()
	buat_penerbit_jaminan_default()


def buat_penerbit_jaminan_default():
	"""Isi master Penerbit Jaminan bila masih kosong."""
	if frappe.db.count("Penerbit Jaminan"):
		return
	for nama, jenis in PENERBIT_JAMINAN_DEFAULT:
		frappe.get_doc({"doctype": "Penerbit Jaminan", "nama_penerbit": nama, "jenis": jenis}).insert(ignore_permissions=True)


def buat_tarif_pph_final_default():
	"""Isi master Tarif PPh Final bila masih kosong."""
	if frappe.db.count("Tarif PPh Final"):
		return
	for jenis_jasa, kualifikasi, tarif in TARIF_PPH_FINAL_DEFAULT:
		frappe.get_doc(
			{
				"doctype": "Tarif PPh Final",
				"jenis_jasa": jenis_jasa,
				"kualifikasi": kualifikasi,
				"tarif": tarif,
				"berlaku_mulai": TARIF_PPH_FINAL_BERLAKU,
				"dasar_hukum": "PP 9 Tahun 2022",
			}
		).insert(ignore_permissions=True)


def buat_jenis_project_default():
	for jenis in JENIS_PROJECT_DEFAULT:
		if not frappe.db.exists("Jenis Project", jenis):
			frappe.get_doc({"doctype": "Jenis Project", "jenis_project": jenis}).insert(ignore_permissions=True)


def buat_template_dokumen_default():
	"""Isi section Dokumen Tender dan template dokumen tiap Jenis Project yang masih kosong."""
	for urutan, (kategori, subjudul, bebas_kunci) in enumerate(KATEGORI_DOKUMEN_DEFAULT, start=1):
		if not frappe.db.exists("Kategori Dokumen Tender", kategori):
			frappe.get_doc(
				{
					"doctype": "Kategori Dokumen Tender",
					"kategori": kategori,
					"subjudul": subjudul,
					"urutan": urutan * 10,
					"bebas_kunci": bebas_kunci,
				}
			).insert(ignore_permissions=True)

	for jenis in frappe.get_all("Jenis Project", pluck="name"):
		doc = frappe.get_doc("Jenis Project", jenis)
		if doc.dokumen:
			continue
		for kategori, nama, wajib, keterangan in TEMPLATE_DOKUMEN_DEFAULT:
			doc.append("dokumen", {"kategori": kategori, "nama_dokumen": nama, "wajib": wajib, "keterangan": keterangan})
		doc.save(ignore_permissions=True)
