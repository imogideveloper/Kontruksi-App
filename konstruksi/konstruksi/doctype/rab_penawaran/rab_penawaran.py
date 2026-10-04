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
	("Harga Satuan Pokok (Rp)", "harga_satuan_pokok"),
)

# Field item yang membentuk harga penawaran; dikunci setelah penawaran diajukan (biaya tetap boleh diubah).
FIELD_HARGA_ITEM = ("kode_wbs", "uraian_pekerjaan", "satuan", "volume", "harga_satuan")


class RABPenawaran(Document):
	def autoname(self):
		self.kode = make_autoname(f"RAB-{getdate().year}-.###", doc=self)
		self.name = self.kode

	def validate(self):
		if not self.is_new():
			self.kode = self.name
		self.cek_harga_terkunci()
		self.hitung_total()

	def onload(self):
		self.set_onload("harga_terkunci", penawaran_diajukan(self.tender))

	def cek_harga_terkunci(self):
		"""Setelah penawaran diajukan, harga yang dikirim ke panitia tidak boleh berubah; biaya pokok boleh."""
		if self.is_new() or not penawaran_diajukan(self.tender):
			return
		sebelum = self.get_doc_before_save()
		if not sebelum:
			return
		harga = lambda doc: [tuple(flt(item.get(f)) if f in ("volume", "harga_satuan") else cstr(item.get(f)) for f in FIELD_HARGA_ITEM) for item in doc.items]
		if harga(sebelum) != harga(self):
			frappe.throw(
				_("Penawaran tender {0} sudah diajukan, jadi item & harga RAB dikunci. Harga Satuan Pokok (biaya) tetap bisa diubah.").format(
					self.tender
				),
				title=_("Harga RAB dikunci"),
			)

	def hitung_total(self):
		tarif = flt(self.tarif_ppn) if self.status_ppn == "PPN" else 0

		for item in self.items:
			item.jumlah_harga = flt(flt(item.volume) * flt(item.harga_satuan), 2)
			item.ppn = flt(item.jumlah_harga * tarif / 100, 2)
			item.jumlah_harga_ppn = item.jumlah_harga + item.ppn
			item.jumlah_biaya = flt(flt(item.volume) * flt(item.harga_satuan_pokok), 2)
			item.margin_persen = (
				flt((item.jumlah_harga - item.jumlah_biaya) / item.jumlah_harga * 100, 2) if item.jumlah_harga and item.jumlah_biaya else 0
			)

		self.total_sebelum_ppn = sum(item.jumlah_harga for item in self.items)
		self.total_ppn = sum(item.ppn for item in self.items)
		self.total_rab = self.total_sebelum_ppn + self.total_ppn

		for item in self.items:
			item.bobot = flt(item.jumlah_harga / self.total_sebelum_ppn * 100, 2) if self.total_sebelum_ppn else 0

		self.persen_hps = flt(self.total_rab / flt(self.hps) * 100, 2) if flt(self.hps) else 0

		self.total_biaya = sum(flt(item.jumlah_biaya) for item in self.items)
		self.estimasi_margin = flt(self.total_sebelum_ppn) - flt(self.total_biaya) if self.total_biaya else 0
		self.persen_margin = (
			flt(self.estimasi_margin / self.total_sebelum_ppn * 100, 2) if self.total_biaya and self.total_sebelum_ppn else 0
		)


def penawaran_diajukan(tender):
	return bool(tender and frappe.db.get_value("Dokumen Tender", {"tender": tender}, "diajukan_pada"))


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
		["1", "Pekerjaan Persiapan", "", "ls", 1, 0, 0],
		["1.1", "Pembersihan lokasi", "Termasuk buang puing", "m2", 250, 15000, 11000],
		["2", "Pekerjaan Beton", "Beton K-250", "m3", 12.5, 1250000, 1050000],
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
		for f in ("volume", "harga_satuan", "harga_satuan_pokok"):
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
