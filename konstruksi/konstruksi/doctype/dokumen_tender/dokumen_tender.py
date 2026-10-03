# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, now_datetime

class DokumenTender(Document):
	def before_insert(self):
		if not self.items:
			self.tambah_dari_template()

	def tambah_dari_template(self):
		"""Tambahkan dokumen template Jenis Project milik tender yang belum ada di checklist.

		Section yang sudah dikunci (penawaran diajukan) dilewati. Mengembalikan jumlah dokumen yang ditambahkan.
		"""
		jenis_project = frappe.db.get_value("Tender", self.tender, "jenis_project")
		if not jenis_project:
			return 0
		sudah_ada = {(item.kategori, item.nama_dokumen) for item in self.items}
		jumlah = 0
		for row in frappe.get_doc("Jenis Project", jenis_project).dokumen:
			if (row.kategori, row.nama_dokumen) in sudah_ada or self.terkunci(row.kategori):
				continue
			self.append(
				"items",
				{
					"kategori": row.kategori,
					"nama_dokumen": row.nama_dokumen,
					"wajib": row.wajib,
					"keterangan": row.keterangan,
				},
			)
			jumlah += 1
		return jumlah

	def validate(self):
		item_ids = {item.name for item in self.items}
		# File milik dokumen yang sudah dihapus ikut dibuang.
		self.files = [f for f in self.files if f.item in item_ids]

		ada_file = {f.item for f in self.files}
		for item in self.items:
			if item.wajib:
				item.tidak_diperlukan = 0

		wajib = [item for item in self.items if item.wajib]
		self.wajib_total = len(wajib)
		self.wajib_lengkap = sum(1 for item in wajib if item.name in ada_file)
		self.persen_lengkap = self.wajib_lengkap / self.wajib_total * 100 if self.wajib_total else 100
		self.jumlah_file = len(self.files)

	def onload(self):
		self.set_onload("kategori", get_kategori())
		self.set_onload(
			"rab_penawaran",
			frappe.get_all(
				"RAB Penawaran",
				filters={"tender": self.tender},
				fields=["name", "total_rab"],
				order_by="creation desc",
			),
		)

	def get_item(self, item):
		row = next((i for i in self.items if i.name == item), None)
		if not row:
			frappe.throw(_("Dokumen tidak ditemukan. Muat ulang halaman."))
		return row

	def terkunci(self, kategori):
		return bool(self.diajukan_pada) and not frappe.db.get_value("Kategori Dokumen Tender", kategori, "bebas_kunci")

	def cek_kunci(self, kategori):
		if self.terkunci(kategori):
			frappe.throw(
				_("Penawaran sudah diajukan, dokumen {0} dikunci. Batalkan pengajuan dulu bila perlu mengubah.").format(
					_(kategori)
				),
				title=_("Dokumen terkunci"),
			)


def get_kategori():
	"""Section Dokumen Tender sesuai urutan tampil."""
	return frappe.get_all(
		"Kategori Dokumen Tender",
		fields=["name", "subjudul", "bebas_kunci"],
		order_by="urutan asc, name asc",
	)


def get_doc_untuk_ubah(name):
	"""Ambil dokumen dengan lock baris, agar unggahan beberapa file sekaligus tidak saling menimpa."""
	doc = frappe.get_doc("Dokumen Tender", name, for_update=True)
	doc.check_permission("write")
	return doc


def ubah_status_tender(tender, dari, ke):
	# db_set, bukan save: validasi Tender (peringatan HPS) tidak perlu muncul di sini.
	tender_doc = frappe.get_doc("Tender", tender)
	if tender_doc.status == dari:
		tender_doc.db_set("status", ke, notify=True)
		sinkron_dari_tender(tender_doc)


@frappe.whitelist()
def get_or_create(tender):
	"""Buka Dokumen Tender milik tender ini; buat baru dengan checklist bawaan bila belum ada."""
	name = frappe.db.get_value("Dokumen Tender", {"tender": tender})
	if name:
		return name
	doc = frappe.get_doc({"doctype": "Dokumen Tender", "tender": tender})
	doc.insert()
	return doc.name


@frappe.whitelist()
def tambah_file(name, item, file_url):
	doc = get_doc_untuk_ubah(name)
	doc.cek_kunci(doc.get_item(item).kategori)

	file = frappe.db.get_value(
		"File",
		{"file_url": file_url, "attached_to_doctype": "Dokumen Tender", "attached_to_name": name},
		["file_name", "file_size"],
		as_dict=True,
	)
	if not file:
		frappe.throw(_("File tidak ditemukan. Coba unggah ulang."))

	doc.append(
		"files",
		{
			"item": item,
			"file_url": file_url,
			"nama_file": file.file_name,
			"ukuran": cint(file.file_size),
			"diunggah_oleh": frappe.session.user,
			"diunggah_pada": now_datetime(),
		},
	)
	doc.save()


@frappe.whitelist()
def hapus_file(name, row):
	doc = get_doc_untuk_ubah(name)
	baris = next((f for f in doc.files if f.name == row), None)
	if not baris:
		return
	doc.cek_kunci(doc.get_item(baris.item).kategori)

	doc.files = [f for f in doc.files if f.name != row]
	doc.save()

	# File fisik ikut dihapus bila tidak dipakai di baris lain.
	if not any(f.file_url == baris.file_url for f in doc.files):
		for file_name in frappe.get_all(
			"File",
			filters={"file_url": baris.file_url, "attached_to_doctype": "Dokumen Tender", "attached_to_name": name},
			pluck="name",
		):
			frappe.delete_doc("File", file_name)


@frappe.whitelist()
def set_tidak_diperlukan(name, item, nilai):
	doc = get_doc_untuk_ubah(name)
	row = doc.get_item(item)
	doc.cek_kunci(row.kategori)
	if row.wajib:
		frappe.throw(_("Dokumen wajib tidak bisa ditandai tidak diperlukan."))
	row.tidak_diperlukan = cint(nilai)
	doc.save()


@frappe.whitelist()
def simpan_dokumen(name, kategori, nama_dokumen, wajib=0, keterangan=None, item=None):
	"""Tambah dokumen baru ke checklist, atau ubah dokumen yang ada bila `item` diisi."""
	doc = get_doc_untuk_ubah(name)
	doc.cek_kunci(kategori)
	values = {"kategori": kategori, "nama_dokumen": nama_dokumen, "wajib": cint(wajib), "keterangan": keterangan}
	if item:
		row = doc.get_item(item)
		doc.cek_kunci(row.kategori)
		row.update(values)
	else:
		doc.append("items", {**values, "kustom": 1})
	doc.save()


@frappe.whitelist()
def muat_template(name):
	"""Tambahkan dokumen dari template Jenis Project yang belum ada di checklist."""
	doc = get_doc_untuk_ubah(name)
	jumlah = doc.tambah_dari_template()
	if jumlah:
		doc.save()
	return jumlah


@frappe.whitelist()
def hapus_dokumen(name, item):
	doc = get_doc_untuk_ubah(name)
	row = doc.get_item(item)
	doc.cek_kunci(row.kategori)
	if any(f.item == item for f in doc.files):
		frappe.throw(_("Hapus dulu file di dokumen ini."))
	doc.items = [i for i in doc.items if i.name != item]
	doc.save()


@frappe.whitelist()
def ajukan_penawaran(name):
	doc = get_doc_untuk_ubah(name)
	if doc.diajukan_pada:
		return
	doc.diajukan_pada = now_datetime()
	doc.save()
	ubah_status_tender(doc.tender, "Persiapan", "Penawaran Dikirim")


@frappe.whitelist()
def batalkan_pengajuan(name):
	doc = get_doc_untuk_ubah(name)
	doc.diajukan_pada = None
	doc.save()
	ubah_status_tender(doc.tender, "Penawaran Dikirim", "Persiapan")


def sinkron_dari_tender(tender, method=None):
	"""Tender.on_update: salin data tender yang ditampilkan di Dokumen Tender."""
	name = frappe.db.get_value("Dokumen Tender", {"tender": tender.name})
	if name:
		frappe.db.set_value(
			"Dokumen Tender",
			name,
			{
				"nama_project": tender.nama_paket,
				"pemberi_kerja": tender.pemberi_kerja,
				"jenis_project": tender.jenis_project,
				"batas_pemasukan": tender.batas_pemasukan,
				"status_tender": tender.status,
			},
			update_modified=False,
		)


def hapus_baris_file(file, method=None):
	"""File.on_trash: lampiran yang dihapus dari sidebar form ikut hilang dari checklist."""
	if file.attached_to_doctype != "Dokumen Tender" or not file.attached_to_name:
		return
	if not frappe.db.exists("Dokumen Tender", file.attached_to_name):
		return
	doc = frappe.get_doc("Dokumen Tender", file.attached_to_name)
	sisa = [f for f in doc.files if f.file_url != file.file_url]
	if len(sisa) != len(doc.files):
		doc.files = sisa
		doc.flags.ignore_permissions = True
		doc.save()
