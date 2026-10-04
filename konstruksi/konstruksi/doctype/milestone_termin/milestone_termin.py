# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class MilestoneTermin(Document):
	def validate(self):
		if not 0 < flt(self.bobot) <= 100:
			frappe.throw(_("Bobot termin harus lebih dari 0% dan maksimal 100%."))
		lain = flt(
			frappe.db.get_value(
				"Milestone Termin", {"project": self.project, "name": ("!=", self.name or "")}, [{"SUM": "bobot"}]
			)
		)
		if lain + flt(self.bobot) > 100.0001:
			frappe.throw(_("Total bobot termin proyek menjadi {0}% (maksimal 100%).").format(flt(lain + flt(self.bobot), 2)))
		for row in self.lingkup:
			if frappe.db.get_value("WBS Item", row.wbs_item, "project") != self.project:
				frappe.throw(_("Item WBS {0} bukan milik proyek ini.").format(row.wbs_item))

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
