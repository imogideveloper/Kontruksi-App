// List Penugasan Personel (lintas proyek): ID paling kiri, lalu Project, status SKK paling kanan.
const KOLOM_PENUGASAN = ["project", "nama_personel", "jabatan", "tanggal_mulai", "tanggal_selesai", "alokasi"];

frappe.listview_settings["Penugasan Personel"] = {
	// Kolom di luar in_list_view hanya terisi bila field-nya ikut diambil.
	add_fields: ["status_skk", ...KOLOM_PENUGASAN],
	hide_name_column: true,

	get_indicator(doc) {
		if (["Belum Ada", "Kedaluwarsa"].includes(doc.status_skk)) {
			return [__("SKK {0}", [__(doc.status_skk)]), "red", "status_skk,=," + doc.status_skk];
		}
		if (doc.status_skk === "Habis Saat Bertugas") {
			return [__("SKK Habis Saat Bertugas"), "orange", "status_skk,=,Habis Saat Bertugas"];
		}
		return [__("Aktif"), "green", "status_skk,!=,Belum Ada"];
	},

	onload(listview) {
		// Frappe selalu menaruh title field (Nama Personel) di kolom pertama; susun ulang (lihat tender_list.js).
		const setup_columns = listview.setup_columns.bind(listview);
		listview.setup_columns = function () {
			setup_columns();
			const get_df = (fieldname) => frappe.meta.get_docfield("Penugasan Personel", fieldname);
			this.columns = [
				{ type: "Subject", df: { label: __("ID"), fieldname: "name" } },
				{ type: "Tag" },
				...KOLOM_PENUGASAN.map((fieldname) => ({ type: "Field", df: get_df(fieldname) })),
				{ type: "Status" },
			];
		};
		listview.setup_columns();
		listview.render_header(true);
	},
};
