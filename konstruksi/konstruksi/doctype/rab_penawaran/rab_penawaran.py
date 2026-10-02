# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe.utils import cstr, flt, getdate
from frappe.utils.number_format import NumberFormat
from frappe.utils.xlsxutils import build_xlsx_response, read_xlsx_file_from_attached_file

# Kolom template Excel: (judul kolom, fieldname item).
KOLOM_EXCEL = (
	("Kode WBS", "kode_wbs"),
	("Uraian Pekerjaan", "uraian_pekerjaan"),
	("Spesifikasi / Keterangan", "spesifikasi"),
	("Satuan", "satuan"),
	("Volume", "volume"),
	("Harga Satuan (Rp)", "harga_satuan"),
)


class RABPenawaran(Document):
	def autoname(self):
		self.kode = make_autoname(f"RAB-{getdate().year}-.###", doc=self)
		self.name = self.kode

	def validate(self):
		if not self.is_new():
			self.kode = self.name
		self.hitung_total()

	def hitung_total(self):
		tarif = flt(self.tarif_ppn) if self.status_ppn == "PPN" else 0

		for item in self.items:
			item.jumlah_harga = flt(flt(item.volume) * flt(item.harga_satuan), 2)
			item.ppn = flt(item.jumlah_harga * tarif / 100, 2)
			item.jumlah_harga_ppn = item.jumlah_harga + item.ppn

		self.total_sebelum_ppn = sum(item.jumlah_harga for item in self.items)
		self.total_ppn = sum(item.ppn for item in self.items)
		self.total_rab = self.total_sebelum_ppn + self.total_ppn

		for item in self.items:
			item.bobot = flt(item.jumlah_harga / self.total_sebelum_ppn * 100, 2) if self.total_sebelum_ppn else 0

		self.persen_hps = flt(self.total_rab / flt(self.hps) * 100, 2) if flt(self.hps) else 0


@frappe.whitelist()
def get_saran_uraian():
	"""Uraian pekerjaan yang pernah dipakai, untuk saran di kolom Uraian Pekerjaan."""
	return frappe.get_all(
		"RAB Penawaran Item",
		filters={"parenttype": "RAB Penawaran"},
		pluck="uraian_pekerjaan",
		distinct=True,
		order_by="uraian_pekerjaan",
		limit=500,
	)


@frappe.whitelist()
def download_template():
	frappe.has_permission("RAB Penawaran", "read", throw=True)
	data = [
		[judul for judul, _ in KOLOM_EXCEL],
		["1", "Pekerjaan Persiapan", "", "ls", 1, 0],
		["1.1", "Pembersihan lokasi", "Termasuk buang puing", "m2", 250, 15000],
		["2", "Pekerjaan Beton", "Beton K-250", "m3", 12.5, 1250000],
	]
	build_xlsx_response(data, "Template RAB Penawaran")


@frappe.whitelist()
def baca_excel(file_url):
	"""Baca file Excel template RAB, kembalikan daftar item. File upload dihapus setelah dibaca."""
	frappe.has_permission("RAB Penawaran", "write", throw=True)
	rows = read_xlsx_file_from_attached_file(file_url=file_url)
	frappe.delete_doc("File", frappe.db.get_value("File", {"file_url": file_url}), ignore_permissions=True)

	if not rows:
		frappe.throw(_("File Excel kosong."))

	judul = [cstr(h).strip().lower() for h in rows[0]]
	posisi = {}
	for nama_kolom, fieldname in KOLOM_EXCEL:
		if nama_kolom.lower() in judul:
			posisi[fieldname] = judul.index(nama_kolom.lower())
	if "uraian_pekerjaan" not in posisi:
		frappe.throw(_("Kolom 'Uraian Pekerjaan' tidak ditemukan. Gunakan Download Template."))

	items = []
	for baris in rows[1:]:
		item = {f: (baris[i] if i < len(baris) else None) for f, i in posisi.items()}
		if not cstr(item.get("uraian_pekerjaan")).strip():
			continue
		for f in ("kode_wbs", "uraian_pekerjaan", "spesifikasi", "satuan"):
			if f in item:
				item[f] = cstr(item[f]).strip()
		for f in ("volume", "harga_satuan"):
			if f in item:
				item[f] = parse_angka(item[f])
		items.append(item)

	if not items:
		frappe.throw(_("Tidak ada baris item yang terisi di file Excel."))
	return items


def parse_angka(value):
	"""Angka dari Excel bisa berupa number atau teks berformat lokal (mis. 'Rp 1.250.000,50')."""
	if isinstance(value, int | float):
		return flt(value)
	teks = cstr(value).replace("Rp", "").replace(" ", "").strip()
	if not teks:
		return 0
	fmt = NumberFormat.from_string(frappe.db.get_default("number_format") or "#,###.##")
	return flt(teks.replace(fmt.thousands_separator, "").replace(fmt.decimal_separator, "."))
