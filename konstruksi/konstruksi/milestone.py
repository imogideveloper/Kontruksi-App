# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

"""Milestone & Termin: tahapan capaian pekerjaan sebagai dasar penagihan termin ke klien.

- Bobot termin = porsi nilai kontrak (termasuk PPN, sebelum potongan uang muka & retensi) yang ditagih saat milestone
  tercapai; total bobot proyek maksimal 100%. Nilai & kumulatif dihitung urut tanggal target.
- Lingkup WBS: progres milestone = rata-rata tertimbang nilai progres item WBS-nya (item induk mencakup sub-itemnya).
  Tanpa lingkup = milestone manual.
- Status: Rencana → Terlambat (lewat target) → Tercapai (ditandai, dengan tanggal & dokumen).
"""

import json

import frappe
from frappe import _
from frappe.utils import date_diff, flt, getdate, today

FIELD = [
	"name", "urutan", "nama_milestone", "tanggal_target", "bobot", "bobot_kumulatif", "nilai_termin", "nilai_kumulatif",
	"progres", "status", "tanggal_tercapai", "dokumen", "catatan", "sales_invoice",
]


def nilai_kontrak(project):
	return flt(frappe.db.get_value("Project", project, "nilai_kontrak"))


def lingkup_per_milestone(names):
	if not names:
		return {}
	hasil = {}
	for r in frappe.get_all(
		"Milestone Termin WBS", filters={"parent": ("in", names), "parenttype": "Milestone Termin"}, fields=["parent", "wbs_item"],
		order_by="idx asc",
	):
		hasil.setdefault(r.parent, []).append(r.wbs_item)
	return hasil


def hitung_ulang(project):
	"""Urutan, bobot & nilai kumulatif, progres dari WBS, dan status semua milestone proyek."""
	rows = frappe.get_all("Milestone Termin", filters={"project": project}, fields=FIELD, order_by="tanggal_target asc, creation asc")
	if not rows:
		return
	nilai = nilai_kontrak(project)
	wbs = {w.name: w for w in frappe.get_all("WBS Item", filters={"project": project}, fields=["name", "jumlah_harga", "progres"])}
	lingkup = lingkup_per_milestone([r.name for r in rows])
	kumulatif = 0
	hari_ini = getdate(today())
	for i, r in enumerate(rows, start=1):
		kumulatif += flt(r.bobot)
		items = [wbs[w] for w in lingkup.get(r.name, []) if w in wbs]
		total = sum(flt(w.jumlah_harga) for w in items)
		progres = (sum(flt(w.jumlah_harga) * flt(w.progres) for w in items) / total) if total else 0
		if r.tanggal_tercapai:
			status = "Tercapai"
		elif r.tanggal_target and getdate(r.tanggal_target) < hari_ini:
			status = "Terlambat"
		else:
			status = "Rencana"
		baru = {
			"urutan": i,
			"bobot_kumulatif": flt(kumulatif, 4),
			"nilai_termin": flt(nilai * flt(r.bobot) / 100, 0),
			"nilai_kumulatif": flt(nilai * kumulatif / 100, 0),
			"progres": flt(progres, 2),
			"status": status,
		}
		if any(flt(r.get(k), 4) != flt(v, 4) if not isinstance(v, str) else r.get(k) != v for k, v in baru.items()):
			frappe.db.set_value("Milestone Termin", r.name, baru, update_modified=False)


def perbarui_semua():
	"""Scheduler harian: status Terlambat mengikuti tanggal."""
	for project in frappe.get_all("Milestone Termin", filters={"status": ("!=", "Tercapai")}, pluck="project", distinct=True):
		hitung_ulang(project)


def daun_tercakup(items, lingkup):
	"""Item WBS tanpa sub-item yang tercakup lingkup (memilih induk = semua sub-itemnya)."""
	anak = {}
	for w in items:
		anak.setdefault(w.parent_wbs, []).append(w)
	hasil = set()

	def turun(name):
		sub = anak.get(name, [])
		if not sub:
			hasil.add(name)
		for s in sub:
			turun(s.name)

	for name in lingkup:
		turun(name)
	return hasil


@frappe.whitelist()
def get_milestone(project):
	doc = frappe.get_doc("Project", project)
	doc.check_permission("read")
	hitung_ulang(project)
	rows = frappe.get_all("Milestone Termin", filters={"project": project}, fields=FIELD, order_by="urutan asc")
	lingkup = lingkup_per_milestone([r.name for r in rows])

	from konstruksi.konstruksi.wbs import kunci_kode

	wbs = frappe.get_all("WBS Item", filters={"project": project}, fields=["name", "kode", "uraian", "is_group", "parent_wbs", "level", "progres"])
	per_nama = {w.name: w for w in wbs}
	hari_ini = getdate(today())
	semua_lingkup = set()
	for r in rows:
		r.lingkup = [
			{"name": w, "kode": per_nama[w].kode, "uraian": per_nama[w].uraian} for w in lingkup.get(r.name, []) if w in per_nama
		]
		r.lingkup.sort(key=lambda x: kunci_kode(x["kode"]))
		semua_lingkup.update(x["name"] for x in r.lingkup)
		r.selisih_hari = date_diff(r.tanggal_target, hari_ini) if r.tanggal_target else None
		r.selisih_tercapai = date_diff(r.tanggal_tercapai, r.tanggal_target) if r.tanggal_tercapai and r.tanggal_target else None
		r.status_tagih = (
			frappe.db.get_value("Sales Invoice", r.sales_invoice, ["docstatus", "status"], as_dict=True) if r.sales_invoice else None
		)

	tercakup = daun_tercakup(wbs, semua_lingkup)
	belum = sorted([w for w in wbs if not w.is_group and w.name not in tercakup], key=lambda w: kunci_kode(w.kode))
	nilai = nilai_kontrak(project)
	tercapai = [r for r in rows if r.status == "Tercapai"]
	return {
		"project": {"name": doc.name, "project_name": doc.project_name, "nilai_kontrak": nilai, "tarif_ppn": flt(doc.get("tarif_ppn"))},
		"milestone": rows,
		"wbs": sorted(
			[{"name": w.name, "kode": w.kode, "uraian": w.uraian, "is_group": w.is_group, "level": w.level} for w in wbs],
			key=lambda w: kunci_kode(w["kode"]),
		),
		"belum_masuk": [{"kode": w.kode, "uraian": w.uraian} for w in belum],
		"tercapai": len(tercapai),
		"bobot_tercapai": sum(flt(r.bobot) for r in tercapai),
		"nilai_tercapai": sum(flt(r.nilai_termin) for r in tercapai),
		"terlambat": sum(1 for r in rows if r.status == "Terlambat"),
		"total_bobot": sum(flt(r.bobot) for r in rows),
		"total_nilai": sum(flt(r.nilai_termin) for r in rows),
		"bisa_ubah": bool(frappe.has_permission("Milestone Termin", "write")),
		"bisa_buat": bool(frappe.has_permission("Milestone Termin", "create")),
		"bisa_hapus": bool(frappe.has_permission("Milestone Termin", "delete")),
	}


@frappe.whitelist()
def get_daftar():
	projects = frappe.get_list(
		"Project",
		filters={"kontrak_project": ("is", "set")},
		fields=["name", "project_name", "customer", "status_proyek", "nilai_kontrak"],
		order_by="creation desc",
		limit_page_length=0,
	)
	if not projects:
		return []
	ringkas = {
		r.project: r
		for r in frappe.db.sql(
			"""select project, count(*) as jumlah, sum(status = 'Tercapai') as tercapai, sum(status = 'Terlambat') as terlambat,
				sum(bobot) as bobot, sum(case when status = 'Tercapai' then bobot else 0 end) as bobot_tercapai,
				sum(case when status = 'Tercapai' then nilai_termin else 0 end) as nilai_tercapai
			from `tabMilestone Termin` where project in %s group by project""",
			(tuple(p.name for p in projects),),
			as_dict=True,
		)
	}
	for p in projects:
		r = ringkas.get(p.name) or {}
		p.update({k: flt(r.get(k)) for k in ("jumlah", "tercapai", "terlambat", "bobot", "bobot_tercapai", "nilai_tercapai")})
	return projects


def milestone_milik(project, name, ptype="write"):
	doc = frappe.get_doc("Milestone Termin", name)
	if doc.project != project:
		frappe.throw(_("Milestone tidak ada di proyek ini."))
	doc.check_permission(ptype)
	return doc


@frappe.whitelist()
def simpan_milestone(project, nama_milestone, tanggal_target, bobot, lingkup=None, catatan=None, dokumen=None, name=None):
	if name:
		doc = milestone_milik(project, name)
	else:
		frappe.has_permission("Milestone Termin", "create", throw=True)
		doc = frappe.new_doc("Milestone Termin")
		doc.project = project
	lingkup = json.loads(lingkup) if isinstance(lingkup, str) else (lingkup or [])
	doc.update({"nama_milestone": nama_milestone, "tanggal_target": tanggal_target, "bobot": flt(bobot), "catatan": catatan})
	if dokumen is not None:
		doc.dokumen = dokumen
	doc.set("lingkup", [{"wbs_item": w} for w in dict.fromkeys(lingkup) if w])
	doc.save()
	return doc.name


@frappe.whitelist()
def tandai_tercapai(project, name, tanggal, dokumen=None, catatan=None):
	doc = milestone_milik(project, name)
	if getdate(tanggal) > getdate(today()):
		frappe.throw(_("Tanggal tercapai tidak boleh di masa depan."))
	doc.tanggal_tercapai = tanggal
	if dokumen:
		doc.dokumen = dokumen
	if catatan:
		doc.catatan = catatan
	doc.save()


@frappe.whitelist()
def batalkan_tercapai(project, name):
	doc = milestone_milik(project, name)
	if doc.sales_invoice and frappe.db.get_value("Sales Invoice", doc.sales_invoice, "docstatus") == 1:
		frappe.throw(_("Milestone ini sudah ditagih ({0}); batalkan tagihannya dulu.").format(doc.sales_invoice))
	doc.tanggal_tercapai = None
	doc.save()


@frappe.whitelist()
def hapus_milestone(project, name):
	milestone_milik(project, name, "delete").delete()
