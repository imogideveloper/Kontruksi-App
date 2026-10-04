// Copyright (c) 2026, Imogi Indonesia and contributors
// For license information, please see license.txt

// Milestone baru selalu dibuat lewat halaman Milestone & Termin (dialog pohon WBS: bobot, target, & dokumen wajib
// dihitung otomatis). Form ini dipakai untuk melihat / mengubah detail milestone yang sudah ada.
frappe.ui.form.on("Milestone Termin", {
	refresh(frm) {
		if (frm.is_new()) {
			// Ditunda sampai form selesai tampil; pengalihan di tengah render form diabaikan router.
			const project = frm.doc.project || "";
			setTimeout(() => {
				frappe.route_options = { milestone_baru: 1 };
				frappe.set_route(...(project ? ["milestone-termin", project] : ["milestone-termin"]));
			}, 0);
			return;
		}
		frm.add_custom_button(__("Buka Milestone & Termin"), () => frappe.set_route("milestone-termin", frm.doc.project));
		// Bobot dihitung dari lingkup WBS; dokumen wajib ditentukan otomatis dari lingkup.
		frm.set_df_property("bobot", "read_only", (frm.doc.lingkup || []).length ? 1 : 0);
		frm.set_df_property("dokumen_wajib", "cannot_add_rows", 1);
		frm.set_df_property("dokumen_wajib", "cannot_delete_rows", 1);
	},
});
