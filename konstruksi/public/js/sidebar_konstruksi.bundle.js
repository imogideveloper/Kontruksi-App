// Sidebar Konstruksi "terkunci": selama sidebar yang tampil adalah Konstruksi, pindah ke halaman mana pun (Holiday
// List, Event, Timesheet, Project Calendar, Task, link di form, tombol Back, dsb.) tetap memakai sidebar Konstruksi.
// Frappe sendiri memilih sidebar per halaman — kadang dari modul halaman sebelumnya — sehingga sidebar pindah ke
// Leaves / Desk / Projects. Kunci lepas saat pengguna membuka workspace lain (app switcher, /desk/<workspace>).
//
// Catatan: dari /desk/konstruksi Frappe menyimpan judul sidebar dalam huruf kecil ("konstruksi"); disamakan ke label.
const SIDEBAR_KONSTRUKSI = "Konstruksi";
const sidebar_konstruksi = (judul) => String(judul || "").toLowerCase() === SIDEBAR_KONSTRUKSI.toLowerCase();

$(document).on("app_ready", () => {
	const sidebar = frappe.app?.sidebar;
	if (!sidebar || !frappe.boot.workspace_sidebar_item?.konstruksi) return;

	const setup_asli = sidebar.setup.bind(sidebar);
	sidebar.setup = (judul, ...args) => setup_asli(sidebar_konstruksi(judul) ? SIDEBAR_KONSTRUKSI : judul, ...args);
	if (sidebar_konstruksi(sidebar.sidebar_title)) sidebar.sidebar_title = SIDEBAR_KONSTRUKSI;

	// Pemilih sidebar Frappe (dipanggil tiap pindah route & refresh halaman).
	const pilih_asli = sidebar.set_workspace_sidebar.bind(sidebar);
	sidebar.set_workspace_sidebar = (...args) => {
		const sebelumnya = sidebar.sidebar_title;
		pilih_asli(...args);
		const buka_workspace = frappe.get_route()[0] === "Workspaces";
		if (sidebar_konstruksi(sebelumnya) && !buka_workspace && sidebar.sidebar_title !== SIDEBAR_KONSTRUKSI) {
			sidebar.setup(SIDEBAR_KONSTRUKSI);
			sidebar.set_active_workspace_item?.();
		}
	};
});
