// List Milestone Termin: tombol tambah (+ Add / Ctrl+B / "buat baru" saat list kosong) membuka dialog di halaman
// Milestone & Termin — proyek diambil dari filter list bila ada. primary_action = hook bawaan list view Frappe.
frappe.listview_settings["Milestone Termin"] = {
	primary_action() {
		const listview = cur_list;
		const filter = (listview?.filter_area?.get() || []).find((f) => f[1] === "project" && f[2] === "=");
		frappe.route_options = { milestone_baru: 1 };
		frappe.set_route(...(filter ? ["milestone-dan-termin", filter[3]] : ["milestone-dan-termin"]));
	},
};
