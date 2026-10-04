# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class MilestoneTermin(Document):
	def validate(self):
		from konstruksi.konstruksi.milestone import daun_tercakup, dokumen_wajib_untuk, lingkup_terpakai

		for row in self.lingkup:
			if frappe.db.get_value("WBS Item", row.wbs_item, "project") != self.project:
				frappe.throw(_("Item WBS {0} bukan milik proyek ini.").format(row.wbs_item))
		if self.lingkup:
			# Bobot termin = jumlah bobot WBS item (tanpa sub-item) yang tercakup lingkup.
			items = frappe.get_all(
				"WBS Item", filters={"project": self.project}, fields=["name", "kode", "uraian", "parent_wbs", "is_group", "bobot"]
			)
			daun = daun_tercakup(items, [r.wbs_item for r in self.lingkup])
			terpakai = lingkup_terpakai(self.project, kecuali=self.name)
			dobel = sorted({frappe.db.get_value("WBS Item", w, "kode") for w in daun if w in terpakai})
			if dobel:
				frappe.throw(_("Item WBS {0} sudah masuk milestone lain.").format(", ".join(dobel)))
			self.bobot = flt(sum(flt(w.bobot) for w in items if w.name in daun), 4)
			uraian = [w.uraian for w in items if w.name in daun or w.name in {r.wbs_item for r in self.lingkup}]
		else:
			uraian = [self.nama_milestone or ""]
		if not 0 < flt(self.bobot) <= 100:
			frappe.throw(_("Bobot termin harus lebih dari 0% dan maksimal 100%."))
		lain = flt(
			frappe.db.get_value("Milestone Termin", {"project": self.project, "name": ("!=", self.name or "")}, [{"SUM": "bobot"}])
		)
		if lain + flt(self.bobot) > 100.01:
			frappe.throw(_("Total bobot termin proyek menjadi {0}% (maksimal 100%).").format(flt(lain + flt(self.bobot), 2)))

		# Dokumen wajib mengikuti lingkup; file yang sudah di-upload dipertahankan.
		lama = {d.nama_dokumen: d for d in self.dokumen_wajib}
		self.set(
			"dokumen_wajib",
			[
				{"nama_dokumen": n, "file": lama[n].file if n in lama else None, "keterangan": lama[n].keterangan if n in lama else None}
				for n in dokumen_wajib_untuk(uraian + [self.nama_milestone or ""], lain + flt(self.bobot) >= 99.99)
			],
		)

	def on_update(self):
		if not self.flags.tanpa_hitung_ulang:
			from konstruksi.konstruksi.milestone import hitung_ulang

			hitung_ulang(self.project)

	def on_trash(self):
		if self.sales_invoice and frappe.db.get_value("Sales Invoice", self.sales_invoice, "docstatus") == 1:
			frappe.throw(_("Milestone ini sudah ditagih ({0}); batalkan tagihannya dulu.").format(self.sales_invoice))

	def after_delete(self):
		from konstruksi.konstruksi.milestone import hitung_ulang

		hitung_ulang(self.project)
