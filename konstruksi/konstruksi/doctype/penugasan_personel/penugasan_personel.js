// Copyright (c) 2026, Imogi Indonesia and contributors
// For license information, please see license.txt

frappe.ui.form.on("Penugasan Personel", {
	setup(frm) {
		frm.set_query("project", () => ({ filters: { kontrak_project: ["is", "set"] } }));
		// Pilihan personel menampilkan jabatan & department.
		frm.set_query("employee", () => ({ query: "konstruksi.konstruksi.tim_proyek.cari_personel" }));
	},

	refresh(frm) {
		if (frm.doc.project) {
			frm.add_custom_button(__("Project Master"), () => frappe.set_route("Form", "Project", frm.doc.project));
		}
		if (["Belum Ada", "Kedaluwarsa"].includes(frm.doc.status_skk)) {
			frm.dashboard.set_headline(
				__("Jabatan {0} mewajibkan SKK, dan SKK personel ini {1}. Lengkapi di Data Personel.", [
					frm.doc.jabatan,
					__(frm.doc.status_skk).toLowerCase(),
				]),
				"orange"
			);
		}
	},

	project(frm) {
		// Periode tugas bawaan = periode proyek.
		if (!frm.doc.project) return;
		frappe.db.get_value("Project", frm.doc.project, ["expected_start_date", "expected_end_date"]).then((r) => {
			const p = r.message || {};
			if (!frm.doc.tanggal_mulai) frm.set_value("tanggal_mulai", p.expected_start_date || frappe.datetime.get_today());
			if (!frm.doc.tanggal_selesai && p.expected_end_date) frm.set_value("tanggal_selesai", p.expected_end_date);
		});
	},
});
