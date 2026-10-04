# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

"""Tim Proyek: penugasan personel (Employee) ke Project, kebutuhan personel dari template, status SKK.

Personel yang punya akun login otomatis masuk tabel Users di Project, supaya bisa mengakses proyek dan terhitung
di tim bawaan ERPNext.
"""

import frappe
from frappe import _
from frappe.utils import flt, getdate, today

from konstruksi.api import beri_tahu_form


def get_status_skk(employee, jabatan, tanggal=None):
	"""Tidak Wajib / Berlaku / Belum Ada / Kedaluwarsa — SKK personel untuk jabatan yang mewajibkannya."""
	if not frappe.db.get_value("Designation", jabatan, "wajib_skk"):
		return "Tidak Wajib"
	skk = frappe.get_all(
		"SKK Personel", filters={"parent": employee, "parenttype": "Employee"}, pluck="berlaku_sampai"
	)
	if not skk:
		return "Belum Ada"
	acuan = getdate(tanggal or today())
	return "Berlaku" if any(not b or getdate(b) >= acuan for b in skk) else "Kedaluwarsa"


def sinkron_users_project(project):
	"""Akun login personel yang ditugaskan masuk tabel Users di Project (yang tidak lagi ditugaskan dikeluarkan)."""
	if not frappe.db.get_value("Project", project, "kontrak_project"):
		return
	ditugaskan = set(
		frappe.get_all("Penugasan Personel", filters={"project": project, "user_id": ("is", "set")}, pluck="user_id")
	)
	doc = frappe.get_doc("Project", project)
	sekarang = {row.user for row in doc.users}
	if sekarang == ditugaskan:
		return
	doc.users = [row for row in doc.users if row.user in ditugaskan]
	for user in sorted(ditugaskan - sekarang):
		# welcome_email_sent = 1: ERPNext tidak mengirim email undangan proyek otomatis.
		doc.append("users", {"user": user, "welcome_email_sent": 1})
	doc.flags.ignore_permissions = True
	doc.save()
	beri_tahu_form("Project", project)


def get_kebutuhan(project):
	"""Gabungan semua Template Kebutuhan Personel yang cocok (jenis project & nilai kontrak): {jabatan: {wajib, jumlah}}."""
	jenis, nilai = frappe.db.get_value("Project", project, ["jenis_project", "nilai_kontrak"])
	kebutuhan = {}
	for template in frappe.get_all(
		"Template Kebutuhan Personel",
		filters={"disabled": 0, "nilai_minimal": ("<=", flt(nilai))},
		fields=["name", "jenis_project"],
		order_by="nilai_minimal asc",
	):
		if template.jenis_project and template.jenis_project != jenis:
			continue
		for row in frappe.get_all(
			"Kebutuhan Jabatan",
			filters={"parent": template.name, "parenttype": "Template Kebutuhan Personel"},
			fields=["jabatan", "wajib", "jumlah"],
			order_by="idx asc",
		):
			k = kebutuhan.setdefault(row.jabatan, {"wajib": 0, "jumlah": 0})
			k["wajib"] = k["wajib"] or row.wajib
			k["jumlah"] = max(k["jumlah"], row.jumlah or 1)
	return kebutuhan


@frappe.whitelist()
def get_tim(project):
	"""Data tab Tim Proyek: ringkasan, kebutuhan (perlu diisi / sudah terisi), dan daftar penugasan."""
	frappe.has_permission("Project", "read", project, throw=True)
	penugasan = frappe.get_all(
		"Penugasan Personel",
		filters={"project": project},
		fields=[
			"name", "employee", "nama_personel", "jabatan", "tanggal_mulai", "tanggal_selesai",
			"alokasi", "user_id", "telepon", "email", "status_skk",
		],
		order_by="creation asc",
	)
	per_jabatan = {}
	for p in penugasan:
		per_jabatan.setdefault(p.jabatan, []).append(p)

	kebutuhan = get_kebutuhan(project)
	jabatan_semua = list(kebutuhan) + [j for j in per_jabatan if j not in kebutuhan]
	tugas = dict(frappe.get_all("Designation", filters={"name": ("in", jabatan_semua or [""])}, fields=["name", "description"], as_list=True))

	perlu, terisi = [], []
	for jabatan in jabatan_semua:
		k = kebutuhan.get(jabatan, {"wajib": 0, "jumlah": 0})
		orang = per_jabatan.get(jabatan, [])
		info = {"jabatan": jabatan, "wajib": k["wajib"], "jumlah": k["jumlah"], "tugas": tugas.get(jabatan) or ""}
		if orang:
			terisi.append({**info, "personel": [{"nama": o.nama_personel, "status_skk": o.status_skk} for o in orang]})
		if len(orang) < k["jumlah"]:
			perlu.append({**info, "kurang": k["jumlah"] - len(orang)})

	wajib = [j for j, k in kebutuhan.items() if k["wajib"]]
	return {
		"penugasan": penugasan,
		"perlu": sorted(perlu, key=lambda x: not x["wajib"]),
		"terisi": terisi,
		"jumlah_personel": len({p.employee for p in penugasan}),
		"fte": round(sum(flt(p.alokasi) for p in penugasan) / 100, 2),
		"wajib_total": len(wajib),
		"wajib_terisi": sum(1 for j in wajib if len(per_jabatan.get(j, [])) >= kebutuhan[j]["jumlah"]),
	}


@frappe.whitelist()
def tugaskan(project, employee, jabatan, tanggal_mulai, alokasi=100, tanggal_selesai=None, catatan=None):
	"""Buat Penugasan Personel dari dialog di tab Tim Proyek."""
	doc = frappe.get_doc(
		{
			"doctype": "Penugasan Personel",
			"project": project,
			"employee": employee,
			"jabatan": jabatan,
			"tanggal_mulai": tanggal_mulai,
			"tanggal_selesai": tanggal_selesai or None,
			"alokasi": flt(alokasi) or 100,
			"catatan": catatan,
		}
	)
	doc.insert()
	return doc.name
