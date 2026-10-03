import frappe

from konstruksi.install import JENIS_PROJECT_DEFAULT


def execute():
	# Field baru Urutan di Jenis Project: ikuti urutan data awal, jenis tambahan user disisipkan sebelum "Lainnya".
	semua = frappe.get_all("Jenis Project", pluck="name", order_by="creation asc")
	bawaan = [j for j in JENIS_PROJECT_DEFAULT if j in semua and j != "Lainnya"]
	tambahan = [j for j in semua if j not in JENIS_PROJECT_DEFAULT]
	urutan = bawaan + tambahan + [j for j in ("Lainnya",) if j in semua]
	for i, name in enumerate(urutan, start=1):
		frappe.db.set_value("Jenis Project", name, "urutan", i * 10, update_modified=False)
