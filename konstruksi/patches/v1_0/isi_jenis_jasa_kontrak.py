import frappe


def execute():
	# Field baru Jenis Jasa di Kontrak Project: kontrak lama diisi nilai default-nya.
	frappe.db.set_value(
		"Kontrak Project", {"jenis_jasa": ("is", "not set")}, "jenis_jasa", "Pekerjaan Konstruksi", update_modified=False
	)
