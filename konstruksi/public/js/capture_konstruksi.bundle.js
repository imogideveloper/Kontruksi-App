// Capture Halaman: simpan SELURUH UI desk yang sedang dibuka (sidebar kiri + halaman) sebagai PNG — termasuk bagian
// yang harus di-scroll (tabel lebar, Gantt, daftar panjang), bukan screenshot layar. Tombol ikon kamera di header
// setiap halaman (form, list, report, halaman custom) dan shortcut Ctrl+Shift+Alt+S.
//
// Cara kerja: seluruh <body> diperbesar sementara — setiap elemen yang bisa di-scroll dibuka penuh dan sidebar
// dipanjangkan setinggi isi — lalu dirender ke gambar dengan html-to-image, kemudian gaya aslinya dikembalikan.
import { toPng } from "html-to-image";

const LABEL_CAPTURE = __("Capture seluruh halaman (PNG)");
// Batas aman kanvas browser (sisi maks. ±16.000 px, luas maks. ±200 juta piksel).
const SISI_MAKS = 16000;
const LUAS_MAKS = 200e6;

function nama_file() {
	const route = frappe.get_route().filter(Boolean).join("-") || "halaman";
	const t = new Date();
	const p = (n) => String(n).padStart(2, "0");
	const waktu = `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}`;
	return `${route.replace(/[^\w.-]+/g, "_").slice(0, 80)}-${waktu}.png`;
}

// Buka semua area yang bisa di-scroll di dalam `akar`; mengembalikan fungsi untuk memulihkan gaya aslinya.
function buka_area_scroll(akar) {
	const asli = [];
	const simpan = (el, gaya) => {
		asli.push([el, el.getAttribute("style")]);
		Object.entries(gaya).forEach(([k, v]) => el.style.setProperty(k, v, "important"));
	};
	// Dari dalam ke luar supaya ukuran induk mengikuti isi yang sudah dibuka.
	const elemen = [akar, ...akar.querySelectorAll("*")].reverse();
	elemen.forEach((el) => {
		if (!(el instanceof HTMLElement) || !el.offsetParent && el !== akar) return;
		const cs = getComputedStyle(el);
		const scroll_x = /(auto|scroll|hidden)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
		const scroll_y = /(auto|scroll|hidden)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
		// Teks yang sengaja dipotong "…" dibiarkan (bukan area scroll).
		if (cs.textOverflow === "ellipsis" && !el.children.length) return;
		if (!scroll_x && !scroll_y) return;
		const gaya = { overflow: "visible", "max-height": "none", "max-width": "none" };
		if (scroll_y) gaya.height = `${el.scrollHeight}px`;
		if (scroll_x) gaya.width = `${el.scrollWidth}px`;
		simpan(el, gaya);
	});
	// Lebar total = isi terlebar (mis. Gantt), supaya tidak terpotong di kanan.
	simpan(akar, { width: `${Math.max(akar.scrollWidth, akar.offsetWidth)}px`, "max-width": "none", overflow: "visible" });
	return () =>
		asli.reverse().forEach(([el, style]) => (style == null ? el.removeAttribute("style") : el.setAttribute("style", style)));
}

// Sidebar kiri (fixed / setinggi layar) dipanjangkan setinggi isi halaman supaya ikut tergambar penuh.
function panjangkan_sidebar(tinggi) {
	const asli = [];
	document.querySelectorAll(".body-sidebar-container, .body-sidebar, .body-sidebar-placeholder").forEach((el) => {
		asli.push([el, el.getAttribute("style")]);
		el.style.setProperty("height", `${tinggi}px`, "important");
		el.style.setProperty("max-height", "none", "important");
		if (getComputedStyle(el).position === "fixed") el.style.setProperty("position", "absolute", "important");
	});
	return () => asli.reverse().forEach(([el, style]) => (style == null ? el.removeAttribute("style") : el.setAttribute("style", style)));
}

async function capture_halaman() {
	const akar = document.body;
	if (!frappe.container?.page) return frappe.msgprint(__("Tidak ada halaman yang bisa di-capture."));
	frappe.show_alert({ message: __("Membuat gambar halaman…"), indicator: "blue" });
	document.activeElement?.blur?.();
	$(".dropdown-menu.show").removeClass("show");
	const scroll_awal = [window.scrollX, window.scrollY];
	window.scrollTo(0, 0);
	const pulihkan_scroll = buka_area_scroll(akar);
	let pulihkan_sidebar = () => {};
	try {
		// Tunggu layout menyesuaikan sebelum diukur.
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
		pulihkan_sidebar = panjangkan_sidebar(Math.max(document.documentElement.scrollHeight, akar.scrollHeight));
		await new Promise((r) => requestAnimationFrame(r));
		const w = Math.ceil(Math.max(akar.scrollWidth, document.documentElement.scrollWidth));
		const h = Math.ceil(Math.max(akar.scrollHeight, document.documentElement.scrollHeight));
		const rasio = Math.max(Math.min(window.devicePixelRatio || 1, 2, SISI_MAKS / w, SISI_MAKS / h, Math.sqrt(LUAS_MAKS / (w * h))), 0.25);
		const latar = getComputedStyle(document.body).backgroundColor || "#ffffff";
		const data_url = await toPng(akar, {
			width: w,
			height: h,
			pixelRatio: rasio,
			backgroundColor: latar,
			cacheBust: true,
			style: { margin: "0", transform: "none" },
			// Elemen sementara / overlay tidak ikut digambar.
			filter: (node) =>
				!(node instanceof HTMLElement) ||
				!node.matches?.(
					".tooltip, .popover, .desk-alert, .alert-container, .kptl-k-tip, .frappe-toast, #all-symbols, #build-events-overlay, .splash, .modal-backdrop"
				),
		});
		const a = document.createElement("a");
		a.href = data_url;
		a.download = nama_file();
		a.click();
		frappe.show_alert({ message: __("Gambar tersimpan: {0} ({1}×{2} px)", [a.download, Math.round(w * rasio), Math.round(h * rasio)]), indicator: "green" });
	} catch (e) {
		console.error(e);
		frappe.msgprint({ title: __("Capture gagal"), message: __("Halaman tidak bisa dijadikan gambar: {0}", [e?.message || e]), indicator: "red" });
	} finally {
		pulihkan_sidebar();
		pulihkan_scroll();
		window.scrollTo(...scroll_awal);
	}
}

// Tombol ikon kamera di grup ikon header halaman.
function pasang_tombol(page) {
	if (!page?.add_action_icon || page.__capture_konstruksi) return;
	page.add_action_icon("camera", capture_halaman, "konstruksi-capture-btn", LABEL_CAPTURE);
	page.__capture_konstruksi = true;
}

$(document).on("app_ready", () => {
	// Grup ikon header dikosongkan (clear_icons) oleh sebagian halaman saat refresh; pasang lagi sesudahnya.
	const proto = frappe.ui.Page?.prototype;
	if (proto && !proto.__capture_dipatch) {
		const clear_asli = proto.clear_icons;
		proto.clear_icons = function (...args) {
			clear_asli.apply(this, args);
			this.__capture_konstruksi = false;
			pasang_tombol(this);
		};
		proto.__capture_dipatch = true;
	}
	$(document).on("page-change", () => setTimeout(() => pasang_tombol(frappe.container?.page?.page), 0));
	setTimeout(() => pasang_tombol(frappe.container?.page?.page), 0);
	frappe.ui.keys.add_shortcut({
		shortcut: "alt+shift+ctrl+s",
		action: () => capture_halaman(),
		description: __("Capture seluruh halaman sebagai PNG"),
		ignore_inputs: true,
	});
});

frappe.provide("konstruksi");
konstruksi.capture_halaman = capture_halaman;
