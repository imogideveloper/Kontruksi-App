# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

"""Project (Project Master): Gross Margin ikut memotong Total Biaya Personel (Gaji) dari Biaya Personel Bulanan.

Turunan dari Project versi HRMS (yang sudah menambahkan Expense Claim), jadi perilaku HRMS tetap.
"""

import frappe
from frappe.utils import flt
from hrms.overrides.employee_project import EmployeeProject


class KonstruksiProject(EmployeeProject):
	def update_costing(self):
		total = frappe.db.get_value("Biaya Personel Bulanan", {"project": self.name, "docstatus": 1}, [{"SUM": "total_biaya"}])
		self.total_biaya_personel = flt(total)
		super().update_costing()

	def calculate_gross_margin(self):
		super().calculate_gross_margin()
		self.gross_margin = flt(self.gross_margin) - flt(self.get("total_biaya_personel"))
		self.per_gross_margin = (
			self.gross_margin / flt(self.total_billed_amount) * 100 if flt(self.total_billed_amount) else 0
		)
