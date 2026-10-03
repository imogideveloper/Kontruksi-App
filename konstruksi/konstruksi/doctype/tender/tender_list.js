// Urutan kolom list Tender: Kode paling kiri, Status paling kanan.
const KOLOM_TENDER = [
	"tanggal",
	"nama_paket",
	"pemberi_kerja",
	"hps",
	"nilai_penawaran",
	"batas_pemasukan",
	"penanggung_jawab",
];

frappe.listview_settings["Tender"] = {
	add_fields: ["status", "penanggung_jawab"],
	// Kolom "ID" bawaan tidak perlu: Kode = ID dokumen.
	hide_name_column: true,

	get_indicator(doc) {
		const colors = {
			Persiapan: "gray",
			"Penawaran Dikirim": "blue",
			Evaluasi: "orange",
			Menang: "green",
			Kalah: "red",
			"Batal / Mundur": "darkgrey",
		};
		return [__(doc.status), colors[doc.status] || "gray", "status,=," + doc.status];
	},

	onload(listview) {
		// Frappe selalu menaruh title field (Nama Project) di kolom pertama dan Status di kolom ketiga;
		// susun ulang setelah kolom bawaan dibuat.
		const setup_columns = listview.setup_columns.bind(listview);
		listview.setup_columns = function () {
			setup_columns();
			const get_df = (fieldname) => frappe.meta.get_docfield("Tender", fieldname);
			this.columns = [
				{ type: "Subject", df: get_df("kode") },
				{ type: "Tag" },
				...KOLOM_TENDER.map((fieldname) => ({ type: "Field", df: get_df(fieldname) })),
				{ type: "Status" },
			];
		};
		listview.setup_columns();
		listview.render_header(true);
	},
};
