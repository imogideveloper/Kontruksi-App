// Report bawaan tertentu: tabel selebar area kerja dengan kolom proporsional (DataTable layout "fluid"), bukan lebar
// kolom tetap yang menyisakan ruang kosong di kanan & memotong angka. Hanya report di LAPORAN_LEBAR_PENUH.
const LAPORAN_LEBAR_PENUH = ["Trial Balance"];

function pasang_lebar_penuh() {
	const QR = frappe.views?.QueryReport;
	if (!QR || QR.prototype.__konstruksi_lebar) return;
	const render_asli = QR.prototype.render_datatable;
	QR.prototype.render_datatable = function (...args) {
		const s = this.report_settings;
		if (LAPORAN_LEBAR_PENUH.includes(this.report_name) && s && !s.__konstruksi_lebar) {
			const opsi_asli = s.get_datatable_options;
			s.get_datatable_options = (opsi) => ({ ...(opsi_asli ? opsi_asli(opsi) : opsi), layout: "fluid" });
			s.__konstruksi_lebar = true;
		}
		return render_asli.apply(this, args);
	};
	QR.prototype.__konstruksi_lebar = true;
}

$(document).on("app_ready", () => setTimeout(pasang_lebar_penuh, 0));
// Cadangan bila kelas QueryReport baru tersedia setelah app_ready.
$(document).on("page-change", pasang_lebar_penuh);
