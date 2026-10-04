# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, today

# Kualifikasi yang berlaku per jenis jasa (PP 9/2022).
KUALIFIKASI_PER_JASA = {
	"Pekerjaan Konstruksi": ("Kecil / Perseorangan", "Menengah / Besar", "Tidak Memiliki Sertifikat"),
	"Pekerjaan Konstruksi Terintegrasi": ("Bersertifikat", "Tidak Memiliki Sertifikat"),
	"Konsultansi Konstruksi": ("Bersertifikat", "Tidak Memiliki Sertifikat"),
}


class TarifPPhFinal(Document):
	def validate(self):
		cek_kualifikasi(self.jenis_jasa, self.kualifikasi)
		if not 0 <= (self.tarif or 0) <= 100:
			frappe.throw(_("Tarif harus antara 0 dan 100."))
		dobel = frappe.db.exists(
			"Tarif PPh Final",
			{
				"jenis_jasa": self.jenis_jasa,
				"kualifikasi": self.kualifikasi,
				"berlaku_mulai": self.berlaku_mulai,
				"name": ("!=", self.name),
			},
		)
		if dobel:
			frappe.throw(_("Tarif untuk kombinasi dan tanggal berlaku ini sudah ada: {0}.").format(dobel))


def cek_kualifikasi(jenis_jasa, kualifikasi):
	if kualifikasi not in KUALIFIKASI_PER_JASA.get(jenis_jasa, ()):
		frappe.throw(
			_("Kualifikasi {0} tidak berlaku untuk {1}. Pilih: {2}.").format(
				kualifikasi, jenis_jasa, ", ".join(KUALIFIKASI_PER_JASA.get(jenis_jasa, ()))
			)
		)


@frappe.whitelist()
def get_tarif(jenis_jasa, kualifikasi, tanggal=None):
	"""Tarif PPh Final yang berlaku pada `tanggal` (default hari ini): {name, tarif} atau None."""
	rows = frappe.get_all(
		"Tarif PPh Final",
		filters={
			"jenis_jasa": jenis_jasa,
			"kualifikasi": kualifikasi,
			"disabled": 0,
			"berlaku_mulai": ("<=", getdate(tanggal or today())),
		},
		fields=["name", "tarif"],
		order_by="berlaku_mulai desc",
		limit=1,
	)
	return rows[0] if rows else None
