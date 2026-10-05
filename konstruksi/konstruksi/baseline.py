# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

"""Baseline Schedule: snapshot jadwal rencana (Baseline Jadwal) untuk mengontrol deviasi jadwal aktual.

- Simpan Baseline: salin jadwal semua aktivitas (mulai, selesai, durasi, bobot) & target milestone saat itu; terkunci.
- Bandingkan: rencana baseline s.d. hari ini (bobot tersebar rata per hari kerja jadwal baseline) vs realisasi
  (progres WBS dari laporan disetujui) → deviasi & SPI (realisasi ÷ rencana); varians mulai / selesai per aktivitas
  dan target per milestone (hari kalender, + = mundur).
- Baseline utama (bawaan perbandingan & Timeline) = baseline pertama (biasanya Baseline Awal / Kontrak).
"""

from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import date_diff, flt, get_datetime, getdate, now_datetime, today

from konstruksi.konstruksi.aktivitas import status_tampil, tanggal_libur


def tgl(v):
	return get_datetime(v).date() if v else None


def baseline_utama(project):
	return frappe.db.get_value("Baseline Jadwal", {"project": project}, "name", order_by="tanggal asc, creation asc")


def bobot_aktivitas(project):
	"""Bobot tiap aktivitas (% proyek) = bobot item WBS-nya dibagi rata ke aktivitas di item itu."""
	tasks = frappe.get_all(
		"Task", filters={"project": project, "is_template": 0, "is_group": 0, "status": ("!=", "Cancelled")},
		fields=["name", "wbs_item"],
	)
	jumlah = {}
	for t in tasks:
		jumlah[t.wbs_item] = jumlah.get(t.wbs_item, 0) + 1
	bobot_wbs = dict(frappe.get_all("WBS Item", filters={"project": project}, fields=["name", "bobot"], as_list=True))
	return {t.name: flt(bobot_wbs.get(t.wbs_item)) / jumlah[t.wbs_item] if t.wbs_item and jumlah.get(t.wbs_item) else 0 for t in tasks}


def rencana_sampai(rows, libur, tanggal):
	"""Persen rencana kumulatif s.d. tanggal: bobot tiap aktivitas disebar rata per hari kerja jadwalnya."""
	total = sum(flt(r.bobot) for r in rows) or 0
	if not total:
		return 0
	nilai = 0
	for r in rows:
		mulai, selesai = getdate(r.mulai) if r.mulai else None, getdate(r.selesai) if r.selesai else None
		if not (mulai and selesai and flt(r.bobot)):
			continue
		hari = [mulai + timedelta(days=i) for i in range((selesai - mulai).days + 1)]
		kerja = [d for d in hari if d not in libur] or [selesai]
		nilai += flt(r.bobot) * sum(1 for d in kerja if d <= tanggal) / len(kerja)
	return min(nilai / total * 100, 100)


@frappe.whitelist()
def simpan_baseline(project, nama_baseline, keterangan=None):
	frappe.has_permission("Baseline Jadwal", "create", throw=True)
	doc_project = frappe.get_doc("Project", project)
	doc_project.check_permission("read")
	bobot = bobot_aktivitas(project)
	kode = dict(frappe.get_all("WBS Item", filters={"project": project}, fields=["name", "kode"], as_list=True))
	tasks = frappe.get_all(
		"Task", filters={"project": project, "is_template": 0, "is_group": 0, "status": ("!=", "Cancelled")},
		fields=["name", "subject", "wbs_item", "exp_start_date", "exp_end_date", "durasi_hk"],
	)
	if not tasks:
		frappe.throw(_("Belum ada aktivitas di proyek ini; buat jadwal di Task & Activity Management dulu."))
	from konstruksi.konstruksi.wbs import kunci_kode

	tasks.sort(key=lambda t: (kunci_kode(kode.get(t.wbs_item, "")), str(t.exp_start_date or "")))
	milestone = frappe.get_all("Milestone Termin", filters={"project": project}, fields=["name", "nama_milestone", "tanggal_target", "bobot"],
		order_by="urutan asc")
	doc = frappe.get_doc(
		{
			"doctype": "Baseline Jadwal",
			"project": project,
			"nama_baseline": nama_baseline,
			"keterangan": keterangan,
			"tanggal": now_datetime(),
			"periode_mulai": doc_project.expected_start_date,
			"periode_selesai": doc_project.expected_end_date,
			"aktivitas": [
				{"task": t.name, "kode_wbs": kode.get(t.wbs_item, ""), "subject": t.subject, "mulai": tgl(t.exp_start_date),
					"selesai": tgl(t.exp_end_date), "durasi_hk": t.durasi_hk, "bobot": flt(bobot.get(t.name), 4)}
				for t in tasks
			],
			"milestone": [
				{"milestone": m.name, "nama_milestone": m.nama_milestone, "tanggal_target": m.tanggal_target, "bobot": m.bobot}
				for m in milestone
			],
		}
	)
	doc.insert()
	return doc.name


@frappe.whitelist()
def hapus_baseline(project, name):
	doc = frappe.get_doc("Baseline Jadwal", name)
	if doc.project != project:
		frappe.throw(_("Baseline tidak ada di proyek ini."))
	doc.check_permission("delete")
	doc.delete()


def bandingkan(project, baseline):
	"""Ringkasan & tabel deviasi proyek terhadap satu baseline."""
	b = frappe.get_doc("Baseline Jadwal", baseline)
	libur = tanggal_libur(project)
	hari_ini = getdate(today())
	tasks = {
		t.name: t
		for t in frappe.get_all(
			"Task", filters={"project": project, "is_template": 0, "is_group": 0},
			fields=["name", "subject", "status", "progress", "exp_start_date", "exp_end_date", "wbs_item"],
		)
	}
	kode = dict(frappe.get_all("WBS Item", filters={"project": project}, fields=["name", "kode"], as_list=True))

	def var(baru, lama):
		return date_diff(baru, lama) if baru and lama else None

	aktivitas, di_baseline = [], set()
	for r in b.aktivitas:
		di_baseline.add(r.task)
		t = tasks.get(r.task)
		row = {
			"task": r.task, "kode_wbs": r.kode_wbs, "subject": t.subject if t else r.subject,
			"baseline_mulai": str(r.mulai) if r.mulai else None, "baseline_selesai": str(r.selesai) if r.selesai else None,
		}
		if not t or t.status == "Cancelled":
			row.update({"status": "dihapus", "progres": 0})
		else:
			mulai, selesai = tgl(t.exp_start_date), tgl(t.exp_end_date)
			row.update({
				"status": "ada", "mulai": str(mulai) if mulai else None, "selesai": str(selesai) if selesai else None,
				"var_mulai": var(mulai, r.mulai), "var_selesai": var(selesai, r.selesai), "progres": flt(t.progress),
				"status_tampil": status_tampil(t),
			})
		aktivitas.append(row)
	for t in tasks.values():
		if t.name in di_baseline or t.status == "Cancelled":
			continue
		mulai, selesai = tgl(t.exp_start_date), tgl(t.exp_end_date)
		aktivitas.append({
			"task": t.name, "kode_wbs": kode.get(t.wbs_item, ""), "subject": t.subject, "status": "baru",
			"mulai": str(mulai) if mulai else None, "selesai": str(selesai) if selesai else None, "progres": flt(t.progress),
			"status_tampil": status_tampil(t),
		})
	from konstruksi.konstruksi.wbs import kunci_kode

	aktivitas.sort(key=lambda a: (kunci_kode(a["kode_wbs"]), str(a.get("baseline_mulai") or a.get("mulai") or "")))

	ms_sekarang = {m.name: m for m in frappe.get_all("Milestone Termin", filters={"project": project},
		fields=["name", "nama_milestone", "tanggal_target", "status", "urutan"])}
	milestone, ada_ms = [], set()
	for r in b.milestone:
		ada_ms.add(r.milestone)
		m = ms_sekarang.get(r.milestone)
		milestone.append({
			"milestone": r.milestone, "nama": m.nama_milestone if m else r.nama_milestone,
			"baseline": str(r.tanggal_target) if r.tanggal_target else None,
			"sekarang": str(m.tanggal_target) if m and m.tanggal_target else None,
			"varians": var(m.tanggal_target, r.tanggal_target) if m else None,
			"status": (m.status if m else "dihapus"),
		})
	for m in ms_sekarang.values():
		if m.name not in ada_ms:
			milestone.append({"milestone": m.name, "nama": m.nama_milestone, "baseline": None,
				"sekarang": str(m.tanggal_target) if m.tanggal_target else None, "varians": None, "status": "baru"})

	from konstruksi.konstruksi.wbs import FIELD_ITEM, ringkasan_wbs

	_total, realisasi = ringkasan_wbs(project, frappe.get_all("WBS Item", filters={"project": project}, fields=FIELD_ITEM))
	rencana = rencana_sampai(b.aktivitas, libur, hari_ini)
	return {
		"baseline": {
			"name": b.name, "nama_baseline": b.nama_baseline, "tanggal": str(b.tanggal), "keterangan": b.keterangan,
			"jumlah_aktivitas": b.jumlah_aktivitas, "jumlah_milestone": b.jumlah_milestone, "owner": b.owner,
			"periode_mulai": str(b.periode_mulai) if b.periode_mulai else None,
			"periode_selesai": str(b.periode_selesai) if b.periode_selesai else None,
		},
		"ringkasan": {
			"rencana": flt(rencana, 2),
			"realisasi": flt(realisasi, 2),
			"deviasi": flt(flt(realisasi) - rencana, 2),
			"spi": flt(flt(realisasi) / rencana, 2) if rencana > 0.0001 else None,
			"mundur": sum(1 for a in aktivitas if (a.get("var_selesai") or 0) > 0),
			"maju": sum(1 for a in aktivitas if (a.get("var_selesai") or 0) < 0),
			"baru": sum(1 for a in aktivitas if a["status"] == "baru"),
			"dihapus": sum(1 for a in aktivitas if a["status"] == "dihapus"),
		},
		"aktivitas": aktivitas,
		"milestone": milestone,
	}


@frappe.whitelist()
def get_baseline(project, baseline=None):
	doc = frappe.get_doc("Project", project)
	doc.check_permission("read")
	daftar = frappe.get_all(
		"Baseline Jadwal", filters={"project": project},
		fields=["name", "nama_baseline", "tanggal", "jumlah_aktivitas", "jumlah_milestone", "keterangan"],
		order_by="tanggal asc, creation asc",
	)
	if baseline and not any(d.name == baseline for d in daftar):
		baseline = None
	hasil = {
		"project": {"name": doc.name, "project_name": doc.project_name},
		"daftar": daftar,
		"utama": daftar[0].name if daftar else None,
		"jumlah_aktivitas": frappe.db.count("Task", {"project": project, "is_template": 0, "is_group": 0, "status": ("!=", "Cancelled")}),
		"bisa_buat": bool(frappe.has_permission("Baseline Jadwal", "create")),
		"bisa_hapus": bool(frappe.has_permission("Baseline Jadwal", "delete")),
	}
	pilih = baseline or (daftar[0].name if daftar else None)
	if pilih:
		hasil.update(bandingkan(project, pilih))
	return hasil


@frappe.whitelist()
def get_daftar():
	projects = frappe.get_list(
		"Project", filters={"kontrak_project": ("is", "set")},
		fields=["name", "project_name", "customer", "status_proyek"], order_by="creation desc", limit_page_length=0,
	)
	for p in projects:
		daftar = frappe.get_all("Baseline Jadwal", filters={"project": p.name}, fields=["name", "nama_baseline", "tanggal"],
			order_by="tanggal asc, creation asc")
		p.jumlah_baseline = len(daftar)
		p.baseline_utama = daftar[0].nama_baseline if daftar else None
		p.baseline_terakhir = daftar[-1].nama_baseline if daftar else None
		if daftar:
			r = bandingkan(p.name, daftar[0].name)["ringkasan"]
			p.update({"rencana": r["rencana"], "realisasi": r["realisasi"], "deviasi": r["deviasi"], "spi": r["spi"], "mundur": r["mundur"]})
	return projects


def baseline_per_task(project):
	"""{task: (mulai, selesai)} dari baseline utama — untuk batang Baseline di Project Timeline."""
	utama = baseline_utama(project)
	if not utama:
		return None, {}
	rows = frappe.get_all("Baseline Jadwal Aktivitas", filters={"parent": utama, "parenttype": "Baseline Jadwal"},
		fields=["task", "mulai", "selesai"])
	return frappe.db.get_value("Baseline Jadwal", utama, "nama_baseline"), {
		r.task: (str(r.mulai) if r.mulai else None, str(r.selesai) if r.selesai else None) for r in rows
	}
