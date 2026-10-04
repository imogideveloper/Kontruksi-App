// Copyright (c) 2026, Imogi Indonesia and contributors
// For license information, please see license.txt

frappe.ui.form.on("WBS Item", {
	refresh(frm) {
		if (frm.doc.project) {
			frm.add_custom_button(__("Buka Work Breakdown Structure"), () =>
				frappe.set_route("work-breakdown-structure", frm.doc.project)
			);
		}
	},
});
