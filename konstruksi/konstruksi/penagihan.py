# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

"""Penagihan proyek: Sales Invoice uang muka & termin dari Kontrak Project / Milestone Termin.

Uang Muka (UM-KONSTRUKSI → akun "Uang Muka Proyek Diterima", kewajiban):
	bruto = nilai uang muka kontrak (termasuk PPN); DPP = bruto ÷ (1 + PPN%); PPN = DPP × PPN%;
	PPh final dipotong langsung di invoice (baris pajak minus, akun "PPh Final 4(2) Dibayar Dimuka").
	Syarat: Jaminan Uang Muka sudah diserahkan.
Termin (milestone Tercapai):
	bruto = nilai termin milestone (bobot × nilai kontrak, termasuk PPN); DPP termin = bruto ÷ (1 + PPN%);
	potongan uang muka = UM% × DPP termin (baris pemotong di tabel pajak, akun "Uang Muka Proyek Diterima" → mendebit
	kewajiban uang muka; tanpa mengaktifkan harga item negatif), dibatasi sisa uang muka yang belum dipotong;
	PPN & PPh final dihitung dari DPP setelah potongan (baris pajak nominal);
	retensi = retensi% × bruto, ditagih di baris jadwal pembayaran terakhir (jatuh tempo akhir pemeliharaan).
Invoice dibuat Draft — diperiksa / dilampiri dokumen lalu di-submit dari form Sales Invoice.
"""

import frappe
from frappe import _
from frappe.utils import add_days, flt, getdate, today

from konstruksi.install import akun_penagihan

ITEM_UM = "UM-KONSTRUKSI"
ITEM_TERMIN = "TERMIN-KONSTRUKSI"


def data_kontrak(project):
	p = frappe.db.get_value("Project", project, ["name", "project_name", "kontrak_project", "company", "nilai_kontrak", "cost_center"], as_dict=True)
	if not p or not p.kontrak_project:
		frappe.throw(_("Proyek ini tidak terhubung ke Kontrak Project."))
	k = frappe.get_doc("Kontrak Project", p.kontrak_project)
	ppn = flt(k.tarif_ppn) if (k.status_ppn or "PPN") == "PPN" else 0
	return frappe._dict(
		project=p.name, project_name=p.project_name, kontrak=k.name, company=p.company, customer=k.pemberi_kerja,
		nilai_kontrak=flt(p.nilai_kontrak or k.nilai_kontrak_terkini or k.nilai_kontrak), ppn=ppn,
		um_persen=flt(k.uang_muka_persen), um_nilai=flt(k.nilai_uang_muka), retensi_persen=flt(k.retensi_persen),
		pph_persen=flt(k.pph_final_persen), jaminan_um=k.jaminan_uang_muka_diserahkan, akhir_pemeliharaan=k.akhir_pemeliharaan,
		nomor_kontrak=k.nomor_kontrak, cost_center=p.cost_center, nilai_kontrak_awal=flt(k.nilai_kontrak),
	)


def invoice_aktif(filters):
	"""Sales Invoice tidak batal (Draft / Submitted) yang cocok filter."""
	return frappe.get_all("Sales Invoice", filters={**filters, "docstatus": ("<", 2)},
		fields=["name", "docstatus", "status", "grand_total", "rounded_total", "outstanding_amount", "posting_date", "due_date",
			"potongan_uang_muka", "nilai_retensi", "nilai_pph_final", "net_total", "total_taxes_and_charges"])


def dpp_um_terpotong(project, kecuali=None):
	filters = {"project": project, "jenis_tagihan": "Termin", "docstatus": 1}
	if kecuali:
		filters["name"] = ("!=", kecuali)
	return sum(flt(x) for x in frappe.get_all("Sales Invoice", filters=filters, pluck="potongan_uang_muka"))


def rincian_uang_muka(k):
	bruto = flt(k.um_nilai) or flt(k.nilai_kontrak * k.um_persen / 100, 0)
	dpp = flt(bruto / (1 + k.ppn / 100), 0)
	ppn = flt(dpp * k.ppn / 100, 0)
	pph = flt(dpp * k.pph_persen / 100, 0)
	return frappe._dict(bruto=bruto, dpp=dpp, ppn=ppn, pph=pph, total=dpp + ppn - pph)


def rincian_termin(k, m, project, kecuali=None):
	bruto = flt(m.nilai_termin)
	dpp = flt(bruto / (1 + k.ppn / 100), 0)
	um = invoice_aktif({"project": project, "jenis_tagihan": "Uang Muka", "docstatus": 1})
	potong = 0
	if um and k.um_persen:
		sisa = flt(rincian_uang_muka(k).dpp) - dpp_um_terpotong(project, kecuali)
		potong = flt(max(min(dpp * k.um_persen / 100, sisa), 0), 0)
	dpp_net = dpp - potong
	ppn = flt(dpp_net * k.ppn / 100, 0)
	pph = flt(dpp_net * k.pph_persen / 100, 0)
	total = dpp_net + ppn - pph
	retensi = flt(min(bruto * k.retensi_persen / 100, total), 0)
	return frappe._dict(bruto=bruto, dpp=dpp, potong_um=potong, dpp_net=dpp_net, ppn=ppn, pph=pph, total=total, retensi=retensi,
		dibayar_sekarang=total - retensi, um_diterima=bool(um))


def perlu_uang_muka_dulu(k, project):
	"""Kontrak dengan uang muka: termin baru boleh ditagih setelah invoice uang muka di-submit (supaya terpotong)."""
	return bool(k.um_persen or k.um_nilai) and not invoice_aktif({"project": project, "jenis_tagihan": "Uang Muka", "docstatus": 1})


def baris_pajak(k, company):
	pajak = []
	if k.ppn:
		pajak.append({"charge_type": "On Net Total", "account_head": frappe.db.get_value("Account", {"company": company, "account_name": "PPN Keluaran"}),
			"description": f"PPN {flt(k.ppn):g}%", "rate": k.ppn})
	if k.pph_persen:
		pajak.append({"charge_type": "On Net Total", "account_head": akun_penagihan(company, "akun_pph"),
			"description": f"PPh Final {flt(k.pph_persen):g}% (dipotong pemberi kerja)", "rate": -k.pph_persen})
	for row in pajak:
		if not row["account_head"]:
			frappe.throw(_("Akun pajak untuk {0} belum ada di company {1}.").format(row["description"], company))
	return pajak


def invoice_baru(k, jenis, items, keterangan, milestone=None, pajak=None):
	si = frappe.new_doc("Sales Invoice")
	si.update(
		{
			"company": k.company, "customer": k.customer, "project": k.project, "posting_date": today(),
			"jenis_tagihan": jenis, "kontrak_project": k.kontrak, "milestone_termin": milestone,
			"remarks": keterangan,
		}
	)
	if k.cost_center:
		si.cost_center = k.cost_center
	for it in items:
		si.append("items", {**it, "qty": 1, "uom": frappe.db.get_value("Item", it["item_code"], "stock_uom")})
	for tx in pajak if pajak is not None else baris_pajak(k, k.company):
		si.append("taxes", tx)
	return si


@frappe.whitelist()
def buat_tagihan_uang_muka(project):
	frappe.has_permission("Sales Invoice", "create", throw=True)
	k = data_kontrak(project)
	if not (k.um_persen or k.um_nilai):
		frappe.throw(_("Kontrak {0} tidak memakai uang muka.").format(k.kontrak))
	if not k.jaminan_um:
		frappe.throw(_("Jaminan Uang Muka belum diserahkan (Kontrak Project {0} → Jaminan). Uang muka tidak bisa ditagih.").format(k.kontrak),
			title=_("Jaminan uang muka belum ada"))
	ada = invoice_aktif({"project": project, "jenis_tagihan": "Uang Muka"})
	if ada:
		return ada[0].name
	r = rincian_uang_muka(k)
	pajak = [{**tx, "charge_type": "Actual", "tax_amount": r.ppn if tx["rate"] > 0 else -r.pph} for tx in baris_pajak(k, k.company)]
	for tx in pajak:
		tx.pop("rate")
	si = invoice_baru(
		k, "Uang Muka",
		[{"item_code": ITEM_UM, "description": _("Uang muka {0}% pekerjaan {1} (kontrak {2})").format(flt(k.um_persen, 2), k.project_name, k.nomor_kontrak or k.kontrak),
			"rate": r.dpp}],
		_("Tagihan uang muka {0}% — {1}").format(flt(k.um_persen, 2), k.project_name),
		pajak=pajak,
	)
	si.nilai_bruto, si.nilai_pph_final = r.bruto, r.pph
	si.insert()
	return si.name


@frappe.whitelist()
def buat_tagihan_termin(project, milestone):
	frappe.has_permission("Sales Invoice", "create", throw=True)
	k = data_kontrak(project)
	m = frappe.get_doc("Milestone Termin", milestone)
	if m.project != project:
		frappe.throw(_("Milestone tidak ada di proyek ini."))
	if m.status != "Tercapai":
		frappe.throw(_("Milestone {0} belum tercapai.").format(m.nama_milestone))
	if perlu_uang_muka_dulu(k, project) and not invoice_aktif({"milestone_termin": milestone}):
		frappe.throw(_("Tagih (submit) invoice uang muka dulu supaya termin ini dipotong uang muka secara proporsional."),
			title=_("Uang muka belum ditagih"))
	ada = invoice_aktif({"milestone_termin": milestone})
	if ada:
		# Sudah ada (Draft / Submitted): buka invoice itu, bukan membuat baru.
		return ada[0].name
	r = rincian_termin(k, m, project)
	items = [{"item_code": ITEM_TERMIN, "description": _("Termin {0} — {1} ({2}% nilai kontrak)").format(m.urutan, m.nama_milestone, flt(m.bobot, 2)),
		"rate": r.dpp}]
	# Potongan uang muka, PPN, & PPh final sebagai baris pajak nominal (PPN/PPh dari DPP setelah potongan).
	pajak = []
	if r.potong_um:
		pajak.append({"charge_type": "Actual", "account_head": akun_penagihan(k.company, "akun_uang_muka"),
			"description": _("Pengembalian uang muka {0}% (DPP)").format(flt(k.um_persen, 2)), "tax_amount": -r.potong_um})
	for tx in baris_pajak(k, k.company):
		nilai = r.ppn if tx["rate"] > 0 else -r.pph
		pajak.append({**{x: tx[x] for x in ("account_head", "description")}, "charge_type": "Actual", "tax_amount": nilai,
			"description": tx["description"] + (_(" × DPP setelah potongan uang muka") if r.potong_um else "")})
	si = invoice_baru(k, "Termin", items, _("Tagihan termin {0} — {1}").format(m.urutan, m.nama_milestone), milestone, pajak)
	si.nilai_bruto, si.potongan_uang_muka, si.nilai_pph_final, si.nilai_retensi = r.bruto, r.potong_um, r.pph, r.retensi
	si.set_missing_values()
	si.calculate_taxes_and_totals()
	atur_jadwal_retensi(si, k)
	si.insert()
	return si.name


def atur_jadwal_retensi(si, k):
	"""Jadwal pembayaran: (1) dibayar sekarang = total − retensi, (2) retensi jatuh tempo akhir pemeliharaan."""
	if not flt(si.nilai_retensi):
		return
	total = flt(si.rounded_total or si.grand_total)
	retensi = min(flt(si.nilai_retensi), total)
	jatuh_tempo_retensi = k.akhir_pemeliharaan or add_days(si.posting_date, 180)
	posting = getdate(si.posting_date)
	si.payment_terms_template = None
	si.set("payment_schedule", [
		{"due_date": getdate(si.due_date) if si.due_date else posting, "payment_amount": total - retensi,
			"invoice_portion": (total - retensi) / total * 100, "description": _("Pembayaran termin")},
		{"due_date": max(getdate(jatuh_tempo_retensi), posting), "payment_amount": retensi, "invoice_portion": retensi / total * 100,
			"description": _("Retensi {0}% (dibayar setelah masa pemeliharaan)").format(flt(k.retensi_persen, 2))},
	])


def validasi_invoice(doc, method=None):
	"""Sales Invoice validate: satu tagihan aktif per milestone / satu uang muka per proyek."""
	if doc.jenis_tagihan == "Termin" and doc.milestone_termin:
		lain = frappe.db.get_value("Sales Invoice", {"milestone_termin": doc.milestone_termin, "docstatus": ("<", 2), "name": ("!=", doc.name)})
		if lain:
			frappe.throw(_("Milestone ini sudah punya tagihan {0}.").format(lain))
	if doc.jenis_tagihan == "Uang Muka" and doc.project:
		lain = frappe.db.get_value("Sales Invoice", {"project": doc.project, "jenis_tagihan": "Uang Muka", "docstatus": ("<", 2), "name": ("!=", doc.name)})
		if lain:
			frappe.throw(_("Tagihan uang muka proyek ini sudah ada: {0}.").format(lain))


def sinkron_milestone(doc, method=None):
	"""Sales Invoice on_submit / on_cancel: tautan tagihan di Milestone Termin."""
	if doc.jenis_tagihan != "Termin" or not doc.milestone_termin:
		return
	nilai = doc.name if method == "on_submit" else None
	if method == "on_cancel" and frappe.db.get_value("Milestone Termin", doc.milestone_termin, "sales_invoice") != doc.name:
		return
	frappe.db.set_value("Milestone Termin", doc.milestone_termin, "sales_invoice", nilai, update_modified=False)


def ppn_invoice(names):
	"""PPN (baris pajak positif berakun PPN Keluaran) per invoice."""
	if not names:
		return {}
	return {
		r.parent: flt(r.ppn)
		for r in frappe.db.sql(
			"""select t.parent, sum(t.tax_amount) as ppn from `tabSales Taxes and Charges` t join `tabAccount` a on a.name = t.account_head
			where t.parenttype = 'Sales Invoice' and t.parent in %s and a.account_name = 'PPN Keluaran' group by t.parent""",
			(tuple(names),),
			as_dict=True,
		)
	}


def lengkapi_invoice(inv, ppn):
	"""Total, dibayar, retensi diterima/sisa. Pembayaran dianggap melunasi bagian termin dulu, sisanya retensi."""
	total = flt(inv.rounded_total or inv.grand_total)
	retensi = flt(inv.nilai_retensi)
	dibayar = total - flt(inv.outstanding_amount) if inv.docstatus == 1 else 0
	inv.total = total
	inv.ppn = flt(ppn.get(inv.name))
	inv.dibayar_sekarang = total - retensi
	inv.dibayar = dibayar
	inv.sisa_termin = max(inv.dibayar_sekarang - dibayar, 0) if inv.docstatus == 1 else 0
	inv.retensi_diterima = min(max(dibayar - inv.dibayar_sekarang, 0), retensi)
	inv.retensi_sisa = retensi - inv.retensi_diterima if inv.docstatus == 1 else 0
	return inv


@frappe.whitelist()
def get_penagihan(project):
	doc = frappe.get_doc("Project", project)
	doc.check_permission("read")
	k = data_kontrak(project)
	hari_ini = getdate(today())
	um_inv = invoice_aktif({"project": project, "jenis_tagihan": "Uang Muka"})
	r_um = rincian_uang_muka(k) if (k.um_persen or k.um_nilai) else None
	milestone = frappe.get_all("Milestone Termin", filters={"project": project},
		fields=["name", "urutan", "nama_milestone", "tanggal_target", "tanggal_tercapai", "status", "bobot", "nilai_termin"], order_by="urutan asc")
	semua_inv = invoice_aktif({"project": project, "jenis_tagihan": ("in", ["Uang Muka", "Termin"])})
	ppn = ppn_invoice([x.name for x in semua_inv])
	per_nama = {x.name: lengkapi_invoice(x, ppn) for x in semua_inv}
	tunggu_um = perlu_uang_muka_dulu(k, project)
	termin, retensi = [], []
	for m in milestone:
		inv = invoice_aktif({"milestone_termin": m.name})
		inv = per_nama.get(inv[0].name) if inv else None
		row = {**m, "invoice": inv}
		if not inv and m.status == "Tercapai":
			row["rincian"] = rincian_termin(k, m, project)
			row["tunggu_um"] = tunggu_um
		termin.append(row)
		if inv and inv.docstatus == 1 and flt(inv.nilai_retensi):
			jatuh_tempo = k.akhir_pemeliharaan or inv.due_date
			status = "Lunas" if inv.retensi_sisa <= 0.5 else ("Jatuh Tempo" if jatuh_tempo and getdate(jatuh_tempo) <= hari_ini else "Ditahan")
			retensi.append({"urutan": m.urutan, "nama_milestone": m.nama_milestone, "invoice": inv.name, "retensi": flt(inv.nilai_retensi),
				"diterima": inv.retensi_diterima, "sisa": inv.retensi_sisa, "jatuh_tempo": str(jatuh_tempo) if jatuh_tempo else None,
				"status": status, "sisa_termin": inv.sisa_termin})
	um = per_nama.get(um_inv[0].name) if um_inv else None
	submitted = [x for x in per_nama.values() if x.docstatus == 1]
	ditagih = sum(x.total for x in submitted)
	retensi_total = sum(r["retensi"] for r in retensi)
	retensi_sisa = sum(r["sisa"] for r in retensi)
	jatuh_tempo_retensi = min((r["jatuh_tempo"] for r in retensi if r["sisa"] > 0.5 and r["jatuh_tempo"]), default=None)
	termin_ditagih = [t for t in termin if t["invoice"] and t["invoice"].docstatus == 1]
	return {
		"project": {"name": doc.name, "project_name": doc.project_name},
		"kontrak": k,
		"uang_muka": {"rincian": r_um, "invoice": um},
		"termin": termin,
		"retensi": retensi,
		"alur": {
			"uang_muka": bool(um and um.docstatus == 1) if r_um else None,
			"termin_ditagih": len(termin_ditagih),
			"termin_total": len(termin),
			"piutang_termin": sum(x.sisa_termin for x in submitted),
			"retensi_sisa": retensi_sisa,
		},
		"ringkasan": {
			"nilai_kontrak": k.nilai_kontrak,
			"ditagih": ditagih,
			"diterima": sum(x.dibayar for x in submitted),
			"piutang": sum(x.sisa_termin for x in submitted),
			"retensi_total": retensi_total,
			"retensi_diterima": retensi_total - retensi_sisa,
			"retensi_sisa": retensi_sisa,
			"retensi_jatuh_tempo": jatuh_tempo_retensi,
			"retensi_lewat": bool(jatuh_tempo_retensi and getdate(jatuh_tempo_retensi) <= hari_ini),
			"bisa_ditagih": sum(flt(t["nilai_termin"]) for t in termin if t["status"] == "Tercapai" and not t["invoice"]),
			"bisa_ditagih_total": sum(flt(t["rincian"].total) for t in termin if t.get("rincian")),
			"persen_ditagih": flt(sum(flt(t["bobot"]) for t in termin_ditagih), 2),
		},
		"bisa_buat": bool(frappe.has_permission("Sales Invoice", "create")),
		"bisa_bayar": bool(frappe.has_permission("Payment Entry", "create")),
	}


@frappe.whitelist()
def buat_pembayaran(project, invoice, bagian="termin"):
	"""Payment Entry (belum disimpan) untuk invoice proyek: bagian 'termin' = sisa di luar retensi, 'retensi' = sisa retensi,
	'semua' = seluruh sisa piutang. Dikembalikan ke form untuk dilengkapi (rekening, tanggal, referensi)."""
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	inv = frappe.get_doc("Sales Invoice", invoice)
	if inv.project != project or inv.docstatus != 1:
		frappe.throw(_("Invoice tidak valid untuk proyek ini."))
	x = lengkapi_invoice(frappe._dict(name=inv.name, docstatus=1, rounded_total=inv.rounded_total, grand_total=inv.grand_total,
		outstanding_amount=inv.outstanding_amount, nilai_retensi=inv.nilai_retensi), {})
	jumlah = {"termin": x.sisa_termin, "retensi": x.retensi_sisa}.get(bagian, flt(inv.outstanding_amount))
	if jumlah <= 0:
		frappe.throw(_("Tidak ada sisa {0} pada invoice ini.").format(_("retensi") if bagian == "retensi" else _("tagihan")))
	pe = get_payment_entry("Sales Invoice", invoice, party_amount=jumlah)
	pe.project = project
	pe.remarks = (
		_("Penerimaan retensi {0}").format(inv.name) if bagian == "retensi" else _("Penerimaan {0} {1}").format(inv.jenis_tagihan or "", inv.name)
	)
	return pe


@frappe.whitelist()
def get_daftar():
	projects = frappe.get_list("Project", filters={"kontrak_project": ("is", "set")},
		fields=["name", "project_name", "customer", "nilai_kontrak"], order_by="creation desc", limit_page_length=0)
	for p in projects:
		inv = invoice_aktif({"project": p.name, "jenis_tagihan": ("in", ["Uang Muka", "Termin"]), "docstatus": 1})
		p.ditagih = sum(flt(x.rounded_total or x.grand_total) for x in inv)
		p.piutang = sum(flt(x.outstanding_amount) for x in inv)
		p.siap_ditagih = frappe.db.count("Milestone Termin", {"project": p.name, "status": "Tercapai", "sales_invoice": ("is", "not set")})
		p.uang_muka = bool(invoice_aktif({"project": p.name, "jenis_tagihan": "Uang Muka", "docstatus": 1}))
	return projects
