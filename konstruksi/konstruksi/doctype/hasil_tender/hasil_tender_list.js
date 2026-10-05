// List Hasil Tender: kartu ringkasan (total, menang + win rate, kalah, nilai dimenangkan) dan kolom
// Kode · Project · Pemberi Kerja · Hasil · HPS · Penawaran Kita (% HPS) · Pemenang & Harga · Selisih · Tgl. Pengumuman · Kontrak.
// Keterangan & tanggal pengajuan dibaca di form.
const KOLOM_SEBELUM_HASIL = ["nama_project", "pemberi_kerja"];
const KOLOM_SESUDAH_HASIL = ["hps", "penawaran_kita", "pemenang", "selisih_persen", "tanggal_pengumuman"];
const JUDUL_KOLOM = {
	nama_project: __("Project"),
	pemberi_kerja: __("Pemberi Kerja"),
	hps: __("HPS"),
	penawaran_kita: __("Penawaran Kita"),
	pemenang: __("Pemenang · Harga"),
	selisih_persen: __("Selisih"),
	tanggal_pengumuman: __("Tgl. Pengumuman"),
	kontrak: __("Kontrak"),
};
const KOSONG = `<span class="text-muted">—</span>`;
const BULAN_HT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const esc_ht = (v) => frappe.utils.escape_html(v || "");
const rp_ht = (v) => format_currency(v, "IDR", 0);
// Diisi get_ringkasan_list: tender → Kontrak Project.
let ringkasan_ht = { kontrak: {} };

frappe.listview_settings["Hasil Tender"] = {
	// Kolom di luar in_list_view hanya terisi bila field-nya ikut diambil.
	add_fields: ["hasil", "harga_pemenang", ...KOLOM_SEBELUM_HASIL, ...KOLOM_SESUDAH_HASIL],
	// Kolom "ID" bawaan tidak perlu: ID = kode Tender.
	hide_name_column: true,

	get_indicator(doc) {
		const colors = { Menunggu: "orange", Menang: "green", Kalah: "red", "Batal / Mundur": "gray" };
		return [__(doc.hasil), colors[doc.hasil] || "gray", "hasil,=," + doc.hasil];
	},

	formatters: {
		nama_project(value) {
			return value ? `<span class="kpm-utama ellipsis" title="${esc_ht(value)}">${esc_ht(value)}</span>` : KOSONG;
		},
		pemberi_kerja(value) {
			return value ? `<span class="ellipsis" title="${esc_ht(value)}">${esc_ht(value)}</span>` : KOSONG;
		},
		hps(value) {
			return flt(value) ? rp_ht(value) : KOSONG;
		},
		penawaran_kita(value, df, doc) {
			if (!flt(value)) return KOSONG;
			const persen = flt(doc.hps) ? `<div class="kpm-sub">${__("{0}% dari HPS", [format_number((value / doc.hps) * 100, null, 1)])}</div>` : "";
			return `<div class="kpm-dua-baris text-right"><div class="kpm-utama">${rp_ht(value)}</div>${persen}</div>`;
		},
		// Pemenang & harganya; saat kita menang cukup "Perusahaan kita" (harga = penawaran kita).
		pemenang(value, df, doc) {
			if (doc.hasil === "Menang") return `<span class="text-success">${__("Perusahaan kita")}</span>`;
			if (!value) return KOSONG;
			const harga = flt(doc.harga_pemenang) ? `<div class="kpm-sub">${rp_ht(doc.harga_pemenang)}</div>` : "";
			return `<div class="kpm-dua-baris"><div class="ellipsis" title="${esc_ht(value)}">${esc_ht(value)}</div>${harga}</div>`;
		},
		selisih_persen(value, df, doc) {
			value = flt(value);
			if (!value || doc.hasil !== "Kalah") return KOSONG;
			const teks = `${value > 0 ? "+" : ""}${format_number(value, null, 1)}%`;
			return value > 0
				? `<span class="text-danger">${__("{0} lebih mahal", [teks])}</span>`
				: `<span class="text-success">${__("{0} lebih murah", [teks])}</span>`;
		},
		tanggal_pengumuman(value) {
			if (!value) return KOSONG;
			const m = moment(value);
			return `${m.format("DD")} ${BULAN_HT[m.month()]} ${m.format("YYYY")}`;
		},
		// Kolom virtual: Kontrak Project dari tender ini (hanya relevan bila menang).
		kontrak(value, df, doc) {
			const k = ringkasan_ht.kontrak?.[doc.name];
			if (k) return `<a href="/app/kontrak-project/${encodeURIComponent(k)}" onclick="event.stopPropagation()">${esc_ht(k)}</a>`;
			return doc.hasil === "Menang" ? `<span class="text-warning">${__("Belum dibuat")}</span>` : KOSONG;
		},
	},

	onload(listview) {
		// Frappe selalu menaruh title field (Project) di kolom pertama; susun ulang (lihat tender_list.js).
		const setup_columns = listview.setup_columns.bind(listview);
		listview.setup_columns = function () {
			setup_columns();
			const get_df = (fieldname) => ({ ...frappe.meta.get_docfield("Hasil Tender", fieldname), label: JUDUL_KOLOM[fieldname] });
			this.columns = [
				{ type: "Subject", df: { ...frappe.meta.get_docfield("Hasil Tender", "tender"), label: __("Kode") } },
				{ type: "Tag" },
				...KOLOM_SEBELUM_HASIL.map((fieldname) => ({ type: "Field", df: get_df(fieldname) })),
				{ type: "Status" },
				...KOLOM_SESUDAH_HASIL.map((fieldname) => ({ type: "Field", df: get_df(fieldname) })),
				{ type: "Field", df: { fieldname: "kontrak", fieldtype: "Data", label: JUDUL_KOLOM.kontrak } },
			];
		};
		listview.setup_columns();
		listview.render_header(true);
		muat_ringkasan_ht(listview);
	},

	refresh(listview) {
		render_ringkasan_ht(listview);
	},
};

function muat_ringkasan_ht(listview) {
	frappe.call("konstruksi.konstruksi.doctype.hasil_tender.hasil_tender.get_ringkasan_list").then((r) => {
		ringkasan_ht = r.message || { kontrak: {} };
		render_ringkasan_ht(listview);
		listview.render_list?.();
	});
}

function render_ringkasan_ht(listview) {
	const d = ringkasan_ht;
	if (d.total == null) return;
	const n = d.per_hasil || {};
	const field = listview.page.fields_dict.hasil;
	const aktif = field ? field.get_value() || "" : "";
	const kartu = (hasil, label, nilai, sub) => `<a href="#" class="kpm-kartu kpm-kartu-filter ${aktif === hasil ? "kpm-kartu-aktif" : ""}" data-hasil="${hasil}"
		title="${hasil ? __("Tampilkan tender {0}", [hasil]) : __("Tampilkan semua tender")}">
		<div class="kpm-kartu-label">${label}</div><div class="kpm-kartu-nilai">${nilai}</div>${sub ? `<div class="kpm-sub">${sub}</div>` : ""}</a>`;
	listview.page.main.find(".kpm-ringkasan").remove();
	listview.page.main.find(".frappe-list").before(`<div class="kpm-ringkasan">
		${kartu("", __("Total Tender"), cint(d.total), n.Menunggu ? __("{0} menunggu hasil", [n.Menunggu]) : "")}
		${kartu("Menang", __("Menang"), cint(n.Menang), d.win_rate != null ? __("win rate {0}%", [format_number(d.win_rate, null, 1)]) : "")}
		${kartu("Kalah", __("Kalah"), cint(n.Kalah), "")}
		<div class="kpm-kartu"><div class="kpm-kartu-label">${__("Nilai Dimenangkan")}</div><div class="kpm-kartu-nilai">${rp_ht(d.nilai_menang)}</div></div>
	</div>`);
	listview.page.main.find(".kpm-kartu-filter").on("click", function (e) {
		e.preventDefault();
		const hasil = $(this).attr("data-hasil");
		if (field) {
			field.set_value(hasil);
		} else {
			listview.filter_area.remove("hasil").then(() => hasil && listview.filter_area.add([["Hasil Tender", "hasil", "=", hasil]]));
		}
	});
}
