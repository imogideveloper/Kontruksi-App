// List Project Master (Project ERPNext + field konstruksi): kartu ringkasan di atas, kolom seperti daftar proyek,
// status proyek konstruksi. Dimuat setelah project_list.js ERPNext (hooks.doctype_list_js) dan menimpanya.
(() => {
	const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
	const KOLOM = ["project_name", "customer", "jenis_project", "nilai_kontrak", "expected_start_date", "project_manager"];
	const WARNA_STATUS = {
		Perencanaan: "gray",
		Berjalan: "blue",
		Pemeliharaan: "purple",
		Selesai: "green",
		Ditunda: "orange",
		Batal: "red",
	};
	const esc = (v) => frappe.utils.escape_html(v || "");
	const kosong = `<span class="text-muted">—</span>`;
	const tanggal = (v) => {
		if (!v) return "";
		const m = moment(v);
		return `${m.format("DD")} ${BULAN[m.month()]} ${m.format("YYYY")}`;
	};
	const bawaan = frappe.listview_settings["Project"] || {};

	frappe.listview_settings["Project"] = {
		...bawaan,
		// Kolom di luar in_list_view hanya terisi bila field-nya ikut diambil.
		add_fields: [
			...(bawaan.add_fields || []),
			...KOLOM,
			"kontrak_project",
			"lokasi",
			"nilai_sebelum_ppn",
			"tarif_ppn",
			"expected_end_date",
			"status_proyek",
		],
		// Bawaan ERPNext hanya menampilkan status Open; Project Master menampilkan semua.
		filters: [],
		hide_name_column: true,

		get_indicator(doc) {
			if (doc.status_proyek) {
				return [__(doc.status_proyek), WARNA_STATUS[doc.status_proyek] || "gray", "status_proyek,=," + doc.status_proyek];
			}
			return bawaan.get_indicator ? bawaan.get_indicator(doc) : null;
		},

		formatters: {
			project_name(value, df, doc) {
				return `<div class="kpm-dua-baris">
					<div class="kpm-utama ellipsis" title="${esc(value)}">${esc(value)}</div>
					${doc.lokasi ? `<div class="kpm-sub ellipsis">${esc(doc.lokasi)}</div>` : ""}
				</div>`;
			},
			customer(value) {
				return value ? `<span class="ellipsis" title="${esc(value)}">${esc(value)}</span>` : kosong;
			},
			jenis_project(value) {
				return value ? esc(value) : kosong;
			},
			nilai_kontrak(value, df, doc) {
				if (!flt(value)) return kosong;
				const sub = flt(doc.tarif_ppn)
					? __("{0} + PPN {1}%", [format_currency(doc.nilai_sebelum_ppn, "IDR", 0), cint(doc.tarif_ppn)])
					: __("Non-PPN");
				return `<div class="kpm-dua-baris text-right">
					<div class="kpm-utama">${format_currency(value, "IDR", 0)}</div><div class="kpm-sub">${sub}</div></div>`;
			},
			// Kolom Periode: mulai – selesai.
			expected_start_date(value, df, doc) {
				if (!value) return `<span class="text-muted">${__("Menunggu SPMK")}</span>`;
				return `${tanggal(value)} – ${tanggal(doc.expected_end_date)}`;
			},
			project_manager(value) {
				return value ? esc(frappe.user_info(value).fullname) : kosong;
			},
		},

		onload(listview) {
			bawaan.onload && bawaan.onload(listview);

			// Susun ulang kolom (lihat tender_list.js); kolom tanggal mulai diberi judul "Periode".
			const setup_columns = listview.setup_columns.bind(listview);
			listview.setup_columns = function () {
				setup_columns();
				const get_df = (fieldname) => frappe.meta.get_docfield("Project", fieldname);
				this.columns = [
					{ type: "Subject", df: { label: __("Kode"), fieldname: "name" } },
					{ type: "Tag" },
					...KOLOM.map((fieldname) => ({
						type: "Field",
						df: fieldname === "expected_start_date" ? { ...get_df(fieldname), label: __("Periode") } : get_df(fieldname),
					})),
					{ type: "Status" },
				];
			};
			listview.setup_columns();
			listview.render_header(true);

			// Kartu ringkasan di atas list.
			frappe.call("konstruksi.konstruksi.project_konstruksi.get_ringkasan_list").then((r) => {
				const d = r.message || {};
				const s = d.per_status || {};
				const kartu = (label, nilai, aktif) =>
					`<div class="kpm-kartu ${aktif ? "kpm-kartu-aktif" : ""}"><div class="kpm-kartu-label">${label}</div>
						<div class="kpm-kartu-nilai">${nilai}</div></div>`;
				listview.page.main.find(".kpm-ringkasan").remove();
				listview.page.main.find(".frappe-list").before(`<div class="kpm-ringkasan">
					${kartu(__("Total Proyek"), cint(d.total))}
					${kartu(__("Sedang Berjalan"), cint(s.Berjalan), true)}
					${kartu(__("Perencanaan"), cint(s.Perencanaan))}
					${kartu(__("Total Nilai Kontrak + PPN"), format_currency(d.total_nilai, "IDR", 0))}
				</div>`);
			});
		},
	};
})();
