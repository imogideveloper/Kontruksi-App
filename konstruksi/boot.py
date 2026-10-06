"""Boot session: bagian sidebar Konstruksi disaring per role.

Frappe sudah menyembunyikan link yang tidak boleh dibaca user (izin DocType / role Page). Beberapa DocType perlu
bisa dibaca semua tim (dipakai di field link, mis. Jenis Project, Sales Invoice "All"), jadi bagian sidebar berikut
dibatasi lagi per role. System Manager melihat semua. Bagian tanpa aturan mengikuti izin per link."""

import frappe

ROLE_BAGIAN = {
	"Tender & Kontrak": {"Projects Manager"},
	"Keuangan": {"Accounts User", "Accounts Manager"},
	"Pengadaan": {"Purchase User", "Purchase Manager", "Accounts User", "Accounts Manager", "Projects Manager"},
	"SDM Proyek": {"HR User", "HR Manager", "Projects Manager"},
	"Data Proyek": {"Projects Manager", "Projects User"},
	"Konfigurasi": set(),
}


def saring_sidebar(bootinfo):
	sidebar = (bootinfo.get("workspace_sidebar_item") or {}).get("konstruksi")
	if not sidebar:
		return
	roles = set(frappe.get_roles())
	if "System Manager" in roles:
		return
	label_bagian = {frappe._(nama): izin for nama, izin in ROLE_BAGIAN.items()}
	hasil, bagian, boleh = [], None, True
	for item in sidebar["items"]:
		if item.get("type") == "Section Break":
			bagian = item
			izin = label_bagian.get(item.get("label"))
			boleh = izin is None or bool(izin & roles)
			if boleh:
				hasil.append(item)
			continue
		if bagian is None or boleh:
			hasil.append(item)
	# Bagian yang tersisa tanpa isi (semua link-nya tersaring) ikut dibuang.
	sidebar["items"] = [
		x for i, x in enumerate(hasil)
		if x.get("type") != "Section Break" or (i + 1 < len(hasil) and hasil[i + 1].get("type") != "Section Break")
	]
