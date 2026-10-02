from collections import Counter

import frappe
from frappe import _
from frappe.utils import cstr, getdate

STANDARD_GROUP_FIELDS = ("owner", "creation", "modified")


def group_key(value, granularity=None):
	"""Kunci kelompok; harus sama dengan groupKey() di list_group_by.bundle.js."""
	if value is None or value == "":
		return ""
	if granularity:
		date = cstr(getdate(value))
		return {"year": date[:4], "month": date[:7], "day": date[:10]}[granularity]
	return cstr(value)


@frappe.whitelist()
def get_group_counts(doctype, fieldname, granularity=None, filters=None):
	"""Jumlah dokumen per kelompok untuk seluruh data (bukan hanya halaman yang dimuat), sesuai filter & hak akses."""
	frappe.has_permission(doctype, "read", throw=True)
	if fieldname not in STANDARD_GROUP_FIELDS and not frappe.get_meta(doctype).get_field(fieldname):
		frappe.throw(_("Field {0} tidak ada di {1}").format(fieldname, doctype))
	if granularity not in (None, "", "year", "month", "day"):
		frappe.throw(_("Pengelompokan tanggal tidak dikenal: {0}").format(granularity))

	rows = frappe.get_list(
		doctype,
		filters=frappe.parse_json(filters) or [],
		fields=[fieldname],
		limit_page_length=0,
		order_by=None,
	)
	return Counter(group_key(row.get(fieldname), granularity or None) for row in rows)
