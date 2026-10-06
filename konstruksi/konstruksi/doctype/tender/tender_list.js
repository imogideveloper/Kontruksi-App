// List Tender — memantau tender yang berjalan & tenggatnya. Kartu ringkasan pipeline (bisa diklik sebagai filter) dan
// kolom Kode · Nama Project · Pemberi Kerja · Jenis · Metode · HPS · Penawaran Kita · Batas Pemasukan (sisa waktu) · PJ ·
// Status (paling kanan). Hasil akhir (pemenang, selisih) ada di list Hasil Tender.
const KOLOM_TENDER = ["nama_paket", "pemberi_kerja", "jenis_project", "hps", "nilai_penawaran", "batas_pemasukan", "penanggung_jawab"];
const JUDUL_TENDER = {
	nama_paket: __("Nama Project"),
	pemberi_kerja: __("Pemberi Kerja"),
	jenis_project: __("Jenis · Metode"),
	hps: __("HPS"),
	nilai_penawaran: __("Penawaran Kita"),
	batas_pemasukan: __("Batas Pemasukan"),
	penanggung_jawab: __("PJ"),
};
const KOSONG_TDR = `<span class="text-muted">—</span>`;
const BULAN_TDR = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const esc_tdr = (v) => frappe.utils.escape_html(v || "");
let ringkasan_tdr = null;

frappe.listview_settings["Tender"] = {
	add_fields: ["status", "metode_pemilihan", ...KOLOM_TENDER],
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

	formatters: {
		nama_paket(value) {
			return value ? `<span class="kpm-utama kptdr-utuh" title="${esc_tdr(value)}">${esc_tdr(value)}</span>` : KOSONG_TDR;
		},
		pemberi_kerja(value) {
			return value ? `<span class="kptdr-utuh" title="${esc_tdr(value)}">${esc_tdr(value)}</span>` : KOSONG_TDR;
		},
		jenis_project(value, df, doc) {
			if (!value && !doc.metode_pemilihan) return KOSONG_TDR;
			return `<div class="kpm-dua-baris"><div>${esc_tdr(value) || "—"}</div><div class="kpm-sub">${esc_tdr(doc.metode_pemilihan)}</div></div>`;
		},
		hps(value) {
			return flt(value) ? format_currency(value, "IDR", 0) : KOSONG_TDR;
		},
		nilai_penawaran(value) {
			return flt(value) ? format_currency(value, "IDR", 0) : KOSONG_TDR;
		},
		// Tanggal + sisa waktu (hanya selama Persiapan): merah ≤ 3 hari / lewat, oranye ≤ 7 hari.
		batas_pemasukan(value, df, doc) {
			if (!value) return KOSONG_TDR;
			const m = moment(value);
			const tanggal = `${m.format("DD")} ${BULAN_TDR[m.month()]} ${m.format("YYYY")}`;
			let sub = "";
			if (doc.status === "Persiapan") {
				const hari = m.clone().startOf("day").diff(moment().startOf("day"), "days");
				if (hari < 0) sub = `<span class="text-danger">${__("lewat {0} hari", [-hari])}</span>`;
				else if (hari === 0) sub = `<span class="text-danger">${__("hari ini, {0}", [m.format("HH:mm")])}</span>`;
				else if (hari <= 3) sub = `<span class="text-danger">${__("{0} hari lagi", [hari])}</span>`;
				else if (hari <= 7) sub = `<span class="text-warning">${__("{0} hari lagi", [hari])}</span>`;
				else sub = __("{0} hari lagi", [hari]);
			}
			return `<div class="kpm-dua-baris"><div>${tanggal}</div>${sub ? `<div class="kpm-sub">${sub}</div>` : ""}</div>`;
		},
		penanggung_jawab(value) {
			return value ? esc_tdr(frappe.user_info(value).fullname) : KOSONG_TDR;
		},
	},

	onload(listview) {
		// Frappe selalu menaruh title field (Nama Project) di kolom pertama dan Status di kolom ketiga;
		// susun ulang setelah kolom bawaan dibuat.
		const setup_columns = listview.setup_columns.bind(listview);
		listview.setup_columns = function () {
			setup_columns();
			const get_df = (fieldname) => ({ ...frappe.meta.get_docfield("Tender", fieldname), label: JUDUL_TENDER[fieldname] });
			this.columns = [
				{ type: "Subject", df: { ...frappe.meta.get_docfield("Tender", "kode"), label: __("Kode") } },
				{ type: "Tag" },
				...KOLOM_TENDER.map((fieldname) => ({ type: "Field", df: get_df(fieldname) })),
				{ type: "Status" },
			];
		};
		listview.setup_columns();
		listview.render_header(true);
		muat_ringkasan_tdr(listview);
	},

	refresh(listview) {
		render_ringkasan_tdr(listview);
	},
};

function muat_ringkasan_tdr(listview) {
	frappe.call("konstruksi.konstruksi.doctype.tender.tender.get_ringkasan_list").then((r) => {
		ringkasan_tdr = r.message;
		render_ringkasan_tdr(listview);
	});
}

// Filter tiap kartu ringkasan.
const FILTER_KARTU_TDR = (d) => ({
	persiapan: [["Tender", "status", "=", "Persiapan"]],
	proses: [["Tender", "status", "in", ["Penawaran Dikirim", "Evaluasi"]]],
	tenggat: [["Tender", "name", "in", (d.tenggat_nama || []).length ? d.tenggat_nama : ["-"]]],
});

function render_ringkasan_tdr(listview) {
	const d = ringkasan_tdr;
	if (!d) return;
	const s = d.per_status || {};
	// Kartu aktif = filter list saat ini sama dengan filter kartu itu (menyala); klik lagi → filter dilepas.
	const kini = (listview.filter_area?.get() || []).map((f) => `${f[1]}|${f[2]}|${JSON.stringify(f[3])}`).sort().join(";");
	const sama = (kunci) => kini && kini === (FILTER_KARTU_TDR(d)[kunci] || []).map((f) => `${f[1]}|${f[2]}|${JSON.stringify(f[3])}`).sort().join(";");
	const kartu = (kunci, label, nilai, sub) => `<a href="#" class="kpm-kartu kpm-kartu-filter ${sama(kunci) ? "kpm-kartu-aktif" : ""}" data-kunci="${kunci}"
		title="${sama(kunci) ? __("Klik untuk menampilkan semua tender") : __("Tampilkan tender: {0}", [label])}">
		<div class="kpm-kartu-label">${label}</div><div class="kpm-kartu-nilai">${nilai}</div>${sub ? `<div class="kpm-sub">${sub}</div>` : ""}</a>`;
	const proses = cint(s["Penawaran Dikirim"]) + cint(s.Evaluasi);
	listview.page.main.find(".kpm-ringkasan").remove();
	listview.page.main.find(".frappe-list").before(`<div class="kpm-ringkasan">
		${kartu("persiapan", __("Persiapan"), cint(s.Persiapan), __("sedang disusun"))}
		${kartu("proses", __("Penawaran Dikirim / Evaluasi"), proses, __("menunggu hasil"))}
		${kartu("tenggat", __("Tenggat ≤ 7 Hari"), cint(d.tenggat_7_hari), d.tenggat_7_hari ? `<span class="text-danger">${__("segera kirim penawaran")}</span>` : "")}
		<div class="kpm-kartu"><div class="kpm-kartu-label">${__("Total HPS dalam Proses")}</div>
			<div class="kpm-kartu-nilai">${format_currency(d.hps_proses, "IDR", 0)}</div></div>
	</div>`);
	listview.page.main.find(".kpm-kartu-filter").on("click", function (e) {
		e.preventDefault();
		const kunci = $(this).attr("data-kunci");
		const lepas = sama(kunci);
		listview.filter_area.clear(lepas).then(() => !lepas && listview.filter_area.add(FILTER_KARTU_TDR(d)[kunci]));
	});
}
