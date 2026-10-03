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


def after_install():
	buat_jenis_project_default()
	buat_template_dokumen_default()


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
