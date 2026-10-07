# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, cint, flt, fmt_money, getdate, now

from konstruksi.api import beri_tahu_form
from konstruksi.konstruksi.doctype.addendum.addendum import addendum_disetujui
from konstruksi.konstruksi.project_konstruksi import sinkron_project

from konstruksi.konstruksi.doctype.tarif_pph_final.tarif_pph_final import cek_kualifikasi, get_tarif
from konstruksi.konstruksi.penagihan import SKEMA_RETENSI_JAMINAN
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

		self.cek_data_jaminan()
		self.peringatan_jaminan()

		if self.tanggal_kontrak and self.tanggal_spmk and getdate(self.tanggal_spmk) < getdate(self.tanggal_kontrak):
			frappe.throw(_("Tanggal SPMK tidak boleh sebelum Tanggal Kontrak."))
		for fieldname in ("uang_muka_persen", "retensi_persen", "tarif_ppn"):
			if not 0 <= flt(self.get(fieldname)) <= 100:
				frappe.throw(_("{0} harus antara 0 dan 100.").format(_(self.meta.get_label(fieldname))))

		self.set_jumlah_kelengkapan(self.get_kelengkapan())

	def on_update(self):
		sinkron_project(self)

	def onload(self):
		self.set_onload("kelengkapan", self.get_kelengkapan())
		self.set_onload("addendum", addendum_disetujui(self.name) if not self.is_new() else [])

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

	def cek_data_jaminan(self):
		"""Jaminan yang ditandai sudah diserahkan wajib punya nomor, penerbit, dan masa berlaku."""
		jaminan = (
			(_("Jaminan pelaksanaan"), "jaminan_pelaksanaan", self.jaminan_pelaksanaan_wajib),
			(_("Jaminan uang muka"), "jaminan_uang_muka", flt(self.uang_muka_persen)),
			(_("Jaminan pemeliharaan"), "jaminan_pemeliharaan", self.perlu_jaminan_pemeliharaan()),
		)
		for nama, prefix, berlaku in jaminan:
			if not (berlaku and self.get(f"{prefix}_diserahkan")):
				continue
			kosong = [
				_(self.meta.get_label(f"{prefix}_{field}"))
				for field in ("nomor", "penerbit", "berlaku")
				if not self.get(f"{prefix}_{field}")
			]
			if kosong:
				frappe.throw(
					_("{0} ditandai sudah diserahkan; lengkapi: {1}.").format(nama, ", ".join(kosong)),
					title=_("Data jaminan belum lengkap"),
				)

		if self.car_wajib and self.car_ada_polis:
			kosong = [
				_(self.meta.get_label(field))
				for field in ("car_nomor_polis", "car_penanggung", "car_mulai", "car_selesai", "car_nilai_pertanggungan")
				if not self.get(field)
			]
			if kosong:
				frappe.throw(
					_("Asuransi CAR ditandai sudah ada polis; lengkapi: {0}.").format(", ".join(kosong)),
					title=_("Data asuransi CAR belum lengkap"),
				)
			if self.car_selesai and getdate(self.car_selesai) < getdate(self.car_mulai):
				frappe.throw(_("Periode Konstruksi Sampai pada polis CAR tidak boleh sebelum Periode Mulai."))

	def peringatan_jaminan(self):
		"""Peringatan (bukan blokir) bila masa berlaku atau nilai jaminan / polis kurang dari yang disyaratkan."""
		pesan = []
		if self.jaminan_pelaksanaan_kurang_lama():
			pesan.append(
				_("Jaminan pelaksanaan berlaku sampai {0}, sebelum Tanggal Selesai pekerjaan {1}. Minta perpanjangan ke penerbit.").format(
					frappe.format(self.jaminan_pelaksanaan_berlaku, "Date"), frappe.format(self.tanggal_selesai, "Date")
				)
			)
		if self.jaminan_pemeliharaan_kurang_lama():
			pesan.append(
				_("Jaminan pemeliharaan berlaku sampai {0}, sebelum Akhir Pemeliharaan {1}. Minta perpanjangan ke penerbit.").format(
					frappe.format(self.jaminan_pemeliharaan_berlaku, "Date"), frappe.format(self.akhir_pemeliharaan, "Date")
				)
			)
		pesan += [ket for ket, _field in self.kekurangan_car()]
		if pesan:
			frappe.msgprint("<br><br>".join(pesan), title=_("Jaminan / asuransi perlu diperbaiki"), indicator="orange")

	def perlu_jaminan_pemeliharaan(self):
		return bool(flt(self.retensi_persen) and self.skema_retensi == SKEMA_RETENSI_JAMINAN)

	def jaminan_pemeliharaan_kurang_lama(self):
		"""Jaminan pemeliharaan harus berlaku minimal sampai akhir masa pemeliharaan (FHO)."""
		return bool(
			self.perlu_jaminan_pemeliharaan()
			and self.jaminan_pemeliharaan_berlaku
			and self.akhir_pemeliharaan
			and getdate(self.jaminan_pemeliharaan_berlaku) < getdate(self.akhir_pemeliharaan)
		)

	def kekurangan_car(self):
		"""[(keterangan, field)] polis CAR yang periode / nilai pertanggungannya kurang dari kontrak terkini."""
		if not (self.car_wajib and self.car_ada_polis):
			return []
		kurang = []
		if self.car_selesai and self.tanggal_selesai and getdate(self.car_selesai) < getdate(self.tanggal_selesai):
			kurang.append((
				_("Polis CAR berakhir {0}, sebelum Tanggal Selesai pekerjaan {1} · minta perpanjangan").format(
					frappe.format(self.car_selesai, "Date"), frappe.format(self.tanggal_selesai, "Date")
				),
				"car_selesai",
			))
		nilai = flt(self.nilai_kontrak_terkini or self.nilai_kontrak)
		if self.car_nilai_pertanggungan and flt(self.car_nilai_pertanggungan) < nilai:
			kurang.append((
				_("Nilai pertanggungan CAR {0} di bawah nilai kontrak terkini {1} · minta endorsemen polis").format(
					fmt_money(self.car_nilai_pertanggungan, 0, "IDR"), fmt_money(nilai, 0, "IDR")
				),
				"car_nilai_pertanggungan",
			))
		return kurang

	def jaminan_pelaksanaan_kurang_lama(self):
		"""Jaminan pelaksanaan harus berlaku minimal sampai tanggal selesai pekerjaan."""
		return bool(
			self.jaminan_pelaksanaan_wajib
			and self.jaminan_pelaksanaan_berlaku
			and self.tanggal_selesai
			and getdate(self.jaminan_pelaksanaan_berlaku) < getdate(self.tanggal_selesai)
		)

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

	def get_addendum(self):
		return addendum_disetujui(self.name) if self.name and not self.is_new() else []

	def hitung_nilai(self):
		if self.status_ppn != "PPN":
			self.tarif_ppn = 0
		addendum = self.get_addendum()
		self.jumlah_addendum = len(addendum)
		self.nilai_kontrak_terkini = flt(self.nilai_kontrak) + sum(flt(a.selisih_nilai) for a in addendum)
		nilai = flt(self.nilai_kontrak)
		self.nilai_sebelum_ppn = flt(nilai / (1 + flt(self.tarif_ppn) / 100), 2)
		self.nilai_ppn = flt(nilai - self.nilai_sebelum_ppn, 2)
		self.nilai_uang_muka = flt(nilai * flt(self.uang_muka_persen) / 100, 2)

	def hitung_waktu(self):
		# Hari ke-1 = tanggal SPMK, jadi tanggal selesai = SPMK + (masa - 1) hari; masa termasuk perpanjangan addendum.
		self.tambahan_waktu = sum(cint(a.tambah_hari) for a in self.get_addendum())
		self.masa_pelaksanaan_terkini = cint(self.masa_pelaksanaan) + cint(self.tambahan_waktu)
		mulai, masa = self.tanggal_spmk, cint(self.masa_pelaksanaan_terkini)
		self.tanggal_selesai = add_days(mulai, masa - 1) if mulai and masa else None
		pemeliharaan = cint(self.masa_pemeliharaan)
		self.akhir_pemeliharaan = (
			add_days(self.tanggal_selesai, pemeliharaan) if self.tanggal_selesai and pemeliharaan else None
		)

	def hitung_jaminan(self):
		# Jaminan pelaksanaan dari nilai kontrak terkini (addendum tambah = jaminan ikut bertambah).
		nilai, hps = flt(self.nilai_kontrak_terkini or self.nilai_kontrak), flt(frappe.db.get_value("Tender", self.tender, "hps"))
		dasar = hps if hps and nilai and nilai / hps * 100 < BATAS_HARGA_WAJAR else nilai
		self.jaminan_pelaksanaan_nilai = (
			flt(dasar * PERSEN_JAMINAN_PELAKSANAAN / 100, 2) if self.jaminan_pelaksanaan_wajib else 0
		)
		# Jaminan uang muka senilai uang muka yang diterima.
		self.jaminan_uang_muka_nilai = self.nilai_uang_muka
		if not flt(self.uang_muka_persen):
			self.jaminan_uang_muka_diserahkan = 0
		# Jaminan pemeliharaan senilai retensi, hanya bila retensi diganti jaminan.
		self.jaminan_pemeliharaan_nilai = (
			flt(nilai * flt(self.retensi_persen) / 100, 2) if self.perlu_jaminan_pemeliharaan() else 0
		)
		if not self.perlu_jaminan_pemeliharaan():
			self.jaminan_pemeliharaan_diserahkan = 0
		# Nilai pertanggungan CAR minimal nilai kontrak; diisi otomatis bila belum diisi.
		if self.car_wajib and not flt(self.car_nilai_pertanggungan):
			self.car_nilai_pertanggungan = nilai
		if not self.car_wajib:
			self.car_ada_polis = 0

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
			nilai = fmt_money(self.jaminan_pelaksanaan_nilai, 0, "IDR")
			if not self.jaminan_pelaksanaan_diserahkan:
				ok, ket, field = False, _("Belum diserahkan · nilai {0}").format(nilai), "jaminan_pelaksanaan_diserahkan"
			elif self.jaminan_pelaksanaan_kurang_lama():
				ok, field = False, "jaminan_pelaksanaan_berlaku"
				ket = _("Berlaku sampai {0}, sebelum tanggal selesai {1} · minta perpanjangan").format(
					frappe.format(self.jaminan_pelaksanaan_berlaku, "Date"), frappe.format(self.tanggal_selesai, "Date")
				)
			else:
				ok, field = True, "jaminan_pelaksanaan_diserahkan"
				ket = _("{0} · {1} · berlaku sampai {2}").format(
					self.jaminan_pelaksanaan_penerbit or _("Diserahkan"),
					nilai,
					frappe.format(self.jaminan_pelaksanaan_berlaku, "Date"),
				)
			items.append({"label": _("Jaminan pelaksanaan"), "ok": ok, "ket": ket, "field": field})
		if flt(self.uang_muka_persen):
			items.append(
				{
					"label": _("Jaminan uang muka"),
					"ok": bool(self.jaminan_uang_muka_diserahkan),
					"ket": _("{0} · {1} · berlaku sampai {2}").format(
						self.jaminan_uang_muka_penerbit or _("Diserahkan"),
						fmt_money(self.jaminan_uang_muka_nilai, 0, "IDR"),
						frappe.format(self.jaminan_uang_muka_berlaku, "Date"),
					)
					if self.jaminan_uang_muka_diserahkan
					else _("Wajib sebelum uang muka dibayar · nilai {0}").format(
						fmt_money(self.jaminan_uang_muka_nilai, 0, "IDR")
					),
					"field": "jaminan_uang_muka_diserahkan",
				}
			)
		if self.perlu_jaminan_pemeliharaan():
			nilai = fmt_money(self.jaminan_pemeliharaan_nilai, 0, "IDR")
			if not self.jaminan_pemeliharaan_diserahkan:
				ok, field = False, "jaminan_pemeliharaan_diserahkan"
				ket = _("Wajib sebelum retensi dicairkan saat PHO · nilai {0}").format(nilai)
			elif self.jaminan_pemeliharaan_kurang_lama():
				ok, field = False, "jaminan_pemeliharaan_berlaku"
				ket = _("Berlaku sampai {0}, sebelum akhir pemeliharaan {1} · minta perpanjangan").format(
					frappe.format(self.jaminan_pemeliharaan_berlaku, "Date"), frappe.format(self.akhir_pemeliharaan, "Date")
				)
			else:
				ok, field = True, "jaminan_pemeliharaan_diserahkan"
				ket = _("{0} · {1} · berlaku sampai {2}").format(
					self.jaminan_pemeliharaan_penerbit or _("Diserahkan"),
					nilai,
					frappe.format(self.jaminan_pemeliharaan_berlaku, "Date"),
				)
			items.append({"label": _("Jaminan pemeliharaan"), "ok": ok, "ket": ket, "field": field})
		if self.car_wajib:
			kurang = self.kekurangan_car()
			if not self.car_ada_polis:
				ok, field, ket = False, "car_ada_polis", _("Polis belum ada · tutup sebelum pekerjaan dimulai")
			elif kurang:
				ok, (ket, field) = False, kurang[0]
			else:
				ok, field = True, "car_ada_polis"
				ket = _("{0} · {1} · sampai {2}").format(
					self.car_penanggung or self.car_nomor_polis,
					fmt_money(self.car_nilai_pertanggungan, 0, "IDR"),
					frappe.format(self.car_selesai, "Date"),
				)
			items.append({"label": _("Asuransi CAR"), "ok": ok, "ket": ket, "field": field})
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
	sinkron_project(doc)


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


# Field hasil hitungan yang dikirim balik ke form sebelum disimpan (lihat get_kelengkapan_live).
FIELD_HITUNGAN = (
	"nilai_kontrak_terkini",
	"tambahan_waktu",
	"masa_pelaksanaan_terkini",
	"nilai_sebelum_ppn",
	"nilai_ppn",
	"nilai_uang_muka",
	"tanggal_selesai",
	"akhir_pemeliharaan",
	"jaminan_pelaksanaan_nilai",
	"jaminan_uang_muka_nilai",
	"jaminan_pemeliharaan_nilai",
	"car_nilai_pertanggungan",
)


@frappe.whitelist()
def get_kelengkapan_live(doc):
	"""Hitungan & checklist untuk isian form yang belum disimpan, supaya langsung terlihat tanpa simpan dulu."""
	doc = frappe.get_doc(json.loads(doc) if isinstance(doc, str) else doc)
	doc.check_permission("read")
	if not doc.tender:
		return {"kelengkapan": [], "hitungan": {}}
	doc.ambil_dari_tender()
	doc.hitung_nilai()
	doc.hitung_waktu()
	doc.hitung_jaminan()
	return {
		"kelengkapan": doc.get_kelengkapan(),
		"hitungan": {fieldname: doc.get(fieldname) for fieldname in FIELD_HITUNGAN},
	}


def hitung_ulang_dari_rab(rab, method=None):
	"""RAB Penawaran diubah / dihapus: jumlah kelengkapan kontrak (cek RAB = nilai kontrak) dihitung ulang."""
	name = get_kontrak(rab.tender) if rab.tender else None
	if not name:
		return
	doc = frappe.get_doc("Kontrak Project", name)
	doc.set_jumlah_kelengkapan(doc.get_kelengkapan())
	doc.db_set({"kelengkapan_terisi": doc.kelengkapan_terisi, "kelengkapan_total": doc.kelengkapan_total})
	beri_tahu_form("Kontrak Project", name)
	# Estimated Cost di Project ikut Total Biaya RAB.
	sinkron_project(doc)
