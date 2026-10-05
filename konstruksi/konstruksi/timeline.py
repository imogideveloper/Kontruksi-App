# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

"""Project Timeline: Gantt per kelompok WBS + Kurva S (rencana vs aktual).

- Aktivitas = Task proyek (jadwal Expected Start/End, progres dari Laporan Progres), dikelompokkan per WBS level 1.
- Jalur kritis: aktivitas tanpa kelonggaran (float) menurut dependensi (Dependent Tasks) & hari kerja Project
  Calendar — akhir terlambat (LF) = min(mulai penerus − 1), aktivitas tanpa penerus berakhir di akhir aktivitas
  terakhir; kritis bila LF − selesai ≤ 0.
- Kurva S: bobot aktivitas = bobot WBS item-nya dibagi rata ke aktivitas di item itu. Rencana = bobot tersebar rata
  per hari kerja jadwal; Aktual = penambahan progres dari Laporan Progres yang dihitung (Disetujui / Direvisi) per tanggal.
"""

from datetime import timedelta

import frappe
from frappe.utils import add_days, flt, get_datetime, getdate, today

from konstruksi.konstruksi.aktivitas import STATUS_DIHITUNG, status_tampil, tanggal_libur
from konstruksi.konstruksi.wbs import kunci_kode


def tgl(v):
	return get_datetime(v).date() if v else None


def indeks_hari_kerja(mulai, sampai, libur):
	"""{tanggal: nomor hari kerja ke-n sejak mulai} untuk rentang mulai..sampai."""
	hasil, n, d = {}, 0, mulai
	while d <= sampai:
		if d not in libur:
			n += 1
		hasil[d] = n
		d += timedelta(days=1)
	return hasil


def jalur_kritis(tasks, dep, libur):
	"""Nama aktivitas di jalur kritis (float ≤ 0 hari kerja)."""
	ada = [t for t in tasks if t.mulai and t.selesai]
	if not ada:
		return set()
	awal, akhir = min(t.mulai for t in ada), max(t.selesai for t in ada)
	idx = indeks_hari_kerja(awal, akhir, libur)
	penerus = {}
	for t in ada:
		for p in dep.get(t.name, []):
			penerus.setdefault(p, []).append(t.name)
	per_nama = {t.name: t for t in ada}
	kritis = set()
	for t in ada:
		lf = min((idx[per_nama[s].mulai] - 1 for s in penerus.get(t.name, []) if s in per_nama), default=idx[akhir])
		if lf - idx[t.selesai] <= 0 and t.status != "Completed":
			kritis.add(t.name)
	return kritis


def kurva_s(tasks, laporan, libur, mulai, selesai):
	"""(titik mingguan {tanggal, rencana, aktual} dalam persen kumulatif, rencana kumulatif s.d. hari ini)."""
	bobot_total = sum(flt(t.bobot) for t in tasks) or 1
	harian_rencana = {}
	for t in tasks:
		if not (t.mulai and t.selesai and flt(t.bobot)):
			continue
		hari = [d for d in (t.mulai + timedelta(days=i) for i in range((t.selesai - t.mulai).days + 1)) if d not in libur]
		hari = hari or [t.selesai]
		for d in hari:
			harian_rencana[d] = harian_rencana.get(d, 0) + flt(t.bobot) / len(hari)
	per_task = {t.name: t for t in tasks}
	if not (mulai and selesai):
		return [], 0
	hari_ini = getdate(today())
	rencana_hari_ini = sum(v for d, v in harian_rencana.items() if d <= hari_ini) / bobot_total * 100
	titik, rencana, aktual = [], 0, 0
	# Progres aktual per aktivitas dibatasi 100%; laporan berlebih tidak menaikkan kurva.
	batas = {t.name: flt(t.bobot) for t in tasks}
	akumulasi_task = {}
	aktual_per_hari = {}
	for r in sorted(laporan, key=lambda x: (getdate(x.tanggal), x.creation)):
		t = per_task.get(r.task)
		if not t or not flt(t.bobot):
			continue
		if t.metode_progres == "Tahapan":
			total = sum(t.bobot_tahap.values()) or len(t.bobot_tahap) or 1
			persen = sum(t.bobot_tahap.get(n) or (0 if sum(t.bobot_tahap.values()) else 1) for n in r.tahap) / total * 100
		elif flt(t.target_volume):
			persen = flt(r.volume) / flt(t.target_volume) * 100
		else:
			persen = 0
		sebelum = akumulasi_task.get(t.name, 0)
		sesudah = min(sebelum + flt(t.bobot) * persen / 100, batas[t.name])
		akumulasi_task[t.name] = sesudah
		d = getdate(r.tanggal)
		aktual_per_hari[d] = aktual_per_hari.get(d, 0) + (sesudah - sebelum)

	d = mulai
	while d <= selesai + timedelta(days=6):
		akhir_minggu = min(d + timedelta(days=6), selesai) if d <= selesai else d
		x = d
		while x <= akhir_minggu:
			rencana += harian_rencana.get(x, 0)
			aktual += aktual_per_hari.get(x, 0)
			x += timedelta(days=1)
		titik.append(
			{
				"tanggal": str(akhir_minggu),
				"rencana": flt(min(rencana / bobot_total * 100, 100), 2),
				"aktual": flt(min(aktual / bobot_total * 100, 100), 2) if akhir_minggu <= hari_ini or d <= hari_ini else None,
			}
		)
		if akhir_minggu >= selesai:
			break
		d = akhir_minggu + timedelta(days=1)
	return titik, min(rencana_hari_ini, 100)


@frappe.whitelist()
def get_timeline(project):
	doc = frappe.get_doc("Project", project)
	doc.check_permission("read")
	libur = tanggal_libur(project)
	hari_ini = getdate(today())

	wbs = {w.name: w for w in frappe.get_all(
		"WBS Item", filters={"project": project}, fields=["name", "kode", "uraian", "parent_wbs", "is_group", "bobot", "progres", "level"]
	)}
	per_kode = {w.kode: w for w in wbs.values()}
	tasks = frappe.get_all(
		"Task",
		filters={"project": project, "is_template": 0, "is_group": 0, "status": ("!=", "Cancelled")},
		fields=["name", "subject", "status", "progress", "exp_start_date", "exp_end_date", "wbs_item", "pj_nama", "pj_jabatan",
			"metode_progres", "target_volume", "satuan", "realisasi_volume", "durasi_hk", "priority"],
	)
	nama = [t.name for t in tasks]
	dep = {}
	if nama:
		for d in frappe.get_all("Task Depends On", filters={"parent": ("in", nama), "parenttype": "Task"}, fields=["parent", "task"]):
			dep.setdefault(d.parent, []).append(d.task)
	jumlah_per_wbs = {}
	for t in tasks:
		jumlah_per_wbs[t.wbs_item] = jumlah_per_wbs.get(t.wbs_item, 0) + 1
	bobot_tahap = {}
	if nama:
		for b in frappe.get_all("Tahapan Aktivitas", filters={"parent": ("in", nama), "parenttype": "Task"}, fields=["parent", "nama_tahap", "bobot"]):
			bobot_tahap.setdefault(b.parent, {})[b.nama_tahap] = flt(b.bobot)
	for t in tasks:
		w = wbs.get(t.wbs_item)
		t.mulai, t.selesai = tgl(t.exp_start_date), tgl(t.exp_end_date)
		t.kode_wbs = w.kode if w else ""
		t.induk = (t.kode_wbs.split(".")[0]) if t.kode_wbs else ""
		t.bobot = flt(w.bobot) / jumlah_per_wbs[t.wbs_item] if w and jumlah_per_wbs.get(t.wbs_item) else 0
		t.bobot_tahap = bobot_tahap.get(t.name, {})
		t.status_tampil = status_tampil(t)
		t.predecessor = dep.get(t.name, [])
	kritis = jalur_kritis(tasks, dep, libur)

	laporan = []
	if nama:
		laporan = frappe.get_all(
			"Laporan Progres", filters={"task": ("in", nama), "status": ("in", STATUS_DIHITUNG)},
			fields=["name", "task", "tanggal", "volume", "creation"],
		)
		tahap = {}
		if laporan:
			for x in frappe.get_all("Laporan Progres Tahap", filters={"parent": ("in", [r.name for r in laporan]), "parenttype": "Laporan Progres"},
					fields=["parent", "nama_tahap"]):
				tahap.setdefault(x.parent, []).append(x.nama_tahap)
		for r in laporan:
			r.tahap = tahap.get(r.name, [])

	mulai = tgl(doc.expected_start_date) or min((t.mulai for t in tasks if t.mulai), default=None)
	selesai = tgl(doc.expected_end_date) or max((t.selesai for t in tasks if t.selesai), default=None)
	titik, rencana_hari_ini = kurva_s(tasks, laporan, libur, mulai, selesai) if mulai and selesai else ([], 0)

	# Kelompok WBS level 1: rentang & progres (progres item WBS induk = tertimbang nilai).
	kelompok = {}
	for t in tasks:
		g = kelompok.setdefault(t.induk or "-", {"kode": t.induk, "uraian": per_kode[t.induk].uraian if t.induk in per_kode else "Tanpa WBS",
			"progres": flt(per_kode[t.induk].progres) if t.induk in per_kode else 0, "aktivitas": []})
		g["aktivitas"].append(t)
	hasil_kelompok = []
	for g in sorted(kelompok.values(), key=lambda g: kunci_kode(g["kode"] or "zz")):
		ak = sorted(g["aktivitas"], key=lambda t: (kunci_kode(t.kode_wbs), str(t.mulai or ""), t.subject))
		ada = [t for t in ak if t.mulai and t.selesai]
		hasil_kelompok.append({
			"kode": g["kode"], "uraian": g["uraian"], "progres": g["progres"],
			"mulai": str(min(t.mulai for t in ada)) if ada else None, "selesai": str(max(t.selesai for t in ada)) if ada else None,
			"aktivitas": [{
				"name": t.name, "subject": t.subject, "kode_wbs": t.kode_wbs, "mulai": str(t.mulai) if t.mulai else None,
				"selesai": str(t.selesai) if t.selesai else None, "progress": flt(t.progress), "status": t.status,
				"status_tampil": t.status_tampil, "pj_nama": t.pj_nama, "pj_jabatan": t.pj_jabatan, "durasi_hk": t.durasi_hk,
				"kritis": t.name in kritis, "predecessor": t.predecessor, "metode_progres": t.metode_progres,
				"realisasi_volume": t.realisasi_volume, "target_volume": t.target_volume, "satuan": t.satuan,
			} for t in ak],
		})

	milestone = frappe.get_all(
		"Milestone Termin", filters={"project": project},
		fields=["name", "urutan", "nama_milestone", "tanggal_target", "tanggal_tercapai", "status", "bobot", "nilai_termin"],
		order_by="urutan asc",
	)
	from konstruksi.konstruksi.wbs import FIELD_ITEM, ringkasan_wbs

	_total, progres = ringkasan_wbs(project, frappe.get_all("WBS Item", filters={"project": project}, fields=FIELD_ITEM))
	return {
		"project": {"name": doc.name, "project_name": doc.project_name, "mulai": str(mulai) if mulai else None,
			"selesai": str(selesai) if selesai else None, "akhir_pemeliharaan": doc.get("akhir_pemeliharaan")},
		"kelompok": hasil_kelompok,
		"milestone": milestone,
		"libur": sorted(str(d) for d in libur if mulai and selesai and add_days(mulai, -60) <= d <= add_days(selesai, 120)),
		"kurva_s": titik,
		"ringkasan": {
			"progres": flt(progres, 2),
			"rencana": flt(rencana_hari_ini, 2),
			"deviasi": flt(flt(progres) - rencana_hari_ini, 2),
			"terlambat": sum(1 for t in tasks if t.status_tampil == "Terlambat"),
			"aktivitas": len(tasks),
			"milestone_tercapai": sum(1 for m in milestone if m.status == "Tercapai"),
			"milestone": len(milestone),
			"kritis": len(kritis),
		},
	}


@frappe.whitelist()
def get_daftar():
	from konstruksi.konstruksi.aktivitas import get_daftar as daftar_aktivitas

	return daftar_aktivitas()
