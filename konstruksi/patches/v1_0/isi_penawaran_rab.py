import frappe


def execute():
	"""RAB Penawaran lama: isi Nilai Penawaran Kita dari Tender & hitung ulang Penawaran / HPS (%)."""
	from konstruksi.konstruksi.doctype.rab_penawaran.rab_penawaran import sinkron_dari_tender

	for tender in frappe.get_all("RAB Penawaran", filters={"tender": ("is", "set")}, pluck="tender", distinct=True):
		sinkron_dari_tender(frappe.get_doc("Tender", tender))
