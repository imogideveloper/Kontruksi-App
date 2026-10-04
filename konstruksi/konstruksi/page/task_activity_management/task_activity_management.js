// Task & Activity Management: aktivitas lapangan (Task) per item WBS, penanggung jawab, jadwal (hari kerja dari
// Project Calendar), progres dari Laporan Progres yang disetujui. Data & aksi: konstruksi.konstruksi.aktivitas.
// Gaya: kelas kpa-* (+ kpw-*, kpr-*, kpt-aksi-*) di konstruksi.bundle.css.
// Route: /app/task-activity-management (daftar proyek) · /app/task-activity-management/<ID Project>.

frappe.pages["task-activity-management"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Task & Activity Management"), single_column: true });
	wrapper.aktivitas = new HalamanAktivitas(page);
};

frappe.pages["task-activity-management"].on_page_show = function (wrapper) {
	wrapper.aktivitas?.tampil();
};

const KPA_API = "konstruksi.konstruksi.aktivitas.";
const KPA_PRIORITAS = { Low: "Rendah", Medium: "Sedang", High: "Tinggi", Urgent: "Kritis" };
const KPA_STATUS_WARNA = { "Belum Mulai": "abu", Berjalan: "biru", Terlambat: "merah", Selesai: "hijau", "Menunggu Review": "oranye", Dibatalkan: "abu" };
const KPA_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const kpa_esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));
const kpa_tgl = (v) => {
	if (!v) return "";
	const [y, m, d] = String(v).slice(0, 10).split("-").map(Number);
	return `${String(d).padStart(2, "0")} ${KPA_BULAN[m - 1]} ${y}`;
};
const kpa_angka = (v) => format_number(flt(v), null, flt(v) % 1 ? 2 : 0);
const kpa_persen = (v, d = 1) => `${format_number(flt(v), null, flt(v) % 1 ? d : 0)}%`;
const kpa_hari_kerja = (dari, sampai, libur) => {
	if (!dari || !sampai) return 0;
	let n = 0;
	const [y1, m1, d1] = String(dari).slice(0, 10).split("-").map(Number);
	const [y2, m2, d2] = String(sampai).slice(0, 10).split("-").map(Number);
	const akhir = new Date(y2, m2 - 1, d2);
	for (let t = new Date(y1, m1 - 1, d1); t <= akhir; t.setDate(t.getDate() + 1)) {
		const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
		if (!libur.has(iso)) n++;
	}
	return n;
};

class HalamanAktivitas {
	constructor(page) {
		this.page = page;
		this.tab = "aktivitas";
		this.filter = { cari: "", wbs: "", status: "" };
		this.filter_laporan = "";
		this.field_project = page.add_field({
			fieldname: "project",
			fieldtype: "Link",
			options: "Project",
			label: __("Proyek"),
			get_query: () => ({ filters: { kontrak_project: ["is", "set"] } }),
			change: () => {
				const project = this.field_project.get_value();
				if (project && project !== this.project) frappe.set_route("task-activity-management", project);
			},
		});
		this.$body = $(`<div class="kpr kpw kpa"></div>`).appendTo(page.main);
		this.$body.on("click", "[data-kpa]", (e) => this.aksi(e));
		this.$body.on("input", ".kpa-cari", frappe.utils.debounce((e) => {
			this.filter.cari = e.target.value;
			this.render_tabel_aktivitas();
		}, 200));
		this.$body.on("change", ".kpa-filter-wbs, .kpa-filter-status, .kpa-filter-laporan", (e) => {
			const $s = $(e.target);
			if ($s.hasClass("kpa-filter-wbs")) this.filter.wbs = $s.val();
			if ($s.hasClass("kpa-filter-status")) this.filter.status = $s.val();
			if ($s.hasClass("kpa-filter-laporan")) {
				this.filter_laporan = $s.val();
				return this.muat_laporan();
			}
			this.render_tabel_aktivitas();
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
		if (mode !== "proyek") return;
		this.page.add_inner_button(__("Semua Proyek"), () => frappe.set_route("task-activity-management"));
		this.page.add_inner_button(__("Work Breakdown Structure"), () => frappe.set_route("work-breakdown-structure", this.project));
		this.page.add_inner_button(__("Project Calendar"), () => frappe.set_route("project-calendar", this.project));
		if (this.data?.bisa_buat) this.page.set_primary_action(__("Aktivitas Baru"), () => this.dialog_aktivitas({}), "add");
	}

	// ---------- daftar proyek ----------

	daftar() {
		this.project = null;
		this.data = null;
		if (this.field_project.get_value()) this.field_project.set_value("");
		this.atur_toolbar("daftar");
		return frappe.xcall(KPA_API + "get_daftar").then((rows) => {
			const kepala = `<div class="kpw-head"><div class="kpw-sub">${__("Pilih proyek untuk mengelola aktivitas lapangan, penanggung jawab, jadwal, dan laporan progres.")}</div></div>`;
			if (!rows.length) {
				this.$body.html(`${kepala}<div class="kpr-card kpr-kosong">${__("Belum ada Project Master. Buat dari Kontrak Project terlebih dahulu.")}</div>`);
				return;
			}
			const baris = rows
				.map((r) => {
					const p = Math.min(flt(r.progres), 100);
					return `<tr class="kpw-baris-proyek" data-kpa="buka" data-project="${kpa_esc(r.name)}">
						<td><div class="kpw-proyek-nama">${kpa_esc(r.project_name)}</div><div class="kpw-proyek-id">${kpa_esc(r.name)}${r.customer ? ` · ${kpa_esc(r.customer)}` : ""}</div></td>
						<td>${r.status_proyek ? `<span class="kpw-badge">${kpa_esc(__(r.status_proyek))}</span>` : ""}</td>
						<td class="text-right">${r.jumlah}</td>
						<td class="text-right">${r.berjalan}</td>
						<td class="text-right ${r.terlambat ? "kpa-merah" : ""}">${r.terlambat}</td>
						<td class="text-right">${r.selesai} / ${r.jumlah}</td>
						<td class="text-right ${r.menunggu ? "kpa-oranye" : ""}">${r.menunggu}</td>
						<td><div class="kpw-progres"><div class="kpr-progress ${p >= 100 ? "kpr-progress-ok" : "kpr-progress-biru"}"><div style="width:${p}%"></div></div><span>${kpa_persen(p, 1)}</span></div></td>
						<td class="text-right"><span class="kpw-buka">${__("Buka")} ${frappe.utils.icon("right", "xs")}</span></td>
					</tr>`;
				})
				.join("");
			this.$body.html(`${kepala}<div class="kpr-card kpw-tabel-card"><div class="kpw-tabel-wrap">
				<table class="kpw-tabel kpw-tabel-daftar">
					<colgroup><col><col style="width:120px"><col style="width:90px"><col style="width:90px"><col style="width:90px"><col style="width:90px"><col style="width:110px"><col style="width:150px"><col style="width:80px"></colgroup>
					<thead><tr><th>${__("Proyek")}</th><th>${__("Status")}</th><th class="text-right">${__("Aktivitas")}</th><th class="text-right">${__("Berjalan")}</th>
						<th class="text-right">${__("Terlambat")}</th><th class="text-right">${__("Selesai")}</th><th class="text-right">${__("Lap. Menunggu")}</th><th>${__("Progres")}</th><th></th></tr></thead>
					<tbody>${baris}</tbody>
				</table></div></div>`);
		});
	}

	// ---------- satu proyek ----------

	buka(project) {
		if (this.project !== project) {
			this.filter = { cari: "", wbs: "", status: "" };
			this.tab = "aktivitas";
		}
		this.project = project;
		if (this.field_project.get_value() !== project) this.field_project.set_value(project);
		return this.muat();
	}

	muat() {
		return frappe.xcall(KPA_API + "get_aktivitas", { project: this.project }).then((data) => {
			this.data = data;
			this.libur = new Set(data.libur);
			this.atur_toolbar("proyek");
			this.render();
		});
	}

	call(method, args, pesan) {
		return frappe.xcall(KPA_API + method, { project: this.project, ...args }).then((r) => {
			if (pesan) frappe.show_alert({ message: pesan, indicator: "green" });
			return this.muat().then(() => r);
		});
	}

	render() {
		const d = this.data;
		const p = d.project;
		const akt = d.aktivitas;
		const hitung = (s) => akt.filter((t) => t.status_tampil === s).length;
		const kartu = (warna, label, nilai, sub) => `<div class="kpr-card kpw-kartu">
			<div class="kpw-kartu-label">${label}</div><div class="kpw-kartu-nilai">${nilai}</div>
			<div class="kpw-kartu-sub">${sub}</div><span class="kpw-kartu-garis kpw-garis-${warna}"></span></div>`;
		const terlambat = hitung("Terlambat");
		this.$body.html(`
			<div class="kpw-head">
				<a class="kpw-crumb" href="/app/project/${encodeURIComponent(p.name)}">${kpa_esc(p.name)} · ${kpa_esc(p.project_name)}</a>
				<div class="kpw-sub">${__("Aktivitas lapangan, penanggung jawab, jadwal, dan progres harian.")}</div>
			</div>
			<div class="kpw-kartu-baris">
				${kartu("biru", __("Progres Proyek"), kpa_persen(d.progres, 1), __("Tertimbang bobot WBS, dari laporan disetujui"))}
				${kartu("biru", __("Berjalan"), hitung("Berjalan"), __("Aktivitas sedang dikerjakan"))}
				${kartu(terlambat ? "oranye" : "abu", __("Terlambat"), terlambat, terlambat ? __("Melewati tanggal selesai") : __("Tidak ada"))}
				${kartu("hijau", __("Selesai"), `${hitung("Selesai")} / ${akt.length}`, __("Aktivitas selesai"))}
				${kartu(d.laporan_menunggu ? "oranye" : "abu", __("Laporan Menunggu"), d.laporan_menunggu, d.laporan_menunggu ? __("Perlu disetujui") : __("Tidak ada"))}
			</div>
			<div class="kpa-tabs">
				<a class="kpa-tab ${this.tab === "aktivitas" ? "kpa-tab-aktif" : ""}" data-kpa="tab" data-tab="aktivitas">${__("Aktivitas")}</a>
				<a class="kpa-tab ${this.tab === "laporan" ? "kpa-tab-aktif" : ""}" data-kpa="tab" data-tab="laporan">${__("Laporan Progres")}
					${d.laporan_menunggu ? `<span class="kpa-tab-badge">${d.laporan_menunggu}</span>` : ""}</a>
			</div>
			<div class="kpa-isi"></div>`);
		this.tab === "laporan" ? this.render_laporan() : this.render_aktivitas();
	}

	render_aktivitas() {
		const d = this.data;
		const opsi_wbs = d.wbs
			.filter((w) => !w.is_group)
			.map((w) => `<option value="${kpa_esc(w.name)}" ${this.filter.wbs === w.name ? "selected" : ""}>${kpa_esc(w.kode)} · ${kpa_esc(w.uraian)}</option>`)
			.join("");
		const opsi_status = ["Belum Mulai", "Berjalan", "Terlambat", "Selesai"]
			.map((s) => `<option value="${s}" ${this.filter.status === s ? "selected" : ""}>${__(s)}</option>`)
			.join("");
		this.$body.find(".kpa-isi").html(`<div class="kpr-card kpw-tabel-card">
			<div class="kpw-toolbar kpa-toolbar">
				<input type="search" class="form-control input-sm kpa-cari" placeholder="${__("Cari aktivitas / PJ...")}" value="${kpa_esc(this.filter.cari)}">
				<select class="form-control input-sm kpa-filter-wbs"><option value="">${__("Semua WBS")}</option>${opsi_wbs}</select>
				<select class="form-control input-sm kpa-filter-status"><option value="">${__("Semua status")}</option>${opsi_status}</select>
			</div>
			<div class="kpw-tabel-wrap"><table class="kpw-tabel kpa-tabel">
				<colgroup><col style="width:60px"><col><col style="width:150px"><col style="width:190px"><col style="width:70px">
					<col style="width:90px"><col style="width:190px"><col style="width:110px"><col style="width:150px"></colgroup>
				<thead><tr><th>${__("WBS")}</th><th>${__("Aktivitas")}</th><th>${__("PJ")}</th><th>${__("Jadwal")}</th><th class="text-right">${__("Durasi")}</th>
					<th>${__("Prioritas")}</th><th>${__("Progres")}</th><th>${__("Status")}</th><th></th></tr></thead>
				<tbody class="kpa-tbody"></tbody>
			</table></div>
		</div>`);
		this.render_tabel_aktivitas();
	}

	render_tabel_aktivitas() {
		const d = this.data;
		const cari = this.filter.cari.toLowerCase();
		const rows = d.aktivitas.filter(
			(t) =>
				(!this.filter.wbs || t.wbs_item === this.filter.wbs) &&
				(!this.filter.status || t.status_tampil === this.filter.status) &&
				(!cari || `${t.subject} ${t.pj_nama || ""} ${t.pj_jabatan || ""} ${t.kode_wbs}`.toLowerCase().includes(cari))
		);
		const $tbody = this.$body.find(".kpa-tbody");
		if (!rows.length) {
			$tbody.html(`<tr><td colspan="9" class="kpa-kosong">${
				d.aktivitas.length ? __("Tidak ada aktivitas yang cocok dengan filter.") : __("Belum ada aktivitas. Klik Aktivitas Baru untuk menambahkan.")
			}</td></tr>`);
			return;
		}
		$tbody.html(
			rows
				.map((t) => {
					const progres = Math.min(flt(t.progress), 100);
					const ket_progres =
						t.metode_progres === "Tahapan"
							? __("{0} / {1} tahap selesai", [t.tahapan.filter((x) => x.selesai).length, t.tahapan.length])
							: `${kpa_angka(t.realisasi_volume)} / ${kpa_angka(t.target_volume)} ${kpa_esc(t.satuan || "")}`;
					const setelah = t.predecessor.length
						? `<div class="kpa-sub ${t.predecessor.some((x) => x.mendahului) ? "kpa-oranye" : ""}">${__("Setelah")}: ${t.predecessor
								.map((x) => kpa_esc(x.subject))
								.join(", ")}${t.predecessor.some((x) => x.mendahului) ? ` (${__("mulai sebelum predecessor selesai")})` : ""}</div>`
						: "";
					const warna = KPA_STATUS_WARNA[t.status_tampil] || "abu";
					const prio = KPA_PRIORITAS[t.priority] || t.priority || "";
					const selesai = t.status === "Completed";
					return `<tr>
						<td class="kpw-kode">${kpa_esc(t.kode_wbs)}</td>
						<td class="kpa-wrap"><a class="kpa-judul" data-kpa="ubah" data-name="${kpa_esc(t.name)}">${kpa_esc(t.subject)}</a>${setelah}
							${t.laporan_menunggu ? `<div class="kpa-sub kpa-oranye">${__("{0} laporan menunggu persetujuan", [t.laporan_menunggu])}</div>` : ""}</td>
						<td class="kpa-wrap">${t.pj ? `<div>${kpa_esc(t.pj_nama)}</div><div class="kpa-sub">${kpa_esc(t.pj_jabatan || "")}</div>` : '<span class="kpw-strip">—</span>'}</td>
						<td>${kpa_tgl(t.exp_start_date)} – ${kpa_tgl(t.exp_end_date)}</td>
						<td class="text-right">${t.durasi_hk ? `${t.durasi_hk} hk` : ""}</td>
						<td><span class="kpa-prio kpa-prio-${kpa_esc(t.priority || "")}">${__(prio)}</span></td>
						<td><div class="kpw-progres"><div class="kpr-progress ${progres >= 100 ? "kpr-progress-ok" : "kpr-progress-biru"}"><div style="width:${progres}%"></div></div><span>${kpa_persen(progres, 1)}</span></div>
							<div class="kpa-sub">${ket_progres}</div></td>
						<td><span class="kpa-status kpa-status-${warna}">${__(t.status_tampil)}</span></td>
						<td class="text-right kpt-aksi">
							<button class="btn btn-xs btn-default kpa-lapor" data-kpa="lapor" data-name="${kpa_esc(t.name)}" ${selesai ? "disabled" : ""}>${frappe.utils.icon("clipboard-check", "xs")} ${__("Lapor")}</button>
							${this.html_aksi(t)}
						</td>
					</tr>`;
				})
				.join("")
		);
	}

	html_aksi(t) {
		const d = this.data;
		const item = (aksi, ikon, label, kelas = "") =>
			`<a class="dropdown-item kpt-aksi-item ${kelas}" data-kpa="${aksi}" data-name="${kpa_esc(t.name)}">
				<span class="kpt-aksi-ikon">${frappe.utils.icon(ikon, "sm")}</span><span>${label}</span></a>`;
		const menu = [];
		if (d.bisa_ubah) menu.push(item("ubah", "pencil", __("Ubah Aktivitas")));
		menu.push(item("lihat-laporan", "list-checks", __("Lihat Laporan")));
		menu.push(item("form", "external-link", __("Buka Form Task")));
		if (d.bisa_hapus) menu.push('<div class="dropdown-divider"></div>', item("hapus", "trash-2", __("Hapus Aktivitas"), "kpt-aksi-bahaya"));
		return `<div class="dropdown kpt-aksi-dropdown">
			<button class="btn btn-xs kpt-aksi-btn" data-toggle="dropdown">${__("Aksi")} ${frappe.utils.icon("down", "xs")}</button>
			<div class="dropdown-menu dropdown-menu-right kpt-aksi-menu">${menu.join("")}</div>
		</div>`;
	}

	// ---------- tab laporan ----------

	render_laporan() {
		const opsi = ["Menunggu", "Disetujui", "Ditolak"]
			.map((s) => `<option value="${s}" ${this.filter_laporan === s ? "selected" : ""}>${__(s)}</option>`)
			.join("");
		this.$body.find(".kpa-isi").html(`<div class="kpr-card kpw-tabel-card">
			<div class="kpw-toolbar kpa-toolbar">
				<select class="form-control input-sm kpa-filter-laporan"><option value="">${__("Semua status")}</option>${opsi}</select>
				<span class="kpw-petunjuk">${__("Hanya laporan yang disetujui yang menambah progres aktivitas.")}</span>
			</div>
			<div class="kpw-tabel-wrap"><table class="kpw-tabel kpa-tabel">
				<colgroup><col style="width:110px"><col><col style="width:160px"><col style="width:170px"><col><col style="width:110px"><col style="width:190px"></colgroup>
				<thead><tr><th>${__("Tanggal")}</th><th>${__("Aktivitas")}</th><th>${__("Pelapor")}</th><th>${__("Progres Dilaporkan")}</th>
					<th>${__("Catatan")}</th><th>${__("Status")}</th><th></th></tr></thead>
				<tbody class="kpa-tbody-laporan"><tr><td colspan="7" class="kpa-kosong">${__("Memuat...")}</td></tr></tbody>
			</table></div>
		</div>`);
		this.muat_laporan();
	}

	muat_laporan() {
		return frappe.xcall(KPA_API + "get_laporan", { project: this.project, status: this.filter_laporan || null }).then((rows) => {
			this.laporan = rows;
			const d = this.data;
			const warna = { Menunggu: "oranye", Disetujui: "hijau", Ditolak: "merah" };
			const html = rows.length
				? rows
						.map((r) => {
							const isi = r.metode === "Tahapan" ? r.tahap.map(kpa_esc).join(", ") : `${kpa_angka(r.volume)} ${kpa_esc(r.satuan || "")}`;
							const tombol = [];
							if (r.status === "Menunggu" && d.bisa_setujui) {
								tombol.push(`<button class="btn btn-xs btn-primary" data-kpa="setujui" data-name="${kpa_esc(r.name)}">${__("Setujui")}</button>`);
								tombol.push(`<button class="btn btn-xs btn-default" data-kpa="tolak" data-name="${kpa_esc(r.name)}">${__("Tolak")}</button>`);
							}
							if (r.status !== "Disetujui" || d.bisa_setujui) {
								tombol.push(`<button class="btn btn-xs btn-default kpa-ikon-btn" data-kpa="hapus-laporan" data-name="${kpa_esc(r.name)}" title="${__("Hapus")}">${frappe.utils.icon("delete", "xs")}</button>`);
							}
							return `<tr>
								<td>${kpa_tgl(r.tanggal)}</td>
								<td class="kpa-wrap"><a class="kpa-judul" href="/app/laporan-progres/${encodeURIComponent(r.name)}">${kpa_esc(r.aktivitas)}</a><div class="kpa-sub">${kpa_esc(r.name)}</div></td>
								<td class="kpa-wrap">${kpa_esc(r.nama_pelapor || r.owner)}</td>
								<td class="kpa-wrap"><b>${isi}</b></td>
								<td class="kpa-wrap">${kpa_esc(r.catatan || "")}${r.kendala ? `<div class="kpa-sub kpa-oranye">${__("Kendala")}: ${kpa_esc(r.kendala)}</div>` : ""}
									${r.alasan_tolak ? `<div class="kpa-sub kpa-merah">${__("Ditolak")}: ${kpa_esc(r.alasan_tolak)}</div>` : ""}
									${r.foto ? `<a class="kpa-sub" href="${encodeURI(r.foto)}" target="_blank">${frappe.utils.icon("image", "xs")} ${__("Foto")}</a>` : ""}</td>
								<td><span class="kpa-status kpa-status-${warna[r.status]}">${__(r.status)}</span></td>
								<td class="text-right kpa-tombol">${tombol.join(" ")}</td>
							</tr>`;
						})
						.join("")
				: `<tr><td colspan="7" class="kpa-kosong">${__("Belum ada laporan progres.")}</td></tr>`;
			this.$body.find(".kpa-tbody-laporan").html(html);
		});
	}

	// ---------- aksi ----------

	aksi(e) {
		const $el = $(e.target).closest("[data-kpa]");
		const jenis = $el.attr("data-kpa");
		const name = $el.attr("data-name");
		const t = this.data?.aktivitas.find((x) => x.name === name);
		switch (jenis) {
			case "buka":
				return frappe.set_route("task-activity-management", $el.attr("data-project"));
			case "tab":
				this.tab = $el.attr("data-tab");
				return this.render();
			case "ubah":
				return this.dialog_aktivitas(t);
			case "lapor":
				return this.dialog_lapor(t);
			case "lihat-laporan":
				this.tab = "laporan";
				this.filter_laporan = "";
				this.render();
				return;
			case "form":
				return frappe.set_route("Form", "Task", name);
			case "hapus":
				return frappe.confirm(__("Hapus aktivitas {0}?", [kpa_esc(t.subject)]), () => this.call("hapus_aktivitas", { name }, __("Aktivitas dihapus")));
			case "setujui":
				return this.call("setujui_laporan", { name }, __("Laporan disetujui")).then(() => this.tab === "laporan" && this.render());
			case "tolak":
				return frappe.prompt(
					{ fieldname: "alasan", fieldtype: "Small Text", label: __("Alasan ditolak"), reqd: 1 },
					(v) => this.call("tolak_laporan", { name, alasan: v.alasan }, __("Laporan ditolak")),
					__("Tolak Laporan"),
					__("Tolak")
				);
			case "hapus-laporan":
				return frappe.confirm(__("Hapus laporan {0}?", [kpa_esc(name)]), () => this.call("hapus_laporan", { name }, __("Laporan dihapus")));
		}
	}

	dialog_aktivitas(t) {
		const d = this.data;
		const baru = !t.name;
		const wbs_daun = d.wbs.filter((w) => !w.is_group);
		const opsi_wbs = wbs_daun.map((w) => ({ value: w.name, label: `${w.kode} · ${w.uraian}` }));
		const opsi_pj = [{ value: "", label: "" }, ...d.personel.map((p) => ({ value: p.employee, label: `${p.nama_personel} · ${p.jabatan}` }))];
		const opsi_pred = d.aktivitas
			.filter((x) => x.name !== t.name)
			.map((x) => ({ value: x.name, label: `${x.kode_wbs ? `${x.kode_wbs} · ` : ""}${x.subject}`, description: `${kpa_tgl(x.exp_start_date)} – ${kpa_tgl(x.exp_end_date)}` }));
		const tanggal = (v) => (v ? String(v).slice(0, 10) : null);
		const dialog = new frappe.ui.Dialog({
			title: baru ? __("Aktivitas Baru") : __("Ubah Aktivitas"),
			size: "large",
			fields: [
				{ fieldname: "wbs_item", fieldtype: "Select", label: __("Item WBS"), reqd: 1, options: opsi_wbs, default: t.wbs_item || this.filter.wbs || opsi_wbs[0]?.value },
				{ fieldname: "subject", fieldtype: "Data", label: __("Nama Aktivitas"), reqd: 1, default: t.subject },
				{ fieldname: "col1", fieldtype: "Column Break" },
				{ fieldname: "pj", fieldtype: "Select", label: __("Penanggung Jawab"), options: opsi_pj, default: t.pj || "",
					description: d.personel.length ? __("Dari Tim Proyek (Penugasan Personel).") : __("Belum ada personel di Tim Proyek.") },
				{ fieldname: "priority", fieldtype: "Select", label: __("Prioritas"), default: t.priority || "Medium",
					options: Object.entries(KPA_PRIORITAS).map(([value, label]) => ({ value, label: __(label) })) },
				{ fieldname: "jadwal_section", fieldtype: "Section Break", label: __("Jadwal") },
				{ fieldname: "exp_start_date", fieldtype: "Date", label: __("Mulai"), reqd: 1, default: tanggal(t.exp_start_date) },
				{ fieldname: "col2", fieldtype: "Column Break" },
				{ fieldname: "exp_end_date", fieldtype: "Date", label: __("Selesai"), reqd: 1, default: tanggal(t.exp_end_date) },
				{ fieldname: "col3", fieldtype: "Column Break" },
				{ fieldname: "durasi", fieldtype: "HTML" },
				{ fieldname: "pred_section", fieldtype: "Section Break" },
				{ fieldname: "predecessor", fieldtype: "MultiSelectList", label: __("Setelah (Predecessor)"), options: opsi_pred,
					default: (t.predecessor || []).map((x) => x.name), description: __("Aktivitas yang harus selesai lebih dulu.") },
				{ fieldname: "progres_section", fieldtype: "Section Break", label: __("Cara Mengukur Progres") },
				{ fieldname: "metode_progres", fieldtype: "Select", label: __("Metode"), default: t.metode_progres || "Volume",
					options: [{ value: "Volume", label: __("Volume (realisasi ÷ target)") }, { value: "Tahapan", label: __("Tahapan (tahap selesai ÷ jumlah tahap)") }] },
				{ fieldname: "col4", fieldtype: "Column Break" },
				{ fieldname: "target_volume", fieldtype: "Float", label: __("Target Volume"), depends_on: "eval:doc.metode_progres=='Volume'", default: t.target_volume },
				{ fieldname: "col5", fieldtype: "Column Break" },
				{ fieldname: "satuan", fieldtype: "Data", label: __("Satuan"), depends_on: "eval:doc.metode_progres=='Volume'", default: t.satuan },
				{ fieldname: "tahap_section", fieldtype: "Section Break", depends_on: "eval:doc.metode_progres=='Tahapan'" },
				{ fieldname: "tahapan", fieldtype: "Small Text", label: __("Tahapan (satu per baris)"),
					default: (t.tahapan || []).map((x) => x.nama_tahap).join("\n"),
					description: __("Mis. Pondasi, Struktur, Dinding, Atap, Finishing.") },
				{ fieldname: "desc_section", fieldtype: "Section Break" },
				{ fieldname: "description", fieldtype: "Small Text", label: __("Keterangan"), default: t.description ? frappe.utils.html2text(t.description) : null },
			],
			primary_action_label: __("Simpan"),
			primary_action: (v) => {
				dialog.hide();
				this.call(
					"simpan_aktivitas",
					{
						...v,
						name: t.name || null,
						predecessor: v.predecessor || [],
						tahapan: (v.tahapan || "").split("\n"),
					},
					baru ? __("Aktivitas ditambahkan") : __("Aktivitas disimpan")
				);
			},
			secondary_action_label: __("Batal"),
			secondary_action: () => dialog.hide(),
		});
		dialog.$wrapper.addClass("kpw-dialog kpa-dialog");

		const tampil_durasi = () => {
			const v = dialog.get_values(true) || {};
			const hk = kpa_hari_kerja(v.exp_start_date, v.exp_end_date, this.libur);
			dialog.fields_dict.durasi.$wrapper.html(`<div class="kpa-durasi"><div class="kpa-durasi-label">${__("Durasi")}</div>
				<div class="kpa-durasi-nilai">${hk ? `${hk} ${__("hari kerja")}` : "—"}</div>
				<div class="kpa-sub">${__("Mengikuti Project Calendar")}</div></div>`);
		};
		// Aktivitas baru: nama, target volume, & satuan awal dari item WBS yang dipilih.
		const isi_dari_wbs = () => {
			const w = d.wbs.find((x) => x.name === dialog.get_value("wbs_item"));
			if (!w || !baru) return;
			if (!dialog.get_value("subject")) dialog.set_value("subject", w.uraian);
			if (!flt(dialog.get_value("target_volume"))) dialog.set_value("target_volume", w.volume);
			if (!dialog.get_value("satuan")) dialog.set_value("satuan", w.satuan);
		};
		dialog.fields_dict.exp_start_date.df.onchange = tampil_durasi;
		dialog.fields_dict.exp_end_date.df.onchange = tampil_durasi;
		dialog.fields_dict.wbs_item.df.onchange = isi_dari_wbs;
		isi_dari_wbs();
		tampil_durasi();
		dialog.show();
	}

	dialog_lapor(t) {
		const tahap_sisa = (t.tahapan || []).filter((x) => !x.selesai);
		const volume = t.metode_progres !== "Tahapan";
		const sisa_volume = Math.max(flt(t.target_volume) - flt(t.realisasi_volume), 0);
		const fields = [
			{ fieldname: "info", fieldtype: "HTML" },
			{ fieldname: "tanggal", fieldtype: "Date", label: __("Tanggal"), reqd: 1, default: frappe.datetime.get_today() },
		];
		if (volume) {
			fields.push({ fieldname: "volume", fieldtype: "Float", label: __("Volume dikerjakan ({0})", [t.satuan || "-"]), reqd: 1,
				description: __("Sisa {0} {1} dari target.", [kpa_angka(sisa_volume), t.satuan || ""]) });
		} else {
			fields.push({ fieldname: "tahap", fieldtype: "MultiCheck", label: __("Tahap yang selesai"), reqd: 1, columns: 1,
				options: tahap_sisa.map((x) => ({ label: x.nama_tahap, value: x.nama_tahap })) });
		}
		fields.push(
			{ fieldname: "catatan", fieldtype: "Small Text", label: __("Catatan Pekerjaan") },
			{ fieldname: "kendala", fieldtype: "Small Text", label: __("Kendala") },
			{ fieldname: "foto", fieldtype: "Attach Image", label: __("Foto") }
		);
		if (this.data.bisa_setujui) {
			fields.push({ fieldname: "langsung_setujui", fieldtype: "Check", label: __("Langsung setujui (progres langsung bertambah)"), default: 1 });
		}
		const dialog = new frappe.ui.Dialog({
			title: __("Lapor Progres"),
			fields,
			primary_action_label: __("Kirim Laporan"),
			primary_action: (v) => {
				if (!volume && !(v.tahap || []).length) return frappe.msgprint(__("Pilih minimal satu tahap yang selesai."));
				dialog.hide();
				const disetujui = v.langsung_setujui && this.data.bisa_setujui;
				this.call("simpan_laporan", { ...v, task: t.name }, disetujui ? __("Laporan disimpan & disetujui") : __("Laporan dikirim, menunggu persetujuan"));
			},
			secondary_action_label: __("Batal"),
			secondary_action: () => dialog.hide(),
		});
		dialog.$wrapper.addClass("kpw-dialog");
		const realisasi = volume
			? `${kpa_angka(t.realisasi_volume)} / ${kpa_angka(t.target_volume)} ${kpa_esc(t.satuan || "")}`
			: __("{0} / {1} tahap selesai", [t.tahapan.filter((x) => x.selesai).length, t.tahapan.length]);
		dialog.fields_dict.info.$wrapper.html(`<div class="kpa-lapor-info">
			<div class="kpa-judul">${kpa_esc(t.subject)}</div>
			<div class="kpa-sub">${kpa_esc(t.kode_wbs)} · ${__("Realisasi saat ini")}: <b>${realisasi}</b> (${kpa_persen(t.progress, 1)})</div>
		</div>`);
		dialog.show();
	}
}
