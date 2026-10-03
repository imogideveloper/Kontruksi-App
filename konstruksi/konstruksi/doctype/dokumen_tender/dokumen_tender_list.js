// Urutan kolom list Dokumen Tender: Tender paling kiri, status kelengkapan paling kanan.
const KOLOM_DOKUMEN_TENDER = ["nama_project", "pemberi_kerja", "batas_pemasukan", "persen_lengkap"];

frappe.listview_settings["Dokumen Tender"] = {
	add_fields: ["diajukan_pada", "wajib_total", "wajib_lengkap"],
	// Kolom "ID" bawaan tidak perlu: ID = kode Tender.
	hide_name_column: true,

	get_indicator(doc) {
		if (doc.diajukan_pada) {
			return [__("Diajukan"), "blue", "diajukan_pada,is,set"];
		}
		if (flt(doc.persen_lengkap) >= 100) {
			return [__("Lengkap"), "green", "persen_lengkap,>=,100"];
		}
		return [
			__("Kurang {0} dokumen", [cint(doc.wajib_total) - cint(doc.wajib_lengkap)]),
			"orange",
			"persen_lengkap,<,100",
		];
	},

	onload(listview) {
		// Frappe selalu menaruh title field (Nama Project) di kolom pertama; susun ulang (lihat tender_list.js).
		const setup_columns = listview.setup_columns.bind(listview);
		listview.setup_columns = function () {
			setup_columns();
			const get_df = (fieldname) => frappe.meta.get_docfield("Dokumen Tender", fieldname);
			this.columns = [
				{ type: "Subject", df: get_df("tender") },
				{ type: "Tag" },
				...KOLOM_DOKUMEN_TENDER.map((fieldname) => ({ type: "Field", df: get_df(fieldname) })),
				{ type: "Status" },
			];
		};
		listview.setup_columns();
		listview.render_header(true);
	},
};
