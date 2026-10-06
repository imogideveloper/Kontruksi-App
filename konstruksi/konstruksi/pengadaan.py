# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

"""Pengadaan proyek (Purchase Order / Purchase Invoice) — biaya langsung dibebankan ke proyek.

- Material dikirim langsung ke site: item biaya proyek non-stok, Purchase Invoice menjurnal ke akun Beban Pokok Proyek
  sesuai Item Group (Material Proyek, Subkontraktor, Sewa Alat, Upah Tukang, Biaya Proyek Lain).
- Tiap baris item biaya proyek wajib ber-Project (diisi dari Project di header) dan boleh ditandai Item WBS.
- ERPNext menjumlahkan Purchase Invoice ber-Project ke Total Purchase Cost di Project Master (masuk Gross Margin).
"""

import frappe
from frappe import _
from frappe.utils import flt

from konstruksi.install import ITEM_GROUP_BIAYA_PROYEK, JENIS_BIAYA_PROYEK, akun_biaya_proyek

JENIS_BIAYA = [grup for grup, _akun in JENIS_BIAYA_PROYEK]


def item_biaya_proyek(item_group):
	return item_group in JENIS_BIAYA or item_group == ITEM_GROUP_BIAYA_PROYEK


def lengkapi_pengadaan(doc, method=None):
	"""Purchase Order / Purchase Invoice before_validate: Project baris dari header, cek wajib Project & Item WBS,
	akun beban PI sesuai jenis biaya."""
	akun_jenis = {grup: akun for grup, akun in JENIS_BIAYA_PROYEK}
	tanpa_project, wbs_salah = [], []
	for row in doc.items:
		if doc.get("project") and not row.get("project"):
			row.project = doc.project
		grup = row.get("item_group") or frappe.get_cached_value("Item", row.item_code, "item_group")
		row.jenis_biaya = grup if grup in JENIS_BIAYA else None
		if item_biaya_proyek(grup) and not row.get("project"):
			tanpa_project.append(str(row.idx))
		if row.get("wbs_item"):
			wbs = frappe.db.get_value("WBS Item", row.wbs_item, ["project", "is_group"], as_dict=True)
			if not wbs or wbs.project != row.project or wbs.is_group:
				wbs_salah.append(str(row.idx))
		# Purchase Invoice: akun beban mengikuti jenis biaya (bila user mengganti item setelah akun terisi).
		if doc.doctype == "Purchase Invoice" and grup in akun_jenis:
			akun = akun_biaya_proyek(doc.company, akun_jenis[grup])
			if akun and row.get("expense_account") != akun:
				row.expense_account = akun
	if tanpa_project:
		frappe.throw(
			_("Item biaya proyek di baris {0} belum ada Project. Isi Project di bagian atas atau di baris itemnya.").format(
				", ".join(tanpa_project)
			),
			title=_("Project wajib diisi"),
		)
	if wbs_salah:
		frappe.throw(
			_("Item WBS di baris {0} bukan pekerjaan (bukan induk) dari Project baris tersebut.").format(", ".join(wbs_salah)),
			title=_("Item WBS tidak sesuai"),
		)


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def cari_wbs(doctype, txt, searchfield, start, page_len, filters):
	"""Pilihan Item WBS: pekerjaan (bukan induk) dari Project baris, dicari lewat kode / uraian."""
	project = (filters or {}).get("project")
	if not project:
		return []
	from konstruksi.konstruksi.wbs import kunci_kode

	rows = frappe.get_list(
		"WBS Item",
		filters={"project": project, "is_group": 0},
		or_filters={"kode": ("like", f"%{txt}%"), "uraian": ("like", f"%{txt}%")},
		fields=["name", "kode", "uraian", "satuan"],
		limit_page_length=0,
	)
	rows.sort(key=lambda r: kunci_kode(r.kode))
	return [(r.name, f"{r.kode} · {r.uraian}", r.satuan or "") for r in rows][start : start + page_len]


def realisasi_biaya(project):
	"""Realisasi biaya proyek: pembelian per jenis biaya (Purchase Invoice submit), personel, dan klaim biaya."""
	per_jenis = {
		r.jenis or _("Lainnya"): flt(r.nilai)
		for r in frappe.db.sql(
			"""select coalesce(nullif(i.jenis_biaya, ''), i.item_group) as jenis, sum(i.base_net_amount) as nilai
			from `tabPurchase Invoice Item` i join `tabPurchase Invoice` p on p.name = i.parent
			where p.docstatus = 1 and i.project = %s group by jenis""",
			project,
			as_dict=True,
		)
	}
	p = frappe.db.get_value(
		"Project", project,
		["estimated_costing", "total_costing_amount", "total_expense_claim", "total_biaya_personel"], as_dict=True,
	) or frappe._dict()
	personel = flt(p.total_costing_amount) + flt(p.get("total_biaya_personel"))
	pembelian = sum(per_jenis.values())
	total = pembelian + personel + flt(p.total_expense_claim)
	return {
		"rap": flt(p.estimated_costing),
		"total": total,
		"pembelian": pembelian,
		"per_jenis": per_jenis,
		"personel": personel,
		"klaim": flt(p.total_expense_claim),
		"persen_rap": flt(total / flt(p.estimated_costing) * 100, 1) if flt(p.estimated_costing) else 0,
	}
