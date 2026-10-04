// Sidebar Konstruksi tetap tampil saat membuka menu yang ada di sidebar Konstruksi (mis. Holiday List, Event,
// Timesheet) dari sidebar Konstruksi — Frappe kadang memilih sidebar modul bawaannya (Leaves, Desk, dsb.).
// Bila dibuka dari sidebar lain (mis. HR), pilihan Frappe tidak diubah.
$(document).on("app_ready", () => {
	let sebelumnya = frappe.app?.sidebar?.sidebar_title;

	frappe.router.on("change", () => {
		// Jalan setelah handler sidebar Frappe (didaftarkan lebih dulu) memilih sidebar.
		setTimeout(() => {
			const sidebar = frappe.app?.sidebar;
			const konfigurasi = frappe.boot.workspace_sidebar_item?.konstruksi;
			if (!sidebar || !konfigurasi) return;
			const entity = sidebar.entity_from_route(frappe.get_route());
			const ada = konfigurasi.items.some((item) => item.link_to === entity);
			if (sebelumnya === "Konstruksi" && ada && sidebar.sidebar_title !== "Konstruksi") {
				sidebar.setup("Konstruksi");
				sidebar.set_active_workspace_item?.();
			}
			sebelumnya = sidebar.sidebar_title;
		}, 0);
	});
});
