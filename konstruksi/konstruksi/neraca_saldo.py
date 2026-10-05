"""Neraca Saldo (halaman Keuangan SiKon): tampilan premium dari report Trial Balance ERPNext.

Angka dihitung oleh mesin Trial Balance ERPNext (sama persis dengan report bawaan) dengan akun induk ditampilkan dan
saldo awal / akhir netto; modul ini hanya merapikan data untuk halaman & cetak PDF."""

import frappe
from frappe import _
from frappe.utils import flt, getdate, today

URUTAN_JENIS = ["Asset", "Liability", "Equity", "Income", "Expense"]
LABEL_JENIS = {"Asset": "Aset", "Liability": "Kewajiban", "Equity": "Ekuitas", "Income": "Pendapatan", "Expense": "Beban"}
KOLOM_ANGKA = ("opening_debit", "opening_credit", "debit", "credit", "closing_debit", "closing_credit")


def _cek_izin():
	if not frappe.has_permission("GL Entry", "read"):
		frappe.throw(_("Tidak punya akses ke data akuntansi."), frappe.PermissionError)


@frappe.whitelist()
def get_awal():
	"""Nilai awal filter: company default & periode tahun fiskal berjalan."""
	_cek_izin()
	from erpnext.accounts.utils import get_fiscal_year

	company = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")
	fy = get_fiscal_year(today(), company=company, as_dict=True, raise_on_missing=False) or frappe._dict()
	return {"company": company, "from_date": fy.get("year_start_date"), "to_date": today(), "fiscal_year": fy.get("name")}


@frappe.whitelist()
def get_neraca_saldo(company, from_date, to_date, project=None, cost_center=None, show_zero=0):
	_cek_izin()
	from erpnext.accounts.report.trial_balance.trial_balance import execute
	from erpnext.accounts.utils import get_fiscal_year

	from_date, to_date = getdate(from_date), getdate(to_date)
	if from_date > to_date:
		frappe.throw(_("Tanggal awal harus sebelum tanggal akhir."))
	fy = get_fiscal_year(from_date, company=company, as_dict=True)
	if getdate(to_date) > getdate(fy.year_end_date):
		frappe.throw(_("Periode harus berada dalam satu tahun fiskal ({0}: {1} s.d. {2}).").format(
			fy.name, frappe.format(fy.year_start_date, "Date"), frappe.format(fy.year_end_date, "Date")))
	filters = frappe._dict(
		company=company, fiscal_year=fy.name, from_date=from_date, to_date=to_date,
		show_zero_values=int(frappe.utils.cint(show_zero)), include_default_book_entries=1,
		show_group_accounts=1, show_net_values=1,
	)
	if project:
		filters.project = [project]
	if cost_center:
		filters.cost_center = [cost_center]
	data = execute(filters)[1] or []

	total = next((r for r in data if str(r.get("account")).strip("'") == "Total"), None)
	baris = [r for r in data if r is not total and r.get("account")]
	induk = {r.get("parent_account") for r in baris if r.get("parent_account")}
	info = {
		a.name: a
		for a in frappe.get_all("Account", filters={"name": ("in", [r["account"] for r in baris] or [""])},
			fields=["name", "account_name", "account_number", "root_type"])
	}
	rows = []
	for r in baris:
		a = info.get(r["account"]) or frappe._dict()
		rows.append(frappe._dict(
			account=r["account"], nama=a.account_name or r.get("account_name") or r["account"], nomor=a.account_number or "",
			parent=r.get("parent_account"), indent=int(r.get("indent") or 0), group=r["account"] in induk,
			root_type=a.root_type, **{k: flt(r.get(k)) for k in KOLOM_ANGKA},
		))

	jumlah = {k: flt((total or {}).get(k)) for k in KOLOM_ANGKA}
	per_jenis = {}
	for r in rows:
		if r.indent == 0 and r.root_type:
			per_jenis[r.root_type] = per_jenis.get(r.root_type, 0) + r.closing_debit - r.closing_credit
	selisih = flt(jumlah["closing_debit"] - jumlah["closing_credit"], 2)
	return {
		"rows": rows,
		"total": jumlah,
		"seimbang": abs(selisih) < 0.5 and abs(flt(jumlah["debit"] - jumlah["credit"], 2)) < 0.5,
		"selisih": selisih,
		"per_jenis": [{"jenis": j, "label": LABEL_JENIS[j], "saldo": per_jenis[j]} for j in URUTAN_JENIS if j in per_jenis],
		"fiscal_year": fy.name,
	}


@frappe.whitelist()
def cetak_neraca_saldo(company, from_date, to_date, project=None, cost_center=None, show_zero=0):
	"""Unduh PDF Neraca Saldo (A4 landscape, gaya cetak SiKon)."""
	from frappe.utils.pdf import get_pdf

	from konstruksi.konstruksi.cetak import _company, _nama_user, font_cetak, tanggal_indonesia

	d = frappe._dict(get_neraca_saldo(company, from_date, to_date, project, cost_center, show_zero))
	angka = lambda v: frappe.utils.fmt_money(flt(v), precision=0).strip() if flt(v) else "–"  # noqa: E731
	for r in d.rows:
		r.teks = {k: angka(r[k]) for k in KOLOM_ANGKA}
	html = frappe.render_template("konstruksi/templates/cetak/neraca_saldo.html", {"d": frappe._dict(
		data=d, company=_company(company), font=font_cetak(), angka=angka,
		periode=f"{tanggal_indonesia(from_date)} – {tanggal_indonesia(to_date)}",
		project=(f"{project} — {frappe.db.get_value('Project', project, 'project_name')}" if project else ""),
		cost_center=cost_center or "", tanggal_cetak=tanggal_indonesia(today()), pencetak=_nama_user(frappe.session.user),
		total={k: angka(v) for k, v in d.total.items()},
		per_jenis=[{**x, "teks": angka(abs(x["saldo"])), "posisi": "D" if x["saldo"] >= 0 else "K"} for x in d.per_jenis],
	)})
	frappe.local.response.filename = f"Neraca Saldo {company} {from_date} sd {to_date}.pdf"
	frappe.local.response.filecontent = get_pdf(html, {"orientation": "Landscape", "page-size": "A4"})
	frappe.local.response.type = "pdf"
