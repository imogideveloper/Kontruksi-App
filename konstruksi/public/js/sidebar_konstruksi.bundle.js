// Sidebar Konstruksi "terkunci": begitu pengguna masuk ke Konstruksi (workspace atau menu sidebar-nya), sidebar tetap
// Konstruksi untuk halaman apa pun yang dibuka (Holiday List, Event, Timesheet, Task, dsb.) — Frappe sendiri memilih
// sidebar per halaman (Leaves, Desk, Projects, ...) sehingga menu Konstruksi hilang. Kunci lepas saat pengguna
// sengaja membuka workspace / app lain (app switcher, /desk/<workspace lain>).
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

	let terkunci = sidebar_konstruksi(sidebar.sidebar_title);

	// Klik menu di sidebar mana pun: terkunci bila sidebar-nya Konstruksi.
	$(document).on("click", ".body-sidebar .item-anchor", () => {
		terkunci = sidebar_konstruksi(sidebar.sidebar_title);
	});

	frappe.router.on("change", () => {
		// Jalan setelah handler sidebar Frappe (didaftarkan lebih dulu) memilih sidebar.
		setTimeout(() => {
			const route = frappe.get_route();
			if (route[0] === "Workspaces") {
				// Membuka workspace: Konstruksi mengunci, workspace lain melepas.
				const nama = route[route.length - 1];
				if (nama && route.length > 1) terkunci = sidebar_konstruksi(nama) || sidebar_konstruksi(sidebar.sidebar_title);
				return;
			}
			if (terkunci && sidebar.sidebar_title !== SIDEBAR_KONSTRUKSI) {
				sidebar.setup(SIDEBAR_KONSTRUKSI);
				sidebar.set_active_workspace_item?.();
			}
		}, 0);
	});

	// Refresh halaman (page-change / form-refresh) juga menjalankan pemilih sidebar Frappe.
	$(document).on("page-change", () => {
		setTimeout(() => {
			if (terkunci && frappe.get_route()[0] !== "Workspaces" && sidebar.sidebar_title !== SIDEBAR_KONSTRUKSI) {
				sidebar.setup(SIDEBAR_KONSTRUKSI);
				sidebar.set_active_workspace_item?.();
			}
		}, 0);
	});
});
