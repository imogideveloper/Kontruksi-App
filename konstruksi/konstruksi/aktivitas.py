# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

"""Task & Activity Management: aktivitas lapangan (Task ERPNext) per item WBS dan Laporan Progres harian.

- Progres aktivitas dihitung dari Laporan Progres yang DISETUJUI: metode Volume = realisasi ÷ target volume,
  metode Tahapan = tahap selesai ÷ jumlah tahap. Progres Task → progres item WBS → progres proyek (wbs.py).
- Durasi dihitung dalam hari kerja menurut Project Calendar (Holiday List proyek).
- Status Task mengikuti progres & jadwal: Belum Mulai (Open), Berjalan (Working), Terlambat (Overdue), Selesai
  (Completed). Selesai hanya bila semua predecessor (Dependent Tasks) sudah selesai — aturan bawaan ERPNext.
"""

import json
from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import cint, flt, get_datetime, getdate, now_datetime, today

PENYETUJU = ("Projects Manager", "System Manager")


def tanggal_libur(project):
	hl = frappe.db.get_value("Project", project, "holiday_list")
	if not hl:
		return set()
	return {getdate(d) for d in frappe.get_all("Holiday", filters={"parent": hl}, pluck="holiday_date")}


def hari_kerja(dari, sampai, libur):
	if not (dari and sampai):
		return 0
	d, akhir, n = getdate(dari), getdate(sampai), 0
	while d <= akhir:
		if d not in libur:
			n += 1
		d += timedelta(days=1)
	return n


def bisa_setujui():
	return bool(set(PENYETUJU) & set(frappe.get_roles()))


# ---------- Task (doc_events) ----------


def hitung_task(doc, method=None):
	"""Task validate: durasi hari kerja, progres dari realisasi / tahapan, dan status."""
	if not doc.get("project") or doc.is_template or not frappe.db.get_value("Project", doc.project, "kontrak_project"):
		return
	doc.durasi_hk = hari_kerja(doc.exp_start_date, doc.exp_end_date, tanggal_libur(doc.project)) if doc.exp_start_date else 0

	if doc.get("metode_progres") == "Tahapan":
		tahap = doc.get("tahapan") or []
		total_bobot = sum(flt(t.bobot) for t in tahap)
		if total_bobot:
			# Progres = jumlah bobot tahap yang selesai (dinormalkan bila total bobot belum tepat 100%).
			doc.progress = flt(min(sum(flt(t.bobot) for t in tahap if t.selesai) / total_bobot * 100, 100), 2)
		else:
			doc.progress = flt(sum(1 for t in tahap if t.selesai) / len(tahap) * 100, 2) if tahap else 0
	else:
		target = flt(doc.get("target_volume"))
		doc.progress = flt(min(flt(doc.realisasi_volume) / target * 100, 100), 2) if target else 0

	if doc.status == "Cancelled":
		return
	if flt(doc.progress) >= 100:
		belum = [d.task for d in doc.depends_on if frappe.db.get_value("Task", d.task, "status") not in ("Completed", "Cancelled")]
		if not belum:
			doc.status = "Completed"
			doc.completed_on = doc.completed_on or today()
			return
	terlambat = doc.exp_end_date and get_datetime(doc.exp_end_date).date() < getdate()
	if doc.status == "Completed" and flt(doc.progress) < 100:
		doc.status = "Working"
		doc.completed_on = None
	if terlambat and doc.status in ("Open", "Working"):
		doc.status = "Overdue"
	elif not terlambat and doc.status == "Overdue":
		doc.status = "Working" if flt(doc.progress) > 0 else "Open"
	elif flt(doc.progress) > 0 and doc.status == "Open":
		doc.status = "Working"


def perbarui_dari_laporan(task):
	"""Realisasi volume & tahap selesai dari semua Laporan Progres yang disetujui, lalu simpan Task (progres ikut)."""
	doc = frappe.get_doc("Task", task)
	laporan = frappe.get_all(
		"Laporan Progres",
		filters={"task": task, "status": "Disetujui"},
		fields=["name", "tanggal", "volume"],
		order_by="tanggal asc, creation asc",
	)
	doc.realisasi_volume = sum(flt(l.volume) for l in laporan)
	selesai = {}
	if laporan:
		for row in frappe.get_all(
			"Laporan Progres Tahap",
			filters={"parent": ("in", [l.name for l in laporan]), "parenttype": "Laporan Progres"},
			fields=["parent", "nama_tahap"],
		):
			selesai.setdefault(row.nama_tahap, row.parent)
	per_laporan = {l.name: l.tanggal for l in laporan}
	for t in doc.get("tahapan") or []:
		lap = selesai.get(t.nama_tahap)
		t.selesai = 1 if lap else 0
		t.laporan = lap
		t.tanggal_selesai = per_laporan.get(lap) if lap else None
	doc.flags.ignore_permissions = True
	doc.save()


# ---------- data halaman ----------


def status_tampil(t):
	return {
		"Open": "Belum Mulai", "Working": "Berjalan", "Pending Review": "Menunggu Review", "Overdue": "Terlambat",
		"Completed": "Selesai", "Cancelled": "Dibatalkan",
	}.get(t.status, t.status)


@frappe.whitelist()
def get_aktivitas(project):
	doc = frappe.get_doc("Project", project)
	doc.check_permission("read")
	tasks = frappe.get_all(
		"Task",
		filters={"project": project, "is_template": 0, "is_group": 0},
		fields=[
			"name", "subject", "status", "priority", "progress", "exp_start_date", "exp_end_date", "wbs_item", "pj", "pj_nama",
			"pj_jabatan", "metode_progres", "target_volume", "satuan", "realisasi_volume", "durasi_hk", "description",
			"is_milestone",
		],
	)
	nama = [t.name for t in tasks]
	wbs = {
		w.name: w
		for w in frappe.get_all(
			"WBS Item", filters={"project": project}, fields=["name", "kode", "uraian", "satuan", "volume", "is_group"]
		)
	}
	dep, tahap, menunggu = {}, {}, {}
	if nama:
		for d in frappe.get_all("Task Depends On", filters={"parent": ("in", nama), "parenttype": "Task"}, fields=["parent", "task"]):
			dep.setdefault(d.parent, []).append(d.task)
		for t in frappe.get_all(
			"Tahapan Aktivitas", filters={"parent": ("in", nama), "parenttype": "Task"},
			fields=["parent", "nama_tahap", "bobot", "selesai"], order_by="idx asc",
		):
			tahap.setdefault(t.parent, []).append({"nama_tahap": t.nama_tahap, "bobot": t.bobot, "selesai": t.selesai})
		for l in frappe.db.sql(
			"""select task, count(*) as n from `tabLaporan Progres` where task in %s and status = 'Menunggu' group by task""",
			(tuple(nama),),
			as_dict=True,
		):
			menunggu[l.task] = l.n
	per_nama = {t.name: t for t in tasks}

	from konstruksi.konstruksi.wbs import kunci_kode

	for t in tasks:
		w = wbs.get(t.wbs_item)
		t.kode_wbs = w.kode if w else ""
		t.uraian_wbs = w.uraian if w else ""
		t.status_tampil = status_tampil(t)
		t.tahapan = tahap.get(t.name, [])
		t.laporan_menunggu = menunggu.get(t.name, 0)
		t.predecessor = []
		for p in dep.get(t.name, []):
			pt = per_nama.get(p)
			if not pt:
				continue
			mendahului = bool(
				t.exp_start_date and pt.exp_end_date and pt.status != "Completed"
				and get_datetime(t.exp_start_date).date() <= get_datetime(pt.exp_end_date).date()
			)
			t.predecessor.append({"name": p, "subject": pt.subject, "mendahului": mendahului})
	tasks.sort(key=lambda t: (not t.kode_wbs, kunci_kode(t.kode_wbs), str(t.exp_start_date or ""), t.subject))

	pj = frappe.get_all(
		"Penugasan Personel", filters={"project": project}, fields=["employee", "nama_personel", "jabatan"], order_by="nama_personel"
	)
	from konstruksi.konstruksi.wbs import FIELD_ITEM, ringkasan_wbs

	items = frappe.get_all("WBS Item", filters={"project": project}, fields=FIELD_ITEM)
	_total, progres = ringkasan_wbs(project, items)
	return {
		"project": {
			"name": doc.name,
			"project_name": doc.project_name,
			"mulai": doc.expected_start_date,
			"selesai": doc.expected_end_date,
		},
		"aktivitas": tasks,
		"wbs": sorted(
			[{"name": w.name, "kode": w.kode, "uraian": w.uraian, "satuan": w.satuan, "volume": w.volume, "is_group": w.is_group} for w in wbs.values()],
			key=lambda w: kunci_kode(w["kode"]),
		),
		"personel": list({p.employee: p for p in pj}.values()),
		"libur": sorted(str(d) for d in tanggal_libur(project)),
		"progres": flt(progres, 2),
		"laporan_menunggu": frappe.db.count("Laporan Progres", {"project": project, "status": "Menunggu"}),
		"bisa_ubah": bool(frappe.has_permission("Task", "write")),
		"bisa_buat": bool(frappe.has_permission("Task", "create")),
		"bisa_hapus": bool(frappe.has_permission("Task", "delete")),
		"bisa_setujui": bisa_setujui(),
	}


@frappe.whitelist()
def get_laporan(project, status=None):
	frappe.get_doc("Project", project).check_permission("read")
	filters = {"project": project}
	if status:
		filters["status"] = status
	rows = frappe.get_all(
		"Laporan Progres",
		filters=filters,
		fields=[
			"name", "task", "aktivitas", "tanggal", "pelapor", "nama_pelapor", "status", "metode", "volume", "satuan", "catatan",
			"kendala", "foto", "disetujui_oleh", "alasan_tolak", "owner",
		],
		order_by="tanggal desc, creation desc",
		limit_page_length=200,
	)
	if rows:
		tahap = {}
		for t in frappe.get_all(
			"Laporan Progres Tahap", filters={"parent": ("in", [r.name for r in rows]), "parenttype": "Laporan Progres"},
			fields=["parent", "nama_tahap"], order_by="idx asc",
		):
			tahap.setdefault(t.parent, []).append(t.nama_tahap)
		for r in rows:
			r.tahap = tahap.get(r.name, [])
	return rows


@frappe.whitelist()
def get_daftar():
	"""Daftar Project Master dengan ringkasan aktivitas."""
	projects = frappe.get_list(
		"Project",
		filters={"kontrak_project": ("is", "set")},
		fields=["name", "project_name", "customer", "status_proyek"],
		order_by="creation desc",
		limit_page_length=0,
	)
	if not projects:
		return []
	nama = tuple(p.name for p in projects)
	ringkas = {
		r.project: r
		for r in frappe.db.sql(
			"""select project, count(*) as jumlah, sum(status = 'Working') as berjalan, sum(status = 'Overdue') as terlambat,
				sum(status = 'Completed') as selesai
			from `tabTask` where project in %s and is_template = 0 and is_group = 0 and status != 'Cancelled' group by project""",
			(nama,),
			as_dict=True,
		)
	}
	menunggu = {
		r.project: r.n
		for r in frappe.db.sql(
			"select project, count(*) as n from `tabLaporan Progres` where project in %s and status = 'Menunggu' group by project",
			(nama,),
			as_dict=True,
		)
	}
	progres = {
		r.project: flt(r.nilai / r.total, 2) if flt(r.total) else 0
		for r in frappe.db.sql(
			"""select project, sum(jumlah_harga) as total, sum(jumlah_harga * progres) as nilai from `tabWBS Item`
			where project in %s and ifnull(parent_wbs, '') = '' group by project""",
			(nama,),
			as_dict=True,
		)
	}
	for p in projects:
		r = ringkas.get(p.name) or {}
		p.update(
			{
				"jumlah": cint(r.get("jumlah")),
				"berjalan": cint(r.get("berjalan")),
				"terlambat": cint(r.get("terlambat")),
				"selesai": cint(r.get("selesai")),
				"menunggu": menunggu.get(p.name, 0),
				"progres": progres.get(p.name, 0),
			}
		)
	return projects


# ---------- aksi ----------


def task_milik(project, name, ptype="write"):
	doc = frappe.get_doc("Task", name)
	if doc.project != project:
		frappe.throw(_("Aktivitas tidak ada di proyek ini."))
	doc.check_permission(ptype)
	return doc


@frappe.whitelist()
def simpan_aktivitas(project, subject, wbs_item, exp_start_date, exp_end_date, name=None, pj=None, priority="Medium",
		predecessor=None, metode_progres="Volume", target_volume=0, satuan=None, tahapan=None, description=None):
	if name:
		doc = task_milik(project, name)
	else:
		frappe.has_permission("Task", "create", throw=True)
		doc = frappe.new_doc("Task")
		doc.project = project
	if frappe.db.get_value("WBS Item", wbs_item, "project") != project:
		frappe.throw(_("Item WBS tidak ada di proyek ini."))
	predecessor = json.loads(predecessor) if isinstance(predecessor, str) else (predecessor or [])
	tahapan = json.loads(tahapan) if isinstance(tahapan, str) else (tahapan or [])
	doc.update(
		{
			"subject": subject,
			"wbs_item": wbs_item,
			"pj": pj or None,
			"exp_start_date": exp_start_date,
			"exp_end_date": exp_end_date,
			"priority": priority,
			"metode_progres": metode_progres,
			"target_volume": flt(target_volume),
			"satuan": satuan,
			"description": description,
		}
	)
	doc.set("depends_on", [{"task": p} for p in predecessor if p and p != doc.name])
	# Tahapan: [{nama_tahap, bobot}] (atau daftar nama); status selesai dipertahankan untuk nama tahap yang sama.
	lama = {t.nama_tahap: t for t in doc.get("tahapan") or []}
	baris = {}
	for t in tahapan:
		nama_tahap = (t.get("nama_tahap") if isinstance(t, dict) else t) or ""
		nama_tahap = nama_tahap.strip()
		if nama_tahap and nama_tahap not in baris:
			baris[nama_tahap] = flt(t.get("bobot")) if isinstance(t, dict) else 0
	doc.set(
		"tahapan",
		[
			{
				"nama_tahap": n,
				"bobot": bobot,
				"selesai": lama[n].selesai if n in lama else 0,
				"tanggal_selesai": lama[n].tanggal_selesai if n in lama else None,
				"laporan": lama[n].laporan if n in lama else None,
			}
			for n, bobot in baris.items()
		],
	)
	if metode_progres == "Tahapan":
		if not doc.tahapan:
			frappe.throw(_("Isi minimal satu tahap untuk metode Tahapan."))
		total = sum(flt(t.bobot) for t in doc.tahapan)
		if abs(total - 100) > 0.01:
			frappe.throw(_("Total bobot tahapan harus 100% (sekarang {0}%).").format(flt(total, 2)))
	doc.save()
	return doc.name


@frappe.whitelist()
def hapus_aktivitas(project, name):
	doc = task_milik(project, name, "delete")
	if frappe.db.exists("Laporan Progres", {"task": name, "status": "Disetujui"}):
		frappe.throw(_("Aktivitas ini sudah punya laporan progres yang disetujui; ubah statusnya menjadi Cancelled bila tidak dikerjakan."))
	for l in frappe.get_all("Laporan Progres", filters={"task": name}, pluck="name"):
		frappe.delete_doc("Laporan Progres", l, ignore_permissions=True)
	doc.delete()


@frappe.whitelist()
def simpan_laporan(project, task, tanggal, volume=0, tahap=None, catatan=None, kendala=None, foto=None, langsung_setujui=0):
	t = task_milik(project, task, "read")
	frappe.has_permission("Laporan Progres", "create", throw=True)
	tahap = json.loads(tahap) if isinstance(tahap, str) else (tahap or [])
	doc = frappe.get_doc(
		{
			"doctype": "Laporan Progres",
			"task": t.name,
			"tanggal": tanggal,
			"volume": flt(volume),
			"tahap": [{"nama_tahap": n} for n in tahap],
			"catatan": catatan,
			"kendala": kendala,
			"foto": foto,
		}
	).insert()
	if cint(langsung_setujui) and bisa_setujui():
		setujui_laporan(project, doc.name)
	return doc.name


def laporan_milik(project, name):
	doc = frappe.get_doc("Laporan Progres", name)
	if doc.project != project:
		frappe.throw(_("Laporan tidak ada di proyek ini."))
	return doc


@frappe.whitelist()
def setujui_laporan(project, name):
	if not bisa_setujui():
		frappe.throw(_("Hanya Projects Manager yang bisa menyetujui laporan progres."), frappe.PermissionError)
	doc = laporan_milik(project, name)
	doc.update({"status": "Disetujui", "disetujui_oleh": frappe.session.user, "disetujui_pada": now_datetime(), "alasan_tolak": None})
	doc.flags.ignore_permissions = True
	doc.flags.keputusan = True
	doc.save()


@frappe.whitelist()
def tolak_laporan(project, name, alasan):
	if not bisa_setujui():
		frappe.throw(_("Hanya Projects Manager yang bisa menolak laporan progres."), frappe.PermissionError)
	doc = laporan_milik(project, name)
	doc.update({"status": "Ditolak", "disetujui_oleh": frappe.session.user, "disetujui_pada": now_datetime(), "alasan_tolak": alasan})
	doc.flags.ignore_permissions = True
	doc.flags.keputusan = True
	doc.save()


@frappe.whitelist()
def hapus_laporan(project, name):
	doc = laporan_milik(project, name)
	if doc.status == "Disetujui" and not bisa_setujui():
		frappe.throw(_("Laporan yang sudah disetujui hanya bisa dihapus oleh Projects Manager."))
	if doc.owner != frappe.session.user and not bisa_setujui():
		frappe.throw(_("Hanya pembuat laporan atau Projects Manager yang bisa menghapus laporan ini."))
	frappe.delete_doc("Laporan Progres", name, ignore_permissions=True)
