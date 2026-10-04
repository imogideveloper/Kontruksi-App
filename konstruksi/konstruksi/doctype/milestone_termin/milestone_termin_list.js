// List Milestone Termin: tombol tambah membuka dialog di halaman Milestone & Termin (proyek dari filter bila ada).
frappe.listview_settings["Milestone Termin"] = {
	onload(listview) {
		listview.page.set_primary_action(
			__("Milestone / Termin Baru"),
			() => {
				const filter = (listview.filter_area?.get() || []).find((f) => f[1] === "project" && f[2] === "=");
				frappe.route_options = { milestone_baru: 1 };
				frappe.set_route(...(filter ? ["milestone-termin", filter[3]] : ["milestone-termin"]));
			},
			"add"
		);
	},
};
