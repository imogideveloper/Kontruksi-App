# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

"""Project Master = Project bawaan ERPNext + field konstruksi (custom field, lihat install.py).

Satu Kontrak Project menghasilkan satu Project dengan ID yang sama (PRJ-2026-001). Data kontrak (klien, lokasi,
nilai terkini, periode, PM) disalin ke Project dan selalu mengikuti kontrak; status proyek dihitung dari tanggal.
"""

import frappe
from frappe.utils import date_diff, flt, getdate, today

from konstruksi.api import beri_tahu_form

# Status yang diisi manual; tidak ditimpa perhitungan otomatis dari tanggal.
STATUS_MANUAL = ("Ditunda", "Batal")
# Status proyek konstruksi -> status bawaan ERPNext Project.
STATUS_ERPNEXT = {"Ditunda": "On hold", "Batal": "Cancelled", "Selesai": "Completed"}


def hitung_status(mulai, selesai, akhir_pemeliharaan, status_sekarang=None):
	if status_sekarang in STATUS_MANUAL:
		return status_sekarang
	hari_ini = getdate(today())
	if not mulai or hari_ini < getdate(mulai):
		return "Perencanaan"
	if not selesai or hari_ini <= getdate(selesai):
		return "Berjalan"
	if akhir_pemeliharaan and hari_ini <= getdate(akhir_pemeliharaan):
		return "Pemeliharaan"
	return "Selesai"


def data_dari_kontrak(kontrak):
	"""Field Project yang disalin dari Kontrak Project."""
	tarif = flt(kontrak.tarif_ppn) if kontrak.status_ppn == "PPN" else 0
	nilai = flt(kontrak.nilai_kontrak_terkini) or flt(kontrak.nilai_kontrak)
	return {
		"project_name": kontrak.nama_project,
		"customer": kontrak.pemberi_kerja,
		"expected_start_date": kontrak.tanggal_spmk,
		"expected_end_date": kontrak.tanggal_selesai,
		"kontrak_project": kontrak.name,
		"tender": kontrak.tender,
		"jenis_project": kontrak.jenis_project,
		"lokasi": kontrak.lokasi,
		"nilai_kontrak": nilai,
		"tarif_ppn": tarif,
		"nilai_sebelum_ppn": flt(nilai / (1 + tarif / 100), 2),
		"project_manager": kontrak.project_manager,
		"akhir_pemeliharaan": kontrak.akhir_pemeliharaan,
		# Estimated Cost = Total Biaya (RAP) dari RAB Penawaran terbaru tender ini.
		"estimated_costing": flt(
			frappe.db.get_value("RAB Penawaran", {"tender": kontrak.tender}, "total_biaya", order_by="creation desc")
		),
	}


def get_project(kontrak_project):
	return frappe.db.get_value("Project", {"kontrak_project": kontrak_project})


@frappe.whitelist()
def get_or_create_project(kontrak_project):
	"""Buka Project milik kontrak ini; buat baru (ID sama dengan kontrak) bila belum ada."""
	name = get_project(kontrak_project)
	if name:
		return name
	kontrak = frappe.get_doc("Kontrak Project", kontrak_project)
	kontrak.check_permission("read")
	data = data_dari_kontrak(kontrak)
	status = hitung_status(data["expected_start_date"], data["expected_end_date"], data["akhir_pemeliharaan"])
	project = frappe.get_doc(
		{
			"doctype": "Project",
			**data,
			"status_proyek": status,
			"status": STATUS_ERPNEXT.get(status, "Open"),
			"company": frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company"),
			"percent_complete_method": "Task Completion",
		}
	)
	# ID Project = ID kontrak, bukan seri PROJ-####, supaya mudah ditelusuri.
	project.insert(set_name=kontrak.name)
	return project.name


def sinkron_project(kontrak):
	"""Kontrak berubah (simpan, sinkron Tender, addendum): salin ke Project-nya dan kabari form yang terbuka."""
	name = get_project(kontrak.name)
	if not name:
		return
	data = data_dari_kontrak(kontrak)
	status_sekarang = frappe.db.get_value("Project", name, "status_proyek")
	status = hitung_status(data["expected_start_date"], data["expected_end_date"], data["akhir_pemeliharaan"], status_sekarang)
	data.update({"status_proyek": status, "status": STATUS_ERPNEXT.get(status, "Open")})
	# set_value, bukan save: validasi Project ERPNext (costing, email, dsb.) tidak perlu jalan untuk penyalinan ini.
	frappe.db.set_value("Project", name, data)
	beri_tahu_form("Project", name)


def perbarui_status_harian():
	"""Scheduler harian: status proyek (Perencanaan → Berjalan → Pemeliharaan → Selesai) mengikuti tanggal."""
	for p in frappe.get_all(
		"Project",
		filters={"kontrak_project": ("is", "set"), "status_proyek": ("not in", STATUS_MANUAL)},
		fields=["name", "expected_start_date", "expected_end_date", "akhir_pemeliharaan", "status_proyek"],
	):
		status = hitung_status(p.expected_start_date, p.expected_end_date, p.akhir_pemeliharaan, p.status_proyek)
		if status != p.status_proyek:
			frappe.db.set_value("Project", p.name, {"status_proyek": status, "status": STATUS_ERPNEXT.get(status, "Open")})


def set_status_erpnext(doc, method=None):
	"""Project.validate: status ERPNext mengikuti Status Proyek (mis. user memilih Ditunda / Batal)."""
	if doc.kontrak_project and doc.status_proyek:
		if doc.status_proyek not in STATUS_MANUAL:
			doc.status_proyek = hitung_status(doc.expected_start_date, doc.expected_end_date, doc.akhir_pemeliharaan)
		doc.status = STATUS_ERPNEXT.get(doc.status_proyek, "Open")


@frappe.whitelist()
def get_dashboard(project):
	"""Angka dashboard Project Master: progres vs rencana, waktu, tim, aktivitas, isu, milestone berikutnya."""
	doc = frappe.get_doc("Project", project)
	doc.check_permission("read")
	hari_ini = getdate(today())

	waktu_terpakai = 0
	if doc.expected_start_date and doc.expected_end_date:
		total = date_diff(doc.expected_end_date, doc.expected_start_date) + 1
		lewat = date_diff(hari_ini, doc.expected_start_date) + 1
		waktu_terpakai = min(max(lewat / total * 100, 0), 100) if total > 0 else 0

	milestone = frappe.get_all(
		"Task",
		filters={"project": project, "is_milestone": 1, "status": ("not in", ("Completed", "Cancelled"))},
		fields=["subject", "exp_end_date"],
		order_by="exp_end_date asc",
		limit=1,
	)
	return {
		"progres_aktual": flt(doc.percent_complete),
		# Rencana sementara = linier terhadap waktu; nanti diganti kurva S dari Baseline Schedule.
		"progres_rencana": flt(waktu_terpakai, 1),
		"waktu_terpakai": flt(waktu_terpakai, 1),
		"tim": len(set(frappe.get_all("Penugasan Personel", filters={"project": project}, pluck="employee"))),
		"aktivitas": frappe.db.count("Task", {"project": project}),
		"aktivitas_selesai": frappe.db.count("Task", {"project": project, "status": "Completed"}),
		"isu_terbuka": frappe.db.count("Issue", {"project": project, "status": ("not in", ("Resolved", "Closed"))}),
		"milestone": milestone[0] if milestone else None,
	}


@frappe.whitelist()
def get_ringkasan_list():
	"""Kartu di atas list Project Master: jumlah proyek per status & total nilai kontrak."""
	rows = frappe.get_list(
		"Project",
		filters={"kontrak_project": ("is", "set")},
		fields=["status_proyek", "nilai_kontrak"],
		limit_page_length=0,
	)
	jumlah = {}
	for row in rows:
		jumlah[row.status_proyek] = jumlah.get(row.status_proyek, 0) + 1
	return {
		"total": len(rows),
		"per_status": jumlah,
		"total_nilai": sum(flt(row.nilai_kontrak) for row in rows),
	}
