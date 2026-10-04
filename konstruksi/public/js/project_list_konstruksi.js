// List Project Master (Project ERPNext + field konstruksi): kartu ringkasan di atas, kolom seperti daftar proyek,
// status proyek konstruksi. Dimuat setelah project_list.js ERPNext (hooks.doctype_list_js) dan menimpanya.
(() => {
	const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
	const KOLOM = ["project_name", "customer", "lokasi", "jenis_project", "nilai_kontrak", "expected_start_date", "project_manager"];
	// Judul kolom (label bawaan ERPNext berbahasa Inggris).
	const JUDUL = {
		project_name: __("Nama Proyek"),
		customer: __("Klien"),
		lokasi: __("Lokasi"),
		jenis_project: __("Jenis"),
		nilai_kontrak: __("Nilai Kontrak"),
		expected_start_date: __("Periode"),
		project_manager: __("PM"),
	};
	// Kartu ringkasan sekaligus filter Status Proyek (null = semua).
	const KARTU = [
		{ label: __("Total Proyek"), status: null },
		{ label: __("Sedang Berjalan"), status: "Berjalan" },
		{ label: __("Perencanaan"), status: "Perencanaan" },
	];
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
			project_name(value) {
				return `<span class="kpm-utama ellipsis" title="${esc(value)}">${esc(value)}</span>`;
			},
			lokasi(value) {
				return value ? `<span class="ellipsis" title="${esc(value)}">${esc(value)}</span>` : kosong;
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

			// List Project = Project Master: tetap di sidebar Konstruksi walau dibuka dari luar sidebar itu.
			const sidebar = frappe.app?.sidebar;
			if (sidebar && sidebar.sidebar_title !== "Konstruksi" && frappe.boot.workspace_sidebar_item?.konstruksi) {
				sidebar.setup("Konstruksi");
				sidebar.set_active_workspace_item?.();
			}

			// Susun ulang kolom (lihat tender_list.js) dengan judul berbahasa Indonesia.
			const setup_columns = listview.setup_columns.bind(listview);
			listview.setup_columns = function () {
				setup_columns();
				const get_df = (fieldname) => frappe.meta.get_docfield("Project", fieldname);
				this.columns = [
					{ type: "Subject", df: { label: __("Kode"), fieldname: "name" } },
					{ type: "Tag" },
					...KOLOM.map((fieldname) => ({ type: "Field", df: { ...get_df(fieldname), label: JUDUL[fieldname] } })),
					{ type: "Status" },
				];
			};
			listview.setup_columns();
			listview.render_header(true);
			muat_ringkasan(listview);
		},

		// Tiap list di-refresh (filter berubah, data berubah): kartu aktif mengikuti filter Status Proyek.
		refresh(listview) {
			bawaan.refresh && bawaan.refresh(listview);
			render_ringkasan(listview);
		},
	};

	function muat_ringkasan(listview) {
		frappe.call("konstruksi.konstruksi.project_konstruksi.get_ringkasan_list").then((r) => {
			listview.__ringkasan = r.message || {};
			render_ringkasan(listview);
		});
	}

	// Status Proyek adalah filter standar (kotak filter di atas list): baca & isi lewat field-nya.
	function filter_status(listview) {
		const field = listview.page.fields_dict.status_proyek;
		if (field) return field.get_value() || null;
		const f = (listview.filter_area?.get() || []).find((x) => x[1] === "status_proyek" && x[2] === "=");
		return f ? f[3] : null;
	}

	function render_ringkasan(listview) {
		const d = listview.__ringkasan;
		if (!d) return;
		const s = d.per_status || {};
		const aktif = filter_status(listview);
		const kartu = KARTU.map(
			(k) => `<a href="#" class="kpm-kartu kpm-kartu-filter ${aktif === k.status ? "kpm-kartu-aktif" : ""}"
				data-status="${k.status || ""}" title="${k.status ? __("Tampilkan proyek {0}", [k.status]) : __("Tampilkan semua proyek")}">
				<div class="kpm-kartu-label">${k.label}</div>
				<div class="kpm-kartu-nilai">${cint(k.status ? s[k.status] : d.total)}</div>
			</a>`
		).join("");
		listview.page.main.find(".kpm-ringkasan").remove();
		listview.page.main.find(".frappe-list").before(`<div class="kpm-ringkasan">
			${kartu}
			<div class="kpm-kartu"><div class="kpm-kartu-label">${__("Total Nilai Kontrak + PPN")}</div>
				<div class="kpm-kartu-nilai">${format_currency(d.total_nilai, "IDR", 0)}</div></div>
		</div>`);
		listview.page.main.find(".kpm-kartu-filter").on("click", function (e) {
			e.preventDefault();
			const status = $(this).attr("data-status");
			const field = listview.page.fields_dict.status_proyek;
			if (field) {
				field.set_value(status);
			} else {
				listview.filter_area.remove("status_proyek").then(() => {
					if (status) listview.filter_area.add([["Project", "status_proyek", "=", status]]);
				});
			}
		});
	}
})();
