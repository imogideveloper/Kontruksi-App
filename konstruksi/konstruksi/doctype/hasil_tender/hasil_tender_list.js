// Kolom list Hasil Tender (mengikuti tabel Riwayat Hasil Tender): Kode, Paket, Hasil, lalu nilai & keterangan.
const KOLOM_HASIL_TENDER = ["penawaran_kita", "pemenang", "harga_pemenang", "selisih_persen", "keterangan"];
const BULAN_HASIL = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const KOSONG = `<span class="text-muted">—</span>`;

function tanggal_singkat(value) {
	if (!value) return "";
	const m = moment(value);
	return `${m.format("DD")} ${BULAN_HASIL[m.month()]} ${m.format("YYYY")}`;
}

frappe.listview_settings["Hasil Tender"] = {
	add_fields: ["hasil", "pemberi_kerja", "tanggal_pengumuman"],
	// Kolom "ID" bawaan tidak perlu: ID = kode Tender.
	hide_name_column: true,

	get_indicator(doc) {
		const colors = { Menang: "green", Kalah: "red", Batal: "gray" };
		return [__(doc.hasil), colors[doc.hasil] || "gray", "hasil,=," + doc.hasil];
	},

	formatters: {
		nama_project(value, df, doc) {
			const esc = frappe.utils.escape_html;
			const sub = [doc.pemberi_kerja, tanggal_singkat(doc.tanggal_pengumuman)].filter(Boolean).join(" · ");
			return `<div class="hasil-paket">
				<div class="hasil-paket-nama ellipsis" title="${esc(value || "")}">${esc(value || "")}</div>
				${sub ? `<div class="hasil-paket-sub ellipsis text-muted" title="${esc(sub)}">${esc(sub)}</div>` : ""}
			</div>`;
		},
		pemenang(value) {
			return value ? `<span class="ellipsis" title="${frappe.utils.escape_html(value)}">${frappe.utils.escape_html(value)}</span>` : KOSONG;
		},
		harga_pemenang(value) {
			return flt(value) ? format_currency(value, "IDR", 0) : KOSONG;
		},
		selisih_persen(value, df, doc) {
			value = flt(value);
			if (!value || doc.hasil === "Batal") return KOSONG;
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
				{ type: "Field", df: get_df("nama_project") },
				{ type: "Status" },
				...KOLOM_HASIL_TENDER.map((fieldname) => ({ type: "Field", df: get_df(fieldname) })),
			];
		};
		listview.setup_columns();
		listview.render_header(true);
	},
};
