// Kolom list Hasil Tender (mengikuti tabel Riwayat Hasil Tender): Kode, Tanggal, Paket, Pemberi Kerja, Hasil,
// lalu nilai & keterangan.
const KOLOM_SEBELUM_HASIL = ["tanggal_tender", "nama_project", "pemberi_kerja"];
const KOLOM_SESUDAH_HASIL = ["penawaran_kita", "pemenang", "harga_pemenang", "selisih_persen", "keterangan"];
const KOSONG = `<span class="text-muted">—</span>`;

frappe.listview_settings["Hasil Tender"] = {
	add_fields: ["hasil"],
	// Kolom "ID" bawaan tidak perlu: ID = kode Tender.
	hide_name_column: true,

	get_indicator(doc) {
		const colors = { Menunggu: "orange", Menang: "green", Kalah: "red", Batal: "gray" };
		return [__(doc.hasil), colors[doc.hasil] || "gray", "hasil,=," + doc.hasil];
	},

	formatters: {
		pemenang(value) {
			return value ? `<span class="ellipsis" title="${frappe.utils.escape_html(value)}">${frappe.utils.escape_html(value)}</span>` : KOSONG;
		},
		harga_pemenang(value) {
			return flt(value) ? format_currency(value, "IDR", 0) : KOSONG;
		},
		selisih_persen(value, df, doc) {
			value = flt(value);
			if (!value || ["Menunggu", "Batal"].includes(doc.hasil)) return KOSONG;
			const teks = `${value > 0 ? "+" : ""}${format_number(value, null, 1)}%`;
			return value > 0
				? `<span class="text-danger">${__("{0} lebih mahal", [teks])}</span>`
				: `<span class="text-success">${__("{0} lebih murah", [teks])}</span>`;
		},
		keterangan(value) {
			if (!value) return KOSONG;
			const esc = frappe.utils.escape_html(value);
			return `<span class="ellipsis text-muted" title="${esc}">${esc}</span>`;
		},
	},

	onload(listview) {
		// Frappe selalu menaruh title field (Paket) di kolom pertama; susun ulang (lihat tender_list.js).
		const setup_columns = listview.setup_columns.bind(listview);
		listview.setup_columns = function () {
			setup_columns();
			const get_df = (fieldname) => frappe.meta.get_docfield("Hasil Tender", fieldname);
			this.columns = [
				{ type: "Subject", df: get_df("tender") },
				{ type: "Tag" },
				...KOLOM_SEBELUM_HASIL.map((fieldname) => ({ type: "Field", df: get_df(fieldname) })),
				{ type: "Status" },
				...KOLOM_SESUDAH_HASIL.map((fieldname) => ({ type: "Field", df: get_df(fieldname) })),
			];
		};
		listview.setup_columns();
		listview.render_header(true);
	},
};
