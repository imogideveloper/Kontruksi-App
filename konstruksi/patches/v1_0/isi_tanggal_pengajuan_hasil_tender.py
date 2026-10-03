import frappe

from konstruksi.konstruksi.doctype.hasil_tender.hasil_tender import get_tanggal_pengajuan


def execute():
	# Field baru Tanggal Pengajuan di Hasil Tender: ambil dari Dokumen Tender (diajukan_pada).
	for name, tender in frappe.get_all("Hasil Tender", fields=["name", "tender"], as_list=True):
		frappe.db.set_value(
			"Hasil Tender", name, "tanggal_pengajuan", get_tanggal_pengajuan(tender), update_modified=False
		)
