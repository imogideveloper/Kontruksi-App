# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe.utils import cint, flt, fmt_money, getdate

# Penawaran di bawah persentase HPS ini wajib klarifikasi kewajaran harga
# dan jaminan pelaksanaan 5% dari HPS (Perpres 12/2021).
BATAS_HARGA_WAJAR = 80


def get_kode_prefix(tanggal=None):
	return f"TDR-{getdate(tanggal).year}-"


class Tender(Document):
	def autoname(self):
		# Kode selalu dari sistem; nilai kiriman dari form/API diabaikan.
		self.kode = make_autoname(get_kode_prefix(self.tanggal) + ".###", doc=self)
		self.name = self.kode

	def validate(self):
		if not self.is_new():
			self.kode = self.name

		if self.status_ppn != "PPN":
			self.tarif_ppn = 0

		if self.rapat_penjelasan and self.batas_pemasukan:
			if getdate(self.rapat_penjelasan) > getdate(self.batas_pemasukan):
				frappe.throw(_("Rapat Penjelasan tidak boleh setelah Batas Pemasukan."))

		self.set_persen_hps()

	def set_persen_hps(self):
		hps, penawaran = flt(self.hps), flt(self.nilai_penawaran)
		self.persen_hps = flt(penawaran / hps * 100, 2) if hps and penawaran else 0
		if not self.persen_hps:
			return

		if penawaran > hps:
			frappe.msgprint(
				_("Nilai penawaran melebihi HPS. Pada tender pemerintah, penawaran di atas HPS dinyatakan gugur."),
				title=_("Penawaran di atas HPS"),
				indicator="red",
			)
		elif self.persen_hps < BATAS_HARGA_WAJAR:
			frappe.msgprint(
				_(
					"Nilai penawaran {0}% dari HPS (di bawah {1}%). Akan ada klarifikasi kewajaran harga, "
					"dan bila menang wajib jaminan pelaksanaan 5% dari HPS = {2}."
				).format(self.persen_hps, BATAS_HARGA_WAJAR, fmt_money(hps * 0.05, currency="IDR")),
				title=_("Penawaran di bawah {0}% HPS").format(BATAS_HARGA_WAJAR),
				indicator="orange",
			)


@frappe.whitelist()
def get_next_kode(tanggal=None):
	"""Pratinjau kode berikutnya untuk form baru; nomor final ditetapkan saat simpan."""
	prefix = get_kode_prefix(tanggal)
	current = cint(frappe.db.get_value("Series", prefix, "current", order_by="name"))
	return f"{prefix}{current + 1:03d}"
