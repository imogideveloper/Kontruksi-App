import frappe


def execute():
	# Field baru nilai / masa / tanggal selesai terkini (kontrak awal + addendum) di Kontrak Project.
	for name in frappe.get_all("Kontrak Project", pluck="name"):
		doc = frappe.get_doc("Kontrak Project", name)
		doc.hitung_semua()
		doc.db_update()
