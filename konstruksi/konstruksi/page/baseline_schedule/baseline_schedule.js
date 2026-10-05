// Baseline Schedule: snapshot jadwal rencana (Baseline Jadwal) & deviasi jadwal aktual terhadapnya.
// Data & aksi: konstruksi.konstruksi.baseline. Gaya: kelas kpbs-* (+ kptl-* untuk kartu / tabel dasar) di
// konstruksi.bundle.css. Route: /app/baseline-schedule (daftar proyek) · /app/baseline-schedule/<ID Project>.

frappe.pages["baseline-schedule"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Baseline Schedule"), single_column: true });
	wrapper.baseline = new HalamanBaseline(page);
};

frappe.pages["baseline-schedule"].on_page_show = function (wrapper) {
	wrapper.baseline?.tampil();
};

const KPBS_API = "konstruksi.konstruksi.baseline.";
const KPBS_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const kpbs_esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));
const kpbs_tgl = (s) => {
	if (!s) return "—";
	const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
	return `${String(d).padStart(2, "0")} ${KPBS_BULAN[m - 1]} ${y}`;
};
const kpbs_persen = (v, dp = 1) => `${format_number(flt(v), null, flt(v) % 1 ? dp : 0)}%`;
// Varians hari: + = mundur (merah), − = maju (hijau), 0 = sesuai.
const kpbs_var = (v) => {
	if (v == null) return '<span class="kpw-strip">—</span>';
	if (v === 0) return `<span class="kpbs-var kpbs-var-sesuai">${__("Sesuai")}</span>`;
	return v > 0
		? `<span class="kpbs-var kpbs-var-mundur">+${v} ${__("hari")}</span>`
		: `<span class="kpbs-var kpbs-var-maju">${v} ${__("hari")}</span>`;
};

class HalamanBaseline {
	constructor(page) {
		this.page = page;
		this.field_project = page.add_field({
			fieldname: "project",
			fieldtype: "Link",
			options: "Project",
			label: __("Proyek"),
			get_query: () => ({ filters: { kontrak_project: ["is", "set"] } }),
			change: () => {
				const project = this.field_project.get_value();
				if (project && project !== this.project) frappe.set_route("baseline-schedule", project);
			},
		});
		this.$body = $(`<div class="kptl kpbs"></div>`).appendTo(page.main);
		this.$body.on("click", "[data-kpbs]", (e) => this.aksi(e));
		this.$body.on("change", ".kpbs-pilih", (e) => {
			this.pilihan = e.target.value;
			try {
				localStorage.setItem(`konstruksi.baseline.${this.project}`, this.pilihan);
			} catch (err) {
				// abaikan
			}
			this.muat();
		});
	}

	tampil() {
		// Halaman modul Konstruksi: selalu dengan sidebar Konstruksi (lihat sidebar_konstruksi.bundle.js).
		const sidebar = frappe.app?.sidebar;
		if (sidebar && sidebar.sidebar_title !== "Konstruksi" && frappe.boot.workspace_sidebar_item?.konstruksi) {
			sidebar.setup("Konstruksi");
			sidebar.set_active_workspace_item?.();
		}
		const project = frappe.get_route()[1];
		return project ? this.buka(project) : this.daftar();
	}

	atur_toolbar(mode) {
		this.page.clear_primary_action();
		this.page.clear_inner_toolbar();
		this.page.clear_menu();
		if (mode !== "proyek") return;
		this.page.add_inner_button(__("Semua Proyek"), () => frappe.set_route("baseline-schedule"));
		this.page.add_inner_button(__("Project Timeline"), () => frappe.set_route("project-timeline", this.project));
		if (this.data?.bisa_buat) this.page.set_primary_action(__("Simpan Baseline Baru"), () => this.dialog_simpan(), "add");
	}

	// ---------- daftar proyek ----------

	daftar() {
		this.project = null;
		this.data = null;
		if (this.field_project.get_value()) this.field_project.set_value("");
		this.atur_toolbar("daftar");
		return frappe.xcall(KPBS_API + "get_daftar").then((rows) => {
			const kepala = `<div class="kptl-sub">${__("Pilih proyek untuk menyimpan baseline jadwal dan memantau deviasi jadwal aktual terhadapnya.")}</div>`;
			if (!rows.length) {
				this.$body.html(`${kepala}<div class="kptl-card kptl-kosong">${__("Belum ada Project Master. Buat dari Kontrak Project terlebih dahulu.")}</div>`);
				return;
			}
			const baris = rows
				.map((r) => {
					const dev = flt(r.deviasi);
					return `<tr class="kptl-baris-proyek" data-kpbs="buka" data-project="${kpbs_esc(r.name)}">
						<td class="kptl-mono">${kpbs_esc(r.name)}</td>
						<td><b>${kpbs_esc(r.project_name)}</b></td>
						<td class="kptl-potong" title="${kpbs_esc(r.customer || "")}">${kpbs_esc(r.customer || "—")}</td>
						<td class="kptl-potong">${r.jumlah_baseline ? `${kpbs_esc(r.baseline_utama)}${r.jumlah_baseline > 1 ? ` <span class="kptl-sub-kecil">+${r.jumlah_baseline - 1}</span>` : ""}` : `<span class="kpw-strip">${__("Belum ada")}</span>`}</td>
						<td class="text-right">${r.jumlah_baseline ? kpbs_persen(r.rencana) : "—"}</td>
						<td class="text-right">${r.jumlah_baseline ? kpbs_persen(r.realisasi) : "—"}</td>
						<td class="text-right ${r.jumlah_baseline && dev < 0 ? "kptl-merah" : ""}">${r.jumlah_baseline ? `${dev > 0 ? "+" : ""}${kpbs_persen(dev, 2)}` : "—"}</td>
						<td class="text-right">${r.spi != null ? format_number(r.spi, null, 2) : "—"}</td>
						<td class="text-right kptl-buka">${__("Buka")} ${frappe.utils.icon("right", "xs")}</td>
					</tr>`;
				})
				.join("");
			this.$body.html(`${kepala}<div class="kptl-card kptl-card-tabel"><div class="kptl-tabel-wrap"><table class="kptl-tabel">
				<colgroup><col style="width:130px"><col><col style="width:180px"><col style="width:200px"><col style="width:100px"><col style="width:100px"><col style="width:100px"><col style="width:70px"><col style="width:80px"></colgroup>
				<thead><tr><th>${__("ID Proyek")}</th><th>${__("Nama Proyek")}</th><th>${__("Klien")}</th><th>${__("Baseline")}</th>
					<th class="text-right">${__("Rencana")}</th><th class="text-right">${__("Realisasi")}</th><th class="text-right">${__("Deviasi")}</th><th class="text-right">SPI</th><th></th></tr></thead>
				<tbody>${baris}</tbody></table></div></div>`);
		});
	}

	// ---------- satu proyek ----------

	buka(project) {
		if (this.project !== project) {
			try {
				this.pilihan = localStorage.getItem(`konstruksi.baseline.${project}`) || null;
			} catch (e) {
				this.pilihan = null;
			}
		}
		this.project = project;
		if (this.field_project.get_value() !== project) this.field_project.set_value(project);
		return this.muat();
	}

	muat() {
		return frappe.xcall(KPBS_API + "get_baseline", { project: this.project, baseline: this.pilihan || null }).then((d) => {
			this.data = d;
			this.atur_toolbar("proyek");
			this.render();
		});
	}

	render() {
		const d = this.data;
		const p = d.project;
		const kepala = `<div class="kptl-head"><div class="kpbs-kepala">
			<a class="kptl-crumb" href="/app/project/${encodeURIComponent(p.name)}">${kpbs_esc(p.name)} · ${kpbs_esc(p.project_name)}</a>
			<span class="kpbs-sub">${__("Snapshot jadwal rencana untuk mengontrol deviasi jadwal aktual.")}</span></div></div>`;
		if (!d.daftar.length) {
			this.$body.html(`${kepala}<div class="kptl-card kptl-kosong">
				<div>${__("Belum ada baseline untuk proyek ini.")}</div>
				<div class="kptl-sub-kecil">${d.jumlah_aktivitas
					? __("Simpan jadwal {0} aktivitas saat ini sebagai Baseline Awal (Kontrak).", [d.jumlah_aktivitas])
					: __("Buat jadwal aktivitas di Task & Activity Management terlebih dahulu.")}</div>
				${d.bisa_buat && d.jumlah_aktivitas ? `<button class="btn btn-primary btn-sm" data-kpbs="simpan">${__("Simpan Baseline Awal")}</button>` : ""}
			</div>`);
			return;
		}
		const b = d.baseline;
		const r = d.ringkasan;
		const dev = flt(r.deviasi);
		const kartu = (warna, label, nilai, sub, bar) => `<div class="kptl-card kpbs-kartu kpbs-garis-${warna}">
			<div class="kpbs-kartu-label">${label}</div><div class="kpbs-kartu-nilai">${nilai}</div>
			${bar != null ? `<div class="kptl-bar-mini kpbs-bar-${warna}"><div style="width:${Math.min(flt(bar), 100)}%"></div></div>` : ""}
			<div class="kptl-sub-kecil">${sub}</div></div>`;
		const opsi = d.daftar
			.map((x) => `<option value="${kpbs_esc(x.name)}" ${x.name === b.name ? "selected" : ""}>${kpbs_esc(x.nama_baseline)} — ${kpbs_tgl(x.tanggal)}${x.name === d.utama ? ` (${__("utama")})` : ""}</option>`)
			.join("");
		const spi = r.spi;
		const warna_spi = spi == null ? "abu" : spi >= 1 ? "hijau" : spi >= 0.9 ? "oranye" : "merah";

		const baris_aktivitas = d.aktivitas
			.map((a) => {
				const ket = a.status === "baru"
					? `<span class="kpbs-var kpbs-var-baru">${__("Baru")}</span>`
					: a.status === "dihapus" ? `<span class="kpbs-var kpbs-var-hapus">${__("Dihapus")}</span>` : "";
				return `<tr class="${a.status !== "ada" ? "kpbs-baris-" + a.status : ""}">
					<td class="kptl-mono">${kpbs_esc(a.kode_wbs)}</td>
					<td class="kptl-potong"><a class="kpbs-nama" data-kpbs="task" data-name="${kpbs_esc(a.task)}" title="${kpbs_esc(a.subject)}">${kpbs_esc(a.subject)}</a> ${ket}</td>
					<td>${a.baseline_mulai ? `${kpbs_tgl(a.baseline_mulai)} – ${kpbs_tgl(a.baseline_selesai)}` : '<span class="kpw-strip">—</span>'}</td>
					<td>${a.mulai ? `${kpbs_tgl(a.mulai)} – ${kpbs_tgl(a.selesai)}` : '<span class="kpw-strip">—</span>'}</td>
					<td>${kpbs_var(a.var_mulai)}</td>
					<td>${kpbs_var(a.var_selesai)}</td>
					<td class="text-right">${a.status === "dihapus" ? "—" : kpbs_persen(a.progres)}</td>
				</tr>`;
			})
			.join("");
		const baris_ms = d.milestone
			.map((m) => `<tr class="${["baru", "dihapus"].includes(m.status) ? "kpbs-baris-" + m.status : ""}">
				<td class="kptl-potong"><b>${kpbs_esc(m.nama)}</b> ${m.status === "baru" ? `<span class="kpbs-var kpbs-var-baru">${__("Baru")}</span>` : m.status === "dihapus" ? `<span class="kpbs-var kpbs-var-hapus">${__("Dihapus")}</span>` : ""}</td>
				<td>${kpbs_tgl(m.baseline)}</td>
				<td>${kpbs_tgl(m.sekarang)}</td>
				<td>${kpbs_var(m.varians)}</td>
				<td>${m.status && !["baru", "dihapus"].includes(m.status) ? `<span class="kptl-chip">${__(m.status)}</span>` : ""}</td>
			</tr>`)
			.join("");

		this.$body.html(`${kepala}
			<div class="kptl-card kpbs-pilih-kartu">
				<div class="kpbs-pilih-kiri">
					<label class="kpbs-pilih-label">${__("Bandingkan dengan")}</label>
					<select class="form-control input-sm kpbs-pilih">${opsi}</select>
				</div>
				<div class="kpbs-info">${frappe.utils.icon("lock", "xs")} ${__("Baseline terkunci")} · ${__("{0} aktivitas, {1} milestone", [b.jumlah_aktivitas, b.jumlah_milestone])}
					${b.keterangan ? ` · ${kpbs_esc(b.keterangan)}` : ""}
					<div class="kptl-sub-kecil">${__("Disimpan {0} oleh {1}", [kpbs_tgl(b.tanggal), kpbs_esc(frappe.user.full_name(b.owner))])}${b.periode_selesai ? ` · ${__("batas selesai saat itu")} ${kpbs_tgl(b.periode_selesai)}` : ""}</div>
				</div>
				${d.bisa_hapus ? `<button class="btn btn-default btn-sm kpbs-hapus" data-kpbs="hapus" title="${__("Hapus baseline ini")}">${frappe.utils.icon("trash-2", "xs")}</button>` : ""}
			</div>
			<div class="kpbs-kartu-baris">
				${kartu("abu", __("Rencana (baseline) s.d. hari ini"), kpbs_persen(r.rencana), __("Sesuai jadwal baseline"), r.rencana)}
				${kartu("hijau", __("Realisasi"), kpbs_persen(r.realisasi), __("Dari laporan progres disetujui"), r.realisasi)}
				${kartu(dev >= 0 ? "hijau" : dev > -5 ? "oranye" : "merah", __("Deviasi"), `${dev > 0 ? "+" : ""}${kpbs_persen(dev, 2)}`, dev >= 0 ? __("Lebih cepat / sesuai rencana") : __("Terlambat dari rencana"))}
				${kartu(warna_spi, "SPI", spi == null ? "—" : format_number(spi, null, 2), __("Schedule Performance Index (≥ 1 baik)"))}
				${kartu(r.mundur ? "merah" : "hijau", __("Aktivitas Mundur"), r.mundur, __("selesai melewati baseline"))}
			</div>
			<div class="kptl-card kpbs-tabel-kartu">
				<div class="kpbs-tabel-judul">${__("Deviasi Aktivitas")}
					${r.baru || r.dihapus ? `<span class="kptl-sub-kecil">${[r.baru ? __("{0} aktivitas baru", [r.baru]) : "", r.dihapus ? __("{0} dihapus", [r.dihapus]) : ""].filter(Boolean).join(" · ")} ${__("sejak baseline")}</span>` : ""}</div>
				<div class="kptl-tabel-wrap"><table class="kptl-tabel kpbs-tabel">
					<colgroup><col style="width:70px"><col><col style="width:220px"><col style="width:220px"><col style="width:110px"><col style="width:110px"><col style="width:90px"></colgroup>
					<thead><tr><th>${__("WBS")}</th><th>${__("Aktivitas")}</th><th>${__("Baseline")}</th><th>${__("Jadwal Saat Ini")}</th>
						<th>${__("Var. Mulai")}</th><th>${__("Var. Selesai")}</th><th class="text-right">${__("Progres")}</th></tr></thead>
					<tbody>${baris_aktivitas}</tbody></table></div>
			</div>
			<div class="kptl-card kpbs-tabel-kartu">
				<div class="kpbs-tabel-judul">${__("Deviasi Milestone")}</div>
				<div class="kptl-tabel-wrap"><table class="kptl-tabel kpbs-tabel">
					<colgroup><col><col style="width:200px"><col style="width:200px"><col style="width:120px"><col style="width:120px"></colgroup>
					<thead><tr><th>${__("Milestone")}</th><th>${__("Target Baseline")}</th><th>${__("Target Saat Ini")}</th><th>${__("Varians")}</th><th>${__("Status")}</th></tr></thead>
					<tbody>${baris_ms || `<tr><td colspan="5" class="kptl-kosong">${__("Tidak ada milestone.")}</td></tr>`}</tbody></table></div>
			</div>`);
	}

	aksi(e) {
		const $el = $(e.target).closest("[data-kpbs]");
		switch ($el.attr("data-kpbs")) {
			case "buka":
				return frappe.set_route("baseline-schedule", $el.attr("data-project"));
			case "simpan":
				return this.dialog_simpan();
			case "task":
				return frappe.set_route("Form", "Task", $el.attr("data-name"));
			case "hapus": {
				const b = this.data.baseline;
				return frappe.confirm(__("Hapus baseline {0}? Perbandingan & batang baseline di Timeline yang memakai baseline ini ikut hilang.", [kpbs_esc(b.nama_baseline)]), () =>
					frappe.xcall(KPBS_API + "hapus_baseline", { project: this.project, name: b.name }).then(() => {
						frappe.show_alert({ message: __("Baseline dihapus"), indicator: "green" });
						this.pilihan = null;
						this.muat();
					})
				);
			}
		}
	}

	dialog_simpan() {
		const d = this.data;
		const pertama = !d.daftar.length;
		const dialog = new frappe.ui.Dialog({
			title: __("Simpan Baseline Baru"),
			fields: [
				{ fieldname: "info", fieldtype: "HTML", options: `<div class="kptl-sub-kecil">${__(
					"Jadwal {0} aktivitas & semua milestone saat ini disimpan sebagai snapshot terkunci. Baseline yang sudah ada tidak berubah.",
					[d.jumlah_aktivitas]
				)}</div>` },
				{ fieldname: "nama_baseline", fieldtype: "Data", label: __("Nama Baseline"), reqd: 1,
					default: pertama ? __("Baseline Awal (Kontrak)") : __("Baseline Revisi {0}", [d.daftar.length]) },
				{ fieldname: "keterangan", fieldtype: "Small Text", label: __("Keterangan"),
					default: pertama ? __("Jadwal sesuai lampiran kontrak.") : "",
					description: __("Mis. alasan revisi: Addendum No. 1 perpanjangan waktu 30 hari.") },
			],
			primary_action_label: __("Simpan Baseline"),
			primary_action: (v) =>
				frappe.xcall(KPBS_API + "simpan_baseline", { project: this.project, ...v }).then((name) => {
					dialog.hide();
					frappe.show_alert({ message: __("Baseline {0} disimpan", [v.nama_baseline]), indicator: "green" });
					// Baseline pertama otomatis jadi pembanding; revisi berikutnya tidak mengganti pembanding yang sedang
					// dipilih (bandingkan dengan revisi baru = semua deviasi 0) — pilih lewat "Bandingkan dengan".
					if (pertama) this.pilihan = name;
					this.muat();
				}),
		});
		dialog.show();
	}
}
