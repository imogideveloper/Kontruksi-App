# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate

from konstruksi.konstruksi.tim_proyek import get_akses, get_skk_berlaku_sampai, get_status_skk, sinkron_users_project


class PenugasanPersonel(Document):
	def validate(self):
		if self.tanggal_selesai and getdate(self.tanggal_selesai) < getdate(self.tanggal_mulai):
			frappe.throw(_("Selesai Tugas tidak boleh sebelum Mulai Tugas."))
		if not 0 < flt(self.alokasi) <= 100:
			frappe.throw(_("Alokasi harus lebih dari 0% dan maksimal 100%."))

		dobel = frappe.db.exists(
			"Penugasan Personel",
			{"project": self.project, "employee": self.employee, "jabatan": self.jabatan, "name": ("!=", self.name)},
		)
		if dobel:
			frappe.throw(_("{0} sudah ditugaskan sebagai {1} di proyek ini ({2}).").format(self.nama_personel, self.jabatan, dobel))

		self.user_id = frappe.db.get_value("Employee", self.employee, "user_id")
		self.akses_sistem = get_akses(self.user_id)
		akhir = self.tanggal_selesai or frappe.db.get_value("Project", self.project, "expected_end_date")
		self.status_skk = get_status_skk(self.employee, self.jabatan, akhir)
		self.skk_berlaku_sampai = get_skk_berlaku_sampai(self.employee) if self.status_skk != "Tidak Wajib" else None
		self.cek_beban()

	def cek_beban(self):
		"""Peringatan bila total alokasi personel di semua proyek pada periode yang beririsan melebihi 100%."""
		lain = frappe.get_all(
			"Penugasan Personel",
			filters={"employee": self.employee, "name": ("!=", self.name)},
			fields=["project", "tanggal_mulai", "tanggal_selesai", "alokasi"],
		)
		mulai, selesai = getdate(self.tanggal_mulai), getdate(self.tanggal_selesai) if self.tanggal_selesai else None
		beririsan = [
			p
			for p in lain
			if (not p.tanggal_selesai or getdate(p.tanggal_selesai) >= mulai) and (not selesai or getdate(p.tanggal_mulai) <= selesai)
		]
		total = flt(self.alokasi) + sum(flt(p.alokasi) for p in beririsan)
		if total > 100:
			frappe.msgprint(
				_("Total alokasi {0} pada periode ini {1}% (lebih dari 100%), termasuk di proyek: {2}.").format(
					self.nama_personel, flt(total, 0), ", ".join(sorted({p.project for p in beririsan}))
				),
				title=_("Alokasi melebihi 100%"),
				indicator="orange",
			)

	def on_update(self):
		sinkron_users_project(self.project)

	def after_delete(self):
		sinkron_users_project(self.project)
