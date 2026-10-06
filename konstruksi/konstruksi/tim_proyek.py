# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

"""Tim Proyek: penugasan personel (Employee) ke Project, kebutuhan personel dari template, status SKK.

Personel yang punya akun login otomatis masuk tabel Users di Project, supaya bisa mengakses proyek dan terhitung
di tim bawaan ERPNext.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, today

from konstruksi.api import beri_tahu_form
from konstruksi.install import ACTIVITY_PER_JABATAN


def get_skk_berlaku_sampai(employee):
	"""Tanggal berlaku SKK terlama milik personel (None bila tidak ada SKK atau ada SKK tanpa batas waktu)."""
	skk = frappe.get_all("SKK Personel", filters={"parent": employee, "parenttype": "Employee"}, pluck="berlaku_sampai")
	if not skk or any(not b for b in skk):
		return None
	return max(getdate(b) for b in skk)


def get_status_skk(employee, jabatan, tanggal=None):
	"""Status SKK personel untuk jabatan yang mewajibkannya, dicek sampai `tanggal` (akhir tugas):
	Tidak Wajib / Berlaku / Habis Saat Bertugas (masih berlaku hari ini, habis sebelum tugas selesai) /
	Kedaluwarsa (sudah habis hari ini) / Belum Ada."""
	if not frappe.db.get_value("Designation", jabatan, "wajib_skk"):
		return "Tidak Wajib"
	if not frappe.db.exists("SKK Personel", {"parent": employee, "parenttype": "Employee"}):
		return "Belum Ada"
	sampai = get_skk_berlaku_sampai(employee)
	if not sampai or sampai >= getdate(tanggal or today()):
		return "Berlaku"
	return "Habis Saat Bertugas" if sampai >= getdate(today()) else "Kedaluwarsa"


def sinkron_users_project(project):
	"""Akun login personel yang ditugaskan masuk tabel Users di Project (yang tidak lagi ditugaskan dikeluarkan)."""
	if not frappe.db.get_value("Project", project, "kontrak_project"):
		return
	ditugaskan = set(
		frappe.get_all("Penugasan Personel", filters={"project": project, "user_id": ("is", "set")}, pluck="user_id")
	)
	doc = frappe.get_doc("Project", project)
	sekarang = {row.user for row in doc.users}
	if sekarang == ditugaskan:
		return
	doc.users = [row for row in doc.users if row.user in ditugaskan]
	for user in sorted(ditugaskan - sekarang):
		# welcome_email_sent = 1: ERPNext tidak mengirim email undangan proyek otomatis.
		doc.append("users", {"user": user, "welcome_email_sent": 1})
	doc.flags.ignore_permissions = True
	doc.save()
	beri_tahu_form("Project", project)


def get_kebutuhan(project):
	"""Gabungan semua Template Kebutuhan Personel yang cocok (jenis project & nilai kontrak): {jabatan: {wajib, jumlah}}."""
	jenis, nilai = frappe.db.get_value("Project", project, ["jenis_project", "nilai_kontrak"])
	kebutuhan = {}
	for template in frappe.get_all(
		"Template Kebutuhan Personel",
		filters={"disabled": 0, "nilai_minimal": ("<=", flt(nilai))},
		fields=["name", "jenis_project"],
		order_by="nilai_minimal asc",
	):
		if template.jenis_project and template.jenis_project != jenis:
			continue
		for row in frappe.get_all(
			"Kebutuhan Jabatan",
			filters={"parent": template.name, "parenttype": "Template Kebutuhan Personel"},
			fields=["jabatan", "wajib", "jumlah"],
			order_by="idx asc",
		):
			k = kebutuhan.setdefault(row.jabatan, {"wajib": 0, "jumlah": 0})
			k["wajib"] = k["wajib"] or row.wajib
			k["jumlah"] = max(k["jumlah"], row.jumlah or 1)
	return kebutuhan


@frappe.whitelist()
def get_tim(project):
	"""Data tab Tim Proyek: ringkasan, kebutuhan (perlu diisi / sudah terisi), dan daftar penugasan."""
	frappe.has_permission("Project", "read", project, throw=True)
	penugasan = frappe.get_all(
		"Penugasan Personel",
		filters={"project": project},
		fields=[
			"name", "employee", "nama_personel", "jabatan", "tanggal_mulai", "tanggal_selesai",
			"alokasi", "user_id", "telepon", "email", "status_skk",
		],
		order_by="creation asc",
	)
	biaya = biaya_per_personel(project, list({p.employee for p in penugasan}))
	sudah = set()
	for p in penugasan:
		# Dihitung saat ditampilkan supaya mengikuti perubahan role di User.
		p.akses = get_akses(p.user_id)
		# Biaya per personel ditampilkan sekali (di baris pertama orang itu) bila ia punya lebih dari satu jabatan.
		p.biaya = biaya[p.employee] if p.employee not in sudah else None
		sudah.add(p.employee)
		# Activity Type bawaan saat mencatat jam dari tab Tim Proyek.
		p.activity_type = ACTIVITY_PER_JABATAN.get(p.jabatan)
	per_jabatan = {}
	for p in penugasan:
		per_jabatan.setdefault(p.jabatan, []).append(p)

	kebutuhan = get_kebutuhan(project)
	jabatan_semua = list(kebutuhan) + [j for j in per_jabatan if j not in kebutuhan]
	tugas = dict(frappe.get_all("Designation", filters={"name": ("in", jabatan_semua or [""])}, fields=["name", "description"], as_list=True))

	perlu, terisi = [], []
	for jabatan in jabatan_semua:
		k = kebutuhan.get(jabatan, {"wajib": 0, "jumlah": 0})
		orang = per_jabatan.get(jabatan, [])
		info = {"jabatan": jabatan, "wajib": k["wajib"], "jumlah": k["jumlah"], "tugas": tugas.get(jabatan) or ""}
		if orang:
			terisi.append({**info, "personel": [{"nama": o.nama_personel, "status_skk": o.status_skk} for o in orang]})
		if len(orang) < k["jumlah"]:
			perlu.append({**info, "kurang": k["jumlah"] - len(orang)})

	wajib = [j for j, k in kebutuhan.items() if k["wajib"]]
	return {
		"penugasan": penugasan,
		"perlu": sorted(perlu, key=lambda x: not x["wajib"]),
		"terisi": terisi,
		"jumlah_personel": len({p.employee for p in penugasan}),
		"fte": round(sum(flt(p.alokasi) for p in penugasan) / 100, 2),
		"wajib_total": len(wajib),
		"wajib_terisi": sum(1 for j in wajib if len(per_jabatan.get(j, [])) >= kebutuhan[j]["jumlah"]),
	}


@frappe.whitelist()
def tugaskan(project, employee, jabatan, tanggal_mulai, alokasi=100, tanggal_selesai=None, catatan=None):
	"""Buat Penugasan Personel dari dialog di tab Tim Proyek."""
	doc = frappe.get_doc(
		{
			"doctype": "Penugasan Personel",
			"project": project,
			"employee": employee,
			"jabatan": jabatan,
			"tanggal_mulai": tanggal_mulai,
			"tanggal_selesai": tanggal_selesai or None,
			"alokasi": flt(alokasi) or 100,
			"catatan": catatan,
		}
	)
	doc.insert()
	return doc.name


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def cari_personel(doctype, txt, searchfield, start, page_len, filters):
	"""Pilihan Personel di penugasan: ID, nama, jabatan, department (personel aktif). Bisa dicari lewat nama atau jabatan.
	filters.designation (jabatan di proyek yang dipilih) membatasi ke personel berjabatan itu.

	frappe.get_all (bukan get_list) karena User Permission Employee dari HRMS tidak berlaku saat menugaskan.
	"""
	frappe.has_permission("Penugasan Personel", "create", throw=True)
	saring = {"status": "Active"}
	if (filters or {}).get("designation"):
		saring["designation"] = filters["designation"]
	return frappe.get_all(
		"Employee",
		filters=saring,
		or_filters={
			"name": ("like", f"%{txt}%"),
			"employee_name": ("like", f"%{txt}%"),
			"designation": ("like", f"%{txt}%"),
		},
		fields=["name", "employee_name", "designation", "department"],
		order_by="designation asc, employee_name asc",
		limit_start=start,
		limit_page_length=page_len,
		as_list=True,
	)


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def cari_personel_nama(doctype, txt, searchfield, start, page_len, filters):
	"""Seperti cari_personel, untuk dialog Tugaskan Personel yang menampilkan nama sebagai judul pilihan: kolom kedua =
	"nama<TAB>jabatan · department". Nama bisa mengandung koma (gelar "S.T."), jadi tidak bisa dipisah dari deskripsi
	berkoma bawaan Frappe."""
	return [
		(name, f"{nama}\t{' · '.join(filter(None, (jabatan, dept)))}")
		for name, nama, jabatan, dept in cari_personel(doctype, txt, searchfield, start, page_len, filters)
	]


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def cari_approver(doctype, txt, searchfield, start, page_len, filters):
	"""Pilihan Expense Approver dengan jabatan (dari Data Personel yang memakai user itu).

	Di Expense Claim (filters berisi employee): daftar tetap dari HRMS get_approvers, hanya ditambah jabatan.
	Di Data Personel: semua user aktif, bisa dicari lewat email, nama, atau jabatan.
	"""
	if filters and filters.get("employee"):
		from hrms.hr.doctype.department_approver.department_approver import get_approvers

		users = sorted(row[0] for row in get_approvers(doctype, txt, searchfield, start, page_len, filters))
	else:
		users = frappe.get_all(
			"User",
			filters={"enabled": 1, "user_type": "System User", "name": ("not in", ("Administrator", "Guest"))},
			pluck="name",
			order_by="full_name asc",
		)
	users = list(dict.fromkeys(users))
	if not users:
		return []
	jabatan = dict(
		frappe.get_all("Employee", filters={"user_id": ("in", users)}, fields=["user_id", "designation"], as_list=True)
	)
	nama = dict(frappe.get_all("User", filters={"name": ("in", users)}, fields=["name", "full_name"], as_list=True))
	hasil = [(u, nama.get(u) or "", jabatan.get(u) or "") for u in users]
	if not (filters and filters.get("employee")) and txt:
		hasil = [r for r in hasil if any(txt.lower() in (v or "").lower() for v in r)]
		return hasil[start : start + page_len]
	return hasil


@frappe.whitelist()
def approver_bawaan(employee, doctype="Expense Claim"):
	"""Expense Approver bawaan personel: dari Data Personel, bila kosong dari approver pertama di Department-nya."""
	from hrms.hr.doctype.department_approver.department_approver import get_approvers

	pribadi = frappe.db.get_value("Employee", employee, "expense_approver")
	if pribadi and frappe.db.get_value("User", pribadi, "enabled"):
		return pribadi
	try:
		# get_approvers mengembalikan set (urutan tidak tetap); diurutkan supaya hasilnya konsisten.
		approvers = sorted(row[0] for row in get_approvers("User", "", "name", 0, 20, {"employee": employee, "doctype": doctype}))
	except frappe.ValidationError:
		frappe.clear_messages()
		return None
	return approvers[0] if approvers else None


BELUM_PUNYA_AKUN = "Belum punya akun"


def get_akses(user):
	"""Teks Akses Sistem: Role Profile akun login personel, atau keterangan bila belum / tidak bisa login."""
	if not user:
		return BELUM_PUNYA_AKUN
	if not frappe.db.get_value("User", user, "enabled"):
		return _("Akun nonaktif")
	profiles = frappe.get_all("User Role Profile", filters={"parent": user, "parenttype": "User"}, pluck="role_profile")
	return ", ".join(profiles) if profiles else _("Role diatur manual")


@frappe.whitelist()
def buat_akun_login(employee, email, role_profile=None, kirim_email=0):
	"""Data Personel: buat User untuk personel (Role Profile sesuai jabatan), tautkan ke Employee & penugasannya."""
	frappe.has_permission("User", "create", throw=True)
	emp = frappe.get_doc("Employee", employee)
	if emp.user_id:
		frappe.throw(_("{0} sudah punya akun login ({1}).").format(emp.employee_name, emp.user_id))
	email = (email or "").strip().lower()
	if frappe.db.exists("User", email):
		frappe.throw(_("Email {0} sudah dipakai akun lain.").format(email))

	user = frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": emp.first_name,
			"last_name": emp.last_name,
			"user_type": "System User",
			"send_welcome_email": frappe.utils.cint(kirim_email),
			"role_profiles": [{"role_profile": role_profile}] if role_profile else [],
		}
	)
	user.insert()

	# set_value, bukan save: HRMS tidak membuat User Permission otomatis yang membatasi user hanya melihat dirinya.
	frappe.db.set_value("Employee", employee, "user_id", user.name)
	# ERPNext membuang role Employee dari user yang belum tertaut ke Employee saat user dibuat; tambahkan setelah tertaut.
	if role_profile and "Employee" in [r.role for r in frappe.get_doc("Role Profile", role_profile).roles]:
		frappe.get_doc("User", user.name).add_roles("Employee")
	for p in frappe.get_all("Penugasan Personel", filters={"employee": employee}, fields=["name", "project"]):
		frappe.db.set_value("Penugasan Personel", p.name, {"user_id": user.name, "akses_sistem": get_akses(user.name)})
		sinkron_users_project(p.project)
	return user.name


# ---------------------------------------------------------------------------
# Timesheet & Expense Claim: biaya personel hanya untuk proyek tempat ia ditugaskan.


def ditugaskan(project, employee, tanggal=None):
	"""Personel punya penugasan di proyek ini (yang mencakup `tanggal` bila diisi)."""
	for p in frappe.get_all(
		"Penugasan Personel", filters={"project": project, "employee": employee}, fields=["tanggal_mulai", "tanggal_selesai"]
	):
		if not tanggal:
			return True
		t = getdate(tanggal)
		if getdate(p.tanggal_mulai) <= t and (not p.tanggal_selesai or t <= getdate(p.tanggal_selesai)):
			return True
	return False


def jabatan_penugasan(project, employee, tanggal=None):
	"""Jabatan personel di proyek (penugasan yang mencakup `tanggal`, atau yang terbaru)."""
	rows = frappe.get_all(
		"Penugasan Personel",
		filters={"project": project, "employee": employee},
		fields=["jabatan", "tanggal_mulai", "tanggal_selesai"],
		order_by="tanggal_mulai desc",
	)
	if tanggal:
		t = getdate(tanggal)
		for p in rows:
			if getdate(p.tanggal_mulai) <= t and (not p.tanggal_selesai or t <= getdate(p.tanggal_selesai)):
				return p.jabatan
	return rows[0].jabatan if rows else None


def isi_tarif_timesheet(doc):
	"""Baris Timesheet ke proyek konstruksi yang tarif biayanya 0 (Activity Type kosong / bawaan ERPNext tanpa tarif,
	mis. Communication): Activity Type diganti sesuai jabatan personel di proyek supaya biaya personel tercatat."""
	from erpnext.projects.doctype.timesheet.timesheet import get_activity_cost

	diganti, tanpa_tarif = [], []
	for row in doc.time_logs:
		if not row.project or flt(row.costing_rate) or not frappe.db.get_value("Project", row.project, "kontrak_project"):
			continue
		activity = ACTIVITY_PER_JABATAN.get(jabatan_penugasan(row.project, doc.employee, row.from_time))
		if activity and activity != row.activity_type and flt((get_activity_cost(doc.employee, activity) or {}).get("costing_rate")):
			diganti.append(_("baris {0}: {1} → {2}").format(row.idx, row.activity_type or "—", activity))
			row.activity_type = activity
			row.update_cost(doc.employee)
		else:
			tanpa_tarif.append(_("baris {0} ({1})").format(row.idx, row.activity_type or "—"))
	if diganti:
		doc.calculate_total_amounts()
		frappe.msgprint(
			_("Activity Type tanpa tarif biaya diganti sesuai jabatan personel di proyek: {0}.").format(", ".join(diganti)),
			title=_("Tarif biaya personel"),
			indicator="blue",
		)
	if tanpa_tarif:
		frappe.msgprint(
			_("Biaya personel Rp 0 pada {0}: Activity Type belum punya tarif biaya. Pilih Activity Type proyek (mis. Manajemen Proyek, Pengawasan Lapangan) atau isi Costing Rate.").format(
				", ".join(tanpa_tarif)
			),
			title=_("Tarif biaya personel"),
			indicator="orange",
		)


def cek_penugasan_biaya(doc, method=None):
	"""Timesheet / Expense Claim validate: peringatan bila personel mencatat biaya ke proyek konstruksi tempat ia
	tidak ditugaskan pada tanggal itu (biaya tetap tersimpan; hanya diperingatkan). Timesheet: tarif biaya diisi
	dari jabatan bila Activity Type-nya tanpa tarif."""
	if not doc.employee:
		return
	if doc.doctype == "Timesheet":
		isi_tarif_timesheet(doc)
	if doc.doctype == "Timesheet":
		pasangan = [(row.project, row.from_time) for row in doc.time_logs if row.project]
	else:
		pasangan = [(doc.project, doc.posting_date)] if doc.project else []
		pasangan += [(row.project, row.expense_date) for row in doc.expenses if row.project]

	salah = []
	for project, tanggal in pasangan:
		if not frappe.db.get_value("Project", project, "kontrak_project"):
			continue
		if not ditugaskan(project, doc.employee, tanggal):
			salah.append(_("{0} ({1})").format(project, frappe.format(getdate(tanggal), "Date")))
	if salah:
		frappe.msgprint(
			_("{0} tidak ditugaskan di proyek berikut pada tanggal tersebut: {1}. Periksa pilihan proyek, atau tambahkan penugasannya di Tim Proyek.").format(
				doc.employee_name or doc.employee, ", ".join(dict.fromkeys(salah))
			),
			title=_("Personel tidak ditugaskan di proyek"),
			indicator="orange",
		)


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def cari_proyek_personel(doctype, txt, searchfield, start, page_len, filters):
	"""Pilihan Project di Timesheet / Expense Claim: proyek konstruksi tempat personel ditugaskan, plus proyek
	umum (tanpa kontrak). Tanpa personel: semua proyek aktif."""
	filters = filters or {}
	employee = filters.get("employee")
	kondisi = {"status": "Open"}
	if filters.get("customer"):
		kondisi["customer"] = filters["customer"]
	rows = frappe.get_list(
		"Project",
		filters=kondisi,
		or_filters={"name": ("like", f"%{txt}%"), "project_name": ("like", f"%{txt}%")},
		fields=["name", "project_name", "kontrak_project"],
		order_by="modified desc",
		limit_page_length=0,
	)
	if employee:
		milik = set(frappe.get_all("Penugasan Personel", filters={"employee": employee}, pluck="project"))
		rows = [r for r in rows if not r.kontrak_project or r.name in milik]
	return [(r.name, r.project_name) for r in rows[cint(start) : cint(start) + cint(page_len)]]


def biaya_per_personel(project, employees):
	"""Jam & biaya Timesheet serta klaim biaya (Expense Claim) yang sudah submit, per personel di proyek ini."""
	hasil = {e: {"jam": 0, "biaya_timesheet": 0, "klaim": 0} for e in employees}
	if not employees:
		return hasil
	for row in frappe.db.sql(
		"""select t.employee, sum(d.hours) as jam, sum(d.costing_amount) as biaya
		from `tabTimesheet Detail` d join `tabTimesheet` t on t.name = d.parent
		where t.docstatus = 1 and d.project = %s and t.employee in %s group by t.employee""",
		(project, tuple(employees)),
		as_dict=True,
	):
		hasil[row.employee].update({"jam": flt(row.jam), "biaya_timesheet": flt(row.biaya)})
	for row in frappe.db.sql(
		"""select employee, sum(total_sanctioned_amount) as klaim from `tabExpense Claim`
		where docstatus = 1 and project = %s and employee in %s group by employee""",
		(project, tuple(employees)),
		as_dict=True,
	):
		hasil[row.employee]["klaim"] = flt(row.klaim)
	return hasil
