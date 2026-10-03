# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint


class JenisProject(Document):
	def validate(self):
		if not cint(self.urutan):
			# Jenis baru tanpa urutan ditaruh paling bawah.
			terbesar = frappe.get_all(
				"Jenis Project", filters={"name": ("!=", self.name)}, fields=[{"MAX": "urutan", "as": "urutan"}]
			)
			self.urutan = (cint(terbesar[0].urutan) if terbesar else 0) + 10
		self.lengkapi_sections()
		self.urutkan_dokumen()

	def lengkapi_sections(self):
		"""Section yang dipakai template dokumen wajib ada di tabel urutan section; lalu urutkan tabelnya."""
		sudah = set()
		for row in self.sections:
			if row.kategori in sudah:
				frappe.throw(_("Section {0} tercantum lebih dari sekali di Urutan Section.").format(row.kategori))
			sudah.add(row.kategori)

		for row in self.dokumen:
			if row.kategori not in sudah:
				# Section baru ditaruh sesuai urutan bawaannya di Kategori Dokumen Tender.
				self.append(
					"sections",
					{
						"kategori": row.kategori,
						"urutan": cint(frappe.db.get_value("Kategori Dokumen Tender", row.kategori, "urutan")),
					},
				)
				sudah.add(row.kategori)

		# fetch_from jalan sebelum validate, jadi baris yang baru ditambahkan di sini diisi manual.
		for row in self.sections:
			row.subjudul = frappe.db.get_value("Kategori Dokumen Tender", row.kategori, "subjudul")

		isi_urutan_kosong(self.sections)
		self.sections = urutkan(self.sections, lambda row: cint(row.urutan))

	def urutkan_dokumen(self):
		"""Urutkan template dokumen per section (mengikuti Urutan Section), lalu per kolom Urutan."""
		urutan_section = {row.kategori: i for i, row in enumerate(self.sections)}
		for kategori in urutan_section:
			isi_urutan_kosong([row for row in self.dokumen if row.kategori == kategori])
		self.dokumen = urutkan(self.dokumen, lambda row: (urutan_section.get(row.kategori, 0), cint(row.urutan)))


def isi_urutan_kosong(rows):
	"""Baris tanpa urutan ditaruh paling bawah, berselang 10 supaya gampang disisipi."""
	terbesar = max((cint(row.urutan) for row in rows), default=0)
	for row in rows:
		if not cint(row.urutan):
			terbesar += 10
			row.urutan = terbesar


def urutkan(rows, key):
	# sorted() stabil: urutan sama tetap mengikuti posisi baris sebelumnya.
	rows = sorted(rows, key=key)
	for i, row in enumerate(rows, start=1):
		row.idx = i
	return rows


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def cari_jenis_project(doctype, txt, searchfield, start, page_len, filters):
	"""Pilihan Jenis Project di field Link, urut sesuai kolom Urutan (pencarian bawaan Frappe selalu urut abjad)."""
	return frappe.get_all(
		"Jenis Project",
		filters={"disabled": 0, "name": ("like", f"%{txt}%")},
		order_by="urutan asc, name asc",
		limit_start=start,
		limit_page_length=page_len,
		as_list=True,
	)
