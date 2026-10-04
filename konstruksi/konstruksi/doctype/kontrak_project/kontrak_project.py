# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, cint, flt, fmt_money, getdate, now

from konstruksi.api import beri_tahu_form

from konstruksi.konstruksi.doctype.tarif_pph_final.tarif_pph_final import cek_kualifikasi, get_tarif
from konstruksi.konstruksi.doctype.tender.tender import BATAS_HARGA_WAJAR

# Field Kontrak Project yang selalu mengikuti Tender (read-only di kontrak, diubah dari Tender): field kontrak -> Tender.
FIELD_DARI_TENDER = {
	"nama_project": "nama_paket",
	"pemberi_kerja": "pemberi_kerja",
	"jenis_project": "jenis_project",
	"lokasi": "lokasi",
	"jenis_kontrak": "jenis_kontrak",
	"sumber_dana": "sumber_dana",
	"masa_pelaksanaan": "masa_pelaksanaan",
	"nilai_kontrak": "nilai_penawaran",
	"status_ppn": "status_ppn",
	"tarif_ppn": "tarif_ppn",
}

# Jaminan pelaksanaan 5% dari nilai kontrak; bila nilai kontrak < 80% HPS, 5% dari HPS (Perpres 12/2021).
PERSEN_JAMINAN_PELAKSANAAN = 5


class KontrakProject(Document):
	def validate(self):
		cek_tender_menang(self.tender)
		self.ambil_dari_tender()
		self.hitung_nilai()
		self.hitung_waktu()
		self.hitung_jaminan()
		self.ambil_tarif_pph()

		if self.tanggal_kontrak and self.tanggal_spmk and getdate(self.tanggal_spmk) < getdate(self.tanggal_kontrak):
			frappe.throw(_("Tanggal SPMK tidak boleh sebelum Tanggal Kontrak."))
		for fieldname in ("uang_muka_persen", "retensi_persen", "tarif_ppn"):
			if not 0 <= flt(self.get(fieldname)) <= 100:
				frappe.throw(_("{0} harus antara 0 dan 100.").format(_(self.meta.get_label(fieldname))))

		self.set_jumlah_kelengkapan(self.get_kelengkapan())

	def onload(self):
		self.set_onload("kelengkapan", self.get_kelengkapan())

	def set_jumlah_kelengkapan(self, kelengkapan):
		self.kelengkapan_total = len(kelengkapan)
		self.kelengkapan_terisi = sum(1 for item in kelengkapan if item["ok"])

	def ambil_dari_tender(self):
		"""Data tender (FIELD_DARI_TENDER) selalu mengikuti Tender; diubah dari form Tender, bukan di kontrak."""
		tender = frappe.db.get_value("Tender", self.tender, list(FIELD_DARI_TENDER.values()), as_dict=True)
		for field_kontrak, field_tender in FIELD_DARI_TENDER.items():
			self.set(field_kontrak, tender.get(field_tender))
		# Project Manager diisi di kontrak; awalnya Penanggung Jawab tender.
		if not self.project_manager:
			self.project_manager = frappe.db.get_value("Tender", self.tender, "penanggung_jawab")

	def ambil_tarif_pph(self):
		"""PPh Final dari master Tarif PPh Final (berlaku pada tanggal kontrak), bukan diisi manual."""
		self.pph_final_persen = 0
		self.tarif_pph_final = None
		if not (self.jenis_jasa and self.kualifikasi_usaha):
			return
		cek_kualifikasi(self.jenis_jasa, self.kualifikasi_usaha)
		tarif = get_tarif(self.jenis_jasa, self.kualifikasi_usaha, self.tanggal_kontrak)
		if not tarif:
			frappe.throw(
				_("Belum ada Tarif PPh Final aktif untuk {0} · {1} yang berlaku pada {2}. Tambahkan di menu Tarif PPh Final.").format(
					self.jenis_jasa, self.kualifikasi_usaha, frappe.format(self.tanggal_kontrak or getdate(), "Date")
				),
				title=_("Tarif PPh Final belum ada"),
			)
		self.pph_final_persen = tarif.tarif
		self.tarif_pph_final = tarif.name

	def hitung_semua(self):
		self.hitung_nilai()
		self.hitung_waktu()
		self.hitung_jaminan()
		self.set_jumlah_kelengkapan(self.get_kelengkapan())

	def hitung_nilai(self):
		if self.status_ppn != "PPN":
			self.tarif_ppn = 0
		nilai = flt(self.nilai_kontrak)
		self.nilai_sebelum_ppn = flt(nilai / (1 + flt(self.tarif_ppn) / 100), 2)
		self.nilai_ppn = flt(nilai - self.nilai_sebelum_ppn, 2)
		self.nilai_uang_muka = flt(nilai * flt(self.uang_muka_persen) / 100, 2)

	def hitung_waktu(self):
		# Hari ke-1 = tanggal SPMK, jadi tanggal selesai = SPMK + (masa - 1) hari.
		mulai, masa = self.tanggal_spmk, cint(self.masa_pelaksanaan)
		self.tanggal_selesai = add_days(mulai, masa - 1) if mulai and masa else None
		pemeliharaan = cint(self.masa_pemeliharaan)
		self.akhir_pemeliharaan = (
			add_days(self.tanggal_selesai, pemeliharaan) if self.tanggal_selesai and pemeliharaan else None
		)

	def hitung_jaminan(self):
		nilai, hps = flt(self.nilai_kontrak), flt(frappe.db.get_value("Tender", self.tender, "hps"))
		dasar = hps if hps and nilai and nilai / hps * 100 < BATAS_HARGA_WAJAR else nilai
		self.jaminan_pelaksanaan_nilai = (
			flt(dasar * PERSEN_JAMINAN_PELAKSANAAN / 100, 2) if self.jaminan_pelaksanaan_wajib else 0
		)
		# Jaminan uang muka senilai uang muka yang diterima.
		self.jaminan_uang_muka_nilai = self.nilai_uang_muka
		if not flt(self.uang_muka_persen):
			self.jaminan_uang_muka_diserahkan = 0

	def get_kelengkapan(self):
		"""Checklist kelengkapan kontrak: label, ok, keterangan, dan field yang perlu diisi."""
		items = [
			{
				"label": _("Nomor & tanggal kontrak"),
				"ok": bool(self.nomor_kontrak and self.tanggal_kontrak),
				"ket": _("{0} · {1}").format(self.nomor_kontrak, frappe.format(self.tanggal_kontrak, "Date"))
				if self.nomor_kontrak and self.tanggal_kontrak
				else _("Isi nomor dan tanggal penandatanganan kontrak."),
				"field": "nomor_kontrak" if not self.nomor_kontrak else "tanggal_kontrak",
			},
			{
				"label": _("SPMK"),
				"ok": bool(self.nomor_spmk and self.tanggal_spmk),
				"ket": _("Mulai kerja {0}").format(frappe.format(self.tanggal_spmk, "Date"))
				if self.nomor_spmk and self.tanggal_spmk
				else _("Tanggal SPMK = hari pertama pelaksanaan."),
				"field": "nomor_spmk" if not self.nomor_spmk else "tanggal_spmk",
			},
			{
				"label": _("Dokumen kontrak terlampir"),
				"ok": bool(self.file_kontrak),
				"ket": _("Scan kontrak sudah diunggah.") if self.file_kontrak else _("Unggah scan kontrak bertanda tangan."),
				"field": "file_kontrak",
			},
			{
				"label": _("Syarat pembayaran dikonfirmasi"),
				"ok": bool(self.syarat_bayar_dikonfirmasi),
				"ket": _("Sudah dicocokkan dengan kontrak.")
				if self.syarat_bayar_dikonfirmasi
				else _("Isi uang muka, retensi, kualifikasi PPh, lalu centang konfirmasi."),
				"field": "syarat_bayar_dikonfirmasi",
			},
		]
		if self.jaminan_pelaksanaan_wajib:
			items.append(
				{
					"label": _("Jaminan pelaksanaan"),
					"ok": bool(self.jaminan_pelaksanaan_diserahkan),
					"ket": _("Diserahkan · {0}").format(fmt_money(self.jaminan_pelaksanaan_nilai, 0, "IDR"))
					if self.jaminan_pelaksanaan_diserahkan
					else _("Belum diserahkan · nilai {0}").format(fmt_money(self.jaminan_pelaksanaan_nilai, 0, "IDR")),
					"field": "jaminan_pelaksanaan_diserahkan",
				}
			)
		if flt(self.uang_muka_persen):
			items.append(
				{
					"label": _("Jaminan uang muka"),
					"ok": bool(self.jaminan_uang_muka_diserahkan),
					"ket": _("Diserahkan · {0}").format(fmt_money(self.jaminan_uang_muka_nilai, 0, "IDR"))
					if self.jaminan_uang_muka_diserahkan
					else _("Wajib sebelum uang muka dibayar · nilai {0}").format(
						fmt_money(self.jaminan_uang_muka_nilai, 0, "IDR")
					),
					"field": "jaminan_uang_muka_diserahkan",
				}
			)
		items.append(self.cek_rab())
		return items

	def cek_rab(self):
		"""RAB Penawaran terakhir tender ini harus sama dengan nilai kontrak (setelah negosiasi)."""
		rab = frappe.get_all(
			"RAB Penawaran",
			filters={"tender": self.tender},
			fields=["name", "total_rab"],
			order_by="creation desc",
			limit=1,
		)
		item = {"label": _("RAB = nilai kontrak"), "field": None, "rab": rab[0].name if rab else None}
		if not rab:
			return {**item, "ok": False, "ket": _("Belum ada RAB Penawaran untuk tender ini.")}
		selisih = flt(rab[0].total_rab) - flt(self.nilai_kontrak)
		if abs(selisih) < 1:
			return {**item, "ok": True, "ket": _("{0} · {1}").format(rab[0].name, fmt_money(rab[0].total_rab, 0, "IDR"))}
		return {
			**item,
			"ok": False,
			"ket": _("{0} {1} dari nilai kontrak · sesuaikan RAB hasil negosiasi.").format(
				rab[0].name, _("lebih {0}").format(fmt_money(abs(selisih), 0, "IDR"))
				if selisih > 0
				else _("kurang {0}").format(fmt_money(abs(selisih), 0, "IDR")),
			),
		}


def cek_tender_menang(tender):
	if frappe.db.get_value("Hasil Tender", {"tender": tender}, "hasil") != "Menang":
		frappe.throw(
			_("Kontrak Project hanya untuk tender yang menang. Catat dulu hasil Menang di Hasil Tender {0}.").format(tender),
			title=_("Tender belum menang"),
		)


@frappe.whitelist()
def get_or_create(tender):
	"""Buka Kontrak Project milik tender ini; buat baru (nilai dari Hasil Tender) bila belum ada."""
	name = frappe.db.get_value("Kontrak Project", {"tender": tender})
	if name:
		return name
	cek_tender_menang(tender)
	doc = frappe.get_doc({"doctype": "Kontrak Project", "tender": tender})
	doc.insert()
	return doc.name


def get_kontrak(tender):
	return frappe.db.get_value("Kontrak Project", {"tender": tender})


def sinkron_dari_tender(tender, method=None):
	"""Tender.on_update: salin data tender ke Kontrak Project, lalu hitung ulang nilai, jaminan & kelengkapan."""
	name = get_kontrak(tender.name)
	if not name:
		return
	doc = frappe.get_doc("Kontrak Project", name)
	doc.ambil_dari_tender()
	doc.hitung_semua()
	# db_update, bukan save: validasi kontrak (mis. tanggal SPMK) tidak boleh menggagalkan simpan Tender.
	doc.modified = now()
	doc.db_update()
	beri_tahu_form("Kontrak Project", name)


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def cari_tender_menang(doctype, txt, searchfield, start, page_len, filters):
	"""Pilihan Asal Tender: tender yang menang dan belum punya Kontrak Project."""
	sudah = frappe.get_all("Kontrak Project", pluck="tender")
	return frappe.get_all(
		"Tender",
		filters={"status": "Menang", "name": ("not in", sudah or [""])},
		or_filters={"name": ("like", f"%{txt}%"), "nama_paket": ("like", f"%{txt}%")},
		fields=["name", "nama_paket"],
		order_by="modified desc",
		limit_start=start,
		limit_page_length=page_len,
		as_list=True,
	)


@frappe.whitelist()
def get_kelengkapan_live(doc):
	"""Checklist kelengkapan untuk isian form yang belum disimpan (supaya checklist langsung ikut berubah)."""
	doc = frappe.get_doc(json.loads(doc) if isinstance(doc, str) else doc)
	doc.check_permission("read")
	if not doc.tender:
		return []
	doc.ambil_dari_tender()
	doc.hitung_nilai()
	doc.hitung_waktu()
	doc.hitung_jaminan()
	return doc.get_kelengkapan()


def hitung_ulang_dari_rab(rab, method=None):
	"""RAB Penawaran diubah / dihapus: jumlah kelengkapan kontrak (cek RAB = nilai kontrak) dihitung ulang."""
	name = get_kontrak(rab.tender) if rab.tender else None
	if not name:
		return
	doc = frappe.get_doc("Kontrak Project", name)
	doc.set_jumlah_kelengkapan(doc.get_kelengkapan())
	doc.db_set({"kelengkapan_terisi": doc.kelengkapan_terisi, "kelengkapan_total": doc.kelengkapan_total})
	beri_tahu_form("Kontrak Project", name)
