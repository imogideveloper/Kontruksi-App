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
		bagian = doc.payment_schedule[1:]
		nilai = sum(flt(x.payment_amount) for x in bagian)
		retensi = frappe._dict(
			dibayar=uang(total - nilai), nilai=uang(nilai), jatuh_tempo=" & ".join(tanggal_indonesia(x.due_date) for x in bagian)
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


def _company(nama, alamat=None):
	company = frappe.get_cached_doc("Company", nama)
	alamat = alamat or frappe.db.get_value("Dynamic Link", {"link_doctype": "Company", "link_name": nama, "parenttype": "Address"}, "parent")
	return frappe._dict(
		nama=(company.company_name or nama).upper(),
		nama_asli=company.company_name or nama,
		alamat=_alamat(alamat),
		npwp=company.tax_id,
		kota=frappe.db.get_value("Address", alamat, "city") if alamat else "",
	)


def _nama_user(user):
	return frappe.db.get_value("User", user, "full_name") or user if user else ""


def data_pembayaran(doc):
	"""Semua isian print format SiKon Bukti Penerimaan (Payment Entry)."""
	terima = doc.payment_type == "Receive"
	mata_uang = doc.paid_to_account_currency if terima else doc.paid_from_account_currency
	uang = lambda v: fmt_money(flt(v), currency=mata_uang)  # noqa: E731
	angka = lambda v: fmt_money(flt(v), currency=mata_uang).replace("Rp", "").strip()  # noqa: E731
	co = _company(doc.company)

	pihak = frappe._dict(nama=doc.party_name or doc.party or "", alamat=[], npwp="")
	if doc.party_type in ("Customer", "Supplier") and doc.party:
		alamat = frappe.db.get_value(doc.party_type, doc.party, "customer_primary_address" if doc.party_type == "Customer" else "supplier_primary_address")
		pihak.alamat = _alamat(alamat)
		pihak.npwp = frappe.db.get_value(doc.party_type, doc.party, "tax_id")

	akun_kas = doc.paid_to if terima else doc.paid_from
	jenis_akun = frappe.get_cached_value("Account", akun_kas, "account_type") if akun_kas else ""
	metode = doc.mode_of_payment or ("Transfer Bank" if jenis_akun == "Bank" else "Tunai" if jenis_akun == "Cash" else "")
	referensi = doc.reference_no if doc.reference_no and doc.reference_no != doc.name else ""

	rincian, sisa_total, proyek = [], 0, set()
	for r in doc.references:
		uraian, tanggal = "", ""
		if r.reference_doctype in ("Sales Invoice", "Purchase Invoice"):
			inv = frappe.db.get_value(r.reference_doctype, r.reference_name, ["posting_date", "project"], as_dict=True) or frappe._dict()
			tanggal = frappe.format(inv.posting_date, "Date") if inv.posting_date else ""
			uraian = frappe.db.get_value(r.reference_doctype + " Item", {"parent": r.reference_name, "idx": 1}, "item_name") or ""
			if inv.project:
				proyek.add(inv.project)
		sisa = max(flt(r.outstanding_amount) - flt(r.allocated_amount), 0)
		sisa_total += sisa
		rincian.append(frappe._dict(nomor=r.reference_name, uraian=uraian, tanggal=tanggal, total=angka(r.total_amount),
			dibayar=angka(r.allocated_amount), sisa=angka(sisa)))
	if doc.project:
		proyek.add(doc.project)
	nama_proyek = ", ".join(frappe.db.get_value("Project", p, "project_name") or p for p in sorted(proyek))

	diterima = flt(doc.received_amount if terima else doc.paid_amount)
	potongan = sum(flt(x.amount) for x in doc.get("deductions") or [])

	bank = None
	if doc.bank_account:
		bank = frappe.db.get_value("Bank Account", doc.bank_account, ["bank", "bank_account_no"], as_dict=True)
	elif jenis_akun == "Bank":
		bank = frappe.db.get_value("Bank Account", {"account": akun_kas, "is_company_account": 1}, ["bank", "bank_account_no"], as_dict=True)
	if bank:
		bank.atas_nama = co.nama_asli

	return frappe._dict(
		company=co,
		terima=terima,
		judul=["BUKTI PENERIMAAN", "PEMBAYARAN"] if terima else ["BUKTI", "PEMBAYARAN"],
		subjudul="Payment Receipt" if terima else "Payment Voucher",
		label_pihak="DITERIMA DARI" if terima else "DIBAYARKAN KEPADA",
		label_tanggal="Tanggal Terima" if terima else "Tanggal Bayar",
		label_jumlah="JUMLAH DITERIMA" if terima else "JUMLAH DIBAYAR",
		label_total="Total Diterima" if terima else "Total Dibayar",
		label_rekening="DITERIMA PADA REKENING" if terima else "DIBAYAR DARI REKENING",
		pihak=pihak,
		tanggal=frappe.format(doc.posting_date, "Date"),
		metode=metode,
		referensi=referensi,
		proyek=nama_proyek,
		jumlah=uang(diterima),
		terbilang=terbilang(diterima),
		lunas=bool(rincian) and sisa_total <= 0.005,
		sisa=uang(sisa_total),
		rincian=rincian,
		dialokasikan=uang(doc.total_allocated_amount),
		potongan=uang(-potongan) if potongan else "",
		belum_dialokasikan=uang(doc.unallocated_amount),
		total=uang(diterima),
		bank=bank,
		akun_kas=akun_kas if jenis_akun != "Bank" else "",
		catatan=("Dokumen ini merupakan bukti sah penerimaan pembayaran atas invoice yang tercantum di atas."
			if terima else "Dokumen ini merupakan bukti sah pembayaran atas tagihan yang tercantum di atas."),
		penerima=_nama_user(doc.owner),
		tanggal_ttd=tanggal_indonesia(doc.posting_date),
		draft=doc.docstatus == 0,
		batal=doc.docstatus == 2,
	)


def data_rekap_retensi(project):
	"""Isian PDF Rekap Retensi satu proyek (lampiran invoice)."""
	from konstruksi.konstruksi.penagihan import data_kontrak, get_penagihan

	d = get_penagihan(project)
	k = data_kontrak(project)
	kontrak = frappe.get_doc("Kontrak Project", k.kontrak)
	uang = lambda v: fmt_money(flt(v), currency="IDR")  # noqa: E731
	angka = lambda v: fmt_money(flt(v), currency="IDR").replace("Rp", "").strip()  # noqa: E731
	invoice = {x.name: x for x in frappe.get_all("Sales Invoice", filters={"name": ("in", [r["invoice"] for r in d["retensi"]] or [""])},
		fields=["name", "posting_date", "nilai_bruto"])}
	baris = []
	for r in d["retensi"]:
		inv = invoice.get(r["invoice"]) or frappe._dict()
		baris.append(frappe._dict(
			termin=f"T{r['urutan']}", milestone=r["nama_milestone"], invoice=r["invoice"],
			tanggal=frappe.format(inv.posting_date, "Date") if inv.posting_date else "",
			nilai_termin=angka(inv.nilai_bruto), retensi=angka(r["retensi"]),
			jatuh_tempo=frappe.format(r["jatuh_tempo"], "Date") if r["jatuh_tempo"] else "",
			diterima=angka(r["diterima"]), sisa=angka(r["sisa"]), status=r["status"],
		))
	rk = d["ringkasan"]
	return frappe._dict(
		company=_company(k.company),
		proyek=f"{project} — {d['project']['project_name']}",
		customer=frappe.db.get_value("Customer", k.customer, "customer_name") or k.customer,
		nomor_kontrak=kontrak.nomor_kontrak or kontrak.name,
		retensi_persen=f"{flt(k.retensi_persen):g}%".replace(".", ","),
		skema=k.skema_retensi,
		akhir_pemeliharaan=tanggal_indonesia(k.akhir_pemeliharaan) if k.akhir_pemeliharaan else "",
		baris=baris,
		total_nilai_termin=angka(sum(flt((invoice.get(r["invoice"]) or {}).get("nilai_bruto")) for r in d["retensi"])),
		total=uang(rk["retensi_total"]), total_angka=angka(rk["retensi_total"]),
		diterima=uang(rk["retensi_diterima"]), diterima_angka=angka(rk["retensi_diterima"]),
		sisa=uang(rk["retensi_sisa"]), sisa_angka=angka(rk["retensi_sisa"]),
		jatuh_tempo=tanggal_indonesia(rk["retensi_jatuh_tempo"]) if rk.get("retensi_jatuh_tempo") else "—",
		tanggal_cetak=tanggal_indonesia(frappe.utils.today()),
		pencetak=_nama_user(frappe.session.user),
		font=font_cetak(),
	)


@frappe.whitelist()
def cetak_rekap_retensi(project):
	"""Unduh PDF Rekap Retensi proyek (A4 landscape) — lampiran invoice termin / pencairan retensi."""
	from frappe.utils.pdf import get_pdf

	frappe.get_doc("Project", project).check_permission("read")
	html = frappe.render_template("konstruksi/templates/cetak/rekap_retensi.html", {"d": data_rekap_retensi(project)})
	frappe.local.response.filename = f"Rekap Retensi {project}.pdf"
	frappe.local.response.filecontent = get_pdf(html, {"orientation": "Landscape", "page-size": "A4",
		"margin-top": "0mm", "margin-bottom": "0mm", "margin-left": "0mm", "margin-right": "0mm"})
	frappe.local.response.type = "pdf"
