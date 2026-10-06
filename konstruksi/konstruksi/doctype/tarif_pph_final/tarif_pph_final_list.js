// List Tarif PPh Final: dikelompokkan per Jenis Jasa → Kualifikasi, tarif tampil sebagai angka, status dihitung
// dari tanggal berlaku & penggantian (digantikan_oleh diisi server, lihat hitung_penggantian di tarif_pph_final.py).
const KOLOM_TARIF_PPH = ["jenis_jasa", "kualifikasi", "tarif", "berlaku_mulai", "dasar_hukum"];
const TABEL_TARIF_PPH = "`tabTarif PPh Final`";

function status_tarif_pph(doc) {
	const hari_ini = frappe.datetime.get_today();
	if (cint(doc.disabled)) return [__("Nonaktif"), "darkgrey", "disabled,=,1"];
	if (doc.berlaku_mulai > hari_ini) return [__("Belum Berlaku"), "blue", `berlaku_mulai,>,${hari_ini}`];
	if (doc.digantikan_mulai && doc.digantikan_mulai <= hari_ini) return [__("Digantikan"), "gray", "digantikan_oleh,is,set"];
	return [__("Berlaku"), "green", "disabled,=,0"];
}

function teks_penuh(value) {
	const esc = frappe.utils.escape_html(value || "");
	return `<span class="ellipsis" title="${esc}">${esc}</span>`;
}

frappe.listview_settings["Tarif PPh Final"] = {
	// Kolom di luar in_list_view hanya terisi bila field-nya ikut diambil.
	add_fields: [...KOLOM_TARIF_PPH, "disabled", "digantikan_oleh", "digantikan_mulai"],
	hide_name_column: true,

	get_indicator: status_tarif_pph,

	formatters: {
		// Field Select bawaan tampil sebagai pill dengan lebar maks 150px (teks panjang terpotong); pakai teks biasa.
		jenis_jasa: teks_penuh,
		kualifikasi: teks_penuh,
		// Frappe merender Percent di list sebagai progress bar; tarif perlu angka yang terbaca.
		tarif(value) {
			return `<b>${format_number(flt(value), null, 2).replace(/[.,]?0+$/, "")}%</b>`;
		},
		berlaku_mulai(value) {
			return value ? `<span>${frappe.datetime.str_to_user(value)}</span>` : "";
		},
		dasar_hukum(value) {
			return value ? `<span class="ellipsis">${frappe.utils.escape_html(value)}</span>` : `<span class="text-muted">—</span>`;
		},
	},

	onload(listview) {
		// Kolom pertama ID (PPH-xxx, dirujuk Sumber Tarif di Kontrak Project); susun ulang seperti tender_list.js.
		const setup_columns = listview.setup_columns.bind(listview);
		listview.setup_columns = function () {
			setup_columns();
			const get_df = (fieldname) => frappe.meta.get_docfield("Tarif PPh Final", fieldname);
			this.columns = [
				{ type: "Subject", df: { label: __("ID"), fieldname: "name" } },
				{ type: "Tag" },
				...KOLOM_TARIF_PPH.map((fieldname) => ({ type: "Field", df: get_df(fieldname) })),
				{ type: "Status" },
			];
		};
		listview.setup_columns();
		listview.render_header(true);

		// Urutan bawaan (Jenis Jasa) dilengkapi Kualifikasi lalu tanggal berlaku terbaru.
		const get_args = listview.get_args.bind(listview);
		listview.get_args = function () {
			const args = get_args();
			if (this.sort_selector?.sort_by === "jenis_jasa") {
				const arah = this.sort_selector.sort_order;
				args.order_by = [
					`${TABEL_TARIF_PPH}.\`jenis_jasa\` ${arah}`,
					`${TABEL_TARIF_PPH}.\`kualifikasi\` asc`,
					`${TABEL_TARIF_PPH}.\`berlaku_mulai\` desc`,
				].join(", ");
			}
			return args;
		};
	},
};
