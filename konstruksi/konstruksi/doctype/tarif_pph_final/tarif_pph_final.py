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

	def on_update(self):
		hitung_penggantian(self.jenis_jasa, self.kualifikasi)
		sebelum = self.get_doc_before_save()
		if sebelum and (sebelum.jenis_jasa, sebelum.kualifikasi) != (self.jenis_jasa, self.kualifikasi):
			hitung_penggantian(sebelum.jenis_jasa, sebelum.kualifikasi)

	def on_trash(self):
		# Link "Digantikan Oleh" di tarif lama dilepas dulu supaya penghapusan tidak terhalang; dihitung ulang setelahnya.
		for name in frappe.get_all("Tarif PPh Final", filters={"digantikan_oleh": self.name}, pluck="name"):
			frappe.db.set_value(
				"Tarif PPh Final", name, {"digantikan_oleh": None, "digantikan_mulai": None}, update_modified=False
			)

	def after_delete(self):
		hitung_penggantian(self.jenis_jasa, self.kualifikasi)


def hitung_penggantian(jenis_jasa, kualifikasi):
	"""Tandai tiap tarif aktif dengan tarif berikutnya (lebih baru) untuk kombinasi yang sama.

	Status Berlaku / Digantikan / Belum Berlaku di list dihitung dari sini dan tanggal hari ini.
	"""
	rows = frappe.get_all(
		"Tarif PPh Final",
		filters={"jenis_jasa": jenis_jasa, "kualifikasi": kualifikasi},
		fields=["name", "berlaku_mulai", "disabled", "digantikan_oleh", "digantikan_mulai"],
		order_by="berlaku_mulai asc",
	)
	aktif = [row for row in rows if not row.disabled]
	pengganti = {row.name: aktif[i + 1] for i, row in enumerate(aktif[:-1])}
	for row in rows:
		baru = pengganti.get(row.name)
		nilai = (baru.name, baru.berlaku_mulai) if baru else (None, None)
		if (row.digantikan_oleh, row.digantikan_mulai) != nilai:
			frappe.db.set_value(
				"Tarif PPh Final",
				row.name,
				{"digantikan_oleh": nilai[0], "digantikan_mulai": nilai[1]},
				update_modified=False,
			)


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
