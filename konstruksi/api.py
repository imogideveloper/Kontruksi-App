from collections import Counter, defaultdict

import frappe
from frappe import _
from frappe.utils import cstr, flt, getdate

STANDARD_GROUP_FIELDS = ("owner", "creation", "modified")
GRANULARITIES = (None, "", "year", "month", "day")
# Pemisah kunci antar level; harus sama dengan PATH_SEP di list_group_by.bundle.js.
PATH_SEP = "\x1f"
MAX_LEVEL = 3
SUM_FIELDTYPES = ("Currency", "Float", "Int")


def group_key(value, granularity=None):
	"""Kunci kelompok satu level; harus sama dengan group_key() di list_group_by.bundle.js."""
	if value is None or value == "":
		return ""
	if granularity:
		date = cstr(getdate(value))
		return {"year": date[:4], "month": date[:7], "day": date[:10]}[granularity]
	return cstr(value)


@frappe.whitelist()
def get_group_counts(doctype, groups, filters=None, sum_field=None):
	"""Jumlah dokumen (dan total sum_field) per jalur kelompok untuk seluruh data sesuai filter & hak akses.

	groups: [[fieldname, granularity], ...] maksimal 3 level; field tanggal yang sama boleh beda granularity.
	Hasil: {"counts": {"<kunci1>": n, "<kunci1>\\x1f<kunci2>": n, ...}, "sums": {...}}
	"""
	frappe.has_permission(doctype, "read", throw=True)
	groups = frappe.parse_json(groups) or []
	if not 0 < len(groups) <= MAX_LEVEL:
		frappe.throw(_("Grouping harus 1 sampai {0} level.").format(MAX_LEVEL))

	meta = frappe.get_meta(doctype)
	for fieldname, granularity in groups:
		if fieldname not in STANDARD_GROUP_FIELDS and not meta.get_field(fieldname):
			frappe.throw(_("Field {0} tidak ada di {1}").format(fieldname, doctype))
		if granularity not in GRANULARITIES:
			frappe.throw(_("Pengelompokan tanggal tidak dikenal: {0}").format(granularity))
	if sum_field:
		df = meta.get_field(sum_field)
		if not df or df.fieldtype not in SUM_FIELDTYPES:
			frappe.throw(_("Field {0} tidak bisa dijumlahkan").format(sum_field))

	fields = {fieldname for fieldname, _ in groups}
	if sum_field:
		fields.add(sum_field)
	rows = frappe.get_list(
		doctype,
		filters=frappe.parse_json(filters) or [],
		fields=list(fields),
		limit_page_length=0,
		order_by=None,
	)

	counts = Counter()
	sums = defaultdict(float)
	for row in rows:
		path = []
		for fieldname, granularity in groups:
			path.append(group_key(row.get(fieldname), granularity or None))
			key = PATH_SEP.join(path)
			counts[key] += 1
			if sum_field:
				sums[key] += flt(row.get(sum_field))
	return {"counts": counts, "sums": sums}


def beri_tahu_form(doctype, name):
	"""Kirim sinyal doc_update supaya form dokumen ini yang sedang terbuka di browser reload otomatis.

	Dipakai setelah dokumen diubah lewat sinkron (db_update / set_value) tanpa save. Frappe hanya me-reload form
	bila `modified` di sinyal berbeda, jadi `modified` dokumen harus sudah diperbarui sebelum memanggil ini.
	"""
	frappe.get_doc(doctype, name).notify_update()
