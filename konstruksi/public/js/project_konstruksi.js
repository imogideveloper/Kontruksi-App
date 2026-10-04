// Form Project Master (Project ERPNext + field konstruksi): dashboard proyek di atas form, tombol ke kontrak,
// dan field yang berasal dari kontrak dikunci. Dimuat lewat hooks.doctype_js setelah project.js ERPNext.
(() => {
	const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
	// Field bawaan Project yang diisi dari Kontrak Project; diubah dari kontrak / tender, bukan di sini.
	const FIELD_DARI_KONTRAK = ["project_name", "customer", "expected_start_date", "expected_end_date", "estimated_costing"];
	const WARNA_STATUS = { Perencanaan: "gray", Berjalan: "blue", Pemeliharaan: "purple", Selesai: "green", Ditunda: "orange", Batal: "red" };
	const esc = (v) => frappe.utils.escape_html(v || "");
	const tanggal = (v) => {
		if (!v) return "";
		const m = moment(v);
		return `${m.format("DD")} ${BULAN[m.month()]} ${m.format("YYYY")}`;
	};
	const persen = (v) => `${format_number(flt(v), null, 1)}%`;

	// Penjelasan field di section "Costing and Billing" (bawaan ERPNext): [label, fungsi, diisi dari].
	const INFO_COSTING = [
		["Estimated Cost", __("Perkiraan biaya pelaksanaan proyek (budget internal), bukan nilai kontrak."), __("Proyek dari kontrak: otomatis dari Total Biaya (RAP) di RAB Penawaran. Lainnya: diisi manual.")],
		["Total Costing Amount", __("Biaya jam kerja orang yang dicatat untuk proyek ini."), __("Timesheet bertanda proyek ini")],
		["Total Expense Claim", __("Klaim biaya karyawan (transport, makan, akomodasi) untuk proyek ini."), __("Expense Claim (HR)")],
		["Total Purchase Cost", __("Pembelian material / jasa / subkon dari supplier."), __("Purchase Invoice bertanda proyek ini")],
		["Company", __("Perusahaan pemilik proyek; menentukan akun & mata uang."), __("Diisi saat proyek dibuat")],
		["Total Sales Amount", __("Nilai pesanan dari klien."), __("Sales Order bertanda proyek ini")],
		["Total Billable Amount", __("Jam kerja yang boleh ditagihkan ke klien."), __("Timesheet (bagian billable)")],
		["Total Billed Amount", __("Total yang sudah ditagihkan ke klien (termin)."), __("Sales Invoice bertanda proyek ini — nanti dari menu Penagihan")],
		["Total Consumed Material Cost", __("Material dari gudang yang dipakai untuk proyek."), __("Stock Entry (Material Issue) bertanda proyek ini")],
		["Default Cost Center", __("Pusat biaya bawaan untuk transaksi proyek ini di akuntansi."), __("Diisi manual / dari pengaturan perusahaan")],
	];

	function pasang_info_costing(frm) {
		const $head = frm.layout.wrapper.find('.form-section[data-fieldname="project_details"] > .section-head');
		if (!$head.length || $head.find(".kpm-info-btn").length) return;
		$(`<button class="btn-reset kpm-info-btn" title="${__("Penjelasan field")}">${frappe.utils.icon("info", "sm")}</button>`)
			.appendTo($head)
			.on("click", (e) => {
				e.stopPropagation();
				tampil_info_costing();
			});
	}

	function tampil_info_costing() {
		const esc = frappe.utils.escape_html;
		const baris = INFO_COSTING.map(
			([label, fungsi, sumber]) => `<tr><td><b>${esc(__(label))}</b></td><td>${esc(fungsi)}</td><td class="text-muted">${esc(sumber)}</td></tr>`
		).join("");
		const d = new frappe.ui.Dialog({
			title: __("Costing and Billing — fungsi tiap field"),
			size: "large",
			fields: [{ fieldname: "isi", fieldtype: "HTML" }],
		});
		d.fields_dict.isi.$wrapper.html(`
			<p class="text-muted">${__(
				"Semua field kecuali Estimated Cost, Company, dan Default Cost Center terisi otomatis dari transaksi ERPNext yang ditandai dengan proyek ini. Selama belum ada transaksi, nilainya Rp 0."
			)}</p>
			<div class="kpm-info-wrap"><table class="kpm-info-tabel">
				<thead><tr><th>${__("Field")}</th><th>${__("Fungsi")}</th><th>${__("Diisi dari")}</th></tr></thead>
				<tbody>${baris}</tbody>
			</table></div>
			<p class="text-muted kpm-info-catatan">${__(
				"Gross Margin (section di bawahnya) = Total Billed Amount − total biaya (timesheet, expense claim, pembelian, material)."
			)}</p>`);
		d.show();
	}

	frappe.ui.form.on("Project", {
		refresh(frm) {
			frm.$wrapper.find(".kpm-dashboard").remove();
			pasang_info_costing(frm);
			if (!frm.doc.kontrak_project) return;

			pakai_sidebar_konstruksi();
			FIELD_DARI_KONTRAK.forEach((fieldname) => frm.set_df_property(fieldname, "read_only", 1));
			frm.set_df_property("estimated_costing", "description", __("Dari Total Biaya (RAP) di RAB Penawaran."));
			frm.add_custom_button(__("Kontrak Project"), () => frappe.set_route("Form", "Kontrak Project", frm.doc.kontrak_project), __("Buka"));
			if (frm.doc.tender) {
				frm.add_custom_button(__("Tender"), () => frappe.set_route("Form", "Tender", frm.doc.tender), __("Buka"));
			}
			if (!frm.is_new()) muat_dashboard(frm);
		},
	});

	// Project milik modul Projects ERPNext, jadi bila dibuka dari luar sidebar Konstruksi (pencarian, link, notifikasi)
	// Frappe memilih sidebar "Projects". Project yang punya kontrak selalu memakai sidebar Konstruksi.
	function pakai_sidebar_konstruksi() {
		const sidebar = frappe.app?.sidebar;
		if (sidebar && sidebar.sidebar_title !== "Konstruksi" && frappe.boot.workspace_sidebar_item?.konstruksi) {
			sidebar.setup("Konstruksi");
			sidebar.set_active_workspace_item?.();
		}
	}

	function muat_dashboard(frm) {
		frappe.call("konstruksi.konstruksi.project_konstruksi.get_dashboard", { project: frm.doc.name }).then((r) => {
			frm.$wrapper.find(".kpm-dashboard").remove();
			const $tab = frm.layout.wrapper.find(".form-tab-content").first();
			($tab.length ? $tab : frm.layout.wrapper).prepend(html_dashboard(frm, r.message || {}));
		});
	}

	function html_dashboard(frm, d) {
		const doc = frm.doc;
		const status = doc.status_proyek || "";
		const kartu = (ikon, warna, label, nilai, sub = "") => `<div class="kpr-card kpr-kartu">
			<div class="kpr-kartu-atas">
				<div class="kpr-ikon kpr-ikon-${warna}">${frappe.utils.icon(ikon, "sm")}</div>
				<div class="kpr-kartu-label">${label}</div>
			</div>
			<div class="kpr-kartu-nilai">${nilai}</div>
			<div class="kpr-kartu-sub">${sub}</div>
		</div>`;
		const bar = (v, kelas = "kpr-progress-biru") =>
			`<div class="kpr-progress ${kelas}"><div style="width: ${Math.min(Math.max(flt(v), 0), 100)}%"></div></div>`;

		// Progres di belakang rencana lebih dari 10 poin = oranye.
		const tertinggal = flt(d.progres_rencana) - flt(d.progres_aktual) > 10;
		const milestone = d.milestone
			? `<b>${esc(d.milestone.subject)}</b>${d.milestone.exp_end_date ? ` · ${tanggal(d.milestone.exp_end_date)}` : ""}`
			: `<span class="kpr-muted">${__("Belum ada milestone (tandai Task sebagai milestone)")}</span>`;

		return `<div class="kpm-dashboard kpr">
			<div class="kpr-card kpr-kepala">
				<div class="kpr-kepala-baris">
					<div class="kpr-kepala-judul">${esc(doc.project_name)}</div>
					<span class="indicator-pill ${WARNA_STATUS[status] || "gray"}">${esc(__(status))}</span>
				</div>
				<div class="kpr-kepala-sub">${[
					esc(doc.name),
					doc.customer ? esc(doc.customer) : "",
					doc.lokasi ? esc(doc.lokasi) : "",
					doc.expected_start_date ? `${tanggal(doc.expected_start_date)} – ${tanggal(doc.expected_end_date)}` : __("Menunggu SPMK"),
				]
					.filter(Boolean)
					.join('<span class="kpr-titik">•</span>')}</div>
			</div>
			<div class="kpr-kartu-baris kpm-kartu-5">
				${kartu(
					"trending-up",
					tertinggal ? "oranye" : "biru",
					__("Progres Aktual vs Rencana"),
					`${persen(d.progres_aktual)}<span>/ ${persen(d.progres_rencana)}</span>`,
					bar(d.progres_aktual, tertinggal ? "" : "kpr-progress-biru") + (tertinggal ? __("Tertinggal dari rencana") : __("Rencana linier terhadap waktu"))
				)}
				${kartu("clock", "ungu", __("Waktu Terpakai"), persen(d.waktu_terpakai), bar(d.waktu_terpakai))}
				${kartu("users", "biru", __("Tim"), `${cint(d.tim)} <span>${__("orang")}</span>`, __("Anggota di tabel Users"))}
				${kartu("list-checks", "hijau", __("Aktivitas"), cint(d.aktivitas), __("{0} selesai", [cint(d.aktivitas_selesai)]))}
				${kartu("circle-alert", cint(d.isu_terbuka) ? "oranye" : "hijau", __("Isu Terbuka"), cint(d.isu_terbuka), __("Dari menu Issue"))}
			</div>
			<div class="kpr-card kpm-milestone">
				<span class="kpr-ikon kpr-ikon-oranye">${frappe.utils.icon("flag", "sm")}</span>
				<span class="kpm-milestone-label">${__("Milestone / Termin Berikutnya")}</span>
				<span class="kpm-milestone-isi">${milestone}</span>
			</div>
		</div>`;
	}
})();
