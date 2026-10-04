# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, cint, flt, fmt_money, now

from konstruksi.api import beri_tahu_form

# Kontrak pemerintah: total tambahan nilai semua addendum maksimal 10% dari nilai kontrak awal (diperingatkan saja).
BATAS_TAMBAH_NILAI = 10


def ubah_nilai(jenis):
	return "Tambah / Kurang" in (jenis or "")


def ubah_waktu(jenis):
	return "Perpanjangan Waktu" in (jenis or "")


class Addendum(Document):
	def validate(self):
		self.hitung(frappe.get_doc("Kontrak Project", self.kontrak_project))

	def before_submit(self):
		# Dihitung ulang saat disetujui: addendum lain mungkin disetujui lebih dulu sejak draft ini dibuat.
		self.hitung(frappe.get_doc("Kontrak Project", self.kontrak_project))
		self.urutan = len(addendum_disetujui(self.kontrak_project, kecuali=self.name)) + 1

	def on_submit(self):
		perbarui_kontrak(self.kontrak_project)

	def on_cancel(self):
		perbarui_kontrak(self.kontrak_project)

	def hitung(self, kontrak):
		"""Nilai & waktu sebelum/sesudah addendum ini, dari kondisi kontrak terkini (tanpa addendum ini)."""
		lain = addendum_disetujui(self.kontrak_project, kecuali=self.name)
		nilai_awal = flt(kontrak.nilai_kontrak)
		self.nilai_sebelumnya = nilai_awal + sum(flt(a.selisih_nilai) for a in lain)
		self.masa_sebelumnya = cint(kontrak.masa_pelaksanaan) + sum(cint(a.tambah_hari) for a in lain)

		if ubah_nilai(self.jenis):
			if not flt(self.nilai_baru):
				frappe.throw(_("Isi Nilai Kontrak Baru."))
			self.selisih_nilai = flt(self.nilai_baru) - flt(self.nilai_sebelumnya)
			if not self.selisih_nilai:
				frappe.throw(_("Nilai Kontrak Baru sama dengan nilai sebelumnya; tidak ada perubahan nilai."))
		else:
			self.nilai_baru = 0
			self.selisih_nilai = 0

		if ubah_waktu(self.jenis):
			if cint(self.tambah_hari) <= 0:
				frappe.throw(_("Tambah Waktu harus lebih dari 0 hari."))
		else:
			self.tambah_hari = 0
		self.masa_baru = cint(self.masa_sebelumnya) + cint(self.tambah_hari)

		mulai = kontrak.tanggal_spmk
		self.tanggal_selesai_sebelumnya = add_days(mulai, self.masa_sebelumnya - 1) if mulai and self.masa_sebelumnya else None
		self.tanggal_selesai_baru = add_days(mulai, self.masa_baru - 1) if mulai and self.masa_baru else None

		total_selisih = sum(flt(a.selisih_nilai) for a in lain) + flt(self.selisih_nilai)
		self.persen_kumulatif = flt(total_selisih / nilai_awal * 100, 2) if nilai_awal else 0
		if self.persen_kumulatif > BATAS_TAMBAH_NILAI:
			frappe.msgprint(
				_(
					"Total tambahan nilai semua addendum {0}% dari nilai kontrak awal ({1}), melebihi {2}%. "
					"Untuk kontrak pemerintah, tambahan di atas {2}% tidak diperbolehkan."
				).format(self.persen_kumulatif, fmt_money(nilai_awal, 0, "IDR"), BATAS_TAMBAH_NILAI),
				title=_("Melebihi batas {0}%").format(BATAS_TAMBAH_NILAI),
				indicator="orange",
			)


def addendum_disetujui(kontrak_project, kecuali=None):
	"""Addendum yang sudah disetujui (submit) untuk kontrak ini, urut tanggal."""
	filters = {"kontrak_project": kontrak_project, "docstatus": 1}
	if kecuali:
		filters["name"] = ("!=", kecuali)
	return frappe.get_all(
		"Addendum",
		filters=filters,
		fields=["name", "urutan", "nomor_addendum", "tanggal_addendum", "jenis", "selisih_nilai", "nilai_baru", "tambah_hari"],
		order_by="tanggal_addendum asc, creation asc",
	)


def perbarui_kontrak(kontrak_project):
	"""Addendum disetujui / dibatalkan: hitung ulang nilai & waktu terkini kontrak, lalu kabari form yang terbuka."""
	kontrak = frappe.get_doc("Kontrak Project", kontrak_project)
	kontrak.hitung_semua()
	kontrak.modified = now()
	kontrak.db_update()
	beri_tahu_form("Kontrak Project", kontrak_project)


@frappe.whitelist()
def get_kondisi_kontrak(kontrak_project, addendum=None):
	"""Nilai & waktu terkini kontrak (tanpa addendum `addendum`), untuk pratinjau di form sebelum disimpan."""
	kontrak = frappe.get_doc("Kontrak Project", kontrak_project)
	kontrak.check_permission("read")
	lain = addendum_disetujui(kontrak_project, kecuali=addendum)
	return {
		"nilai_awal": flt(kontrak.nilai_kontrak),
		"nilai_terkini": flt(kontrak.nilai_kontrak) + sum(flt(a.selisih_nilai) for a in lain),
		"selisih_lain": sum(flt(a.selisih_nilai) for a in lain),
		"masa_terkini": cint(kontrak.masa_pelaksanaan) + sum(cint(a.tambah_hari) for a in lain),
		"tanggal_spmk": kontrak.tanggal_spmk,
	}
