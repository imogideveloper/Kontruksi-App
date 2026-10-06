import frappe


def execute():
	"""WBS yang sudah ada: harga item RAB disesuaikan supaya total WBS = nilai kontrak awal (nilai penawaran) sebelum PPN."""
	from konstruksi.konstruksi.wbs import hitung_ulang, sesuaikan_harga_kontrak

	for project in frappe.get_all("WBS Item", filters={"sumber": "RAB Penawaran"}, pluck="project", distinct=True):
		if sesuaikan_harga_kontrak(project):
			hitung_ulang(project)
