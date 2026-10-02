import frappe


def execute():
	"""Tender lama: isi Tanggal dari tanggal dokumen dibuat."""
	frappe.db.sql("update `tabTender` set tanggal = date(creation) where tanggal is null")
