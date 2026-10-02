from collections import Counter

import frappe
from frappe import _
from frappe.utils import cstr, getdate

STANDARD_GROUP_FIELDS = ("owner", "creation", "modified")
GRANULARITIES = (None, "", "year", "month", "day")
# Pemisah kunci antar level; harus sama dengan PATH_SEP di list_group_by.bundle.js.
PATH_SEP = "\x1f"
MAX_LEVEL = 3


def group_key(value, granularity=None):
	"""Kunci kelompok satu level; harus sama dengan group_key() di list_group_by.bundle.js."""
	if value is None or value == "":
		return ""
	if granularity:
		date = cstr(getdate(value))
		return {"year": date[:4], "month": date[:7], "day": date[:10]}[granularity]
	return cstr(value)


@frappe.whitelist()
def get_group_counts(doctype, groups, filters=None):
	"""Jumlah dokumen per jalur kelompok (level 1, level 1+2, ...) untuk seluruh data sesuai filter & hak akses.

	groups: [[fieldname, granularity], ...] maksimal 3 level.
	Hasil: {"<kunci1>": n, "<kunci1>\\x1f<kunci2>": n, ...}
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

	rows = frappe.get_list(
		doctype,
		filters=frappe.parse_json(filters) or [],
		fields=list({fieldname for fieldname, _ in groups}),
		limit_page_length=0,
		order_by=None,
	)

	counts = Counter()
	for row in rows:
		path = []
		for fieldname, granularity in groups:
			path.append(group_key(row.get(fieldname), granularity or None))
			counts[PATH_SEP.join(path)] += 1
	return counts
