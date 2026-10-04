# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class WBSItem(Document):
	def validate(self):
		self.kode = (self.kode or "").strip().strip(".")
		dobel = frappe.db.exists("WBS Item", {"project": self.project, "kode": self.kode, "name": ("!=", self.name)})
		if dobel:
			frappe.throw(_("Kode {0} sudah dipakai di WBS proyek ini.").format(self.kode))
		induk = ".".join(self.kode.split(".")[:-1])
		if "induk_terdekat" in self.flags:
			# Salinan RAB yang melompati tingkat (mis. 2.1.1 tanpa 2.1): induk terdekat yang ada (kosong = level teratas).
			self.parent_wbs = self.flags.induk_terdekat or None
		else:
			self.parent_wbs = frappe.db.get_value("WBS Item", {"project": self.project, "kode": induk}) if induk else None
			if induk and not self.parent_wbs:
				frappe.throw(_("Induk dengan kode {0} belum ada.").format(induk))
		self.level = self.kode.count(".") + 1
		if not self.is_group:
			self.jumlah_harga = flt(self.volume) * flt(self.harga_satuan)

	def on_update(self):
		if not self.flags.tanpa_hitung_ulang:
			from konstruksi.konstruksi.wbs import hitung_ulang

			hitung_ulang(self.project)

	def on_trash(self):
		if frappe.db.exists("WBS Item", {"parent_wbs": self.name}):
			frappe.throw(_("Hapus sub-item {0} terlebih dahulu.").format(self.kode))
		if frappe.db.exists("Task", {"wbs_item": self.name}):
			frappe.throw(_("Item {0} sudah punya aktivitas (Task); lepaskan dulu tautannya.").format(self.kode))

	def after_delete(self):
		if not self.flags.tanpa_hitung_ulang:
			from konstruksi.konstruksi.wbs import hitung_ulang

			hitung_ulang(self.project)
