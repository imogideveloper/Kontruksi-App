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


def get_skk_berlaku_sampai(employee):
	"""Tanggal berlaku SKK terlama milik personel (None bila tidak ada SKK atau ada SKK tanpa batas waktu)."""
	skk = frappe.get_all("SKK Personel", filters={"parent": employee, "parenttype": "Employee"}, pluck="berlaku_sampai")
	if not skk or any(not b for b in skk):
		return None
	return max(getdate(b) for b in skk)


def get_status_skk(employee, jabatan, tanggal=None):
	"""Status SKK personel untuk jabatan yang mewajibkannya, dicek sampai `tanggal` (akhir tugas):
	Tidak Wajib / Berlaku / Habis Saat Bertugas (masih berlaku hari ini, habis sebelum tugas selesai) /
	Kedaluwarsa (sudah habis hari ini) / Belum Ada."""
	if not frappe.db.get_value("Designation", jabatan, "wajib_skk"):
		return "Tidak Wajib"
	if not frappe.db.exists("SKK Personel", {"parent": employee, "parenttype": "Employee"}):
		return "Belum Ada"
	sampai = get_skk_berlaku_sampai(employee)
	if not sampai or sampai >= getdate(tanggal or today()):
		return "Berlaku"
	return "Habis Saat Bertugas" if sampai >= getdate(today()) else "Kedaluwarsa"


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
	for p in penugasan:
		# Dihitung saat ditampilkan supaya mengikuti perubahan role di User.
		p.akses = get_akses(p.user_id)
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


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def cari_personel(doctype, txt, searchfield, start, page_len, filters):
	"""Pilihan Personel di penugasan: ID, nama, jabatan, department (personel aktif). Bisa dicari lewat nama atau jabatan.

	frappe.get_all (bukan get_list) karena User Permission Employee dari HRMS tidak berlaku saat menugaskan.
	"""
	frappe.has_permission("Penugasan Personel", "create", throw=True)
	return frappe.get_all(
		"Employee",
		filters={"status": "Active"},
		or_filters={
			"name": ("like", f"%{txt}%"),
			"employee_name": ("like", f"%{txt}%"),
			"designation": ("like", f"%{txt}%"),
		},
		fields=["name", "employee_name", "designation", "department"],
		order_by="designation asc, employee_name asc",
		limit_start=start,
		limit_page_length=page_len,
		as_list=True,
	)


BELUM_PUNYA_AKUN = "Belum punya akun"


def get_akses(user):
	"""Teks Akses Sistem: Role Profile akun login personel, atau keterangan bila belum / tidak bisa login."""
	if not user:
		return BELUM_PUNYA_AKUN
	if not frappe.db.get_value("User", user, "enabled"):
		return _("Akun nonaktif")
	profiles = frappe.get_all("User Role Profile", filters={"parent": user, "parenttype": "User"}, pluck="role_profile")
	return ", ".join(profiles) if profiles else _("Role diatur manual")


@frappe.whitelist()
def buat_akun_login(employee, email, role_profile=None, kirim_email=0):
	"""Data Personel: buat User untuk personel (Role Profile sesuai jabatan), tautkan ke Employee & penugasannya."""
	frappe.has_permission("User", "create", throw=True)
	emp = frappe.get_doc("Employee", employee)
	if emp.user_id:
		frappe.throw(_("{0} sudah punya akun login ({1}).").format(emp.employee_name, emp.user_id))
	email = (email or "").strip().lower()
	if frappe.db.exists("User", email):
		frappe.throw(_("Email {0} sudah dipakai akun lain.").format(email))

	user = frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": emp.first_name,
			"last_name": emp.last_name,
			"user_type": "System User",
			"send_welcome_email": frappe.utils.cint(kirim_email),
			"role_profiles": [{"role_profile": role_profile}] if role_profile else [],
		}
	)
	user.insert()

	# set_value, bukan save: HRMS tidak membuat User Permission otomatis yang membatasi user hanya melihat dirinya.
	frappe.db.set_value("Employee", employee, "user_id", user.name)
	# ERPNext membuang role Employee dari user yang belum tertaut ke Employee saat user dibuat; tambahkan setelah tertaut.
	if role_profile and "Employee" in [r.role for r in frappe.get_doc("Role Profile", role_profile).roles]:
		frappe.get_doc("User", user.name).add_roles("Employee")
	for p in frappe.get_all("Penugasan Personel", filters={"employee": employee}, fields=["name", "project"]):
		frappe.db.set_value("Penugasan Personel", p.name, {"user_id": user.name, "akses_sistem": get_akses(user.name)})
		sinkron_users_project(p.project)
	return user.name
