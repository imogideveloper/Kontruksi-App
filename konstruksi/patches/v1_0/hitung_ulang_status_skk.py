import frappe


def execute():
	# Status SKK penugasan dibedakan (Habis Saat Bertugas / Kedaluwarsa): hitung ulang data yang ada.
	for name in frappe.get_all("Penugasan Personel", pluck="name"):
		doc = frappe.get_doc("Penugasan Personel", name)
		doc.flags.ignore_permissions = True
		doc.save()
