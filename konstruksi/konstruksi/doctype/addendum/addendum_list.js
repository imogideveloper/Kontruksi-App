// Kolom list Addendum: Kode, Kontrak, Project, Ke-, Jenis, perubahan nilai & waktu, Tanggal, Status.
const KOLOM_ADDENDUM = ["kontrak_project", "nama_project", "urutan", "jenis", "selisih_nilai", "tambah_hari", "tanggal_addendum"];
const KOSONG_ADDENDUM = `<span class="text-muted">—</span>`;

frappe.listview_settings["Addendum"] = {
	// Kolom di luar in_list_view hanya terisi bila field-nya ikut diambil.
	add_fields: KOLOM_ADDENDUM,
	hide_name_column: true,

	get_indicator(doc) {
		if (doc.docstatus === 1) return [__("Disetujui"), "green", "docstatus,=,1"];
		if (doc.docstatus === 2) return [__("Dibatalkan"), "red", "docstatus,=,2"];
		return [__("Draft"), "orange", "docstatus,=,0"];
	},

	formatters: {
		// Field Select bawaan tampil sebagai pill lebar maks 150px; pakai teks biasa.
		jenis(value) {
			const esc = frappe.utils.escape_html(value || "");
			return `<span class="ellipsis" title="${esc}">${esc}</span>`;
		},
		urutan(value) {
			return cint(value) ? `<span>${__("Ke-{0}", [cint(value)])}</span>` : KOSONG_ADDENDUM;
		},
		selisih_nilai(value) {
			value = flt(value);
			if (!value) return KOSONG_ADDENDUM;
			return `<span class="${value > 0 ? "text-success" : "text-danger"}">${value > 0 ? "+" : "−"}${format_currency(
				Math.abs(value),
				"IDR",
				0
			)}</span>`;
		},
		tambah_hari(value) {
			return cint(value) ? `<span>${__("+{0} hari", [cint(value)])}</span>` : KOSONG_ADDENDUM;
		},
	},

	onload(listview) {
		// Frappe selalu menaruh title field (Project) di kolom pertama; susun ulang (lihat tender_list.js).
		const setup_columns = listview.setup_columns.bind(listview);
		listview.setup_columns = function () {
			setup_columns();
			const get_df = (fieldname) => frappe.meta.get_docfield("Addendum", fieldname);
			this.columns = [
				{ type: "Subject", df: { label: __("Kode"), fieldname: "name" } },
				{ type: "Tag" },
				...KOLOM_ADDENDUM.map((fieldname) => ({ type: "Field", df: get_df(fieldname) })),
				{ type: "Status" },
			];
		};
		listview.setup_columns();
		listview.render_header(true);
	},
};
