# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

"""Project Calendar: hari kerja, hari libur, dan agenda per proyek.

- Hari kerja & hari libur disimpan di Holiday List bawaan ERPNext ("Kalender <ID Project>") yang ditautkan ke field
  Holiday List di Project. Hari tidak kerja mingguan = baris weekly_off; hari libur (nasional, cuti bersama, dsb.) =
  baris biasa. Dipakai untuk menghitung durasi aktivitas (WBS / jadwal).
- Agenda = Event bawaan Frappe dengan referensi ke Project.
- Milestone & jumlah aktivitas berjalan diambil dari Task proyek.
"""

import json
from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import add_days, add_years, get_first_day, getdate

NAMA_HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]  # weekday() Python: 0 = Senin
# Bawaan proyek konstruksi: Senin–Sabtu kerja, Minggu libur.
LIBUR_MINGGUAN_DEFAULT = {6}
NEGARA = "ID"


def rentang(dari, sampai):
	d = getdate(dari)
	while d <= getdate(sampai):
		yield d
		d += timedelta(days=1)


def periode_project(p):
	"""(dari, sampai) Holiday List: masa pelaksanaan s.d. akhir pemeliharaan. Tanpa tanggal (menunggu SPMK): 1 tahun ke depan."""
	dari = getdate(p.expected_start_date) if p.expected_start_date else get_first_day(getdate())
	akhir = [getdate(x) for x in (p.expected_end_date, p.akhir_pemeliharaan) if x]
	sampai = max(akhir) if akhir else add_days(add_years(dari, 1), -1)
	return dari, max(sampai, dari)


def libur_mingguan(hl):
	"""Hari (weekday Python) yang tidak kerja: hari yang punya baris weekly_off."""
	return {getdate(r.holiday_date).weekday() for r in hl.holidays if r.weekly_off}


def isi_libur_mingguan(hl, hari_libur):
	ada = {getdate(r.holiday_date) for r in hl.holidays}
	for d in rentang(hl.from_date, hl.to_date):
		if d.weekday() in hari_libur and d not in ada:
			hl.append("holidays", {"holiday_date": d, "description": NAMA_HARI[d.weekday()], "weekly_off": 1})


def impor_nasional(hl):
	"""Libur nasional Indonesia (pustaka holidays, sama dengan tombol Add Local Holidays di Holiday List).
	Tanggal yang sudah jadi hari tidak kerja mingguan diganti keterangannya jadi nama hari libur."""
	from holidays import country_holidays

	tahun = range(getdate(hl.from_date).year, getdate(hl.to_date).year + 1)
	baris = {getdate(r.holiday_date): r for r in hl.holidays}
	jumlah = 0
	for tanggal, nama in sorted(country_holidays(NEGARA, years=tahun, language="id").items()):
		if not getdate(hl.from_date) <= tanggal <= getdate(hl.to_date):
			continue
		r = baris.get(tanggal)
		if r and not r.weekly_off:
			continue
		if r:
			r.update({"description": nama, "weekly_off": 0})
		else:
			hl.append("holidays", {"holiday_date": tanggal, "description": nama, "weekly_off": 0})
		jumlah += 1
	return jumlah


def perluas_periode(hl, dari, sampai):
	"""Periode Holiday List mengikuti tanggal proyek (mis. bertambah karena addendum); hanya diperluas."""
	dari = min(getdate(hl.from_date), getdate(dari))
	sampai = max(getdate(hl.to_date), getdate(sampai))
	if (dari, sampai) == (getdate(hl.from_date), getdate(hl.to_date)):
		return False
	hari_libur = libur_mingguan(hl)
	hl.from_date, hl.to_date = dari, sampai
	isi_libur_mingguan(hl, hari_libur)
	impor_nasional(hl)
	return True


def pastikan_kalender(project):
	"""Holiday List proyek (dibuat bila belum ada: Senin–Sabtu kerja + libur nasional), periodenya mengikuti proyek."""
	p = frappe.db.get_value(
		"Project", project, ["name", "holiday_list", "expected_start_date", "expected_end_date", "akhir_pemeliharaan"], as_dict=True
	)
	dari, sampai = periode_project(p)
	if p.holiday_list and frappe.db.exists("Holiday List", p.holiday_list):
		hl = frappe.get_doc("Holiday List", p.holiday_list)
		if perluas_periode(hl, dari, sampai):
			hl.save(ignore_permissions=True)
		return hl

	nama = f"Kalender {project}"
	if frappe.db.exists("Holiday List", nama):
		hl = frappe.get_doc("Holiday List", nama)
		if perluas_periode(hl, dari, sampai):
			hl.save(ignore_permissions=True)
	else:
		hl = frappe.get_doc(
			{"doctype": "Holiday List", "holiday_list_name": nama, "from_date": dari, "to_date": sampai, "country": NEGARA}
		)
		isi_libur_mingguan(hl, LIBUR_MINGGUAN_DEFAULT)
		impor_nasional(hl)
		hl.insert(ignore_permissions=True)
	frappe.db.set_value("Project", project, "holiday_list", hl.name, update_modified=False)
	return hl


def cek_boleh_ubah(project):
	if not frappe.has_permission("Project", "write", project):
		frappe.throw(_("Anda tidak punya hak mengubah kalender proyek ini."), frappe.PermissionError)


def hitung_hari_kerja(dari, sampai, tanggal_libur):
	if not (dari and sampai):
		return None
	return sum(1 for d in rentang(dari, sampai) if d not in tanggal_libur)


@frappe.whitelist()
def get_kalender(project, tahun, bulan):
	"""Data satu halaman kalender: grid 6 minggu (mulai Minggu) untuk bulan (1–12) tersebut."""
	doc = frappe.get_doc("Project", project)
	doc.check_permission("read")
	hl = pastikan_kalender(project)

	awal_bulan = getdate(f"{int(tahun)}-{int(bulan):02d}-01")
	awal = add_days(awal_bulan, -((awal_bulan.weekday() + 1) % 7))  # mundur ke hari Minggu
	akhir = add_days(awal, 41)

	libur = [
		{"tanggal": str(getdate(r.holiday_date)), "keterangan": r.description}
		for r in hl.holidays
		if not r.weekly_off
	]
	tanggal_libur = {getdate(r.holiday_date) for r in hl.holidays}

	agenda = frappe.get_all(
		"Event",
		filters={
			"reference_doctype": "Project",
			"reference_docname": project,
			"status": ("!=", "Cancelled"),
			"starts_on": ("<=", f"{akhir} 23:59:59"),
		},
		or_filters=[["ends_on", ">=", f"{awal} 00:00:00"], ["starts_on", ">=", f"{awal} 00:00:00"]],
		fields=["name", "subject", "starts_on", "ends_on", "all_day", "event_category", "location", "description"],
		order_by="starts_on asc",
	)
	mendatang = frappe.get_all(
		"Event",
		filters={
			"reference_doctype": "Project",
			"reference_docname": project,
			"status": ("!=", "Cancelled"),
			"starts_on": (">=", getdate()),
		},
		fields=["name", "subject", "starts_on", "ends_on", "all_day", "event_category", "location", "description"],
		order_by="starts_on asc",
		limit=5,
	)

	tasks = frappe.get_all(
		"Task",
		filters={"project": project, "status": ("!=", "Cancelled"), "exp_start_date": ("<=", akhir)},
		or_filters=[["exp_end_date", ">=", awal], ["exp_end_date", "is", "not set"]],
		fields=["name", "subject", "exp_start_date", "exp_end_date", "is_milestone", "is_group"],
	)
	aktivitas, milestone = {}, []
	for t in tasks:
		if t.is_milestone:
			tanggal = t.exp_end_date or t.exp_start_date
			if tanggal and awal <= getdate(tanggal) <= akhir:
				milestone.append({"name": t.name, "subject": t.subject, "tanggal": str(getdate(tanggal))})
			continue
		if t.is_group or not t.exp_start_date:
			continue
		for d in rentang(max(getdate(t.exp_start_date), awal), min(getdate(t.exp_end_date or t.exp_start_date), akhir)):
			aktivitas[str(d)] = aktivitas.get(str(d), 0) + 1

	return {
		"project": {
			"name": doc.name,
			"project_name": doc.project_name,
			"status_proyek": doc.get("status_proyek"),
			"mulai": doc.expected_start_date,
			"selesai": doc.expected_end_date,
			"akhir_pemeliharaan": doc.get("akhir_pemeliharaan"),
		},
		"holiday_list": hl.name,
		"periode": [str(getdate(hl.from_date)), str(getdate(hl.to_date))],
		"libur_mingguan": sorted(libur_mingguan(hl)),
		"libur": libur,
		"total_hari_kerja": hitung_hari_kerja(doc.expected_start_date, doc.expected_end_date, tanggal_libur),
		"agenda": agenda,
		"agenda_mendatang": mendatang,
		"milestone": milestone,
		"aktivitas": aktivitas,
		"bisa_ubah": bool(frappe.has_permission("Project", "write", project)),
	}


@frappe.whitelist()
def set_hari_kerja(project, hari_kerja):
	"""hari_kerja: daftar weekday Python (0 = Senin … 6 = Minggu) yang dihitung hari kerja."""
	cek_boleh_ubah(project)
	hari_kerja = {int(h) for h in (json.loads(hari_kerja) if isinstance(hari_kerja, str) else hari_kerja)}
	if not hari_kerja:
		frappe.throw(_("Minimal satu hari kerja dalam seminggu."))
	hl = pastikan_kalender(project)
	hl.holidays = [r for r in hl.holidays if not r.weekly_off]
	isi_libur_mingguan(hl, set(range(7)) - hari_kerja)
	hl.save(ignore_permissions=True)


@frappe.whitelist()
def tambah_libur(project, dari, keterangan, sampai=None):
	"""Hari libur satu tanggal atau rentang (mis. cuti bersama). Periode kalender diperluas bila perlu."""
	cek_boleh_ubah(project)
	sampai = sampai or dari
	if getdate(sampai) < getdate(dari):
		frappe.throw(_("Tanggal selesai tidak boleh sebelum tanggal mulai."))
	hl = pastikan_kalender(project)
	perluas_periode(hl, dari, sampai)
	baris = {getdate(r.holiday_date): r for r in hl.holidays}
	for d in rentang(dari, sampai):
		if d in baris:
			baris[d].update({"description": keterangan, "weekly_off": 0})
		else:
			hl.append("holidays", {"holiday_date": d, "description": keterangan, "weekly_off": 0})
	hl.save(ignore_permissions=True)


@frappe.whitelist()
def hapus_libur(project, tanggal):
	"""Hapus hari libur; bila jatuh di hari tidak kerja mingguan, tanggal itu kembali jadi hari tidak kerja biasa."""
	cek_boleh_ubah(project)
	hl = pastikan_kalender(project)
	tanggal = getdate(tanggal)
	hari_libur = libur_mingguan(hl)
	for r in list(hl.holidays):
		if getdate(r.holiday_date) == tanggal and not r.weekly_off:
			if tanggal.weekday() in hari_libur:
				r.update({"description": NAMA_HARI[tanggal.weekday()], "weekly_off": 1})
			else:
				hl.remove(r)
	hl.save(ignore_permissions=True)


@frappe.whitelist()
def impor_libur_nasional(project):
	cek_boleh_ubah(project)
	hl = pastikan_kalender(project)
	jumlah = impor_nasional(hl)
	hl.save(ignore_permissions=True)
	return jumlah


def agenda_milik(project, name):
	ref = frappe.db.get_value("Event", name, ["reference_doctype", "reference_docname"], as_dict=True)
	if not ref or (ref.reference_doctype, ref.reference_docname) != ("Project", project):
		frappe.throw(_("Agenda tidak ditemukan di proyek ini."))


@frappe.whitelist()
def simpan_agenda(project, subject, tanggal, sampai=None, all_day=1, jam_mulai=None, jam_selesai=None,
		kategori="Meeting", lokasi=None, keterangan=None, name=None):
	cek_boleh_ubah(project)
	all_day = int(all_day or 0)
	sampai = sampai or tanggal
	if getdate(sampai) < getdate(tanggal):
		frappe.throw(_("Tanggal selesai tidak boleh sebelum tanggal mulai."))
	if all_day:
		starts_on, ends_on = f"{tanggal} 00:00:00", f"{sampai} 23:59:59"
	else:
		starts_on = f"{tanggal} {jam_mulai or '08:00:00'}"
		ends_on = f"{sampai} {jam_selesai}" if jam_selesai else None
	if name:
		agenda_milik(project, name)
		event = frappe.get_doc("Event", name)
	else:
		event = frappe.new_doc("Event")
		event.update({"reference_doctype": "Project", "reference_docname": project, "event_type": "Public", "send_reminder": 0})
	event.update(
		{
			"subject": subject,
			"starts_on": starts_on,
			"ends_on": ends_on,
			"all_day": all_day,
			"event_category": kategori,
			"location": lokasi,
			"description": keterangan,
		}
	)
	event.save(ignore_permissions=True)
	return event.name


@frappe.whitelist()
def hapus_agenda(project, name):
	cek_boleh_ubah(project)
	agenda_milik(project, name)
	frappe.delete_doc("Event", name, ignore_permissions=True)


def buat_kalender_semua():
	"""Patch / migrasi: kalender untuk semua Project Master yang sudah ada."""
	for project in frappe.get_all("Project", filters={"kontrak_project": ("is", "set")}, pluck="name"):
		pastikan_kalender(project)
