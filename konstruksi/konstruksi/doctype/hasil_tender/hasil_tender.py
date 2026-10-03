# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate, today

PEMENANG_KITA = "Kita"
HASIL_FINAL = ("Menang", "Kalah", "Batal / Mundur")


class HasilTender(Document):
	def validate(self):
		if self.hasil != "Menang" and not self.is_new():
			kontrak = frappe.db.get_value("Kontrak Project", {"tender": self.tender})
			if kontrak:
				frappe.throw(
					_("Tender ini sudah punya Kontrak Project {0}. Hapus kontraknya dulu bila hasilnya bukan Menang.").format(
						kontrak
					)
				)
		# Data tender diambil ulang (bukan hanya fetch_from) supaya selalu sesuai nilai terakhir di Tender.
		tender = frappe.db.get_value(
			"Tender", self.tender, ["nama_paket", "pemberi_kerja", "tanggal", "hps", "nilai_penawaran"], as_dict=True
		)
		self.nama_project = tender.nama_paket
		self.pemberi_kerja = tender.pemberi_kerja
		self.tanggal_tender = tender.tanggal
		self.hps = tender.hps
		self.penawaran_kita = tender.nilai_penawaran
		self.tanggal_pengajuan = get_tanggal_pengajuan(self.tender)

		if self.hasil == "Menang":
			self.pemenang = PEMENANG_KITA
			if not flt(self.harga_pemenang):
				self.harga_pemenang = self.penawaran_kita
		elif self.hasil in ("Menunggu", "Batal / Mundur"):
			self.pemenang = None
			self.harga_pemenang = 0
		elif self.pemenang == PEMENANG_KITA:
			self.pemenang = None

		if self.hasil in HASIL_FINAL and not self.tanggal_pengumuman:
			self.tanggal_pengumuman = today()
		elif self.hasil == "Menunggu":
			self.tanggal_pengumuman = None

		harga, penawaran = flt(self.harga_pemenang), flt(self.penawaran_kita)
		self.selisih_persen = flt((penawaran - harga) / harga * 100, 2) if harga and penawaran else 0

	def on_update(self):
		if self.hasil in HASIL_FINAL:
			alasan = self.keterangan if self.hasil in ("Kalah", "Batal / Mundur") else None
			set_hasil_tender(self.tender, self.hasil, self.pemenang, self.harga_pemenang, alasan)
		elif frappe.db.get_value("Tender", self.tender, "status") in HASIL_FINAL:
			# Hasil dikembalikan ke Menunggu: tender kembali menunggu pengumuman.
			set_hasil_tender(self.tender, "Penawaran Dikirim", None, 0, None)

	def on_trash(self):
		kontrak = frappe.db.get_value("Kontrak Project", {"tender": self.tender})
		if kontrak:
			frappe.throw(_("Tender ini sudah punya Kontrak Project {0}. Hapus kontraknya dulu.").format(kontrak))
		# Hasil dihapus: tender kembali menunggu pengumuman.
		if self.hasil in HASIL_FINAL and frappe.db.get_value("Tender", self.tender, "status") == self.hasil:
			set_hasil_tender(self.tender, "Penawaran Dikirim", None, 0, None)


def set_hasil_tender(tender, status, pemenang, nilai_pemenang, alasan):
	# db_set, bukan save: validasi Tender (peringatan HPS) tidak perlu muncul di sini.
	tender_doc = frappe.get_doc("Tender", tender)
	tender_doc.db_set(
		{"status": status, "pemenang": pemenang, "nilai_pemenang": nilai_pemenang, "alasan": alasan},
		notify=True,
	)

	from konstruksi.konstruksi.doctype.dokumen_tender.dokumen_tender import sinkron_dari_tender

	sinkron_dari_tender(tender_doc)


def get_tanggal_pengajuan(tender):
	diajukan_pada = frappe.db.get_value("Dokumen Tender", {"tender": tender}, "diajukan_pada")
	return getdate(diajukan_pada) if diajukan_pada else None


def buat_menunggu(tender):
	"""Penawaran diajukan: catat Hasil Tender berstatus Menunggu (bila belum ada)."""
	name = frappe.db.get_value("Hasil Tender", {"tender": tender})
	if name:
		frappe.db.set_value("Hasil Tender", name, "tanggal_pengajuan", get_tanggal_pengajuan(tender))
	else:
		frappe.get_doc({"doctype": "Hasil Tender", "tender": tender, "hasil": "Menunggu"}).insert(ignore_permissions=True)


def hapus_menunggu(tender):
	"""Pengajuan dibatalkan: Hasil Tender yang masih Menunggu ikut dihapus."""
	name = frappe.db.get_value("Hasil Tender", {"tender": tender, "hasil": "Menunggu"})
	if name:
		frappe.delete_doc("Hasil Tender", name, ignore_permissions=True)


@frappe.whitelist()
def get_hasil(tender):
	"""Nama Hasil Tender milik tender ini (None bila belum dicatat)."""
	return frappe.db.get_value("Hasil Tender", {"tender": tender})


def sinkron_dari_tender(tender, method=None):
	"""Tender.on_update: salin data tender & hitung ulang selisih di Hasil Tender."""
	name = frappe.db.get_value("Hasil Tender", {"tender": tender.name})
	if not name:
		return
	harga, penawaran = flt(frappe.db.get_value("Hasil Tender", name, "harga_pemenang")), flt(tender.nilai_penawaran)
	frappe.db.set_value(
		"Hasil Tender",
		name,
		{
			"nama_project": tender.nama_paket,
			"pemberi_kerja": tender.pemberi_kerja,
			"tanggal_tender": tender.tanggal,
			"hps": tender.hps,
			"penawaran_kita": penawaran,
			"selisih_persen": flt((penawaran - harga) / harga * 100, 2) if harga and penawaran else 0,
		},
		update_modified=False,
	)
