// Kolom list Kontrak Project: Kode, Project, Pemberi Kerja, nilai, tanggal, kelengkapan, Status.
const KOLOM_KONTRAK = [
	"nama_project",
	"pemberi_kerja",
	"nomor_kontrak",
	"nilai_kontrak_terkini",
	"tanggal_spmk",
	"tanggal_selesai",
	"kelengkapan_terisi",
];
const KOSONG_KONTRAK = `<span class="text-muted">—</span>`;

frappe.listview_settings["Kontrak Project"] = {
	// Kolom di luar in_list_view hanya terisi bila field-nya ikut diambil.
	add_fields: [...KOLOM_KONTRAK, "kelengkapan_total", "akhir_pemeliharaan"],
	hide_name_column: true,

	// Status dihitung dari tanggal; sama dengan kontrak_status() di kontrak_project.js.
	get_indicator(doc) {
		const hari_ini = frappe.datetime.get_today();
		if (!doc.tanggal_spmk || hari_ini < doc.tanggal_spmk) return [__("Persiapan"), "orange"];
		if (!doc.tanggal_selesai || hari_ini <= doc.tanggal_selesai) return [__("Pelaksanaan"), "blue"];
		if (doc.akhir_pemeliharaan && hari_ini <= doc.akhir_pemeliharaan) return [__("Pemeliharaan"), "purple"];
		return [__("Selesai"), "green"];
	},

	formatters: {
		nomor_kontrak(value) {
			return value ? frappe.utils.escape_html(value) : KOSONG_KONTRAK;
		},
		tanggal_spmk(value) {
			return value ? frappe.datetime.str_to_user(value) : KOSONG_KONTRAK;
		},
		tanggal_selesai(value) {
			return value ? frappe.datetime.str_to_user(value) : KOSONG_KONTRAK;
		},
		kelengkapan_terisi(value, df, doc) {
			const total = cint(doc.kelengkapan_total);
			if (!total) return KOSONG_KONTRAK;
			const ok = cint(value) === total;
			return `<span class="indicator-pill ${ok ? "green" : "orange"}">${cint(value)} / ${total}</span>`;
		},
	},

	onload(listview) {
		// Frappe selalu menaruh title field (Project) di kolom pertama; susun ulang (lihat tender_list.js).
		const setup_columns = listview.setup_columns.bind(listview);
		listview.setup_columns = function () {
			setup_columns();
			const get_df = (fieldname) => frappe.meta.get_docfield("Kontrak Project", fieldname);
			this.columns = [
				{ type: "Subject", df: { label: __("Kode"), fieldname: "name" } },
				{ type: "Tag" },
				...KOLOM_KONTRAK.map((fieldname) => ({
					type: "Field",
					df: fieldname === "kelengkapan_terisi" ? { ...get_df(fieldname), label: __("Kelengkapan") } : get_df(fieldname),
				})),
				{ type: "Status" },
			];
		};
		listview.setup_columns();
		listview.render_header(true);
	},
};
