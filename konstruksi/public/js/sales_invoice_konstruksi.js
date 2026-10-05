// Sales Invoice tagihan proyek (dibuat dari halaman Penagihan, jenis_tagihan terisi): sembunyikan elemen bawaan
// ERPNext yang tidak relevan untuk invoice jasa konstruksi (POS, nota debit, potong pajak, barcode, stok, kolom
// gudang) dan rapikan tampilannya. Invoice biasa (tanpa jenis_tagihan) tetap tampil seperti bawaan.
const KELAS_SI_KONSTRUKSI = "kpsi";
const FIELD_TIDAK_RELEVAN = ["is_pos", "is_debit_note", "apply_tds", "scan_barcode", "update_stock"];

function rapikan_invoice_konstruksi(frm) {
	const aktif = Boolean(frm.doc.jenis_tagihan);
	frm.page.wrapper.toggleClass(KELAS_SI_KONSTRUKSI, aktif);
	if (!aktif) return;

	frm.toggle_display(FIELD_TIDAK_RELEVAN, false);

	// Item jasa (UM/Termin) non-stok: kolom Warehouse disembunyikan di tabel item invoice ini saja.
	const grid = frm.fields_dict.items?.grid;
	if (grid && !grid.__kpsi_gudang) {
		grid.set_column_disp_in_list_view("warehouse", false);
		grid.__kpsi_gudang = true;
	}

	// Nama customer panjang tetap bisa dibaca utuh saat kursor diarahkan.
	frm.fields_dict.customer?.$input?.attr("title", frm.doc.customer || "");
}

frappe.ui.form.on("Sales Invoice", {
	refresh: rapikan_invoice_konstruksi,
	customer: rapikan_invoice_konstruksi,
});
