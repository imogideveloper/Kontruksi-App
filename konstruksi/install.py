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
		{"fieldname": "wbs_item", "fieldtype": "Link", "label": "Item WBS", "options": "WBS Item", "insert_after": "project",
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
			"insert_after": "project", "collapsible": 1, "depends_on": "eval:doc.jenis_tagihan"},
		{"fieldname": "jenis_tagihan", "fieldtype": "Select", "label": "Jenis Tagihan", "options": "\nUang Muka\nTermin",
			"insert_after": "penagihan_proyek_section", "read_only": 1, "in_standard_filter": 1, "allow_on_submit": 0},
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


def buat_penagihan_default():
	from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

	create_custom_fields(CUSTOM_FIELD_PENAGIHAN, update=True)
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


def after_install():
	buat_custom_field_project()
	buat_tim_proyek_default()
	buat_biaya_personel_default()
	buat_wbs_default()
	buat_penagihan_default()
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
