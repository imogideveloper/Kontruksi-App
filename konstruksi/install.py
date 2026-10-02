import frappe

# Data awal master Jenis Project; dipakai saat install app dan oleh patch migrate.
JENIS_PROJECT_DEFAULT = (
	"Gedung",
	"Jalan & Jembatan",
	"Sumber Daya Air",
	"Mekanikal & Elektrikal",
	"Lainnya",
)


def after_install():
	buat_jenis_project_default()


def buat_jenis_project_default():
	for jenis in JENIS_PROJECT_DEFAULT:
		if not frappe.db.exists("Jenis Project", jenis):
			frappe.get_doc({"doctype": "Jenis Project", "jenis_project": jenis}).insert(ignore_permissions=True)
