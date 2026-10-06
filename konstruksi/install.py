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


# Tim Proyek: tab di Project, SKK di Employee (Data Personel), penanda Wajib SKK di Designation (Jabatan).
CUSTOM_FIELD_TIM = {
	"Project": [
		{"fieldname": "tim_tab", "fieldtype": "Tab Break", "label": "Tim Proyek", "insert_after": "actual_end_date",
			"depends_on": "eval:doc.kontrak_project"},
		{"fieldname": "tim_html", "fieldtype": "HTML", "insert_after": "tim_tab"},
	],
	"Employee": [
		{"fieldname": "skk_section", "fieldtype": "Section Break", "label": "SKK (Sertifikat Kompetensi Kerja)",
			# Tab Overview, di bawah section Company Details: setelah Grade (field HRMS yang juga disisipkan setelah
			# Branch); bila disisipkan setelah Branch, posisinya bentrok dengan Grade dan terlempar ke tab Address.
			"insert_after": "grade" if frappe.get_meta("Employee").has_field("grade") else "branch", "collapsible": 0},
		{"fieldname": "skk", "fieldtype": "Table", "label": "SKK", "options": "SKK Personel", "insert_after": "skk_section"},
		# Tab Salary: gaji bulanan untuk alokasi biaya personel ke proyek; terisi dari Gaji Standar jabatan bila kosong.
		{"fieldname": "gaji_bulanan", "fieldtype": "Currency", "label": "Gaji Bulanan", "insert_after": "ctc",
			"fetch_from": "designation.gaji_standar", "fetch_if_empty": 1,
			"description": "Dipakai untuk menghitung biaya personel per proyek (gaji × alokasi %)."},
	],
	"Designation": [
		{"fieldname": "wajib_skk", "fieldtype": "Check", "label": "Wajib SKK", "insert_after": "designation_name",
			"description": "Personel di jabatan ini harus punya SKK yang masih berlaku (diperingatkan di Tim Proyek)."},
		{"fieldname": "role_profile_bawaan", "fieldtype": "Link", "label": "Role Profile Bawaan", "options": "Role Profile",
			"insert_after": "wajib_skk",
			"description": "Hak akses sistem untuk akun login personel di jabatan ini (dipakai tombol Buat Akun Login di Data Personel)."},
		{"fieldname": "gaji_standar", "fieldtype": "Currency", "label": "Gaji Standar (per Bulan)", "insert_after": "role_profile_bawaan",
			"description": "Nilai awal Gaji Bulanan personel di jabatan ini (bisa diubah per orang di Data Personel)."},
	],
}

# Role Profile proyek: nama -> roles. Jabatan -> Role Profile bawaan.
ROLE_PROFILE_PROYEK = {
	"Manajer Proyek": ["Projects Manager", "Projects User", "Employee"],
	"Staf Proyek": ["Projects User", "Employee"],
}
ROLE_PROFILE_JABATAN = {
	"Project Manager": "Manajer Proyek",
	"Site Manager": "Manajer Proyek",
	"Site Engineer": "Staf Proyek",
	"Quantity Surveyor": "Staf Proyek",
	"HSE Officer": "Staf Proyek",
	"Project Admin": "Staf Proyek",
	"Logistik": "Staf Proyek",
	"Surveyor": "Staf Proyek",
	"Quality Control": "Staf Proyek",
}

# Jabatan proyek konstruksi: (nama, wajib SKK, uraian tugas). Jabatan yang sudah ada tidak diubah.
JABATAN_KONSTRUKSI = (
	("Project Manager", 1, "Memimpin proyek: jadwal, biaya, mutu, dan hubungan dengan pemberi kerja."),
	("Site Manager", 1, "Memimpin pelaksanaan di lapangan dan mengatur mandor & subkon."),
	("Site Engineer", 1, "Menyiapkan gambar kerja, metode, dan mengawasi teknis pekerjaan."),
	("Quantity Surveyor", 1, "Menghitung volume, progres, opname, dan tagihan."),
	("HSE Officer", 1, "Menerapkan K3 / SMKK di lapangan."),
	("Project Admin", 0, "Administrasi proyek: surat, laporan, dokumentasi."),
	("Logistik", 0, "Pengadaan & penerimaan material serta alat di lapangan."),
	("Surveyor", 0, "Pengukuran, marking, dan as-built."),
	("Quality Control", 0, "Pemeriksaan mutu material & pekerjaan, uji lab."),
)

# Gaji standar per bulan per jabatan (Rp). Hanya mengisi yang masih kosong.
GAJI_STANDAR_JABATAN = {
	"Project Manager": 25_000_000,
	"Site Manager": 18_000_000,
	"Site Engineer": 10_000_000,
	"Quantity Surveyor": 11_000_000,
	"HSE Officer": 9_000_000,
	"Project Admin": 6_500_000,
	"Logistik": 7_000_000,
	"Surveyor": 8_000_000,
	"Quality Control": 9_000_000,
}

# Template kebutuhan personel: (nama, jenis project, nilai minimal, [(jabatan, wajib)]).
TEMPLATE_KEBUTUHAN_DEFAULT = (
	("Standar", None, 0, [
		("Project Manager", 1), ("Site Manager", 1), ("Quantity Surveyor", 1), ("HSE Officer", 1), ("Project Admin", 1),
		("Site Engineer", 0), ("Logistik", 0), ("Surveyor", 0), ("Quality Control", 0),
	]),
	("Proyek ≥ Rp 10 M", None, 10_000_000_000, [("Site Engineer", 1), ("Quality Control", 1)]),
)


def buat_custom_field_project():
	from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

	create_custom_fields({"Project": CUSTOM_FIELD_PROJECT}, update=True)
	atur_project_erpnext()


def buat_tim_proyek_default():
	from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

	create_custom_fields(CUSTOM_FIELD_TIM, update=True)
	# Data Personel: keterangan bawaan "Provide Email Address registered in company" di Company Email tidak ditampilkan.
	from frappe.custom.doctype.property_setter.property_setter import make_property_setter

	make_property_setter("Employee", "company_email", "description", "", "Small Text", validate_fields_for_doctype=False)
	for nama, wajib_skk, tugas in JABATAN_KONSTRUKSI:
		if frappe.db.exists("Designation", nama):
			if not frappe.db.get_value("Designation", nama, "description"):
				frappe.db.set_value("Designation", nama, {"description": tugas, "wajib_skk": wajib_skk})
			continue
		frappe.get_doc(
			{"doctype": "Designation", "designation_name": nama, "description": tugas, "wajib_skk": wajib_skk}
		).insert(ignore_permissions=True)
	for nama, roles in ROLE_PROFILE_PROYEK.items():
		if not frappe.db.exists("Role Profile", nama):
			frappe.get_doc(
				{"doctype": "Role Profile", "role_profile": nama, "roles": [{"role": r} for r in roles if frappe.db.exists("Role", r)]}
			).insert(ignore_permissions=True)
	for jabatan, profile in ROLE_PROFILE_JABATAN.items():
		if frappe.db.exists("Designation", jabatan) and not frappe.db.get_value("Designation", jabatan, "role_profile_bawaan"):
			frappe.db.set_value("Designation", jabatan, "role_profile_bawaan", profile)
	for jabatan, gaji in GAJI_STANDAR_JABATAN.items():
		if frappe.db.exists("Designation", jabatan) and not frappe.db.get_value("Designation", jabatan, "gaji_standar"):
			frappe.db.set_value("Designation", jabatan, "gaji_standar", gaji)
	for nama, jenis, nilai, jabatan in TEMPLATE_KEBUTUHAN_DEFAULT:
		if frappe.db.exists("Template Kebutuhan Personel", nama):
			continue
		frappe.get_doc(
			{
				"doctype": "Template Kebutuhan Personel",
				"nama_template": nama,
				"jenis_project": jenis,
				"nilai_minimal": nilai,
				"jabatan": [{"jabatan": j, "wajib": w, "jumlah": 1} for j, w in jabatan],
			}
		).insert(ignore_permissions=True)


def atur_project_erpnext():
	"""Project Master: filter bawaan ERPNext yang tidak dipakai disembunyikan, list urut kode terbaru."""
	from frappe.custom.doctype.property_setter.property_setter import make_property_setter

	# Status bawaan dobel dengan Status Proyek; Project Type & Priority tidak dipakai di alur konstruksi.
	for fieldname in ("status", "project_type", "priority"):
		make_property_setter("Project", fieldname, "in_standard_filter", 0, "Check", validate_fields_for_doctype=False)
	make_property_setter("Project", None, "sort_field", "name", "Data", for_doctype=True, validate_fields_for_doctype=False)
	make_property_setter("Project", None, "sort_order", "DESC", "Data", for_doctype=True, validate_fields_for_doctype=False)


# Biaya personel proyek. Activity Type: (nama, tarif biaya per jam) untuk Timesheet; tarif contoh, sesuaikan.
ACTIVITY_TYPE_KONSTRUKSI = (
	("Manajemen Proyek", 150000),
	("Pengawasan Lapangan", 100000),
	("Engineering & Gambar Kerja", 90000),
	("Quantity Surveying", 85000),
	("K3 / HSE", 75000),
	("Pengukuran", 70000),
	("Pengendalian Mutu", 70000),
	("Logistik", 50000),
	("Administrasi Proyek", 45000),
)
# Activity Type bawaan saat mencatat jam dari tab Tim Proyek, per jabatan.
ACTIVITY_PER_JABATAN = {
	"Project Manager": "Manajemen Proyek",
	"Site Manager": "Pengawasan Lapangan",
	"Site Engineer": "Engineering & Gambar Kerja",
	"Quantity Surveyor": "Quantity Surveying",
	"HSE Officer": "K3 / HSE",
	"Surveyor": "Pengukuran",
	"Quality Control": "Pengendalian Mutu",
	"Logistik": "Logistik",
	"Project Admin": "Administrasi Proyek",
}
# Expense Claim Type: (nama, akun biaya tanpa singkatan company).
EXPENSE_CLAIM_TYPE_KONSTRUKSI = (
	("Transport Proyek", "Travel Expenses"),
	("Akomodasi Proyek", "Travel Expenses"),
	("Perjalanan Dinas", "Travel Expenses"),
	("Konsumsi Proyek", "Expense Claims"),
	("Komunikasi Proyek", "Expense Claims"),
	("Lain-lain Proyek", "Miscellaneous Expenses"),
)
AKUN_HUTANG_KLAIM = "Hutang Klaim Biaya Karyawan"
# Project: total dari Biaya Personel Bulanan (alokasi gaji) yang sudah submit.
CUSTOM_FIELD_BIAYA = {
	"Project": [
		{"fieldname": "total_biaya_personel", "fieldtype": "Currency", "label": "Total Biaya Personel (Gaji)", "options": "IDR",
			"read_only": 1, "no_copy": 1, "insert_after": "total_costing_amount"},
	],
}


def buat_biaya_personel_default():
	"""Activity Type (Timesheet), Expense Claim Type, dan akun hutang klaim biaya per company bila belum ada."""
	from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

	create_custom_fields(CUSTOM_FIELD_BIAYA, update=True)
	for nama, tarif in ACTIVITY_TYPE_KONSTRUKSI:
		if not frappe.db.exists("Activity Type", nama):
			frappe.get_doc({"doctype": "Activity Type", "activity_type": nama, "costing_rate": tarif, "billing_rate": 0}).insert(
				ignore_permissions=True
			)

	companies = frappe.get_all("Company", fields=["name", "abbr", "default_payable_account", "default_expense_claim_payable_account"])
	for nama, akun in EXPENSE_CLAIM_TYPE_KONSTRUKSI:
		if frappe.db.exists("Expense Claim Type", nama):
			continue
		accounts = [
			{"company": c.name, "default_account": f"{akun} - {c.abbr}"}
			for c in companies
			if frappe.db.exists("Account", f"{akun} - {c.abbr}")
		]
		frappe.get_doc({"doctype": "Expense Claim Type", "expense_type": nama, "accounts": accounts}).insert(ignore_permissions=True)

	# Tabel jam kerja Timesheet: kolom To Time ditampilkan (Hours terhitung otomatis dari From–To Time);
	# Is Billable (penagihan jam ke klien) disembunyikan dari tabel supaya muat.
	from frappe.custom.doctype.property_setter.property_setter import make_property_setter

	for fieldname, prop, nilai, tipe in (
		("to_time", "in_list_view", 1, "Check"),
		("to_time", "columns", 2, "Int"),
		("is_billable", "in_list_view", 0, "Check"),
	):
		make_property_setter("Timesheet Detail", fieldname, prop, nilai, tipe, validate_fields_for_doctype=False)

	atur_expense_claim()

	# Expense Claim butuh akun hutang (Payable) default di Company; dibuat di samping akun Creditors.
	for c in companies:
		if c.default_expense_claim_payable_account or not c.default_payable_account:
			continue
		akun = f"{AKUN_HUTANG_KLAIM} - {c.abbr}"
		if not frappe.db.exists("Account", akun):
			induk = frappe.db.get_value("Account", c.default_payable_account, "parent_account")
			frappe.get_doc(
				{
					"doctype": "Account",
					"account_name": AKUN_HUTANG_KLAIM,
					"parent_account": induk,
					"company": c.name,
					"account_type": "Payable",
					"root_type": "Liability",
				}
			).insert(ignore_permissions=True)
		frappe.db.set_value("Company", c.name, "default_expense_claim_payable_account", akun)


def atur_expense_claim():
	"""Expense Claim: Project dipindah ke tab utama (di bawah Department) supaya tidak terlewat — bawaannya di tab
	Accounting; filter Project & Approval Status di atas list."""
	import json

	from frappe.custom.doctype.property_setter.property_setter import make_property_setter

	frappe.clear_cache(doctype="Expense Claim")
	urutan = [df.fieldname for df in frappe.get_meta("Expense Claim").fields if df.fieldname != "project"]
	if "department" in urutan:
		urutan.insert(urutan.index("department") + 1, "project")
		make_property_setter("Expense Claim", None, "field_order", json.dumps(urutan), "Data", for_doctype=True)
	for fieldname in ("project", "approval_status"):
		make_property_setter("Expense Claim", fieldname, "in_standard_filter", 1, "Check", validate_fields_for_doctype=False)


# Task: tautan ke item WBS (progres item WBS = rata-rata progres Task-nya; konstruksi/wbs.py).
CUSTOM_FIELD_WBS = {
	"Task": [
		# Tepat setelah nama item: kolom tabel Items tampil Item · Item WBS · Qty · ...
		{"fieldname": "wbs_item", "fieldtype": "Link", "label": "Item WBS", "options": "WBS Item", "insert_after": "item_name",
			"depends_on": "eval:doc.project", "search_index": 1,
			"description": "Pekerjaan di Work Breakdown Structure proyek; progres Task ini menjadi progres item tersebut."},
		{"fieldname": "pj", "fieldtype": "Link", "label": "Penanggung Jawab", "options": "Employee", "insert_after": "wbs_item",
			"ignore_user_permissions": 1},
		{"fieldname": "pj_nama", "fieldtype": "Data", "label": "Nama PJ", "fetch_from": "pj.employee_name", "read_only": 1,
			"insert_after": "pj", "hidden": 1},
		{"fieldname": "pj_jabatan", "fieldtype": "Data", "label": "Jabatan PJ", "fetch_from": "pj.designation", "read_only": 1,
			"insert_after": "pj_nama"},
		# Progres lapangan: Volume (realisasi ÷ target) atau Tahapan (tahap selesai ÷ jumlah tahap), dari Laporan Progres
		# yang disetujui (konstruksi/aktivitas.py).
		{"fieldname": "progres_lapangan_section", "fieldtype": "Section Break", "label": "Progres Lapangan",
			"insert_after": "is_milestone", "depends_on": "eval:doc.project"},
		{"fieldname": "metode_progres", "fieldtype": "Select", "label": "Metode Progres", "options": "Volume\nTahapan",
			"default": "Volume", "insert_after": "progres_lapangan_section"},
		{"fieldname": "target_volume", "fieldtype": "Float", "label": "Target Volume", "insert_after": "metode_progres",
			"depends_on": "eval:doc.metode_progres!='Tahapan'"},
		{"fieldname": "satuan", "fieldtype": "Data", "label": "Satuan", "insert_after": "target_volume",
			"depends_on": "eval:doc.metode_progres!='Tahapan'"},
		{"fieldname": "realisasi_volume", "fieldtype": "Float", "label": "Realisasi Volume", "read_only": 1,
			"insert_after": "satuan", "depends_on": "eval:doc.metode_progres!='Tahapan'",
			"description": "Jumlah volume dari Laporan Progres yang disetujui."},
		{"fieldname": "progres_lapangan_column", "fieldtype": "Column Break", "insert_after": "realisasi_volume"},
		{"fieldname": "durasi_hk", "fieldtype": "Int", "label": "Durasi (Hari Kerja)", "read_only": 1,
			"insert_after": "progres_lapangan_column", "description": "Dari Expected Start–End Date, mengikuti Project Calendar."},
		{"fieldname": "tahapan", "fieldtype": "Table", "label": "Tahapan", "options": "Tahapan Aktivitas",
			"insert_after": "durasi_hk", "depends_on": "eval:doc.metode_progres=='Tahapan'"},
	],
}


def buat_wbs_default():
	from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

	create_custom_fields(CUSTOM_FIELD_WBS, update=True)


# Penagihan proyek (Sales Invoice uang muka / termin): item jasa, akun, dan field penanda di Sales Invoice.
ITEM_PENAGIHAN = (
	("UM-KONSTRUKSI", "Uang Muka Pekerjaan Konstruksi", "akun_uang_muka"),
	("TERMIN-KONSTRUKSI", "Termin Pekerjaan Konstruksi", "akun_pendapatan"),
)
AKUN_PENAGIHAN = {
	# kunci: (nama akun, induk, root_type, account_type)
	"akun_uang_muka": ("Uang Muka Proyek Diterima", "Current Liabilities", "Liability", ""),
	"akun_pph": ("PPh Final 4(2) Dibayar Dimuka", "Tax Assets", "Asset", "Tax"),
	"akun_pendapatan": ("Pendapatan Jasa Konstruksi", "Direct Income", "Income", "Income Account"),
}
CUSTOM_FIELD_PENAGIHAN = {
	"Sales Invoice": [
		{"fieldname": "penagihan_proyek_section", "fieldtype": "Section Break", "label": "Penagihan Proyek",
			"insert_after": "project", "collapsible": 0, "depends_on": "eval:doc.jenis_tagihan"},
		{"fieldname": "jenis_tagihan", "fieldtype": "Select", "label": "Jenis Tagihan", "options": "\nUang Muka\nTermin",
			"insert_after": "penagihan_proyek_section", "read_only": 1, "in_standard_filter": 1, "in_list_view": 0, "allow_on_submit": 0},
		# Uraian singkat untuk kolom list ("Uang Muka", "Termin 2 — Pekerjaan Struktur selesai"); diisi otomatis.
		{"fieldname": "uraian_tagihan", "fieldtype": "Data", "label": "Tagihan", "insert_after": "jenis_tagihan", "read_only": 1,
			"hidden": 1, "in_list_view": 1, "no_copy": 1},
		{"fieldname": "kontrak_project", "fieldtype": "Link", "label": "Kontrak Project", "options": "Kontrak Project",
			"insert_after": "jenis_tagihan", "read_only": 1},
		{"fieldname": "milestone_termin", "fieldtype": "Link", "label": "Milestone / Termin", "options": "Milestone Termin",
			"insert_after": "kontrak_project", "read_only": 1, "depends_on": "eval:doc.jenis_tagihan=='Termin'"},
		{"fieldname": "penagihan_proyek_column", "fieldtype": "Column Break", "insert_after": "milestone_termin"},
		{"fieldname": "nilai_bruto", "fieldtype": "Currency", "label": "Nilai Bruto (termasuk PPN)", "options": "currency",
			"insert_after": "penagihan_proyek_column", "read_only": 1},
		{"fieldname": "potongan_uang_muka", "fieldtype": "Currency", "label": "Potongan Uang Muka (DPP)", "options": "currency",
			"insert_after": "nilai_bruto", "read_only": 1, "depends_on": "eval:doc.jenis_tagihan=='Termin'"},
		{"fieldname": "nilai_pph_final", "fieldtype": "Currency", "label": "PPh Final Dipotong", "options": "currency",
			"insert_after": "potongan_uang_muka", "read_only": 1},
		{"fieldname": "nilai_retensi", "fieldtype": "Currency", "label": "Retensi Ditahan", "options": "currency",
			"insert_after": "nilai_pph_final", "read_only": 1, "depends_on": "eval:doc.jenis_tagihan=='Termin'",
			"description": "Ditagih di jadwal pembayaran terakhir (jatuh tempo akhir masa pemeliharaan)."},
	],
}


def akun_penagihan(company, kunci):
	nama, induk, root_type, account_type = AKUN_PENAGIHAN[kunci]
	abbr = frappe.get_cached_value("Company", company, "abbr")
	akun = f"{nama} - {abbr}"
	if not frappe.db.exists("Account", akun):
		parent = frappe.db.get_value("Account", {"company": company, "account_name": induk, "is_group": 1})
		if not parent:
			return None
		frappe.get_doc(
			{"doctype": "Account", "account_name": nama, "parent_account": parent, "company": company,
				"root_type": root_type, "account_type": account_type}
		).insert(ignore_permissions=True)
	return akun


# List Sales Invoice: urutan kolom (title = nama customer di depan, status indikator).
KOLOM_LIST_SALES_INVOICE = ["project", "uraian_tagihan", "posting_date", "due_date", "grand_total", "outstanding_amount", "status_field"]


def atur_list_sales_invoice():
	"""List Sales Invoice: kolom Proyek, Jenis Tagihan, Outstanding; filter Proyek; urutan kolom via List View Settings."""
	import json

	from frappe.custom.doctype.property_setter.property_setter import make_property_setter

	for fieldname in ("project", "outstanding_amount"):
		make_property_setter("Sales Invoice", fieldname, "in_list_view", 1, "Check", validate_fields_for_doctype=False)
	make_property_setter("Sales Invoice", "project", "in_standard_filter", 1, "Check", validate_fields_for_doctype=False)
	lvs = frappe.get_doc("List View Settings", "Sales Invoice") if frappe.db.exists("List View Settings", "Sales Invoice") else frappe.new_doc("List View Settings")
	if lvs.is_new():
		lvs.name = "Sales Invoice"
	lvs.fields = json.dumps([{"fieldname": f} for f in KOLOM_LIST_SALES_INVOICE])
	lvs.flags.ignore_permissions = True
	lvs.save() if not lvs.is_new() else lvs.insert(set_name="Sales Invoice")
	from konstruksi.konstruksi.penagihan import uraian_tagihan

	for si in frappe.get_all("Sales Invoice", filters={"jenis_tagihan": ("is", "set")}, fields=["name", "jenis_tagihan", "milestone_termin"]):
		frappe.db.set_value("Sales Invoice", si.name, "uraian_tagihan", uraian_tagihan(si), update_modified=False)


def buat_penagihan_default():
	from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

	create_custom_fields(CUSTOM_FIELD_PENAGIHAN, update=True)
	atur_list_sales_invoice()
	companies = frappe.get_all("Company", pluck="name")
	for c in companies:
		for kunci in AKUN_PENAGIHAN:
			akun_penagihan(c, kunci)
	for kode, nama, kunci_akun in ITEM_PENAGIHAN:
		if frappe.db.exists("Item", kode):
			continue
		frappe.get_doc(
			{
				"doctype": "Item", "item_code": kode, "item_name": nama, "item_group": "Services" if frappe.db.exists("Item Group", "Services") else "All Item Groups",
				"stock_uom": "Unit" if frappe.db.exists("UOM", "Unit") else "Nos", "is_stock_item": 0, "is_sales_item": 1, "is_purchase_item": 0,
				"include_item_in_manufacturing": 0, "description": nama,
				"item_defaults": [{"company": c, "income_account": akun_penagihan(c, kunci_akun)} for c in companies if akun_penagihan(c, kunci_akun)],
			}
		).insert(ignore_permissions=True)


# Pengadaan proyek (opsi "langsung dibebankan"): material dikirim langsung ke site, jadi item biaya proyek non-stok dan
# Purchase Invoice langsung menjurnal ke Beban Pokok Proyek per jenis biaya, ditandai Project (+ Item WBS).
AKUN_BIAYA_PROYEK_INDUK = ("Beban Pokok Proyek", "Direct Expenses")
# Item Group (di bawah "Biaya Proyek") → akun beban di bawah Beban Pokok Proyek.
ITEM_GROUP_BIAYA_PROYEK = "Biaya Proyek"
JENIS_BIAYA_PROYEK = (
	("Material Proyek", "Beban Material Proyek"),
	("Subkontraktor", "Beban Subkontraktor"),
	("Sewa Alat", "Beban Sewa Alat"),
	("Upah Tukang", "Beban Upah Tukang"),
	("Biaya Proyek Lain", "Beban Proyek Lain-lain"),
)
CUSTOM_FIELD_PENGADAAN = {
	doctype: [
		# Tepat setelah nama item: kolom tabel Items tampil Item · Item WBS · Qty · ...
		{"fieldname": "wbs_item", "fieldtype": "Link", "label": "Item WBS", "options": "WBS Item", "insert_after": "item_name",
			"depends_on": "eval:doc.project", "search_index": 1,
			"description": "Pekerjaan WBS yang dibiayai; untuk realisasi biaya per item WBS."},
		{"fieldname": "jenis_biaya", "fieldtype": "Data", "label": "Jenis Biaya", "fetch_from": "item_code.item_group",
			"read_only": 1, "insert_after": "wbs_item", "hidden": 1},
	]
	for doctype in ("Purchase Order Item", "Purchase Invoice Item")
}


# Satuan konstruksi (nama, harus bilangan bulat) — sama dengan satuan yang dipakai di RAB / WBS.
UOM_KONSTRUKSI = (
	("m3", 0), ("m2", 0), ("m'", 0), ("Kg", 0), ("Ton", 0), ("Liter", 0), ("Sak", 1), ("Lembar", 1), ("Batang", 1),
	("Buah", 1), ("Titik", 1), ("Rit", 1), ("Ls", 0), ("OH", 0), ("Hari", 0), ("Jam", 0), ("Bulan", 0), ("Unit", 1),
)
# Item biaya proyek standar: (kode, nama, Item Group, satuan, keterangan). Non-stok — material dikirim langsung ke site.
ITEM_BIAYA_PROYEK = (
	# Material
	("MAT-SEMEN", "Semen Portland 50 kg", "Material Proyek", "Sak", "Semen PCC/OPC kemasan 50 kg."),
	("MAT-PASIR-BETON", "Pasir Beton", "Material Proyek", "m3", "Pasir untuk campuran beton & plesteran."),
	("MAT-PASIR-URUG", "Pasir Urug", "Material Proyek", "m3", "Pasir untuk urugan & lantai kerja."),
	("MAT-SPLIT", "Batu Split 1/2", "Material Proyek", "m3", "Agregat kasar beton."),
	("MAT-BATU-KALI", "Batu Kali", "Material Proyek", "m3", "Pasangan pondasi & dinding penahan."),
	("MAT-AGREGAT-A", "Agregat Kelas A", "Material Proyek", "m3", "Lapis pondasi atas perkerasan jalan."),
	("MAT-AGREGAT-B", "Agregat Kelas B", "Material Proyek", "m3", "Lapis pondasi bawah perkerasan jalan."),
	("MAT-TANAH-URUG", "Tanah Urug", "Material Proyek", "m3", "Timbunan / urugan tanah."),
	("MAT-READYMIX", "Beton Ready Mix", "Material Proyek", "m3", "Beton siap pakai; mutu (fc') dicatat di deskripsi baris."),
	("MAT-BESI-POLOS", "Besi Beton Polos", "Material Proyek", "Kg", "Tulangan polos (BjTP)."),
	("MAT-BESI-ULIR", "Besi Beton Ulir", "Material Proyek", "Kg", "Tulangan ulir (BjTS)."),
	("MAT-WIREMESH", "Wiremesh", "Material Proyek", "Lembar", "Tulangan jaring untuk pelat / lantai."),
	("MAT-KAWAT-BENDRAT", "Kawat Bendrat", "Material Proyek", "Kg", "Pengikat tulangan."),
	("MAT-BATA-MERAH", "Bata Merah", "Material Proyek", "Buah", "Pasangan dinding bata."),
	("MAT-BATA-RINGAN", "Bata Ringan (AAC)", "Material Proyek", "m3", "Pasangan dinding bata ringan."),
	("MAT-MORTAR", "Mortar Instan", "Material Proyek", "Sak", "Perekat bata ringan / plester instan."),
	("MAT-KAYU-BEKISTING", "Kayu Bekisting", "Material Proyek", "m3", "Kayu kelas III untuk bekisting & perancah."),
	("MAT-MULTIPLEK", "Multiplek 12 mm", "Material Proyek", "Lembar", "Papan bekisting."),
	("MAT-PAKU", "Paku", "Material Proyek", "Kg", "Paku kayu berbagai ukuran."),
	("MAT-BAJA-RINGAN", "Rangka Baja Ringan", "Material Proyek", "Batang", "Kanal C / reng rangka atap."),
	("MAT-PENUTUP-ATAP", "Penutup Atap", "Material Proyek", "m2", "Genteng metal / spandek / genteng beton."),
	("MAT-KERAMIK", "Keramik / Granit Lantai", "Material Proyek", "m2", "Penutup lantai & dinding."),
	("MAT-GYPSUM", "Papan Gypsum 9 mm", "Material Proyek", "Lembar", "Plafon & partisi."),
	("MAT-HOLLOW", "Hollow Galvanis", "Material Proyek", "Batang", "Rangka plafon / partisi."),
	("MAT-CAT", "Cat Tembok", "Material Proyek", "Liter", "Cat dasar & cat finishing."),
	("MAT-PIPA-PVC", "Pipa PVC", "Material Proyek", "Batang", "Instalasi air bersih / kotor."),
	("MAT-KABEL", "Kabel Listrik NYM", "Material Proyek", "m'", "Instalasi listrik."),
	("MAT-ASPAL", "Aspal Hotmix (AC-WC/AC-BC)", "Material Proyek", "Ton", "Lapis perkerasan aspal."),
	# Subkontraktor
	("SUB-TANAH", "Subkon Pekerjaan Tanah", "Subkontraktor", "m3", "Borongan galian, timbunan & pemadatan per m3."),
	("SUB-PONDASI", "Subkon Pondasi / Tiang Pancang", "Subkontraktor", "m'", "Bore pile / tiang pancang / mini pile per meter."),
	("SUB-STRUKTUR", "Subkon Pekerjaan Struktur", "Subkontraktor", "m3", "Beton bertulang komplit (besi, bekisting, cor) per m3."),
	("SUB-BAJA", "Subkon Struktur Baja", "Subkontraktor", "Kg", "Fabrikasi & erection baja per kg."),
	("SUB-ARSITEKTUR", "Subkon Pekerjaan Arsitektur", "Subkontraktor", "m2", "Finishing, kusen, plafon, lantai per m2 bangunan."),
	("SUB-MEP", "Subkon Mekanikal, Elektrikal & Plumbing", "Subkontraktor", "m2", "Instalasi listrik, air, tata udara per m2 bangunan."),
	("SUB-JALAN", "Subkon Perkerasan Jalan", "Subkontraktor", "m2", "Penghamparan agregat & aspal per m2."),
	# Sewa alat
	("ALAT-EXCAVATOR", "Sewa Excavator", "Sewa Alat", "Jam", "Termasuk operator; BBM sesuai kontrak sewa."),
	("ALAT-DUMP-TRUCK", "Sewa Dump Truck", "Sewa Alat", "Rit", "Angkutan material / buangan per ritase."),
	("ALAT-VIBRO-ROLLER", "Sewa Vibro Roller", "Sewa Alat", "Jam", "Pemadatan tanah & agregat."),
	("ALAT-CRANE", "Sewa Mobile Crane", "Sewa Alat", "Jam", "Pengangkatan material berat."),
	("ALAT-CONCRETE-PUMP", "Sewa Concrete Pump", "Sewa Alat", "Jam", "Pengecoran beton."),
	("ALAT-MOLEN", "Sewa Molen (Concrete Mixer)", "Sewa Alat", "Hari", "Pengaduk beton."),
	("ALAT-VIBRATOR", "Sewa Concrete Vibrator", "Sewa Alat", "Hari", "Pemadat beton."),
	("ALAT-STAMPER", "Sewa Stamper", "Sewa Alat", "Hari", "Pemadat tanah kecil."),
	("ALAT-SCAFFOLDING", "Sewa Scaffolding", "Sewa Alat", "Bulan", "Perancah per set."),
	("ALAT-GENSET", "Sewa Genset", "Sewa Alat", "Hari", "Listrik kerja."),
	("ALAT-POMPA", "Sewa Pompa Air", "Sewa Alat", "Hari", "Dewatering / pengeringan."),
	("ALAT-TOTAL-STATION", "Sewa Total Station / Theodolite", "Sewa Alat", "Hari", "Pengukuran & stake out."),
	# Upah
	("UPAH-PEKERJA", "Upah Pekerja", "Upah Tukang", "OH", "Pekerja / kenek per orang-hari."),
	("UPAH-TUKANG-BATU", "Upah Tukang Batu", "Upah Tukang", "OH", "Per orang-hari."),
	("UPAH-TUKANG-KAYU", "Upah Tukang Kayu", "Upah Tukang", "OH", "Per orang-hari."),
	("UPAH-TUKANG-BESI", "Upah Tukang Besi", "Upah Tukang", "OH", "Per orang-hari."),
	("UPAH-TUKANG-CAT", "Upah Tukang Cat", "Upah Tukang", "OH", "Per orang-hari."),
	("UPAH-TUKANG-LISTRIK", "Upah Tukang Listrik", "Upah Tukang", "OH", "Per orang-hari."),
	("UPAH-KEPALA-TUKANG", "Upah Kepala Tukang", "Upah Tukang", "OH", "Per orang-hari."),
	("UPAH-MANDOR", "Upah Mandor", "Upah Tukang", "OH", "Per orang-hari."),
	("UPAH-BORONGAN", "Upah Borongan Pekerjaan", "Upah Tukang", "m2", "Upah borongan bangunan per m2."),
	# Biaya proyek lain
	("LAIN-MOBILISASI", "Mobilisasi & Demobilisasi", "Biaya Proyek Lain", "Ls", "Pengiriman alat & personel ke/dari site."),
	("LAIN-ANGKUTAN", "Angkutan Material", "Biaya Proyek Lain", "Rit", "Ongkos kirim material yang ditagih terpisah."),
	("LAIN-DIREKSI-KEET", "Direksi Keet & Gudang Sementara", "Biaya Proyek Lain", "Ls", "Bangunan sementara di site."),
	("LAIN-LISTRIK-AIR", "Listrik & Air Kerja", "Biaya Proyek Lain", "Bulan", "Tagihan listrik & air selama pelaksanaan."),
	("LAIN-K3", "Perlengkapan K3 / APD", "Biaya Proyek Lain", "Ls", "Helm, rompi, sepatu, rambu, P3K."),
	("LAIN-KEAMANAN", "Keamanan Proyek", "Biaya Proyek Lain", "Bulan", "Jasa keamanan site."),
	("LAIN-PENGUJIAN", "Pengujian Material / Laboratorium", "Biaya Proyek Lain", "Ls", "Uji beton, tanah, aspal."),
	("LAIN-PERIZINAN", "Perizinan & Retribusi", "Biaya Proyek Lain", "Ls", "Izin kerja, retribusi daerah."),
	("LAIN-DOKUMENTASI", "Dokumentasi & Pelaporan", "Biaya Proyek Lain", "Ls", "Foto, as built drawing, laporan."),
	("LAIN-PEMBERSIHAN", "Pembersihan Akhir", "Biaya Proyek Lain", "Ls", "Pembersihan & pembuangan sisa material."),
)


# Harga beli acuan (Price List "Standard Buying", per satuan item) — estimasi pasar 2026, ubah sesuai harga supplier.
HARGA_BELI_ACUAN = {
	"MAT-SEMEN": 68000, "MAT-PASIR-BETON": 320000, "MAT-PASIR-URUG": 220000, "MAT-SPLIT": 360000, "MAT-BATU-KALI": 280000,
	"MAT-AGREGAT-A": 380000, "MAT-AGREGAT-B": 330000, "MAT-TANAH-URUG": 150000, "MAT-READYMIX": 1050000,
	"MAT-BESI-POLOS": 14500, "MAT-BESI-ULIR": 15000, "MAT-WIREMESH": 650000, "MAT-KAWAT-BENDRAT": 25000,
	"MAT-BATA-MERAH": 900, "MAT-BATA-RINGAN": 750000, "MAT-MORTAR": 95000, "MAT-KAYU-BEKISTING": 3500000,
	"MAT-MULTIPLEK": 185000, "MAT-PAKU": 22000, "MAT-BAJA-RINGAN": 95000, "MAT-PENUTUP-ATAP": 85000, "MAT-KERAMIK": 95000,
	"MAT-GYPSUM": 75000, "MAT-HOLLOW": 32000, "MAT-CAT": 45000, "MAT-PIPA-PVC": 85000, "MAT-KABEL": 9000,
	"MAT-ASPAL": 1350000,
	"SUB-TANAH": 95000, "SUB-PONDASI": 425000, "SUB-STRUKTUR": 4750000, "SUB-BAJA": 38000, "SUB-ARSITEKTUR": 650000,
	"SUB-MEP": 400000, "SUB-JALAN": 195000,
	"ALAT-EXCAVATOR": 450000, "ALAT-DUMP-TRUCK": 350000, "ALAT-VIBRO-ROLLER": 400000, "ALAT-CRANE": 850000,
	"ALAT-CONCRETE-PUMP": 950000, "ALAT-MOLEN": 250000, "ALAT-VIBRATOR": 150000, "ALAT-STAMPER": 200000,
	"ALAT-SCAFFOLDING": 50000, "ALAT-GENSET": 650000, "ALAT-POMPA": 200000, "ALAT-TOTAL-STATION": 750000,
	"UPAH-PEKERJA": 150000, "UPAH-TUKANG-BATU": 185000, "UPAH-TUKANG-KAYU": 185000, "UPAH-TUKANG-BESI": 185000,
	"UPAH-TUKANG-CAT": 180000, "UPAH-TUKANG-LISTRIK": 200000, "UPAH-KEPALA-TUKANG": 210000, "UPAH-MANDOR": 225000,
	"UPAH-BORONGAN": 1150000,
	"LAIN-MOBILISASI": 15000000, "LAIN-ANGKUTAN": 450000, "LAIN-DIREKSI-KEET": 25000000, "LAIN-LISTRIK-AIR": 3500000,
	"LAIN-K3": 7500000, "LAIN-KEAMANAN": 4500000, "LAIN-PENGUJIAN": 7500000, "LAIN-PERIZINAN": 5000000,
	"LAIN-DOKUMENTASI": 3000000, "LAIN-PEMBERSIHAN": 4000000,
}
PRICE_LIST_BELI = "Standard Buying"


def item_dipakai(item_code):
	return any(
		frappe.db.exists(dt, {"item_code": item_code})
		for dt in ("Purchase Order Item", "Purchase Invoice Item", "Purchase Receipt Item", "Material Request Item", "Bin")
	)


def buat_item_biaya_proyek():
	"""Satuan konstruksi, item biaya proyek standar, dan harga beli acuannya (yang belum ada saja; item & harga yang
	sudah diubah user tidak ditimpa). Satuan item standar yang belum pernah ditransaksikan disamakan dengan daftar."""
	for nama, bulat in UOM_KONSTRUKSI:
		if not frappe.db.exists("UOM", nama):
			frappe.get_doc({"doctype": "UOM", "uom_name": nama, "must_be_whole_number": bulat}).insert(ignore_permissions=True)
	for kode, nama, grup, satuan, ket in ITEM_BIAYA_PROYEK:
		if frappe.db.exists("Item", kode):
			item = frappe.get_doc("Item", kode)
			if item.stock_uom != satuan and not item_dipakai(kode):
				item.stock_uom = satuan
				item.uoms = []
				item.description = ket
				item.save(ignore_permissions=True)
				frappe.db.delete("Item Price", {"item_code": kode, "uom": ("!=", satuan)})
			continue
		frappe.get_doc(
			{
				"doctype": "Item", "item_code": kode, "item_name": nama, "item_group": grup, "stock_uom": satuan,
				"is_stock_item": 0, "is_purchase_item": 1, "is_sales_item": 0, "include_item_in_manufacturing": 0,
				"is_fixed_asset": 0, "description": ket,
			}
		).insert(ignore_permissions=True)
	if not frappe.db.exists("Price List", PRICE_LIST_BELI):
		return
	for kode, nama, grup, satuan, ket in ITEM_BIAYA_PROYEK:
		harga = HARGA_BELI_ACUAN.get(kode)
		if not harga or frappe.db.exists("Item Price", {"item_code": kode, "price_list": PRICE_LIST_BELI}):
			continue
		frappe.get_doc(
			{"doctype": "Item Price", "item_code": kode, "price_list": PRICE_LIST_BELI, "uom": satuan, "price_list_rate": harga}
		).insert(ignore_permissions=True)


def akun_biaya_proyek(company, nama=None):
	"""Akun Beban Pokok Proyek (group, nama=None) atau akun anaknya; dibuat bila belum ada."""
	abbr = frappe.get_cached_value("Company", company, "abbr")
	induk_nama, kakek = AKUN_BIAYA_PROYEK_INDUK
	induk = f"{induk_nama} - {abbr}"
	if not frappe.db.exists("Account", induk):
		parent = frappe.db.get_value("Account", {"company": company, "account_name": kakek, "is_group": 1})
		if not parent:
			return None
		frappe.get_doc({"doctype": "Account", "account_name": induk_nama, "parent_account": parent, "company": company,
			"root_type": "Expense", "is_group": 1}).insert(ignore_permissions=True)
	if not nama:
		return induk
	akun = f"{nama} - {abbr}"
	if not frappe.db.exists("Account", akun):
		frappe.get_doc({"doctype": "Account", "account_name": nama, "parent_account": induk, "company": company,
			"root_type": "Expense", "account_type": "Cost of Goods Sold"}).insert(ignore_permissions=True)
	return akun


def buat_pengadaan_default():
	"""Akun & Item Group biaya proyek, field Item WBS di PO / PI Item, filter Project di list PO & PI."""
	from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
	from frappe.custom.doctype.property_setter.property_setter import make_property_setter

	create_custom_fields(CUSTOM_FIELD_PENGADAAN, update=True)
	companies = frappe.get_all("Company", pluck="name")
	if not frappe.db.exists("Item Group", ITEM_GROUP_BIAYA_PROYEK):
		frappe.get_doc({"doctype": "Item Group", "item_group_name": ITEM_GROUP_BIAYA_PROYEK, "parent_item_group": "All Item Groups",
			"is_group": 1}).insert(ignore_permissions=True)
	for grup, akun in JENIS_BIAYA_PROYEK:
		doc = (frappe.get_doc("Item Group", grup) if frappe.db.exists("Item Group", grup)
			else frappe.get_doc({"doctype": "Item Group", "item_group_name": grup, "parent_item_group": ITEM_GROUP_BIAYA_PROYEK}))
		ada = {d.company for d in doc.item_group_defaults}
		for c in companies:
			if c not in ada and akun_biaya_proyek(c, akun):
				doc.append("item_group_defaults", {"company": c, "expense_account": akun_biaya_proyek(c, akun)})
		doc.flags.ignore_permissions = True
		doc.save()
	buat_item_biaya_proyek()
	import json

	# Harga mengikuti tagihan supplier persis: pembulatan otomatis mati bawaan untuk PO baru.
	make_property_setter("Purchase Order", "disable_rounded_total", "default", "1", "Text", validate_fields_for_doctype=False)

	for doctype in ("Purchase Order", "Purchase Invoice"):
		for prop, nilai in (("in_standard_filter", 1), ("in_list_view", 1)):
			make_property_setter(doctype, "project", prop, nilai, "Check", validate_fields_for_doctype=False)
		# Project bawaannya di section Accounting Dimensions yang terlipat: pindah ke atas, tepat di bawah Supplier.
		frappe.clear_cache(doctype=doctype)
		urutan = [df.fieldname for df in frappe.get_meta(doctype).fields if df.fieldname != "project"]
		if "supplier_name" in urutan:
			urutan.insert(urutan.index("supplier_name") + 1, "project")
			make_property_setter(doctype, None, "field_order", json.dumps(urutan), "Data", for_doctype=True)
		make_property_setter(doctype, "project", "description",
			"Wajib untuk item biaya proyek.", "Small Text", validate_fields_for_doctype=False)


def after_install():
	from konstruksi.konstruksi.template_rab import isi_template_rab_default

	buat_custom_field_project()
	buat_tim_proyek_default()
	buat_biaya_personel_default()
	buat_wbs_default()
	buat_penagihan_default()
	buat_pengadaan_default()
	buat_jenis_project_default()
	buat_template_dokumen_default()
	isi_template_rab_default()
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
