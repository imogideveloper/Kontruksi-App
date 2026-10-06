// Sidebar Konstruksi "terkunci": selama sidebar yang tampil adalah Konstruksi, pindah ke halaman mana pun (Holiday
// List, Event, Timesheet, Project Calendar, Task, link di form, tombol Back, dsb.) tetap memakai sidebar Konstruksi.
// Frappe sendiri memilih sidebar per halaman — kadang dari modul halaman sebelumnya — sehingga sidebar pindah ke
// Leaves / Desk / Projects. Kunci lepas saat pengguna membuka workspace lain (app switcher, /desk/<workspace>).
//
// Catatan: dari /desk/konstruksi Frappe menyimpan judul sidebar dalam huruf kecil ("konstruksi"); disamakan ke label.
const SIDEBAR_KONSTRUKSI = "Konstruksi";
// Penagihan & pengadaan proyek: selalu di sidebar Konstruksi (bukan Accounting / Payments / Buying).
const DOCTYPE_PENAGIHAN = ["Sales Invoice", "Payment Entry", "Purchase Order", "Purchase Invoice"];
const sidebar_konstruksi = (judul) => String(judul || "").toLowerCase() === SIDEBAR_KONSTRUKSI.toLowerCase();

// app_ready dipicu di dalam constructor frappe.Application, sebelum frappe.app terisi; pasang sesudahnya.
$(document).on("app_ready", () => setTimeout(pasang_kunci_sidebar, 0));

function pasang_kunci_sidebar() {
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
		const route = frappe.get_route();
		const buka_workspace = route[0] === "Workspaces";
		// Penagihan proyek (Sales Invoice, Payment Entry) selalu di sidebar Konstruksi, juga bila dibuka langsung
		// (link, reload, notifikasi) — tidak pindah ke sidebar Accounting / Payments.
		const doctype_penagihan = ["List", "Form"].includes(route[0]) && DOCTYPE_PENAGIHAN.includes(route[1]);
		if ((sidebar_konstruksi(sebelumnya) || doctype_penagihan) && !buka_workspace && sidebar.sidebar_title !== SIDEBAR_KONSTRUKSI) {
			sidebar.setup(SIDEBAR_KONSTRUKSI);
			sidebar.set_active_workspace_item?.();
			frappe.breadcrumbs?.update?.();
		}
	};
}

// Mode ringkas: tooltip judul group (Section Break) dimatikan. Elemen group membungkus menu-menu di dalamnya, sehingga
// tooltip judul group ikut muncul bersama tooltip menu yang disorot (dua tooltip sekaligus).
function matikan_tooltip_group() {
	$(".body-sidebar .sidebar-item-container.section-item").each(function () {
		const $el = $(this);
		if ($el.attr("data-toggle") !== "tooltip") return;
		$el.tooltip?.("dispose");
		$el.removeAttr("data-toggle").removeAttr("title").removeAttr("data-original-title");
	});
}
$(document).on("sidebar-expand sidebar_setup", () => setTimeout(matikan_tooltip_group, 0));
$(document).on("app_ready", () => setTimeout(matikan_tooltip_group, 50));

// Menu "Item Biaya Proyek" (Pengadaan): buka list Item yang tersaring ke grup Biaya Proyek beserta sub-grupnya.
// Filter sidebar bawaan hanya mendukung "sama dengan", sedangkan item ada di sub-grup (Material Proyek, dst).
// Fase capture: berjalan sebelum handler klik Frappe pada link sidebar.
document.addEventListener(
	"click",
	(e) => {
		const link = e.target.closest?.(".body-sidebar .standard-sidebar-item a.item-anchor");
		if (!link || link.querySelector(".sidebar-item-label")?.textContent.trim() !== __("Item Biaya Proyek")) return;
		e.preventDefault();
		e.stopPropagation();
		frappe.set_route("List", "Item", { item_group: ["descendants of (inclusive)", "Biaya Proyek"] });
	},
	true
);
