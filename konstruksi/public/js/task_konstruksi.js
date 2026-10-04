// Task: pilihan Item WBS hanya dari WBS proyek yang dipilih (item tanpa sub-item); ID item tampil bersama kodenya.
frappe.ui.form.on("Task", {
	setup(frm) {
		frm.set_query("wbs_item", () => ({ filters: { project: frm.doc.project || "", is_group: 0 } }));
	},
	project(frm) {
		if (frm.doc.wbs_item) frm.set_value("wbs_item", null);
	},
});
