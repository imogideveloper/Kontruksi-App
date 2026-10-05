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
# Status laporan yang dihitung ke realisasi (Direvisi = volume / tahap hasil revisi).
STATUS_DIHITUNG = ("Disetujui", "Direvisi")


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
		# Progres turun (mis. laporan direvisi): kembali Berjalan, atau Belum Mulai bila 0%.
		doc.status = "Working" if flt(doc.progress) > 0 else "Open"
		doc.completed_on = None
	elif doc.status == "Working" and flt(doc.progress) <= 0:
		doc.status = "Open"
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
		filters={"task": task, "status": ("in", STATUS_DIHITUNG)},
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
			"kendala", "foto", "disetujui_oleh", "alasan_tolak", "owner", "volume_awal", "tahap_dibatalkan", "alasan_revisi",
			"milestone_revisi", "direvisi_oleh", "direvisi_pada",
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
	if frappe.db.exists("Laporan Progres", {"task": name, "status": ("in", STATUS_DIHITUNG)}):
		frappe.throw(_("Aktivitas ini sudah punya laporan progres yang disetujui; ubah statusnya menjadi Cancelled bila tidak dikerjakan."))
	for l in frappe.get_all("Laporan Progres", filters={"task": name}, pluck="name"):
		frappe.delete_doc("Laporan Progres", l, ignore_permissions=True)
	doc.delete()


@frappe.whitelist()
def get_riwayat(project, task):
	"""Riwayat laporan satu aktivitas (lama → baru) dengan progres kumulatif dari laporan yang disetujui."""
	t = task_milik(project, task, "read")
	rows = frappe.get_all(
		"Laporan Progres",
		filters={"task": task},
		fields=["name", "tanggal", "volume", "status", "nama_pelapor", "owner", "catatan", "alasan_tolak", "creation", "volume_awal",
			"tahap_dibatalkan", "alasan_revisi", "milestone_revisi"],
		order_by="tanggal asc, creation asc",
	)
	tahap = {}
	if rows:
		for r in frappe.get_all(
			"Laporan Progres Tahap", filters={"parent": ("in", [r.name for r in rows]), "parenttype": "Laporan Progres"},
			fields=["parent", "nama_tahap"], order_by="idx asc",
		):
			tahap.setdefault(r.parent, []).append(r.nama_tahap)
	bobot = {x.nama_tahap: flt(x.bobot) for x in t.get("tahapan") or []}
	total_bobot = sum(bobot.values()) or len(bobot) or 1
	kumulatif = 0
	for r in rows:
		r.tahap = tahap.get(r.name, [])
		if r.status in STATUS_DIHITUNG:
			if t.metode_progres == "Tahapan":
				kumulatif += sum(bobot.get(n) or (0 if sum(bobot.values()) else 1) for n in r.tahap) / total_bobot * 100
			elif flt(t.target_volume):
				kumulatif += flt(r.volume) / flt(t.target_volume) * 100
			r.progres_kumulatif = flt(min(kumulatif, 100), 2)
	pegawai = frappe.db.get_value("Employee", {"user_id": frappe.session.user, "status": "Active"}, ["name", "employee_name"], as_dict=True)
	return {
		"riwayat": rows,
		"menunggu_volume": sum(flt(r.volume) for r in rows if r.status == "Menunggu"),
		"menunggu_tahap": [n for r in rows if r.status == "Menunggu" for n in r.tahap],
		"menunggu": sum(1 for r in rows if r.status == "Menunggu"),
		"pegawai_saya": pegawai,
	}


@frappe.whitelist()
def simpan_laporan(project, task, tanggal, volume=0, tahap=None, catatan=None, kendala=None, foto=None, langsung_setujui=0,
		pelapor=None):
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
			"pelapor": pelapor or None,
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
def revisi_laporan(project, name, alasan, volume=None, tahap_batal=None):
	"""Revisi laporan progres yang sudah disetujui (hanya Projects Manager). Metode Volume: volume koreksi (0 = laporan
	dibatalkan); metode Tahapan: tahap yang dibatalkan (semua = laporan dibatalkan). Laporan asli tetap tersimpan
	berstatus Direvisi / Dibatalkan dengan jejak revisinya; realisasi & status aktivitas dihitung ulang.
	Ditolak bila aktivitasnya termasuk milestone yang masih berstatus tercapai."""
	from konstruksi.konstruksi.milestone import milestone_tercapai_untuk

	if not bisa_setujui():
		frappe.throw(_("Hanya Projects Manager yang bisa merevisi laporan progres."), frappe.PermissionError)
	alasan = (alasan or "").strip()
	if not alasan:
		frappe.throw(_("Isi alasan revisi."))
	lap = laporan_milik(project, name)
	if lap.status not in STATUS_DIHITUNG:
		frappe.throw(_("Hanya laporan yang sudah disetujui yang bisa direvisi."))
	m = milestone_tercapai_untuk(project, frappe.db.get_value("Task", lap.task, "wbs_item"))
	if m:
		frappe.throw(
			_("Aktivitas ini termasuk milestone {0} ({1}) yang masih berstatus tercapai. Batalkan dulu status tercapainya di menu Milestone & Termin.").format(
				frappe.bold(m.nama_milestone), m.name
			),
			title=_("Milestone masih tercapai"),
		)
	if lap.metode == "Tahapan":
		tahap_batal = json.loads(tahap_batal) if isinstance(tahap_batal, str) else (tahap_batal or [])
		batal = [n for n in tahap_batal if n in {t.nama_tahap for t in lap.tahap}]
		if not batal:
			frappe.throw(_("Pilih tahap yang dibatalkan."))
		sisa = [t for t in lap.tahap if t.nama_tahap not in batal]
		lap.tahap_dibatalkan = ", ".join(filter(None, [lap.tahap_dibatalkan, ", ".join(batal)]))
		lap.set("tahap", [{"nama_tahap": t.nama_tahap} for t in sisa])
		lap.status = "Direvisi" if sisa else "Dibatalkan"
		ringkas = _("tahap dibatalkan: {0}").format(", ".join(batal))
	else:
		baru = flt(volume)
		if baru < 0 or baru >= flt(lap.volume):
			frappe.throw(_("Volume revisi harus 0 sampai kurang dari {0}.").format(flt(lap.volume)))
		if not lap.volume_awal:
			lap.volume_awal = lap.volume
		ringkas = _("volume {0} → {1} {2}").format(flt(lap.volume), baru, lap.satuan or "")
		lap.volume = baru
		lap.status = "Direvisi" if baru else "Dibatalkan"
	lap.update({"alasan_revisi": alasan, "direvisi_oleh": frappe.session.user, "direvisi_pada": now_datetime()})
	lap.flags.keputusan = True
	lap.flags.ignore_permissions = True
	lap.save()
	lap.add_comment("Comment", _("Direvisi: {0}. Alasan: {1}").format(ringkas, frappe.utils.escape_html(alasan)))
	return {"status": lap.status}


@frappe.whitelist()
def hapus_laporan(project, name):
	doc = laporan_milik(project, name)
	if doc.status in STATUS_DIHITUNG:
		from konstruksi.konstruksi.milestone import milestone_tercapai_untuk

		m = milestone_tercapai_untuk(project, frappe.db.get_value("Task", doc.task, "wbs_item"))
		if m:
			frappe.throw(_("Aktivitas ini termasuk milestone {0} yang masih berstatus tercapai; batalkan dulu status tercapainya.").format(
				frappe.bold(m.nama_milestone)))
	if doc.status in STATUS_DIHITUNG and not bisa_setujui():
		frappe.throw(_("Laporan yang sudah disetujui hanya bisa dihapus oleh Projects Manager."))
	if doc.owner != frappe.session.user and not bisa_setujui():
		frappe.throw(_("Hanya pembuat laporan atau Projects Manager yang bisa menghapus laporan ini."))
	frappe.delete_doc("Laporan Progres", name, ignore_permissions=True)


# ---------- Excel: template & upload aktivitas ----------

KOLOM_EXCEL = (
	("No", "no"),
	("Nama Aktivitas", "subject"),
	("Kode WBS", "kode_wbs"),
	("Prioritas", "prioritas"),
	("Durasi (hari kerja)", "durasi"),
	("Setelah No", "setelah"),
	("Mulai", "mulai"),
	("Selesai", "selesai"),
	("Diukur dari", "metode"),
	("Target Volume", "target_volume"),
	("Satuan", "satuan"),
	("Tahapan (nama:bobot; ...)", "tahapan"),
	("Penanggung Jawab", "pj"),
	("Catatan", "catatan"),
)
PRIORITAS_EXCEL = {"rendah": "Low", "sedang": "Medium", "tinggi": "High", "kritis": "Urgent",
	"low": "Low", "medium": "Medium", "high": "High", "urgent": "Urgent"}
PRIORITAS_TEKS = {"Low": "Rendah", "Medium": "Sedang", "High": "Tinggi", "Urgent": "Kritis"}


def normal(teks):
	return " ".join(str(teks or "").split()).strip().lower()


def tambah_hari_kerja(mulai, durasi, libur):
	"""Tanggal selesai: hari kerja ke-`durasi` sejak `mulai` (mulai dihitung bila hari kerja)."""
	d, n = getdate(mulai), 0
	while True:
		if d not in libur:
			n += 1
			if n >= durasi:
				return d
		d += timedelta(days=1)


def hari_kerja_berikut(tanggal, libur):
	d = getdate(tanggal) + timedelta(days=1)
	while d in libur:
		d += timedelta(days=1)
	return d


def parse_tanggal(value):
	from datetime import date, datetime

	if not value:
		return None
	if isinstance(value, datetime):
		return value.date()
	if isinstance(value, date):
		return value
	teks = str(value).strip()
	for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%y", "%Y-%m-%d %H:%M:%S"):
		try:
			return datetime.strptime(teks, fmt).date()
		except ValueError:
			continue
	raise ValueError(teks)


def parse_tahapan(teks):
	"""'Pondasi:15; Struktur:30' -> [{nama_tahap, bobot}]."""
	from konstruksi.konstruksi.doctype.rab_penawaran.rab_penawaran import parse_angka

	hasil = []
	for bagian in str(teks or "").replace("\n", ";").split(";"):
		if not bagian.strip():
			continue
		nama, _sep, bobot = bagian.rpartition(":") if ":" in bagian else (bagian, "", "")
		hasil.append({"nama_tahap": nama.strip(), "bobot": parse_angka(bobot.replace("%", "")) if bobot.strip() else 0})
	return hasil


def kirim_xlsx_aktivitas(nama_file, baris):
	from io import BytesIO

	from openpyxl import Workbook
	from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

	wb = Workbook()
	ws = wb.active
	ws.title = "Aktivitas"
	lebar = {"no": 5, "subject": 40, "kode_wbs": 10, "prioritas": 10, "durasi": 11, "setelah": 10, "mulai": 12, "selesai": 12,
		"metode": 11, "target_volume": 11, "satuan": 8, "tahapan": 42, "pj": 24, "catatan": 36}
	ws.append([judul for judul, _ in KOLOM_EXCEL])
	for c, (_, f) in enumerate(KOLOM_EXCEL, start=1):
		sel = ws.cell(row=1, column=c)
		sel.font = Font(bold=True, color="FFFFFF")
		sel.fill = PatternFill("solid", fgColor="1F3A5F")
		sel.alignment = Alignment(vertical="center", horizontal="center", wrap_text=True)
		ws.column_dimensions[sel.column_letter].width = lebar.get(f, 12)
	ws.row_dimensions[1].height = 32
	ws.freeze_panes = "C2"
	garis = Border(bottom=Side(style="thin", color="D0D5DD"))
	for b in baris:
		ws.append([b.get(f) for _, f in KOLOM_EXCEL])
		r = ws.max_row
		for c, (_, f) in enumerate(KOLOM_EXCEL, start=1):
			sel = ws.cell(row=r, column=c)
			sel.border = garis
			if f in ("mulai", "selesai"):
				sel.number_format = "DD/MM/YYYY"
			elif f == "target_volume":
				sel.number_format = "#,##0.##"
			elif f == "kode_wbs":
				sel.alignment = Alignment(horizontal="left")

	petunjuk = wb.create_sheet("Petunjuk")
	for teks in [
		"Cara mengisi Aktivitas (Task & Activity Management)",
		"",
		"1. Isi sheet Aktivitas mulai baris 2; jangan ubah judul kolom di baris 1. Satu baris = satu aktivitas.",
		"2. No: nomor urut di file ini (dipakai kolom Setelah No). Kode WBS: kode item WBS proyek (mis. 2.1), bukan item induk.",
		"3. Prioritas: Rendah / Sedang / Tinggi / Kritis.",
		"4. Jadwal: isi Mulai & Selesai (DD/MM/YYYY), atau Mulai + Durasi (hari kerja; Selesai dihitung dari Project Calendar).",
		"   Mulai boleh kosong bila Setelah No diisi: aktivitas mulai hari kerja berikutnya setelah predecessor selesai.",
		"5. Setelah No: No aktivitas yang harus selesai lebih dulu; boleh lebih dari satu dipisah koma (mis. 3, 5).",
		"6. Diukur dari: Volume (isi Target Volume & Satuan) atau Tahapan (isi kolom Tahapan).",
		"7. Tahapan: nama:bobot dipisah titik koma, total bobot 100. Contoh: Pondasi:15; Struktur:30; Dinding:20; Atap:15; Finishing:20",
		"   Kolom yang tidak sesuai metode diabaikan (Tahapan untuk Volume, Target Volume untuk Tahapan).",
		"8. Penanggung Jawab: nama personel atau jabatan di Tim Proyek (mis. Site Manager).",
		"9. Aktivitas dengan Nama & Kode WBS yang sudah ada akan diperbarui, bukan dibuat dobel.",
	]:
		petunjuk.append([teks])
	petunjuk["A1"].font = Font(bold=True, size=13)
	petunjuk.column_dimensions["A"].width = 120

	buffer = BytesIO()
	wb.save(buffer)
	frappe.response["filename"] = f"{nama_file}.xlsx"
	frappe.response["filecontent"] = buffer.getvalue()
	frappe.response["type"] = "binary"


@frappe.whitelist()
def download_template(project):
	"""Template Excel aktivitas: berisi aktivitas proyek yang sudah ada; bila belum ada, satu baris per item WBS."""
	frappe.get_doc("Project", project).check_permission("read")
	d = get_aktivitas(project)
	baris = []
	if d["aktivitas"]:
		no = {t.name: i for i, t in enumerate(d["aktivitas"], start=1)}
		for i, t in enumerate(d["aktivitas"], start=1):
			baris.append(
				{
					"no": i, "subject": t.subject, "kode_wbs": t.kode_wbs, "prioritas": PRIORITAS_TEKS.get(t.priority, ""),
					"durasi": t.durasi_hk or None, "setelah": ", ".join(str(no[p["name"]]) for p in t.predecessor if p["name"] in no),
					"mulai": getdate(t.exp_start_date) if t.exp_start_date else None,
					"selesai": getdate(t.exp_end_date) if t.exp_end_date else None,
					"metode": t.metode_progres or "Volume",
					"target_volume": t.target_volume if t.metode_progres != "Tahapan" else None,
					"satuan": t.satuan if t.metode_progres != "Tahapan" else None,
					"tahapan": "; ".join(f"{x['nama_tahap']}:{flt(x['bobot']):g}" for x in t.tahapan) if t.metode_progres == "Tahapan" else None,
					"pj": t.pj_nama, "catatan": frappe.utils.strip_html(t.description or "") or None,
				}
			)
	else:
		for i, w in enumerate([w for w in d["wbs"] if not w["is_group"]], start=1):
			baris.append({"no": i, "subject": w["uraian"], "kode_wbs": w["kode"], "prioritas": "Sedang", "metode": "Volume",
				"target_volume": w["volume"], "satuan": w["satuan"]})
	kirim_xlsx_aktivitas(f"Aktivitas {project} - {d['project']['project_name']}", baris)


def baca_baris_excel(file_url):
	from frappe.utils.xlsxutils import read_xlsx_file_from_attached_file

	rows = read_xlsx_file_from_attached_file(file_url=file_url)
	file = frappe.db.get_value("File", {"file_url": file_url})
	if file:
		frappe.delete_doc("File", file, ignore_permissions=True)
	if not rows:
		frappe.throw(_("File Excel kosong."))
	judul = [normal(h) for h in rows[0]]
	posisi = {f: judul.index(normal(nama)) for nama, f in KOLOM_EXCEL if normal(nama) in judul}
	# Judul kolom Tahapan / Durasi boleh tanpa keterangan dalam kurung.
	for f, awalan in (("tahapan", "tahapan"), ("durasi", "durasi")):
		if f not in posisi:
			cocok = [i for i, j in enumerate(judul) if j.startswith(awalan)]
			if cocok:
				posisi[f] = cocok[0]
	if "subject" not in posisi or "kode_wbs" not in posisi:
		frappe.throw(_("Kolom 'Nama Aktivitas' dan 'Kode WBS' wajib ada. Gunakan Download Template."))
	hasil = []
	for baris in rows[1:]:
		item = {f: (baris[i] if i < len(baris) else None) for f, i in posisi.items()}
		if not str(item.get("subject") or "").strip():
			continue
		for f in ("mulai", "selesai"):
			v = item.get(f)
			if v is not None and not isinstance(v, str):
				item[f] = str(getattr(v, "date", lambda: v)())
		hasil.append({k: (v if v is None or isinstance(v, int | float) else str(v).strip()) for k, v in item.items()})
	if not hasil:
		frappe.throw(_("Tidak ada baris aktivitas yang terisi di file Excel."))
	return hasil


def siapkan_baris(project, rows):
	"""Validasi & lengkapi baris Excel: WBS, jadwal (hari kerja), predecessor, metode, PJ. Mengembalikan baris + error."""
	from konstruksi.konstruksi.doctype.rab_penawaran.rab_penawaran import parse_angka

	proj = frappe.db.get_value("Project", project, ["expected_start_date", "expected_end_date"], as_dict=True)
	libur = tanggal_libur(project)
	wbs = {w.kode: w for w in frappe.get_all("WBS Item", filters={"project": project}, fields=["name", "kode", "uraian", "is_group"])}
	tim = frappe.get_all("Penugasan Personel", filters={"project": project}, fields=["employee", "nama_personel", "jabatan"])
	ada = {(normal(t.subject), t.wbs_item): t.name for t in frappe.get_all("Task", filters={"project": project}, fields=["name", "subject", "wbs_item"])}

	hasil, per_no = [], {}
	for i, r in enumerate(rows, start=1):
		b = frappe._dict(
			no=str(r.get("no") or i).replace(".0", "").strip(), subject=str(r.get("subject") or "").strip(),
			kode_wbs=str(r.get("kode_wbs") or "").strip().rstrip("."), error=[], peringatan=[],
		)
		if b.kode_wbs.endswith(".0") and b.kode_wbs[:-2] in wbs and b.kode_wbs not in wbs:
			b.kode_wbs = b.kode_wbs[:-2]
		w = wbs.get(b.kode_wbs)
		if not w:
			b.error.append(_("Kode WBS {0} tidak ada di WBS proyek").format(b.kode_wbs or "(kosong)"))
		elif w.is_group:
			b.error.append(_("Kode WBS {0} adalah item induk; pakai sub-itemnya").format(b.kode_wbs))
		b.wbs_item = w.name if w else None
		b.uraian_wbs = w.uraian if w else ""

		prio = normal(r.get("prioritas"))
		b.priority = PRIORITAS_EXCEL.get(prio, "Medium")
		if prio and prio not in PRIORITAS_EXCEL:
			b.peringatan.append(_("Prioritas '{0}' tidak dikenal, dipakai Sedang").format(r.get("prioritas")))

		b.setelah = [s.strip().replace(".0", "") for s in str(r.get("setelah") or "").replace(";", ",").split(",") if s.strip()]
		try:
			b.mulai = parse_tanggal(r.get("mulai"))
			b.selesai = parse_tanggal(r.get("selesai"))
		except ValueError as e:
			b.error.append(_("Tanggal '{0}' tidak dikenali (pakai DD/MM/YYYY)").format(e))
			b.mulai = b.selesai = None
		b.durasi = cint(parse_angka(r.get("durasi"))) if r.get("durasi") not in (None, "") else 0

		metode = normal(r.get("metode"))
		b.tahapan = parse_tahapan(r.get("tahapan"))
		b.metode = "Tahapan" if metode.startswith("tahap") or (not metode and b.tahapan) else "Volume"
		b.target_volume, b.satuan = parse_angka(r.get("target_volume")), str(r.get("satuan") or "").strip()
		if b.metode == "Tahapan":
			total = sum(flt(t["bobot"]) for t in b.tahapan)
			if not b.tahapan:
				b.error.append(_("Metode Tahapan tapi kolom Tahapan kosong"))
			elif abs(total - 100) > 0.01:
				b.error.append(_("Total bobot tahapan {0}% (harus 100%)").format(flt(total, 2)))
		else:
			if not b.target_volume:
				b.error.append(_("Target Volume kosong"))

		b.pj = None
		pj = normal(r.get("pj"))
		if pj:
			cocok = [t for t in tim if normal(t.nama_personel) == pj] or [t for t in tim if normal(t.jabatan) == pj]
			if cocok:
				b.pj, b.pj_nama = cocok[0].employee, cocok[0].nama_personel
				if len({c.employee for c in cocok}) > 1:
					b.peringatan.append(_("{0} orang dengan jabatan {1}; dipilih {2}").format(len(cocok), r.get("pj"), cocok[0].nama_personel))
			else:
				b.peringatan.append(_("PJ '{0}' tidak ada di Tim Proyek; dikosongkan").format(r.get("pj")))
		b.catatan = r.get("catatan")
		b.task = ada.get((normal(b.subject), b.wbs_item))
		if b.no in per_no:
			b.error.append(_("No {0} dipakai lebih dari sekali").format(b.no))
		per_no[b.no] = b
		hasil.append(b)

	# Jadwal: urutan topologis menurut Setelah No (predecessor dihitung lebih dulu).
	selesai_hitung, sedang = set(), set()

	def hitung_jadwal(b):
		if b.no in selesai_hitung:
			return
		if b.no in sedang:
			b.error.append(_("Setelah No membentuk lingkaran"))
			return
		sedang.add(b.no)
		for s in b.setelah:
			p = per_no.get(s)
			if not p:
				b.error.append(_("Setelah No {0} tidak ada di file").format(s))
			elif p is b:
				b.error.append(_("Setelah No tidak boleh dirinya sendiri"))
			else:
				hitung_jadwal(p)
		if not b.mulai and b.setelah:
			akhir = [per_no[s].selesai for s in b.setelah if s in per_no and per_no[s].selesai]
			if akhir:
				b.mulai = hari_kerja_berikut(max(akhir), libur)
		if b.mulai and not b.selesai and b.durasi:
			b.selesai = tambah_hari_kerja(b.mulai, b.durasi, libur)
		if not (b.mulai and b.selesai):
			b.error.append(_("Jadwal belum lengkap (isi Mulai & Selesai, atau Mulai + Durasi)"))
		elif b.selesai < b.mulai:
			b.error.append(_("Selesai sebelum Mulai"))
		else:
			hk = hari_kerja(b.mulai, b.selesai, libur)
			if b.durasi and hk != b.durasi:
				b.peringatan.append(_("Durasi {0} hk berbeda dengan tanggal ({1} hk); dipakai tanggal").format(b.durasi, hk))
			b.durasi = hk
			if proj.expected_start_date and b.mulai < getdate(proj.expected_start_date):
				b.error.append(_("Mulai sebelum tanggal mulai proyek ({0})").format(frappe.format(proj.expected_start_date, "Date")))
			if proj.expected_end_date and b.selesai > getdate(proj.expected_end_date):
				b.error.append(_("Selesai setelah tanggal selesai proyek ({0})").format(frappe.format(proj.expected_end_date, "Date")))
			for s in b.setelah:
				p = per_no.get(s)
				if p and p.selesai and b.mulai <= p.selesai:
					b.peringatan.append(_("Mulai sebelum No {0} selesai").format(s))
		sedang.discard(b.no)
		selesai_hitung.add(b.no)

	for b in hasil:
		hitung_jadwal(b)
	for b in hasil:
		b.mulai = str(b.mulai) if b.mulai else None
		b.selesai = str(b.selesai) if b.selesai else None
	return hasil


@frappe.whitelist()
def baca_excel(project, file_url):
	frappe.get_doc("Project", project).check_permission("read")
	frappe.has_permission("Task", "create", throw=True)
	rows = baca_baris_excel(file_url)
	return {"rows": rows, "hasil": siapkan_baris(project, rows)}


@frappe.whitelist()
def impor_excel(project, rows):
	"""Buat / perbarui aktivitas dari baris Excel (sudah dipratinjau). Semua atau tidak sama sekali."""
	frappe.has_permission("Task", "create", throw=True)
	rows = json.loads(rows) if isinstance(rows, str) else rows
	hasil = siapkan_baris(project, rows)
	salah = [b for b in hasil if b.error]
	if salah:
		frappe.throw(_("{0} baris masih error; perbaiki file lalu upload ulang.").format(len(salah)))
	per_no, nama_task, dibuat, diperbarui = {b.no: b for b in hasil}, {}, 0, 0

	def simpan(b):
		if b.no in nama_task:
			return
		for s in b.setelah:
			simpan(per_no[s])
		nama_task[b.no] = simpan_aktivitas(
			project, b.subject, b.wbs_item, b.mulai, b.selesai, name=b.task, pj=b.pj, priority=b.priority,
			predecessor=[nama_task[s] for s in b.setelah], metode_progres=b.metode,
			# Kolom yang tidak sesuai metode diabaikan (Tahapan untuk metode Volume, Target untuk metode Tahapan).
			target_volume=(b.get("target_volume") or 0) if b.metode == "Volume" else 0,
			satuan=b.get("satuan") if b.metode == "Volume" else None,
			tahapan=b.tahapan if b.metode == "Tahapan" else [], description=b.catatan,
		)

	for b in hasil:
		simpan(b)
		if b.task:
			diperbarui += 1
		else:
			dibuat += 1
	return {"dibuat": dibuat, "diperbarui": diperbarui}
