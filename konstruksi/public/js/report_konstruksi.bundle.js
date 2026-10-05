// Report bawaan tertentu: tabel selebar area kerja, bukan lebar kolom tetap yang menyisakan ruang kosong di kanan &
// memotong angka. Lebar kolom dihitung dari lebar area tabel: kolom nomor baris tetap kecil, kolom pertama (Account)
// mendapat porsi terbesar, kolom lain dibagi rata. Hanya report di LAPORAN_LEBAR_PENUH.
const LAPORAN_LEBAR_PENUH = { "Trial Balance": { kolom_utama: 0.3 } };
const LEBAR_NOMOR = 56;

function atur_lebar_kolom(report, opsi) {
	const aturan = LAPORAN_LEBAR_PENUH[report.report_name];
	const total = (report.$report?.width() || 0) - LEBAR_NOMOR - 4;
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
		return render_asli.apply(this, args);
	};
	QR.prototype.__konstruksi_lebar = true;
}

$(document).on("app_ready", () => setTimeout(pasang_lebar_penuh, 0));
// Cadangan bila kelas QueryReport baru tersedia setelah app_ready.
$(document).on("page-change", pasang_lebar_penuh);
