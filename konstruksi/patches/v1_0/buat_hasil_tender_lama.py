import frappe

from konstruksi.konstruksi.doctype.hasil_tender.hasil_tender import HASIL_FINAL


def execute():
	# Tender yang penawarannya sudah diajukan sebelum menu Hasil Tender ada: buatkan Hasil Tender-nya.
	for tender in frappe.get_all(
		"Tender",
		filters={"status": ("!=", "Persiapan")},
		fields=["name", "status", "pemenang", "nilai_pemenang", "alasan"],
	):
		if frappe.db.exists("Hasil Tender", {"tender": tender.name}):
			continue
		final = tender.status in HASIL_FINAL
		doc = frappe.get_doc(
			{
				"doctype": "Hasil Tender",
				"tender": tender.name,
				"hasil": tender.status if final else "Menunggu",
				"pemenang": tender.pemenang if final else None,
				"harga_pemenang": tender.nilai_pemenang if final else 0,
				"keterangan": tender.alasan if final else None,
			}
		)
		doc.flags.ignore_mandatory = True
		doc.insert(ignore_permissions=True)
