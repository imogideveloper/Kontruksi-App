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

import re

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
		tanggal_selesai=k.tanggal_selesai, skema_retensi=k.get("skema_retensi") or SKEMA_RETENSI_FHO,
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
			# Nominal tagihan sudah dibulatkan per rupiah dari kontrak: tanpa pembulatan tambahan ERPNext.
			"disable_rounded_total": 1,
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


SKEMA_RETENSI_FHO = "Cair di Akhir Pemeliharaan"
SKEMA_RETENSI_SEPARUH = "50% PHO / 50% FHO"
SKEMA_RETENSI_JAMINAN = "Diganti Jaminan Pemeliharaan"


def bagian_retensi(k, retensi, posting):
	"""[(jatuh tempo, nominal, keterangan)] retensi sesuai skema kontrak. PHO = Tanggal Selesai, FHO = Akhir Pemeliharaan."""
	posting = getdate(posting)
	fho = getdate(k.akhir_pemeliharaan) if k.akhir_pemeliharaan else getdate(add_days(posting, 180))
	pho = getdate(k.tanggal_selesai) if k.tanggal_selesai else fho
	tgl = lambda d: max(d, posting)  # noqa: E731
	persen = flt(k.retensi_persen, 2)
	if k.skema_retensi == SKEMA_RETENSI_SEPARUH:
		pertama = flt(retensi / 2, 0)
		return [
			(tgl(pho), pertama, _("Retensi {0}% — 50% saat serah terima pertama (PHO)").format(persen)),
			(tgl(fho), retensi - pertama, _("Retensi {0}% — 50% setelah masa pemeliharaan (FHO)").format(persen)),
		]
	if k.skema_retensi == SKEMA_RETENSI_JAMINAN:
		return [(tgl(pho), retensi, _("Retensi {0}% (cair saat PHO, diganti jaminan pemeliharaan)").format(persen))]
	return [(tgl(fho), retensi, _("Retensi {0}% (dibayar setelah masa pemeliharaan)").format(persen))]


def atur_jadwal_retensi(si, k):
	"""Jadwal pembayaran: (1) dibayar sekarang = total − retensi, (2..) retensi sesuai skema retensi kontrak."""
	if not flt(si.nilai_retensi):
		return
	total = flt(si.rounded_total or si.grand_total)
	retensi = min(flt(si.nilai_retensi), total)
	posting = getdate(si.posting_date)
	si.payment_terms_template = None
	jadwal = [{"due_date": getdate(si.due_date) if si.due_date else posting, "payment_amount": total - retensi,
		"invoice_portion": (total - retensi) / total * 100, "description": _("Pembayaran termin")}]
	for jatuh_tempo, nilai, ket in bagian_retensi(k, retensi, posting):
		jadwal.append({"due_date": jatuh_tempo, "payment_amount": nilai, "invoice_portion": nilai / total * 100, "description": ket})
	si.set("payment_schedule", jadwal)


def jatuh_tempo_retensi_berikut(invoice, diterima):
	"""Jatuh tempo bagian retensi berikutnya yang belum terbayar (jadwal pembayaran baris ke-2 dst.)."""
	rows = frappe.get_all("Payment Schedule", filters={"parent": invoice, "parenttype": "Sales Invoice", "idx": (">", 1)},
		fields=["due_date", "payment_amount"], order_by="idx asc")
	sisa = flt(diterima)
	for r in rows:
		if sisa + 0.5 < flt(r.payment_amount):
			return r.due_date
		sisa -= flt(r.payment_amount)
	return rows[-1].due_date if rows else None


def uraian_tagihan(doc):
	"""Teks kolom list Sales Invoice: "Uang Muka" / "Termin 2 — Pekerjaan Struktur selesai"."""
	if doc.get("jenis_tagihan") == "Termin" and doc.get("milestone_termin"):
		m = frappe.db.get_value("Milestone Termin", doc.milestone_termin, ["urutan", "nama_milestone"], as_dict=True)
		if m:
			return _("Termin {0} — {1}").format(m.urutan, m.nama_milestone)
	return _(doc.get("jenis_tagihan") or "")


def validasi_invoice(doc, method=None):
	"""Sales Invoice validate: satu tagihan aktif per milestone / satu uang muka per proyek."""
	if doc.jenis_tagihan:
		doc.uraian_tagihan = uraian_tagihan(doc)
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
			jatuh_tempo = jatuh_tempo_retensi_berikut(inv.name, inv.retensi_diterima) or k.akhir_pemeliharaan or inv.due_date
			status = "Lunas" if inv.retensi_sisa <= 0.5 else ("Jatuh Tempo" if jatuh_tempo and getdate(jatuh_tempo) <= hari_ini else "Ditahan")
			retensi.append({"urutan": m.urutan, "nama_milestone": m.nama_milestone, "invoice": inv.name, "retensi": flt(inv.nilai_retensi),
				"diterima": inv.retensi_diterima, "sisa": inv.retensi_sisa, "jatuh_tempo": str(jatuh_tempo) if jatuh_tempo else None,
				"status": status, "sisa_termin": inv.sisa_termin})
	um = per_nama.get(um_inv[0].name) if um_inv else None
	submitted = [x for x in per_nama.values() if x.docstatus == 1]
	# Layar Pembayaran: daftar invoice proyek & riwayat Payment Entry-nya.
	label_termin = {t["invoice"].name: f"T{t['urutan']} {t['nama_milestone']}" for t in termin if t["invoice"]}
	daftar_invoice = sorted(
		[frappe._dict({**x, "label": _("Uang Muka") if um and x.name == um.name else label_termin.get(x.name, x.name)}) for x in per_nama.values()],
		key=lambda x: (str(x.posting_date), x.name),
	)
	pembayaran = []
	if submitted:
		pembayaran = frappe.db.sql(
			"""select pe.name, pe.posting_date, pe.mode_of_payment, pe.reference_no, ref.reference_name as invoice,
				ref.allocated_amount as jumlah
			from `tabPayment Entry Reference` ref join `tabPayment Entry` pe on pe.name = ref.parent
			where pe.docstatus = 1 and ref.reference_doctype = 'Sales Invoice' and ref.reference_name in %s
			order by pe.posting_date desc, pe.creation desc""",
			(tuple(x.name for x in submitted),),
			as_dict=True,
		)
		for r in pembayaran:
			r.label = next((x["label"] for x in daftar_invoice if x["name"] == r.invoice), r.invoice)
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
		"invoice": daftar_invoice,
		"pembayaran": pembayaran,
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
	'otomatis' = termin dulu lalu retensi (uang muka: seluruh sisa),
	'semua' = seluruh sisa piutang. Dikembalikan ke form untuk dilengkapi (rekening, tanggal, referensi)."""
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	inv = frappe.get_doc("Sales Invoice", invoice)
	if inv.project != project or inv.docstatus != 1:
		frappe.throw(_("Invoice tidak valid untuk proyek ini."))
	x = lengkapi_invoice(frappe._dict(name=inv.name, docstatus=1, rounded_total=inv.rounded_total, grand_total=inv.grand_total,
		outstanding_amount=inv.outstanding_amount, nilai_retensi=inv.nilai_retensi), {})
	if bagian == "otomatis":
		# Dari form Sales Invoice (Create → Payment): uang muka = seluruh sisa; termin = bagian termin dulu, retensi
		# baru setelah bagian termin lunas.
		bagian = "semua" if inv.jenis_tagihan != "Termin" else "termin" if x.sisa_termin > 0.5 else "retensi"
	jumlah = {"termin": x.sisa_termin, "retensi": x.retensi_sisa}.get(bagian, flt(inv.outstanding_amount))
	if jumlah <= 0:
		frappe.throw(_("Tidak ada sisa {0} pada invoice ini.").format(_("retensi") if bagian == "retensi" else _("tagihan")))
	pe = get_payment_entry("Sales Invoice", invoice, party_amount=jumlah)
	pe.project = project
	cara_bayar_bank(pe)
	lengkapi_pembayaran(pe, inv)
	pe.remarks = (
		_("Penerimaan retensi {0}").format(inv.name) if bagian == "retensi" else _("Penerimaan {0} {1}").format(inv.jenis_tagihan or "", inv.name)
	)
	return pe


@frappe.whitelist()
def buat_pembayaran_retensi_semua(project):
	"""Satu Payment Entry (belum disimpan) untuk menerima sisa retensi semua invoice termin proyek sekaligus —
	hanya invoice yang bagian terminnya sudah lunas. Tiap invoice jadi satu baris referensi."""
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	frappe.has_permission("Payment Entry", "create", throw=True)
	daftar = []
	for x in invoice_aktif({"project": project, "jenis_tagihan": "Termin", "docstatus": 1}):
		x = lengkapi_invoice(x, {})
		if x.retensi_sisa > 0.5 and x.sisa_termin <= 0.5:
			daftar.append(x)
	if not daftar:
		frappe.throw(_("Tidak ada retensi yang bisa diterima (retensi sudah lunas, atau bagian termin invoicenya belum lunas)."))
	daftar.sort(key=lambda x: (str(x.posting_date), x.name))
	pe = get_payment_entry("Sales Invoice", daftar[0].name, party_amount=daftar[0].retensi_sisa)
	for x in daftar[1:]:
		lain = get_payment_entry("Sales Invoice", x.name, party_amount=x.retensi_sisa)
		for ref in lain.references:
			pe.append("references", ref.as_dict(no_default_fields=True))
	total = sum(x.retensi_sisa for x in daftar)
	pe.paid_amount = pe.received_amount = total
	pe.base_paid_amount = pe.base_received_amount = total
	pe.set_amounts()
	pe.project = project
	inv = frappe.get_doc("Sales Invoice", daftar[0].name)
	cara_bayar_bank(pe)
	lengkapi_pembayaran(pe, inv)
	pe.remarks = _("Penerimaan retensi {0} termin: {1}").format(len(daftar), ", ".join(x.name for x in daftar))
	return pe


def cara_bayar_bank(pe):
	"""Mode of Payment default untuk penerimaan proyek: Mode of Payment tipe Bank pertama yang punya rekening default
	di company ini; rekening itu dipakai sebagai Account Paid To. Bila belum ada, dibiarkan (diisi user)."""
	mop = frappe.db.sql(
		"""select m.name, a.default_account from `tabMode of Payment` m join `tabMode of Payment Account` a on a.parent = m.name
		where m.enabled = 1 and m.type = 'Bank' and a.company = %s and ifnull(a.default_account, '') != '' order by m.name limit 1""",
		pe.company, as_dict=True,
	)
	if not mop:
		return
	pe.mode_of_payment = mop[0].name
	pe.paid_to = mop[0].default_account
	pe.paid_to_account_type, pe.paid_to_account_currency = frappe.get_cached_value(
		"Account", pe.paid_to, ["account_type", "account_currency"]
	)


def lengkapi_pembayaran(pe, inv):
	"""Isian Payment Entry yang bisa diambil dari invoice / master: kontak customer, rekening bank customer &
	perusahaan (rekening perusahaan sekaligus jadi Account Paid To), cost center."""
	from erpnext.accounts.doctype.bank_account.bank_account import get_default_company_bank_account, get_party_bank_account
	from erpnext.accounts.party import get_default_contact

	pe.contact_person = pe.contact_person or inv.contact_person or get_default_contact("Customer", inv.customer)
	if pe.contact_person and not pe.contact_email:
		pe.contact_email = inv.contact_email or frappe.db.get_value("Contact", pe.contact_person, "email_id")
	pe.party_bank_account = pe.party_bank_account or get_party_bank_account("Customer", inv.customer)
	pe.bank_account = pe.bank_account or get_default_company_bank_account(inv.company, "Customer", inv.customer)
	akun_bank = pe.bank_account and frappe.db.get_value("Bank Account", pe.bank_account, "account")
	if akun_bank:
		pe.paid_to = akun_bank
		pe.paid_to_account_type, pe.paid_to_account_currency = frappe.get_cached_value(
			"Account", akun_bank, ["account_type", "account_currency"]
		)
	pe.cost_center = (
		inv.cost_center
		or frappe.db.get_value("Project", inv.project, "cost_center")
		or frappe.get_cached_value("Company", inv.company, "cost_center")
	)


CARA_BAYAR_CEK = re.compile(r"cheque|cek|giro", re.I)


def pembayaran_proyek(pe):
	"""Payment Entry ini menerima pembayaran invoice tagihan proyek (jenis_tagihan terisi)?"""
	nama = [r.reference_name for r in pe.get("references") or [] if r.reference_doctype == "Sales Invoice" and r.reference_name]
	return bool(nama) and bool(frappe.db.exists("Sales Invoice", {"name": ("in", nama), "jenis_tagihan": ("is", "set")}))


def isi_referensi_pembayaran(doc, method=None):
	"""Payment Entry before_validate: ERPNext mewajibkan Reference No & Date untuk setiap transaksi rekening bank. Untuk
	penerimaan tagihan proyek nomor itu hanya wajib bila dibayar dengan cek / giro; selain itu (transfer, dsb.) diisi
	otomatis nomor Payment Entry ini, tanggalnya = tanggal posting."""
	if doc.reference_no and doc.reference_date:
		return
	if CARA_BAYAR_CEK.search(doc.mode_of_payment or "") or not pembayaran_proyek(doc):
		return
	doc.reference_date = doc.reference_date or doc.posting_date
	doc.reference_no = doc.reference_no or (doc.name if doc.name and not doc.name.startswith("new-") else doc.mode_of_payment or "Transfer")


@frappe.whitelist()
def get_daftar():
	"""Daftar proyek halaman Penagihan: ringkasan status penagihan per proyek.

	progres_tagih = nilai bruto termin yang sudah ditagih ÷ nilai kontrak (uang muka tidak dihitung — ia dipotong
	kembali dari termin). Diterima / piutang dari invoice uang muka & termin yang sudah di-submit; retensi ditahan =
	retensi yang belum diterima."""
	projects = frappe.get_list("Project", filters={"kontrak_project": ("is", "set")},
		fields=["name", "project_name", "customer", "nilai_kontrak"], order_by="creation desc", limit_page_length=0)
	for p in projects:
		semua = invoice_aktif({"project": p.name, "jenis_tagihan": ("in", ["Uang Muka", "Termin"])})
		extra = {x.name: x for x in frappe.get_all("Sales Invoice", filters={"name": ("in", [x.name for x in semua] or [""])},
			fields=["name", "jenis_tagihan", "milestone_termin", "nilai_bruto"])}
		submitted = [lengkapi_invoice(x, {}) for x in semua if x.docstatus == 1]
		um = next((x for x in semua if extra[x.name].jenis_tagihan == "Uang Muka"), None)
		if not um:
			p.uang_muka = "Belum ditagih"
		elif um.docstatus == 0:
			p.uang_muka = "Draft"
		else:
			p.uang_muka = "Lunas" if flt(um.outstanding_amount) <= 0.5 else "Belum dibayar"
		p.uang_muka_total = flt(um.rounded_total or um.grand_total) if um else 0
		termin = [x for x in submitted if extra[x.name].jenis_tagihan == "Termin"]
		p.termin_total_tagih = sum(x.total for x in termin)
		p.termin_total = frappe.db.count("Milestone Termin", {"project": p.name})
		p.termin_ditagih = len({extra[x.name].milestone_termin for x in termin if extra[x.name].milestone_termin})
		bruto_termin = sum(flt(extra[x.name].nilai_bruto) for x in termin)
		p.progres_tagih = flt(bruto_termin / flt(p.nilai_kontrak) * 100, 1) if flt(p.nilai_kontrak) else 0
		p.ditagih = sum(x.total for x in submitted)
		p.diterima = sum(x.dibayar for x in submitted)
		p.piutang = sum(flt(x.outstanding_amount) for x in submitted)
		p.retensi_ditahan = sum(x.retensi_sisa for x in termin)
		p.siap_ditagih = frappe.db.count("Milestone Termin", {"project": p.name, "status": "Tercapai", "sales_invoice": ("is", "not set")})
	return projects

def hapus_transaksi(invoices):
	"""Batalkan & hapus Sales Invoice beserta Payment Entry yang merujuknya (dan jurnal batalnya — saldo nol).
	Ditolak bila sebuah Payment Entry juga membayar invoice lain di luar daftar."""
	invoices = list(invoices)
	if not invoices:
		return []
	pe_list = sorted({r.parent for r in frappe.get_all("Payment Entry Reference",
		filters={"reference_doctype": "Sales Invoice", "reference_name": ("in", invoices)}, fields=["parent"])})
	for pe in pe_list:
		lain = frappe.get_all("Payment Entry Reference", filters={"parent": pe, "reference_name": ("not in", invoices)}, pluck="reference_name")
		if lain:
			frappe.throw(_("Pembayaran {0} juga membayar invoice lain ({1}); hapus manual.").format(pe, ", ".join(lain)))
	dokumen = [("Payment Entry", x) for x in pe_list] + [("Sales Invoice", x) for x in invoices]
	for dt, nama in dokumen:
		doc = frappe.get_doc(dt, nama)
		if doc.docstatus == 1:
			doc.flags.ignore_links = True
			doc.cancel()
	voucher = [nama for _dt, nama in dokumen]
	frappe.db.delete("GL Entry", {"voucher_no": ("in", voucher), "is_cancelled": 1})
	frappe.db.delete("Payment Ledger Entry", {"voucher_no": ("in", voucher), "delinked": 1})
	frappe.db.delete("Payment Ledger Entry", {"against_voucher_no": ("in", voucher), "delinked": 1})
	for dt, nama in dokumen:
		frappe.delete_doc(dt, nama, ignore_permissions=True)
	# Tautan invoice di Milestone Termin (draft yang dihapus tidak melewati on_cancel).
	for m in frappe.get_all("Milestone Termin", filters={"sales_invoice": ("in", invoices)}, pluck="name"):
		frappe.db.set_value("Milestone Termin", m, "sales_invoice", None, update_modified=False)
	return voucher


@frappe.whitelist()
def reset_penagihan(project, konfirmasi):
	"""Tombol Reset Penagihan (System Manager): batalkan & hapus semua invoice uang muka / termin proyek beserta
	pembayarannya — untuk membersihkan data uji. Konfirmasi = ID proyek."""
	frappe.only_for("System Manager")
	if (konfirmasi or "").strip() != project:
		frappe.throw(_("Ketik ID proyek {0} untuk konfirmasi.").format(project))
	invoices = frappe.get_all("Sales Invoice", filters={"project": project, "jenis_tagihan": ("is", "set")}, pluck="name")
	dihapus = hapus_transaksi(invoices)
	frappe.db.commit()
	return dihapus
