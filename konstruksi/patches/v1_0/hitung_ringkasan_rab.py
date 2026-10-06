import frappe


def execute():
	"""Ringkasan RAB Penawaran (Total Sebelum PPN, PPN, Total, margin) kini mengacu ke Nilai Penawaran Kita: hitung ulang."""
	for name in frappe.get_all("RAB Penawaran", filters={"docstatus": ("<", 2)}, pluck="name"):
		doc = frappe.get_doc("RAB Penawaran", name)
		doc.hitung_total()
		doc.db_update_all()
