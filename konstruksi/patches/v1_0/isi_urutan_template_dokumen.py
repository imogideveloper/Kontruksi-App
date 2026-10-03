import frappe


def execute():
	# Field baru Urutan Section & kolom Urutan di Jenis Project: diisi otomatis lewat validate saat disimpan.
	for name in frappe.get_all("Jenis Project", pluck="name"):
		frappe.get_doc("Jenis Project", name).save(ignore_permissions=True)
