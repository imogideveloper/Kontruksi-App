import frappe


def execute():
	"""RAB Penawaran lama: isi Tanggal dari tanggal dokumen dibuat."""
	frappe.db.sql("update `tabRAB Penawaran` set tanggal = date(creation) where tanggal is null")
