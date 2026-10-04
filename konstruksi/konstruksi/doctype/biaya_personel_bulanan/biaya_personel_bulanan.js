// Copyright (c) 2026, Imogi Indonesia and contributors
// For license information, please see license.txt

frappe.ui.form.on("Biaya Personel Bulanan", {
	setup(frm) {
		frm.set_query("project", () => ({ filters: { kontrak_project: ["is", "set"] } }));
	},
	refresh(frm) {
		if (frm.is_new() && !frm.doc.periode) frm.set_value("periode", frappe.datetime.month_start());
		if (frm.doc.docstatus === 0 && !frm.is_new()) {
			frm.add_custom_button(__("Hitung Ulang"), () => frm.save());
		}
	},
});
