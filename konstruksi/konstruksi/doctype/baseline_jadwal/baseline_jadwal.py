# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class BaselineJadwal(Document):
	"""Snapshot jadwal rencana (aktivitas & milestone) — terkunci: hanya nama & keterangan yang boleh diubah."""

	def validate(self):
		self.jumlah_aktivitas = len(self.aktivitas)
		self.jumlah_milestone = len(self.milestone)
		sebelum = self.get_doc_before_save()
		if not sebelum:
			return
		def isi(doc):
			return (
				[(r.task, str(r.mulai), str(r.selesai), r.bobot) for r in doc.aktivitas],
				[(r.milestone, str(r.tanggal_target), r.bobot) for r in doc.milestone],
				doc.project,
			)
		if isi(sebelum) != isi(self):
			frappe.throw(_("Baseline terkunci: jadwal yang sudah disimpan tidak bisa diubah. Simpan baseline baru bila jadwal berubah."))
