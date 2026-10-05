// Sales Invoice tagihan proyek (dibuat dari halaman Penagihan, jenis_tagihan terisi): sembunyikan elemen bawaan
// ERPNext yang tidak relevan untuk invoice jasa konstruksi (POS, nota debit, potong pajak, barcode, stok, kolom
// gudang) dan rapikan tampilannya. Invoice biasa (tanpa jenis_tagihan) tetap tampil seperti bawaan.
const KELAS_SI_KONSTRUKSI = "kpsi";
const FIELD_TIDAK_RELEVAN = ["is_pos", "is_debit_note", "apply_tds", "scan_barcode", "update_stock", "in_words", "base_in_words", "incoterm", "named_place", "tax_category", "taxes_and_charges", "shipping_rule"];

function rapikan_invoice_konstruksi(frm) {
	const aktif = Boolean(frm.doc.jenis_tagihan);
	frm.page.wrapper.toggleClass(KELAS_SI_KONSTRUKSI, aktif);
	pindahkan_edit_posting(frm, aktif);
	atur_label_mata_uang(frm, aktif);
	if (!aktif) return;

	frm.toggle_display(FIELD_TIDAK_RELEVAN, false);

	// Item jasa (UM/Termin) non-stok: kolom Warehouse disembunyikan di tabel item invoice ini saja.
	const grid = frm.fields_dict.items?.grid;
	if (grid && !grid.__kpsi_gudang) {
		grid.set_column_disp_in_list_view("warehouse", false);
		grid.__kpsi_gudang = true;
	}

	tampilkan_persen_pajak(frm);

	// Nama customer panjang tetap bisa dibaca utuh saat kursor diarahkan.
	frm.fields_dict.customer?.$input?.attr("title", frm.doc.customer || "");
}

// Checkbox "Edit Posting Date and Time" dipindah ke bawah "Is Return (Credit Note)" (kolom checkbox). Objek form
// dipakai ulang untuk semua Sales Invoice, jadi posisi aslinya dicatat dan dikembalikan untuk invoice biasa.
function pindahkan_edit_posting(frm, aktif) {
	const edit = frm.fields_dict.set_posting_time?.$wrapper;
	const is_return = frm.fields_dict.is_return?.$wrapper;
	if (!edit?.length || !is_return?.length) return;
	if (!frm.__kpsi_posisi_edit) frm.__kpsi_posisi_edit = { induk: edit.parent(), sebelum: edit.prev() };
	if (aktif) {
		edit.insertAfter(is_return);
	} else {
		const { induk, sebelum } = frm.__kpsi_posisi_edit;
		sebelum.length ? edit.insertAfter(sebelum) : edit.prependTo(induk);
	}
}

// Label tanpa akhiran mata uang ("Rate", bukan "Rate (IDR)"): ERPNext menambahkannya lewat frm.set_currency_labels;
// untuk invoice tagihan proyek dialihkan ke reset_currency_labels (label asli). Saat berpindah antara invoice proyek
// dan invoice biasa, label dihitung ulang (cache mata uang ERPNext dikosongkan dulu).
function atur_label_mata_uang(frm, aktif) {
	if (!frm.__kpsi_label) {
		const asli = frm.set_currency_labels.bind(frm);
		frm.set_currency_labels = function (fields, currency, parentfield) {
			if (!this.doc?.jenis_tagihan) return asli(fields, currency, parentfield);
			if (!currency) return;
			const ada = (fields || []).filter((f) => (parentfield ? true : this.fields_dict[f]));
			return this.reset_currency_labels(ada, parentfield);
		};
		frm.__kpsi_label = true;
	}
	if (frm.__kpsi_label_aktif === aktif || !frm.cscript?.set_dynamic_labels) return;
	frm.__kpsi_label_aktif = aktif;
	frm.cscript._last_currency = null;
	frm.cscript.set_dynamic_labels();
}

// Baris pajak tagihan proyek bertipe "Actual" (nominal dibulatkan rupiah) — ERPNext selalu mengosongkan Tax Rate
// untuk tipe ini. Persen di keterangan yang dibuat sistem Penagihan ("PPN 11%", "PPh Final 2.65% …",
// "Pengembalian uang muka 10% …") ditampilkan di kolom Tax Rate; tanda minus untuk baris pengurang. Hanya tampilan.
function persen_dari_keterangan(row) {
	const cocok = /(\d+(?:[.,]\d+)?)\s*%/.exec(row.description || "");
	if (!cocok) return null;
	const persen = parseFloat(cocok[1].replace(",", "."));
	return flt(row.tax_amount) < 0 ? -persen : persen;
}

function tampilkan_persen_pajak(frm) {
	const grid = frm.fields_dict.taxes?.grid;
	if (!grid || grid.__kpsi_persen) return;
	const format_asli = frappe.form.get_formatter("Float");
	grid.update_docfield_property("rate", "formatter", (value, df, options, row) => {
		const induk = row?.parent && locals["Sales Invoice"]?.[row.parent];
		if (induk?.jenis_tagihan && row.charge_type === "Actual" && !flt(value)) {
			const persen = persen_dari_keterangan(row);
			if (persen != null) return frappe.form.formatters.Percent(persen, { precision: 2 });
		}
		return format_asli(value, df, options, row);
	});
	grid.__kpsi_persen = true;
	grid.refresh();
}

frappe.ui.form.on("Sales Invoice", {
	refresh: rapikan_invoice_konstruksi,
	customer: rapikan_invoice_konstruksi,
});
