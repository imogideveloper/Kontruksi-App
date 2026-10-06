// Report bawaan tertentu: tabel selebar area kerja, bukan lebar kolom tetap yang menyisakan ruang kosong di kanan &
// memotong angka. Lebar kolom dihitung dari lebar area tabel: kolom nomor baris tetap kecil, kolom pertama (Account)
// mendapat porsi terbesar, kolom lain dibagi rata. Hanya report di LAPORAN_LEBAR_PENUH.
const LAPORAN_LEBAR_PENUH = { "Trial Balance": { kolom_utama: 0.3 } };
const LEBAR_NOMOR = 56;
const LEBAR_SCROLLBAR = 16;
// Ruang di bawah tabel: baris Set Level / Collapse All + keterangan filter.
const RUANG_BAWAH = 110;

// Tinggi tabel mengikuti isi (semua baris + scrollbar horizontal bila ada), dibatasi sisa tinggi layar. Bawaan Frappe
// memakai tinggi tetap 100vh − 240px yang tidak memperhitungkan filter dua baris & scrollbar, sehingga baris terakhir
// (Total) bisa terpotong. HyperList membaca tinggi elemen saat scroll, jadi aman diubah setelah tabel dibuat.
function pas_tinggi_tabel(report) {
	const s = report.datatable?.bodyScrollable;
	if (!s || !s.isConnected) return;
	const scrollbar_h = s.offsetHeight - s.clientHeight;
	const isi = s.scrollHeight + scrollbar_h;
	const ruang = Math.max(window.innerHeight - s.getBoundingClientRect().top - RUANG_BAWAH, 240);
	s.style.height = `${Math.min(isi, ruang)}px`;
}

function atur_lebar_kolom(report, opsi) {
	const aturan = LAPORAN_LEBAR_PENUH[report.report_name];
	// Sisakan ruang scrollbar vertikal supaya tidak muncul scrollbar horizontal yang menutupi baris terakhir.
	const total = (report.$report?.width() || 0) - LEBAR_NOMOR - 4 - LEBAR_SCROLLBAR;
	const kolom = (opsi.columns || []).filter((c) => !c.hidden);
	if (!aturan || total < 400 || !kolom.length) return opsi;
	const utama = Math.round(total * aturan.kolom_utama);
	const lain = Math.floor((total - utama) / Math.max(kolom.length - 1, 1));
	kolom.forEach((c, i) => (c.width = i === 0 ? utama : lain));
	return { ...opsi, layout: "fixed" };
}

function pasang_lebar_penuh() {
	const QR = frappe.views?.QueryReport;
	if (!QR || QR.prototype.__konstruksi_lebar) return;
	const render_asli = QR.prototype.render_datatable;
	QR.prototype.render_datatable = function (...args) {
		const s = this.report_settings;
		if (LAPORAN_LEBAR_PENUH[this.report_name] && s && !s.__konstruksi_lebar) {
			const opsi_asli = s.get_datatable_options;
			s.get_datatable_options = (opsi) => atur_lebar_kolom(this, opsi_asli ? opsi_asli(opsi) : opsi);
			s.__konstruksi_lebar = true;
		}
		// Frappe memakai ulang tabel lama saat filter berubah (tanpa opsi lebar): buat ulang supaya lebar dihitung lagi.
		if (LAPORAN_LEBAR_PENUH[this.report_name] && this.datatable) {
			this.datatable.destroy?.();
			this.datatable = null;
		}
		const hasil = render_asli.apply(this, args);
		if (LAPORAN_LEBAR_PENUH[this.report_name]) {
			[0, 300].forEach((jeda) => setTimeout(() => pas_tinggi_tabel(this), jeda));
		}
		return hasil;
	};
	$(window).on(
		"resize.konstruksi_lebar",
		frappe.utils.debounce(() => {
			const report = frappe.query_report;
			if (report && LAPORAN_LEBAR_PENUH[report.report_name]) pas_tinggi_tabel(report);
		}, 200)
	);
	QR.prototype.__konstruksi_lebar = true;
}

$(document).on("app_ready", () => setTimeout(pasang_lebar_penuh, 0));
// Cadangan bila kelas QueryReport baru tersedia setelah app_ready.
$(document).on("page-change", pasang_lebar_penuh);
