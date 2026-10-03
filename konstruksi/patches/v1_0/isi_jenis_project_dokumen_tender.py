import frappe


def execute():
	# Field jenis_project baru di Dokumen Tender: salin dari Tender untuk data lama.
	for name, tender in frappe.get_all("Dokumen Tender", filters={"jenis_project": ("is", "not set")}, fields=["name", "tender"], as_list=True):
		frappe.db.set_value(
			"Dokumen Tender",
			name,
			"jenis_project",
			frappe.db.get_value("Tender", tender, "jenis_project"),
			update_modified=False,
		)
