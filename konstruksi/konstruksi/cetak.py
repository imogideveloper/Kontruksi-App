"""Data cetak dokumen SiKon (dipakai print format lewat hooks.jinja)."""

import re

import frappe
from frappe.utils import cint, flt, fmt_money, getdate, strip_html

BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"]


def _terbilang(n):
	if n < 12:
		return SATUAN[n]
	if n < 20:
		return f"{SATUAN[n - 10]} belas"
	if n < 100:
		return f"{SATUAN[n // 10]} puluh {_terbilang(n % 10)}"
	if n < 200:
		return f"seratus {_terbilang(n - 100)}"
	if n < 1000:
		return f"{SATUAN[n // 100]} ratus {_terbilang(n % 100)}"
	if n < 2000:
		return f"seribu {_terbilang(n - 1000)}"
	for nilai, nama in ((10**12, "triliun"), (10**9, "miliar"), (10**6, "juta"), (10**3, "ribu")):
		if n >= nilai:
			return f"{_terbilang(n // nilai)} {nama} {_terbilang(n % nilai)}"
	return ""


def terbilang(angka, mata_uang="rupiah"):
	"""Angka → kata (Bahasa Indonesia), mis. 28419663 → 'Dua puluh delapan juta … rupiah'."""
	angka = flt(angka, 2)
	minus = angka < 0
	utuh = int(abs(angka))
	sen = int(round((abs(angka) - utuh) * 100))
	teks = _terbilang(utuh) or "nol"
	teks = f"{teks} {mata_uang}"
	if sen:
		teks += f" {_terbilang(sen)} sen"
	teks = re.sub(r"\s+", " ", teks).strip()
	if minus:
		teks = "minus " + teks
	return teks[:1].upper() + teks[1:]


def tanggal_indonesia(tanggal):
	d = getdate(tanggal)
	return f"{d.day:02d} {BULAN[d.month - 1]} {d.year}"


def _alamat(nama):
	if not nama:
		return []
	a = frappe.db.get_value("Address", nama, ["address_line1", "address_line2", "city", "state", "pincode"], as_dict=True)
	if not a:
		return []
	kota = ", ".join(x for x in [a.city, a.state] if x)
	return [x for x in [a.address_line1, a.address_line2, " ".join(x for x in [kota, a.pincode] if x)] if x]


def _alamat_html(teks):
	return [x.strip() for x in re.split(r"<br\s*/?>|\n", teks or "") if strip_html(x).strip()]


def _persen_koma(teks):
	return re.sub(r"(\d+)\.(\d+)\s*%", r"\1,\2%", teks or "")


def data_invoice(doc):
	"""Semua isian print format SiKon Invoice untuk satu Sales Invoice."""
	uang = lambda v: fmt_money(flt(v), currency=doc.currency)  # noqa: E731
	company = frappe.get_cached_doc("Company", doc.company)

	nama_alamat = doc.company_address or frappe.db.get_value(
		"Dynamic Link", {"link_doctype": "Company", "link_name": doc.company, "parenttype": "Address"}, "parent"
	)
	alamat_company = _alamat(nama_alamat)
	kota_company = frappe.db.get_value("Address", nama_alamat, "city") if nama_alamat else ""

	alamat_customer = _alamat_html(doc.address_display) or _alamat(
		frappe.db.get_value("Customer", doc.customer, "customer_primary_address")
	)

	kontrak = frappe._dict()
	if doc.get("kontrak_project"):
		kontrak = frappe.db.get_value("Kontrak Project", doc.kontrak_project, ["nomor_kontrak", "nama_project"], as_dict=True) or kontrak
	nama_proyek = frappe.db.get_value("Project", doc.project, "project_name") if doc.project else ""
	milestone = None
	if doc.get("milestone_termin"):
		milestone = frappe.db.get_value("Milestone Termin", doc.milestone_termin, ["urutan", "nama_milestone"], as_dict=True)

	jenis = doc.get("jenis_tagihan")
	if jenis == "Uang Muka":
		subjudul = "Tagihan Uang Muka"
	elif jenis == "Termin" and milestone:
		subjudul = f"Tagihan Termin {milestone.urutan}"
	else:
		subjudul = "Sales Invoice"

	items = []
	for i, it in enumerate(doc.items, 1):
		uraian = strip_html(it.description or "").strip()
		items.append(
			frappe._dict(
				no=f"{i:02d}",
				nama=it.item_name or it.item_code,
				uraian=uraian if uraian and uraian.lower() != (it.item_name or "").lower() else "",
				qty=f"{flt(it.qty):g} {it.uom or ''}".strip(),
				harga=uang(it.rate),
				jumlah=uang(it.amount),
			)
		)

	pajak = []
	for t in doc.taxes:
		teks = _persen_koma(t.description or t.account_head)
		cocok = re.match(r"^(.*?)\s*(\(.*\))\s*$", teks)
		pajak.append(frappe._dict(label=cocok.group(1) if cocok else teks, catatan=cocok.group(2) if cocok else "", nilai=uang(t.tax_amount)))

	total = flt(doc.rounded_total) if cint(doc.disable_rounded_total) == 0 and flt(doc.rounded_total) else flt(doc.grand_total)

	# Retensi: jadwal pembayaran terakhir jatuh tempo akhir masa pemeliharaan.
	retensi = None
	if flt(doc.get("nilai_retensi")) and len(doc.payment_schedule or []) > 1:
		akhir = doc.payment_schedule[-1]
		retensi = frappe._dict(
			dibayar=uang(total - flt(akhir.payment_amount)), nilai=uang(akhir.payment_amount), jatuh_tempo=tanggal_indonesia(akhir.due_date)
		)

	bank = frappe.db.get_value(
		"Bank Account", {"company": doc.company, "is_company_account": 1, "is_default": 1, "disabled": 0},
		["bank", "account_name", "bank_account_no"], as_dict=True,
	) or frappe.db.get_value(
		"Bank Account", {"company": doc.company, "is_company_account": 1, "disabled": 0}, ["bank", "account_name", "bank_account_no"], as_dict=True
	)

	if bank:
		# Atas nama rekening = nama perusahaan (account_name Bank Account hanya label rekening).
		bank.atas_nama = company.company_name or doc.company

	if jenis == "Uang Muka":
		catatan = ("Tagihan uang muka sesuai ketentuan kontrak. Pemotongan PPh Final dilakukan oleh pemberi kerja dan bukti potong "
			"diserahkan kepada penyedia jasa.")
	elif jenis == "Termin":
		catatan = (f"Tagihan termin atas pencapaian {milestone.nama_milestone if milestone else 'milestone'} sesuai ketentuan kontrak. "
			"Pemotongan PPh Final dilakukan oleh pemberi kerja dan bukti potong diserahkan kepada penyedia jasa.")
		if retensi:
			catatan += f" Retensi ditagihkan pada akhir masa pemeliharaan ({retensi.jatuh_tempo})."
	else:
		catatan = strip_html(doc.terms or doc.remarks or "").strip()
		if catatan.lower() == "no remarks":
			catatan = ""

	return frappe._dict(
		company=(company.company_name or doc.company).upper(),
		alamat_company=alamat_company,
		npwp_company=company.tax_id,
		kota=kota_company,
		customer=doc.customer_name or doc.customer,
		alamat_customer=alamat_customer,
		npwp_customer=doc.tax_id or frappe.db.get_value("Customer", doc.customer, "tax_id"),
		subjudul=subjudul,
		tanggal=frappe.format(doc.posting_date, "Date"),
		jatuh_tempo=frappe.format(doc.due_date, "Date") if doc.due_date else "",
		nomor_kontrak=kontrak.get("nomor_kontrak"),
		proyek=nama_proyek or kontrak.get("nama_project"),
		milestone=f"Termin {milestone.urutan} — {milestone.nama_milestone}" if milestone else "",
		baris_item=items,
		sub_total=uang(doc.total),
		pajak=pajak,
		diskon=uang(doc.discount_amount),
		total=uang(total),
		terbilang=terbilang(total),
		retensi=retensi,
		bank=bank,
		catatan=catatan,
		tanggal_ttd=tanggal_indonesia(doc.posting_date),
		draft=doc.docstatus == 0,
		batal=doc.docstatus == 2,
	)


FONT_CETAK = (
	("SKI Condensed", 600, "normal", "BarlowCondensed-600.ttf"),
	("SKI Condensed", 700, "normal", "BarlowCondensed-700.ttf"),
	("SKI Condensed", 500, "italic", "BarlowCondensed-500i.ttf"),
	("SKI Sans", 400, "normal", "IBMPlexSans-400.ttf"),
	("SKI Sans", 600, "normal", "IBMPlexSans-600.ttf"),
	("SKI Mono", 400, "normal", "IBMPlexMono-400.ttf"),
	("SKI Mono", 500, "normal", "IBMPlexMono-500.ttf"),
)
_font_css = None


def font_cetak():
	"""@font-face font cetak (subset Latin, OFL) sebagai data URI — wkhtmltopdf tidak memuat font web lewat URL."""
	global _font_css
	if _font_css is None:
		import base64
		import os

		folder = frappe.get_app_path("konstruksi", "public", "fonts", "cetak")
		bagian = []
		for keluarga, tebal, gaya, berkas in FONT_CETAK:
			with open(os.path.join(folder, berkas), "rb") as f:
				data = base64.b64encode(f.read()).decode()
			bagian.append(
				f'@font-face{{font-family:"{keluarga}";font-weight:{tebal};font-style:{gaya};'
				# local() dulu: pola ":url(" diubah scrub_urls Frappe (disisipi "!important") sehingga src rusak di PDF.
				f'src:local("{keluarga} {tebal}"),url(data:font/truetype;base64,{data}) format("truetype");}}'
			)
		_font_css = "\n".join(bagian)
	return _font_css
