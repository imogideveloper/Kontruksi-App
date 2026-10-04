# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_months, date_diff, flt, get_first_day, get_last_day, getdate, today


class BiayaPersonelBulanan(Document):
	"""Alokasi biaya gaji personel ke proyek per bulan: Gaji Bulanan × Alokasi % × (hari bertugas ÷ hari sebulan)."""

	def autoname(self):
		self.name = f"BPB-{getdate(self.periode).strftime('%Y-%m')}-{self.project}"

	def validate(self):
		self.periode = get_first_day(self.periode)
		self.periode_selesai = get_last_day(self.periode)
		self.hari_periode = date_diff(self.periode_selesai, self.periode) + 1
		dobel = frappe.db.exists(
			"Biaya Personel Bulanan",
			{"project": self.project, "periode": self.periode, "docstatus": ("<", 2), "name": ("!=", self.name)},
		)
		if dobel:
			frappe.throw(_("Biaya personel proyek ini untuk bulan tersebut sudah ada: {0}.").format(dobel))
		self.hitung()

	def hitung(self):
		"""Isi ulang rincian dari Penugasan Personel yang beririsan dengan bulan ini."""
		mulai_bulan, akhir_bulan = getdate(self.periode), getdate(self.periode_selesai)
		penugasan = frappe.get_all(
			"Penugasan Personel",
			filters={"project": self.project, "tanggal_mulai": ("<=", akhir_bulan)},
			or_filters=[["tanggal_selesai", "is", "not set"], ["tanggal_selesai", ">=", mulai_bulan]],
			fields=["name", "employee", "nama_personel", "jabatan", "tanggal_mulai", "tanggal_selesai", "alokasi"],
			order_by="tanggal_mulai asc, nama_personel asc",
		)
		pakai_timesheet = set(
			frappe.db.sql_list(
				"""select distinct t.employee from `tabTimesheet Detail` d join `tabTimesheet` t on t.name = d.parent
				where t.docstatus = 1 and d.project = %s and date(d.from_time) between %s and %s""",
				(self.project, mulai_bulan, akhir_bulan),
			)
		)
		self.rincian = []
		for p in penugasan:
			mulai = max(getdate(p.tanggal_mulai), mulai_bulan)
			selesai = min(getdate(p.tanggal_selesai), akhir_bulan) if p.tanggal_selesai else akhir_bulan
			hari = date_diff(selesai, mulai) + 1
			gaji = flt(frappe.db.get_value("Employee", p.employee, "gaji_bulanan"))
			if p.employee in pakai_timesheet:
				biaya, keterangan = 0, _("Pakai Timesheet")
			elif not gaji:
				biaya, keterangan = 0, _("Gaji Bulanan belum diisi")
			else:
				biaya, keterangan = flt(gaji * flt(p.alokasi) / 100 * hari / self.hari_periode, 0), ""
			self.append(
				"rincian",
				{
					"penugasan": p.name,
					"employee": p.employee,
					"nama_personel": p.nama_personel,
					"jabatan": p.jabatan,
					"mulai": mulai,
					"selesai": selesai,
					"hari_bertugas": hari,
					"gaji_bulanan": gaji,
					"alokasi": p.alokasi,
					"biaya": biaya,
					"keterangan": keterangan,
				},
			)
		self.jumlah_personel = len({r.employee for r in self.rincian if r.biaya})
		self.total_biaya = sum(flt(r.biaya) for r in self.rincian)

	def before_submit(self):
		if not self.rincian:
			frappe.throw(_("Tidak ada personel yang ditugaskan di proyek ini pada bulan tersebut."))

	def on_submit(self):
		perbarui_total_project(self.project)

	def on_cancel(self):
		perbarui_total_project(self.project)


def perbarui_total_project(project):
	total = frappe.db.get_value("Biaya Personel Bulanan", {"project": project, "docstatus": 1}, [{"SUM": "total_biaya"}])
	frappe.db.set_value("Project", project, "total_biaya_personel", flt(total))


def buat_bulan_lalu(periode=None):
	"""Scheduler tanggal 1: buat & submit Biaya Personel Bulanan bulan lalu untuk tiap proyek yang punya penugasan."""
	periode = get_first_day(periode or add_months(today(), -1))
	akhir = get_last_day(periode)
	projects = frappe.get_all(
		"Penugasan Personel",
		filters={"tanggal_mulai": ("<=", akhir)},
		or_filters=[["tanggal_selesai", "is", "not set"], ["tanggal_selesai", ">=", periode]],
		pluck="project",
		distinct=True,
	)
	for project in projects:
		if frappe.db.exists("Biaya Personel Bulanan", {"project": project, "periode": periode, "docstatus": ("<", 2)}):
			continue
		try:
			doc = frappe.get_doc({"doctype": "Biaya Personel Bulanan", "project": project, "periode": periode})
			doc.insert(ignore_permissions=True)
			doc.submit()
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			frappe.log_error(title=f"Biaya Personel Bulanan {project}")
