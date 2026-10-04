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
		["Total Biaya Personel (Gaji)", __("Gaji personel yang dibebankan ke proyek ini sesuai alokasi % penugasan."), __("Biaya Personel Bulanan (otomatis tiap tanggal 1)")],
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
				"Gross Margin (section di bawahnya) = Total Billed Amount − total biaya (timesheet, biaya personel/gaji, expense claim, pembelian, material)."
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
			if (!frm.is_new()) {
				frm.add_custom_button(__("Project Calendar"), () => frappe.set_route("project-calendar", frm.doc.name), __("Buka"));
				frm.add_custom_button(__("Work Breakdown Structure"), () => frappe.set_route("work-breakdown-structure", frm.doc.name), __("Buka"));
				frm.add_custom_button(__("Task & Activity Management"), () => frappe.set_route("task-activity-management", frm.doc.name), __("Buka"));
				frm.add_custom_button(__("Milestone & Termin"), () => frappe.set_route("milestone-dan-termin", frm.doc.name), __("Buka"));
				muat_dashboard(frm);
				muat_tim(frm);
			}
		},
	});

	// -----------------------------------------------------------------------
	// Tab Tim Proyek: ringkasan, kebutuhan personel (dari Template Kebutuhan Personel), daftar penugasan.

	const TIM_METHOD = "konstruksi.konstruksi.tim_proyek";
	const SKK_BERMASALAH = ["Belum Ada", "Kedaluwarsa", "Habis Saat Bertugas"];

	function muat_tim(frm) {
		const field = frm.fields_dict.tim_html;
		if (!field) return;
		frappe.call(`${TIM_METHOD}.get_tim`, { project: frm.doc.name }).then((r) => {
			field.$wrapper.html(html_tim(frm, r.message || {}));
			pasang_aksi_tim(frm, field.$wrapper);
		});
	}

	function html_tim(frm, d) {
		const bisa = Boolean(frm.perm?.[0]?.write);
		const persen_wajib = d.wajib_total ? Math.round((d.wajib_terisi / d.wajib_total) * 100) : 100;
		const lengkap = d.wajib_terisi >= d.wajib_total;
		const kartu = (ikon, warna, label, nilai, sub) => `<div class="kpr-card kpr-kartu">
			<div class="kpr-kartu-atas"><div class="kpr-ikon kpr-ikon-${warna}">${frappe.utils.icon(ikon, "sm")}</div>
				<div class="kpr-kartu-label">${label}</div></div>
			<div class="kpr-kartu-nilai">${nilai}</div><div class="kpr-kartu-sub">${sub}</div></div>`;

		const skk_chip = (status) =>
			SKK_BERMASALAH.includes(status)
				? `<span class="kpt-skk" title="${esc(__("SKK {0}", [__(status)]))}">${frappe.utils.icon("circle-alert", "xs")} SKK</span>`
				: "";
		const perlu = (d.perlu || [])
			.map(
				(k) => `<div class="kpt-keb" title="${esc(k.tugas)}">
					<span class="kpt-titik ${k.wajib ? "kpt-titik-wajib" : ""}"></span>
					<div class="kpt-keb-info"><b>${esc(__(k.jabatan))}</b>
						<span>${k.wajib ? __("wajib") : __("disarankan")}${k.kurang > 1 ? ` · ${__("kurang {0} orang", [k.kurang])}` : ""}</span></div>
					${bisa ? `<button class="btn btn-xs btn-default kpt-tugaskan" data-jabatan="${esc(k.jabatan)}">${frappe.utils.icon("add", "xs")} ${__("Tugaskan")}</button>` : ""}
				</div>`
			)
			.join("");
		const terisi = (d.terisi || [])
			.map(
				(k) => `<div class="kpt-keb" title="${esc(k.tugas)}">
					<span class="kpt-centang">${frappe.utils.icon("check", "xs")}</span>
					<div class="kpt-keb-info"><b>${esc(__(k.jabatan))}</b><span>${k.personel.map((p) => esc(p.nama)).join(", ")}</span></div>
					${k.personel.map((p) => skk_chip(p.status_skk)).join("")}
				</div>`
			)
			.join("");

		const baris = (d.penugasan || [])
			.map(
				(p) => `<tr>
					<td><a href="/app/employee/${encodeURIComponent(p.employee)}"><b>${esc(p.nama_personel)}</b></a></td>
					<td>${esc(__(p.jabatan))} ${skk_chip(p.status_skk)}</td>
					<td>${
						p.user_id && !["Akun nonaktif", "Role diatur manual"].includes(p.akses)
							? p.akses.split(", ").map((r) => `<span class="kpt-pill" title="${esc(p.user_id)}">${esc(r)}</span>`).join(" ")
							: `<span class="text-muted" title="${esc(p.user_id || "")}">${esc(__(p.akses || "Belum punya akun"))}</span>`
					}</td>
					<td>${esc(p.telepon || "")}${p.email ? `<div class="text-muted small">${esc(p.email)}</div>` : ""}${!p.telepon && !p.email ? '<span class="text-muted">—</span>' : ""}</td>
					<td>${tanggal(p.tanggal_mulai)} – ${p.tanggal_selesai ? tanggal(p.tanggal_selesai) : __("selesai proyek")}</td>
					<td class="text-right">${format_number(flt(p.alokasi), null, 0)}%</td>
					<td class="text-right">${p.biaya && flt(p.biaya.jam) ? format_number(flt(p.biaya.jam), null, 1) : '<span class="text-muted">—</span>'}</td>
					<td class="text-right">${p.biaya && flt(p.biaya.biaya_timesheet) ? format_currency(p.biaya.biaya_timesheet, "IDR", 0) : '<span class="text-muted">—</span>'}</td>
					<td class="text-right">${p.biaya && flt(p.biaya.klaim) ? format_currency(p.biaya.klaim, "IDR", 0) : '<span class="text-muted">—</span>'}</td>
					<td class="text-right kpt-aksi">${html_aksi(p, bisa)}</td>
				</tr>`
			)
			.join("");

		return `<div class="kpr kpt">
			<div class="kpr-kartu-baris kpr-kartu-3">
				${kartu("users", "biru", __("Jumlah Personel"), cint(d.jumlah_personel), __("orang ditugaskan"))}
				${kartu("clock", "ungu", __("Full-Time Equivalent"), format_number(flt(d.fte), null, 1), __("total alokasi / 100%"))}
				${kartu(
					"clipboard-check",
					lengkap ? "hijau" : "oranye",
					__("Jabatan Wajib Terisi"),
					`${cint(d.wajib_terisi)}<span> ${__("dari")} ${cint(d.wajib_total)}</span>`,
					`<div class="kpr-progress ${lengkap ? "kpr-progress-ok" : ""}"><div style="width: ${persen_wajib}%"></div></div>`
				)}
			</div>
			<div class="kpr-card">
				<div class="kpr-judul">${__("Kebutuhan Personel")}
					<a class="btn btn-xs btn-default kpt-atur" href="/app/template-kebutuhan-personel">${frappe.utils.icon("setting-gear", "xs")} ${__("Atur kebutuhan")}</a>
				</div>
				<div class="kpt-keb-grid">
					<div><div class="kpt-keb-judul">${__("Perlu diisi")} <span>${(d.perlu || []).length}</span></div>
						${perlu || `<div class="kpr-muted">${__("Semua kebutuhan sudah terisi.")}</div>`}</div>
					<div><div class="kpt-keb-judul">${__("Sudah terisi")} <span>${(d.terisi || []).length}</span></div>
						${terisi || `<div class="kpr-muted">${__("Belum ada personel ditugaskan.")}</div>`}</div>
				</div>
				<div class="kpr-catatan">${__("Kebutuhan dari Template Kebutuhan Personel sesuai jenis & nilai proyek. Arahkan kursor ke jabatan untuk melihat tugasnya.")}</div>
			</div>
			<div class="kpr-card kpt-tabel-card">
				<div class="kpr-judul">${__("Personel Ditugaskan")}
					${bisa ? `<button class="btn btn-sm btn-primary kpt-tugaskan kpt-tugaskan-utama">${frappe.utils.icon("add", "xs")} ${__("Tugaskan Personel")}</button>` : ""}
				</div>
				${
					baris
						? `<div class="kp-tabel-wrap"><table class="kp-tabel kpt-tabel">
							<thead><tr><th>${__("Nama")}</th><th>${__("Jabatan")}</th><th>${__("Akses Sistem")}</th><th>${__("Kontak")}</th>
								<th>${__("Periode Tugas")}</th><th class="text-right">${__("Alokasi")}</th>
								<th class="text-right" title="${__("Dari Timesheet yang sudah submit")}">${__("Jam Kerja")}</th>
								<th class="text-right" title="${__("Dari Timesheet yang sudah submit")}">${__("Biaya Timesheet")}</th>
								<th class="text-right" title="${__("Dari Expense Claim yang sudah submit")}">${__("Expense Claim")}</th><th></th></tr></thead>
							<tbody>${baris}</tbody></table></div>`
						: `<div class="kpr-muted">${__("Belum ada personel. Klik Tugaskan Personel atau tombol Tugaskan di kebutuhan.")}</div>`
				}
			</div>
		</div>`;
	}

	// Satu tombol "Aksi" per baris personel, dikelompokkan Biaya & Penugasan; isinya sesuai hak user.
	function html_aksi(p, bisa) {
		const item = (kelas, ikon, label, attr = "") =>
			`<a class="dropdown-item kpt-aksi-item ${kelas}" ${attr}>
				<span class="kpt-aksi-ikon">${frappe.utils.icon(ikon, "sm")}</span><span>${label}</span></a>`;
		const judul = (teks) => `<div class="kpt-aksi-judul">${teks}</div>`;

		const biaya = [
			frappe.model.can_create("Timesheet") &&
				item("kpt-catat-jam", "clock", __("Catat Jam Kerja"), `data-employee="${esc(p.employee)}" data-activity="${esc(p.activity_type || "")}"`),
			frappe.model.can_create("Expense Claim") &&
				item("kpt-klaim", "wallet", __("Ajukan Expense Claim"), `data-employee="${esc(p.employee)}"`),
		].filter(Boolean);
		const penugasan = bisa
			? [
					item("", "pencil", __("Ubah Penugasan"), `href="/app/penugasan-personel/${encodeURIComponent(p.name)}"`),
					item("kpt-hapus kpt-aksi-bahaya", "trash-2", __("Hapus dari Tim"), `data-name="${esc(p.name)}" data-nama="${esc(p.nama_personel)}"`),
			  ]
			: [];
		if (!biaya.length && !penugasan.length) return "";

		const menu = [
			biaya.length ? judul(__("Biaya")) + biaya.join("") : "",
			biaya.length && penugasan.length ? '<div class="dropdown-divider"></div>' : "",
			penugasan.length ? judul(__("Penugasan")) + penugasan.join("") : "",
		].join("");
		return `<div class="dropdown kpt-aksi-dropdown">
			<button class="btn btn-xs kpt-aksi-btn" data-toggle="dropdown">${__("Aksi")} ${frappe.utils.icon("down", "xs")}</button>
			<div class="dropdown-menu dropdown-menu-right kpt-aksi-menu">${menu}</div>
		</div>`;
	}

	function pasang_aksi_tim(frm, $w) {
		// Pintasan biaya personel: Timesheet / Expense Claim baru dengan personel & proyek sudah terisi.
		$w.find(".kpt-catat-jam").on("click", function () {
			const employee = $(this).attr("data-employee");
			const activity_type = $(this).attr("data-activity");
			frappe.new_doc("Timesheet", { employee, company: frm.doc.company }, (doc) => {
				const row = frappe.model.add_child(doc, "Timesheet Detail", "time_logs");
				row.project = frm.doc.name;
				row.activity_type = activity_type || null;
				row.from_time = frappe.datetime.now_datetime();
			});
		});
		$w.find(".kpt-klaim").on("click", function () {
			frappe.new_doc("Expense Claim", { employee: $(this).attr("data-employee"), project: frm.doc.name, company: frm.doc.company });
		});
		$w.find(".kpt-tugaskan").on("click", function () {
			dialog_tugaskan(frm, $(this).attr("data-jabatan"));
		});
		$w.find(".kpt-hapus").on("click", function () {
			const name = $(this).attr("data-name");
			frappe.confirm(__("Hapus penugasan <b>{0}</b> dari proyek ini?", [esc($(this).attr("data-nama"))]), () =>
				frappe.db.delete_doc("Penugasan Personel", name).then(() => muat_tim(frm))
			);
		});
	}

	function dialog_tugaskan(frm, jabatan) {
		const d = new frappe.ui.Dialog({
			title: __("Tugaskan Personel"),
			fields: [
				{ fieldname: "employee", fieldtype: "Link", options: "Employee", label: __("Personel"), reqd: 1, ignore_user_permissions: 1,
					get_query: () => ({ query: `${TIM_METHOD}.cari_personel` }),
					// Jabatan diisi dari designation personel, kecuali sudah ditentukan (mis. dari tombol Tugaskan kebutuhan).
					onchange() {
						const employee = d.get_value("employee");
						if (!employee) return;
						frappe.db.get_value("Employee", employee, "designation").then((r) => {
							const designation = r.message?.designation;
							const sekarang = d.get_value("jabatan");
							if (designation && (!sekarang || sekarang === d.__jabatan_otomatis)) {
								d.__jabatan_otomatis = designation;
								d.set_value("jabatan", designation);
							}
						});
					},
					description: __("Belum ada di daftar? Tambahkan dulu di Data Personel.") },
				{ fieldname: "jabatan", fieldtype: "Link", options: "Designation", label: __("Jabatan di Proyek"), reqd: 1, default: jabatan },
				{ fieldname: "kolom", fieldtype: "Column Break" },
				{ fieldname: "tanggal_mulai", fieldtype: "Date", label: __("Mulai Tugas"), reqd: 1,
					default: frm.doc.expected_start_date || frappe.datetime.get_today() },
				{ fieldname: "tanggal_selesai", fieldtype: "Date", label: __("Selesai Tugas"), default: frm.doc.expected_end_date,
					description: __("Kosongkan bila sampai proyek selesai.") },
				{ fieldname: "alokasi", fieldtype: "Percent", label: __("Alokasi (%)"), default: 100, reqd: 1 },
			],
			primary_action_label: __("Tugaskan"),
			primary_action(values) {
				frappe
					.call({ method: `${TIM_METHOD}.tugaskan`, args: { project: frm.doc.name, ...values }, freeze: true })
					.then(() => {
						d.hide();
						frappe.show_alert({ message: __("Personel ditugaskan."), indicator: "green" });
						muat_tim(frm);
					});
			},
		});
		d.show();
	}

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
