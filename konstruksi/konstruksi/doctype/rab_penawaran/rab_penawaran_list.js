// Urutan kolom list RAB Penawaran: Kode paling kiri, Pemberi Kerja sebelum Tender.
const KOLOM_RAB = ["nama_project", "pemberi_kerja", "tender", "total_sebelum_ppn", "total_rab"];

frappe.listview_settings["RAB Penawaran"] = {
	add_fields: KOLOM_RAB,
	// Kolom "ID" bawaan tidak perlu: Kode = ID dokumen.
	hide_name_column: true,

	onload(listview) {
		// Frappe selalu menaruh title field (Nama Project) di kolom pertama; susun ulang (lihat tender_list.js).
		const setup_columns = listview.setup_columns.bind(listview);
		listview.setup_columns = function () {
			setup_columns();
			const get_df = (fieldname) => frappe.meta.get_docfield("RAB Penawaran", fieldname);
			this.columns = [
				{ type: "Subject", df: get_df("kode") },
				{ type: "Tag" },
				...KOLOM_RAB.map((fieldname) => ({ type: "Field", df: get_df(fieldname) })),
			];
		};
		listview.setup_columns();
		listview.render_header(true);
	},
};
