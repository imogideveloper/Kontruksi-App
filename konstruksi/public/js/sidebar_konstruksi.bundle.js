// Sidebar Konstruksi tetap tampil saat membuka menu yang ada di sidebar Konstruksi (mis. Holiday List, Event,
// Timesheet) dari sidebar Konstruksi. Bila dibuka dari sidebar lain (mis. HR), pilihan Frappe tidak diubah.
//
// Penyebab: dibuka lewat halaman workspace (/desk/konstruksi, mis. menu Home), Frappe menyimpan judul sidebar dari
// URL dalam huruf kecil ("konstruksi"), sedangkan pencocokan menu memakai label "Konstruksi" (peka huruf besar).
// Akibatnya menu yang juga ada di sidebar lain (Leaves, Desk, dsb.) pindah ke sidebar itu.
const SIDEBAR_KONSTRUKSI = "Konstruksi";
const sidebar_konstruksi = (judul) => String(judul || "").toLowerCase() === SIDEBAR_KONSTRUKSI.toLowerCase();

$(document).on("app_ready", () => {
	const sidebar = frappe.app?.sidebar;
	if (!sidebar) return;

	// Judul sidebar selalu "Konstruksi" (sesuai label), dari mana pun dibuka.
	const setup_asli = sidebar.setup.bind(sidebar);
	sidebar.setup = (judul, ...args) => setup_asli(sidebar_konstruksi(judul) ? SIDEBAR_KONSTRUKSI : judul, ...args);
	if (sidebar_konstruksi(sidebar.sidebar_title)) sidebar.sidebar_title = SIDEBAR_KONSTRUKSI;

	let sebelumnya = sidebar.sidebar_title;
	frappe.router.on("change", () => {
		// Jalan setelah handler sidebar Frappe (didaftarkan lebih dulu) memilih sidebar.
		setTimeout(() => {
			const konfigurasi = frappe.boot.workspace_sidebar_item?.konstruksi;
			if (!konfigurasi) return;
			const entity = sidebar.entity_from_route(frappe.get_route());
			const ada = konfigurasi.items.some((item) => item.link_to === entity);
			if (sidebar_konstruksi(sebelumnya) && ada && sidebar.sidebar_title !== SIDEBAR_KONSTRUKSI) {
				sidebar.setup(SIDEBAR_KONSTRUKSI);
				sidebar.set_active_workspace_item?.();
			}
			sebelumnya = sidebar.sidebar_title;
		}, 0);
	});
});
