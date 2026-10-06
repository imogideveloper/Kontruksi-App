// Copyright (c) 2026, Imogi Indonesia and contributors
// For license information, please see license.txt

frappe.ui.form.on("Penugasan Personel", {
	setup(frm) {
		frm.set_query("project", () => ({ filters: { kontrak_project: ["is", "set"] } }));
		// Pilihan personel menampilkan jabatan & department; bila Jabatan sudah diisi, hanya personel berjabatan itu.
		frm.set_query("employee", () => ({
			query: "konstruksi.konstruksi.tim_proyek.cari_personel",
			filters: { designation: frm.doc.jabatan || "" },
		}));
	},

	refresh(frm) {
		if (frm.doc.project) {
			frm.add_custom_button(__("Project Master"), () => frappe.set_route("Form", "Project", frm.doc.project));
		}
		const sampai = frm.doc.skk_berlaku_sampai ? frappe.datetime.str_to_user(frm.doc.skk_berlaku_sampai) : "";
		const pesan = {
			"Habis Saat Bertugas": __("SKK personel ini berlaku sampai {0}, sebelum tugasnya selesai. Minta perpanjangan sebelum habis.", [sampai]),
			Kedaluwarsa: __("SKK personel ini sudah habis sejak {0}. Jabatan {1} mewajibkan SKK yang berlaku.", [sampai, frm.doc.jabatan]),
			"Belum Ada": __("Jabatan {0} mewajibkan SKK, tetapi personel ini belum punya SKK. Lengkapi di Data Personel.", [frm.doc.jabatan]),
		}[frm.doc.status_skk];
		if (pesan) frm.dashboard.set_headline(pesan, frm.doc.status_skk === "Habis Saat Bertugas" ? "orange" : "red");
	},

	employee(frm) {
		// Jabatan diisi dari designation personel, kecuali sudah dipilih manual.
		if (!frm.doc.employee) return;
		frappe.db.get_value("Employee", frm.doc.employee, "designation").then((r) => {
			const jabatan = r.message?.designation;
			if (jabatan && (!frm.doc.jabatan || frm.doc.jabatan === frm.__jabatan_otomatis)) {
				frm.__jabatan_otomatis = jabatan;
				frm.set_value("jabatan", jabatan);
			}
		});
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
