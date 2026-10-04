// Form Project Master (Project ERPNext + field konstruksi): dashboard proyek di atas form, tombol ke kontrak,
// dan field yang berasal dari kontrak dikunci. Dimuat lewat hooks.doctype_js setelah project.js ERPNext.
(() => {
	const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
	// Field bawaan Project yang diisi dari Kontrak Project; diubah dari kontrak / tender, bukan di sini.
	const FIELD_DARI_KONTRAK = ["project_name", "customer", "expected_start_date", "expected_end_date"];
	const WARNA_STATUS = { Perencanaan: "gray", Berjalan: "blue", Pemeliharaan: "purple", Selesai: "green", Ditunda: "orange", Batal: "red" };
	const esc = (v) => frappe.utils.escape_html(v || "");
	const tanggal = (v) => {
		if (!v) return "";
		const m = moment(v);
		return `${m.format("DD")} ${BULAN[m.month()]} ${m.format("YYYY")}`;
	};
	const persen = (v) => `${format_number(flt(v), null, 1)}%`;

	frappe.ui.form.on("Project", {
		refresh(frm) {
			frm.$wrapper.find(".kpm-dashboard").remove();
			if (!frm.doc.kontrak_project) return;

			FIELD_DARI_KONTRAK.forEach((fieldname) => frm.set_df_property(fieldname, "read_only", 1));
			frm.add_custom_button(__("Kontrak Project"), () => frappe.set_route("Form", "Kontrak Project", frm.doc.kontrak_project), __("Buka"));
			if (frm.doc.tender) {
				frm.add_custom_button(__("Tender"), () => frappe.set_route("Form", "Tender", frm.doc.tender), __("Buka"));
			}
			if (!frm.is_new()) muat_dashboard(frm);
		},
	});

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
