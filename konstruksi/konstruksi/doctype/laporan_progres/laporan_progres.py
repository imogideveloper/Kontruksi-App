# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from konstruksi.konstruksi.aktivitas import STATUS_DIHITUNG, bisa_setujui, perbarui_dari_laporan


class LaporanProgres(Document):
	"""Laporan progres harian satu aktivitas (Task). Hanya laporan Disetujui / Direvisi (volume / tahap hasil revisi)
	yang menambah realisasi; Dibatalkan & Ditolak tidak dihitung."""

	def validate(self):
		task = frappe.get_doc("Task", self.task)
		self.project, self.wbs_item, self.aktivitas = task.project, task.wbs_item, task.subject
		self.metode, self.satuan = task.get("metode_progres") or "Volume", task.get("satuan")
		if not self.pelapor:
			self.pelapor = frappe.db.get_value("Employee", {"user_id": self.owner or frappe.session.user})

		sebelum = self.get_doc_before_save()
		if sebelum and sebelum.status in STATUS_DIHITUNG and not self.flags.keputusan and not bisa_setujui():
			frappe.throw(_("Laporan yang sudah disetujui tidak bisa diubah."))
		if sebelum and sebelum.status != self.status and not self.flags.keputusan:
			frappe.throw(_("Status laporan diubah lewat tombol Setujui / Tolak."))

		if self.status == "Dibatalkan":
			# Dibatalkan lewat revisi: volume / tahap sudah dikosongkan, tidak perlu divalidasi.
			return
		if self.metode == "Tahapan":
			self.volume = 0
			nama_tahap = {t.nama_tahap: t for t in task.get("tahapan") or []}
			if not self.tahap:
				frappe.throw(_("Pilih minimal satu tahap yang selesai."))
			for t in self.tahap:
				if t.nama_tahap not in nama_tahap:
					frappe.throw(_("Tahap {0} tidak ada di aktivitas ini.").format(t.nama_tahap))
				if nama_tahap[t.nama_tahap].selesai and nama_tahap[t.nama_tahap].laporan != self.name:
					frappe.throw(_("Tahap {0} sudah dilaporkan selesai.").format(t.nama_tahap))
				if self.status == "Menunggu":
					lain = frappe.db.sql(
						"""select l.name from `tabLaporan Progres` l join `tabLaporan Progres Tahap` t on t.parent = l.name
						where l.task = %s and l.status = 'Menunggu' and l.name != %s and t.nama_tahap = %s limit 1""",
						(self.task, self.name or "", t.nama_tahap),
					)
					if lain:
						frappe.throw(_("Tahap {0} sudah dilaporkan di {1} (menunggu persetujuan).").format(t.nama_tahap, lain[0][0]))
		else:
			self.tahap = []
			if flt(self.volume) <= 0:
				frappe.throw(_("Isi volume yang dikerjakan (lebih dari 0)."))

	def on_update(self):
		sebelum = self.get_doc_before_save()
		if self.status in STATUS_DIHITUNG or (sebelum and sebelum.status in STATUS_DIHITUNG):
			perbarui_dari_laporan(self.task)

	def after_delete(self):
		if self.status in STATUS_DIHITUNG and frappe.db.exists("Task", self.task):
			perbarui_dari_laporan(self.task)
