import frappe


def execute():
	# Pilihan "Batal" diganti "Batal / Mundur" di Hasil Tender dan status Tender.
	frappe.db.set_value("Hasil Tender", {"hasil": "Batal"}, "hasil", "Batal / Mundur", update_modified=False)
	frappe.db.set_value("Tender", {"status": "Batal"}, "status", "Batal / Mundur", update_modified=False)
	frappe.db.set_value(
		"Dokumen Tender", {"status_tender": "Batal"}, "status_tender", "Batal / Mundur", update_modified=False
	)
