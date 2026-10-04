# Copyright (c) 2026, Imogi Indonesia and contributors
# For license information, please see license.txt

"""Work Breakdown Structure (WBS) proyek.

- WBS dibuat otomatis dari RAB Penawaran tender proyek saat Project Master dibuat (kode, uraian, spesifikasi, satuan,
  volume, harga satuan). Harga RAB = harga kontrak (sebelum PPN).
- Item induk (punya sub-item) = jumlah sub-itemnya; bobot = jumlah harga ÷ total WBS (sebelum PPN).
- Progres item = rata-rata progres Task yang terhubung (field wbs_item di Task); induk = rata-rata tertimbang nilai.
"""

import frappe
from frappe import _
from frappe.utils import flt

FIELD_ITEM = [
	"name", "kode", "uraian", "spesifikasi", "satuan", "volume", "harga_satuan", "jumlah_harga", "bobot", "progres",
	"is_group", "parent_wbs", "level", "sumber", "keterangan",
]


def kunci_kode(kode):
	"""Urutan alami kode WBS: 2 < 10, 3.2 < 3.10."""
	return [int(x) if x.isdigit() else x for x in str(kode or "").split(".")]


def induk_kode(kode):
	return ".".join(str(kode).split(".")[:-1])


def rab_proyek(project):
	"""RAB Penawaran terbaru dari tender proyek (lewat Kontrak Project)."""
	tender = frappe.db.get_value("Project", project, "tender")
	if not tender:
		kontrak = frappe.db.get_value("Project", project, "kontrak_project")
		tender = kontrak and frappe.db.get_value("Kontrak Project", kontrak, "tender")
	return tender and frappe.db.get_value("RAB Penawaran", {"tender": tender}, "name", order_by="creation desc")


def buat_dari_rab(project):
	"""Salin item RAB Penawaran menjadi WBS (hanya bila WBS proyek masih kosong). Mengembalikan jumlah item."""
	if frappe.db.exists("WBS Item", {"project": project}):
		return 0
	rab = rab_proyek(project)
	if not rab:
		return 0
	items = frappe.get_all(
		"RAB Penawaran Item",
		filters={"parent": rab, "parenttype": "RAB Penawaran"},
		fields=["name", "idx", "kode_wbs", "uraian_pekerjaan", "spesifikasi", "satuan", "volume", "harga_satuan"],
		order_by="idx asc",
	)
	baris = []
	for i in items:
		kode = (i.kode_wbs or "").strip().strip(".") or str(i.idx)
		baris.append(frappe._dict({**i, "kode": kode}))
	kode_semua = {b["kode"] for b in baris}
	punya_anak = {induk_kode(k) for k in kode_semua if "." in k}

	nama_per_kode = {}
	for b in sorted(baris, key=lambda x: kunci_kode(x["kode"])):
		kode = b["kode"]
		induk = induk_kode(kode)
		# Kode induk yang tidak ada di RAB: lompati tingkat yang hilang (taruh di induk terdekat yang ada).
		while induk and induk not in nama_per_kode:
			induk = induk_kode(induk)
		is_group = 1 if kode in punya_anak else 0
		doc = frappe.get_doc(
			{
				"doctype": "WBS Item",
				"project": project,
				"kode": kode,
				"uraian": b.uraian_pekerjaan or kode,
				"spesifikasi": b.spesifikasi,
				"satuan": None if is_group else b.satuan,
				"volume": 0 if is_group else flt(b.volume),
				"harga_satuan": 0 if is_group else flt(b.harga_satuan),
				"is_group": is_group,
				"sumber": "RAB Penawaran",
				"rab_item": b.name,
			}
		)
		doc.flags.tanpa_hitung_ulang = True
		doc.flags.ignore_permissions = True
		# Induk yang hilang di RAB: validate WBS Item mencari induk lewat kode; pakai induk terdekat.
		if induk != induk_kode(kode):
			doc.flags.induk_terdekat = nama_per_kode.get(induk, "")
		doc.insert()
		nama_per_kode[kode] = doc.name
	hitung_ulang(project)
	return len(baris)


def progres_task(project):
	"""Rata-rata progres Task (bukan Cancelled) per item WBS."""
	if not frappe.get_meta("Task").has_field("wbs_item"):
		return {}
	rows = frappe.db.sql(
		"""select wbs_item, avg(progress) as progres, count(*) as jumlah from `tabTask`
		where project = %s and ifnull(wbs_item, '') != '' and status != 'Cancelled' group by wbs_item""",
		project,
		as_dict=True,
	)
	return {r.wbs_item: r for r in rows}


def hitung_ulang(project):
	"""Status induk, jumlah harga induk, bobot, dan progres semua item WBS proyek."""
	items = frappe.get_all("WBS Item", filters={"project": project}, fields=FIELD_ITEM)
	if not items:
		return
	anak = {}
	for it in items:
		anak.setdefault(it.parent_wbs, []).append(it)
	task = progres_task(project)

	def hitung(it):
		sub = anak.get(it.name, [])
		if sub:
			for s in sub:
				hitung(s)
			it.baru_group = 1
			it.baru_jumlah = sum(s.baru_jumlah for s in sub)
			nilai = sum(s.baru_jumlah for s in sub)
			it.baru_progres = (
				sum(s.baru_jumlah * s.baru_progres for s in sub) / nilai if nilai else sum(s.baru_progres for s in sub) / len(sub)
			)
		else:
			it.baru_group = 0
			it.baru_jumlah = flt(it.volume) * flt(it.harga_satuan)
			it.baru_progres = flt(task[it.name].progres) if it.name in task else 0

	akar = anak.get(None, [])
	for it in akar:
		hitung(it)
	total = sum(it.baru_jumlah for it in akar)
	for it in items:
		baru = {
			"is_group": it.baru_group,
			"jumlah_harga": flt(it.baru_jumlah, 2),
			"bobot": flt(it.baru_jumlah / total * 100, 4) if total else 0,
			"progres": flt(it.baru_progres, 2),
		}
		if any(flt(it.get(k), 4) != flt(v, 4) for k, v in baru.items()):
			frappe.db.set_value("WBS Item", it.name, baru, update_modified=False)


def ringkasan_wbs(project, items):
	akar = [it for it in items if not it.parent_wbs]
	total = sum(flt(it.jumlah_harga) for it in akar)
	progres = sum(flt(it.jumlah_harga) * flt(it.progres) for it in akar) / total if total else 0
	return total, progres


@frappe.whitelist()
def get_wbs(project):
	doc = frappe.get_doc("Project", project)
	doc.check_permission("read")
	items = frappe.get_all("WBS Item", filters={"project": project}, fields=FIELD_ITEM)
	items.sort(key=lambda x: kunci_kode(x.kode))
	jumlah_task = {}
	if frappe.get_meta("Task").has_field("wbs_item"):
		for r in frappe.db.sql(
			"""select wbs_item, count(*) as n from `tabTask` where project = %s and ifnull(wbs_item, '') != ''
			and status != 'Cancelled' group by wbs_item""",
			project,
			as_dict=True,
		):
			jumlah_task[r.wbs_item] = r.n
	for it in items:
		it.jumlah_task = jumlah_task.get(it.name, 0)
	total, progres = ringkasan_wbs(project, items)
	tarif_ppn = flt(doc.get("tarif_ppn"))
	return {
		"project": {
			"name": doc.name,
			"project_name": doc.project_name,
			"nilai_kontrak": flt(doc.get("nilai_kontrak")),
			"nilai_sebelum_ppn": flt(doc.get("nilai_sebelum_ppn")),
			"tarif_ppn": tarif_ppn,
		},
		"rab": rab_proyek(project),
		"items": items,
		"total": total,
		"ppn": flt(total * tarif_ppn / 100, 0),
		"progres": flt(progres, 2),
		"aktivitas": sum(jumlah_task.values()),
		"bisa_ubah": bool(frappe.has_permission("WBS Item", "write")),
		"bisa_buat": bool(frappe.has_permission("WBS Item", "create")),
	}


@frappe.whitelist()
def buat_wbs(project):
	frappe.has_permission("WBS Item", "create", throw=True)
	if frappe.db.exists("WBS Item", {"project": project}):
		frappe.throw(_("WBS proyek ini sudah ada."))
	if not rab_proyek(project):
		frappe.throw(_("RAB Penawaran untuk tender proyek ini tidak ditemukan."))
	return buat_dari_rab(project)


def kode_berikutnya(project, induk=None):
	if induk:
		kode_induk = frappe.db.get_value("WBS Item", induk, "kode")
		saudara = frappe.get_all("WBS Item", filters={"project": project, "parent_wbs": induk}, pluck="kode")
		n = max([kunci_kode(k)[-1] for k in saudara if isinstance(kunci_kode(k)[-1], int)] or [0]) + 1
		return f"{kode_induk}.{n}"
	saudara = frappe.get_all("WBS Item", filters={"project": project, "parent_wbs": ("is", "not set")}, pluck="kode")
	n = max([kunci_kode(k)[0] for k in saudara if isinstance(kunci_kode(k)[0], int)] or [0]) + 1
	return str(n)


@frappe.whitelist()
def simpan_item(project, uraian, name=None, induk=None, spesifikasi=None, satuan=None, volume=0, harga_satuan=0,
		keterangan=None):
	"""Tambah (name kosong; di bawah induk bila diisi) atau ubah item WBS dari halaman WBS."""
	if name:
		doc = frappe.get_doc("WBS Item", name)
		if doc.project != project:
			frappe.throw(_("Item tidak ada di proyek ini."))
		doc.check_permission("write")
	else:
		frappe.has_permission("WBS Item", "create", throw=True)
		doc = frappe.get_doc({"doctype": "WBS Item", "project": project, "kode": kode_berikutnya(project, induk), "sumber": "Manual"})
	doc.update(
		{"uraian": uraian, "spesifikasi": spesifikasi, "satuan": satuan, "volume": flt(volume), "harga_satuan": flt(harga_satuan)}
	)
	if keterangan is not None:
		doc.keterangan = keterangan
	doc.save()
	if induk and not frappe.db.get_value("WBS Item", induk, "is_group"):
		# Induk yang tadinya item biasa menjadi induk: volume & harganya tidak dipakai lagi.
		frappe.db.set_value("WBS Item", induk, {"is_group": 1, "satuan": None, "volume": 0, "harga_satuan": 0})
		hitung_ulang(project)
	return doc.name


@frappe.whitelist()
def get_saran_uraian():
	"""Saran Uraian Pekerjaan: uraian yang pernah dipakai di WBS dan RAB Penawaran."""
	saran = set(frappe.get_all("WBS Item", pluck="uraian", distinct=True, limit=500))
	saran.update(
		frappe.get_all("RAB Penawaran Item", filters={"parenttype": "RAB Penawaran"}, pluck="uraian_pekerjaan", distinct=True, limit=500)
	)
	return sorted(s for s in saran if s)


@frappe.whitelist()
def hapus_item(project, name):
	doc = frappe.get_doc("WBS Item", name)
	if doc.project != project:
		frappe.throw(_("Item tidak ada di proyek ini."))
	doc.check_permission("delete")
	induk = doc.parent_wbs
	doc.delete()
	# Induk yang tidak punya sub-item lagi kembali menjadi item biasa.
	if induk and not frappe.db.exists("WBS Item", {"parent_wbs": induk}):
		frappe.db.set_value("WBS Item", induk, "is_group", 0)
		hitung_ulang(project)


def hitung_ulang_dari_task(doc, method=None):
	"""Task on_update / on_trash: progres WBS proyek ikut diperbarui."""
	if doc.get("project") and (doc.get("wbs_item") or (doc.get_doc_before_save() and doc.get_doc_before_save().get("wbs_item"))):
		hitung_ulang(doc.project)


def buat_wbs_semua():
	"""Patch: WBS untuk Project Master yang sudah ada."""
	for project in frappe.get_all("Project", filters={"kontrak_project": ("is", "set")}, pluck="name"):
		buat_dari_rab(project)
