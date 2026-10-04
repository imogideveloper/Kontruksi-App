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
				<div class="kpa-toolbar-kanan">
					<button class="btn btn-default btn-sm" data-kpa="template" title="${__("Excel berisi aktivitas proyek ini (atau item WBS bila belum ada aktivitas)")}">${frappe.utils.icon("download", "xs")} ${__("Template Excel")}</button>
					${d.bisa_buat ? `<button class="btn btn-default btn-sm" data-kpa="upload">${frappe.utils.icon("upload", "xs")} ${__("Upload Excel")}</button>` : ""}
				</div>
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
			case "template":
				return window.open(`/api/method/${KPA_API}download_template?project=${encodeURIComponent(this.project)}`);
			case "upload":
				return this.dialog_upload();
			case "hapus-laporan":
				return frappe.confirm(__("Hapus laporan {0}?", [kpa_esc(name)]), () => this.call("hapus_laporan", { name }, __("Laporan dihapus")));
		}
	}

	dialog_aktivitas(t) {
		const d = this.data;
		const baru = !t.name;
		const tanggal = (v) => (v ? String(v).slice(0, 10) : "");
		const opsi = (list, terpilih) =>
			list.map((o) => `<option value="${kpa_esc(o.value)}" ${String(o.value) === String(terpilih ?? "") ? "selected" : ""}>${kpa_esc(o.label)}</option>`).join("");
		const wbs_daun = d.wbs.filter((w) => !w.is_group);
		const awal_wbs = t.wbs_item || this.filter.wbs || wbs_daun[0]?.name || "";
		const pred_awal = (t.predecessor || [])[0]?.name || "";
		const hari_ini = frappe.datetime.get_today();

		const dialog = new frappe.ui.Dialog({
			title: baru ? __("Aktivitas Baru") : __("Ubah Aktivitas"),
			size: "extra-large",
			fields: [{ fieldname: "form", fieldtype: "HTML" }],
			primary_action_label: __("Simpan"),
			primary_action: () => simpan(),
			secondary_action_label: __("Batal"),
			secondary_action: () => dialog.hide(),
		});
		dialog.$wrapper.addClass("kpa-form-dialog");
		const $f = dialog.fields_dict.form.$wrapper;
		const baris = (label, isi, wajib) =>
			`<div class="kpa-form-baris"><label class="kpa-form-label">${label}${wajib ? ' <span class="kpa-wajib">*</span>' : ""}</label><div class="kpa-form-isi">${isi}</div></div>`;

		$f.html(`<div class="kpa-form">
			<div class="kpa-form-kolom">
				<div class="kpa-form-judul">${__("Pekerjaan")}</div>
				${baris(__("Nama Aktivitas"), `<input class="form-control" name="subject" value="${kpa_esc(t.subject || "")}">`, true)}
				${baris(__("Item WBS"), `<select class="form-control" name="wbs_item">${opsi(wbs_daun.map((w) => ({ value: w.name, label: `${w.kode} ${w.uraian}` })), awal_wbs)}</select>`)}
				${baris(__("Prioritas"), `<select class="form-control" name="priority">${opsi(Object.entries(KPA_PRIORITAS).map(([value, label]) => ({ value, label: __(label) })), t.priority || "Medium")}</select>`)}
				<div class="kpa-form-judul">${__("Jadwal")}</div>
				<div class="kpa-form-baris">
					<label class="kpa-form-label">${__("Mulai")} <span class="kpa-wajib">*</span></label>
					<div class="kpa-form-isi kpa-form-dua">
						<input type="date" class="form-control" name="exp_start_date" value="${tanggal(t.exp_start_date) || hari_ini}">
						<label class="kpa-form-label kpa-form-label-dalam">${__("Selesai")} <span class="kpa-wajib">*</span></label>
						<input type="date" class="form-control" name="exp_end_date" value="${tanggal(t.exp_end_date) || hari_ini}">
					</div>
				</div>
				${baris("", `<div class="kpa-form-ket kpa-durasi-teks"></div>`)}
				${baris(__("Predecessor"), `<select class="form-control" name="predecessor">${opsi(
					[{ value: "", label: `— ${__("Tidak ada")} —` }, ...d.aktivitas.filter((x) => x.name !== t.name).map((x) => ({ value: x.name, label: `${x.kode_wbs ? `${x.kode_wbs} ` : ""}${x.subject}` }))],
					pred_awal
				)}</select>`)}
			</div>
			<div class="kpa-form-kolom">
				<div class="kpa-form-judul">${__("Target & Cara Mengukur Progres")}</div>
				${baris(__("Progres diukur dari"), `<select class="form-control" name="metode_progres">${opsi(
					[{ value: "Volume", label: __("Volume pekerjaan (m2, m3, m1, ...)") }, { value: "Tahapan", label: __("Tahapan pekerjaan (pondasi, struktur, ...)") }],
					t.metode_progres || "Volume"
				)}</select><div class="kpa-form-ket">${__("Progres tidak diisi manual — dihitung dari Laporan Progres yang disetujui.")}</div>`)}
				<div class="kpa-metode-volume">
					${baris(__("Target Volume"), `<div class="kpa-form-dua kpa-form-volume">
						<input type="number" step="any" min="0" class="form-control text-right" name="target_volume" value="${t.target_volume ?? ""}">
						<input class="form-control" name="satuan" placeholder="${__("satuan")}" value="${kpa_esc(t.satuan || "")}">
					</div>`)}
				</div>
				<div class="kpa-metode-tahapan">
					${baris(__("Tahapan"), `<div class="kpa-tahap-list"></div>
						<div class="kpa-tahap-tombol">
							<button type="button" class="btn btn-default btn-sm" data-tahap="tambah">${frappe.utils.icon("add", "xs")} ${__("Tambah tahap")}</button>
							<button type="button" class="btn btn-default btn-sm" data-tahap="contoh" data-contoh="bangunan">${__("Contoh: Bangunan")}</button>
							<button type="button" class="btn btn-default btn-sm" data-tahap="contoh" data-contoh="instalasi">${__("Contoh: Instalasi")}</button>
							<button type="button" class="btn btn-default btn-sm" data-tahap="contoh" data-contoh="umum">${__("Contoh: Persiapan / Umum")}</button>
						</div>
						<div class="kpa-tahap-total"></div>`)}
				</div>
				<div class="kpa-form-judul">${__("Penanggung Jawab & Catatan")}</div>
				${baris(__("Penanggung Jawab"), `<select class="form-control" name="pj">${opsi(
					[{ value: "", label: d.personel.length ? `— ${__("Pilih dari Tim Proyek")} —` : `— ${__("Belum ada personel di Tim Proyek")} —` },
						...d.personel.map((p) => ({ value: p.employee, label: `${p.nama_personel} · ${p.jabatan}` }))],
					t.pj || ""
				)}</select>`)}
				${baris(__("Catatan"), `<textarea class="form-control" name="description" rows="3">${kpa_esc(t.description ? frappe.utils.html2text(t.description) : "")}</textarea>`)}
			</div>
		</div>`);

		const nilai = (name) => $f.find(`[name="${name}"]`).val();
		const CONTOH = {
			bangunan: [["Pondasi", 15], ["Struktur", 30], ["Dinding", 20], ["Atap", 15], ["Finishing", 20]],
			instalasi: [["Persiapan & material", 10], ["Pemasangan", 60], ["Pengujian", 20], ["Serah terima", 10]],
			umum: [["Persiapan", 20], ["Pelaksanaan", 60], ["Pemeriksaan & selesai", 20]],
		};
		let tahap = (t.tahapan || []).map((x) => ({ nama_tahap: x.nama_tahap, bobot: flt(x.bobot), selesai: x.selesai }));

		const render_tahap = () => {
			$f.find(".kpa-tahap-list").html(
				tahap
					.map(
						(x, i) => `<div class="kpa-tahap-baris">
							<input class="form-control" data-i="${i}" data-kolom="nama_tahap" placeholder="${__("Nama tahap")}" value="${kpa_esc(x.nama_tahap)}" ${x.selesai ? "disabled" : ""}>
							<div class="kpa-tahap-bobot"><input type="number" min="0" max="100" step="any" class="form-control text-right" data-i="${i}" data-kolom="bobot" value="${x.bobot || ""}"><span>%</span></div>
							${x.selesai
								? `<span class="kpa-tahap-selesai" title="${__("Sudah dilaporkan selesai")}">${frappe.utils.icon("check", "xs")}</span>`
								: `<button type="button" class="btn btn-xs btn-default kpa-ikon-btn" data-tahap="hapus" data-i="${i}" title="${__("Hapus")}">${frappe.utils.icon("close", "xs")}</button>`}
						</div>`
					)
					.join("")
			);
			render_total();
		};
		const render_total = () => {
			const total = tahap.reduce((s, x) => s + flt(x.bobot), 0);
			const pas = Math.abs(total - 100) < 0.01;
			$f.find(".kpa-tahap-total")
				.toggleClass("kpa-ok", pas)
				.toggleClass("kpa-oranye", !pas)
				.text(pas ? __("Total bobot 100%") : __("Total bobot {0}% (harus 100%)", [format_number(total, null, total % 1 ? 2 : 0)]));
		};
		const render_metode = () => {
			const tahapan = nilai("metode_progres") === "Tahapan";
			$f.find(".kpa-metode-tahapan").toggle(tahapan);
			$f.find(".kpa-metode-volume").toggle(!tahapan);
		};
		const render_durasi = () => {
			const hk = kpa_hari_kerja(nilai("exp_start_date"), nilai("exp_end_date"), this.libur);
			$f.find(".kpa-durasi-teks").html(hk ? __("Durasi {0} hari kerja (mengikuti Project Calendar)", [`<b>${hk}</b>`]) : "");
		};
		// Aktivitas baru: nama, target volume, & satuan awal dari item WBS yang dipilih.
		const isi_dari_wbs = (paksa) => {
			if (!baru) return;
			const w = d.wbs.find((x) => x.name === nilai("wbs_item"));
			if (!w) return;
			if (paksa || !nilai("subject")) $f.find('[name="subject"]').val(w.uraian);
			if (paksa || !flt(nilai("target_volume"))) $f.find('[name="target_volume"]').val(w.volume || "");
			if (paksa || !nilai("satuan")) $f.find('[name="satuan"]').val(w.satuan || "");
		};

		$f.on("change", '[name="metode_progres"]', render_metode);
		$f.on("change input", '[name="exp_start_date"], [name="exp_end_date"]', render_durasi);
		$f.on("change", '[name="wbs_item"]', () => isi_dari_wbs(true));
		$f.on("input", ".kpa-tahap-baris input", (e) => {
			const $i = $(e.target);
			const x = tahap[Number($i.attr("data-i"))];
			if (!x) return;
			x[$i.attr("data-kolom")] = $i.attr("data-kolom") === "bobot" ? flt($i.val()) : $i.val();
			if ($i.attr("data-kolom") === "bobot") render_total();
		});
		$f.on("click", "[data-tahap]", (e) => {
			const $b = $(e.currentTarget);
			const aksi = $b.attr("data-tahap");
			if (aksi === "tambah") tahap.push({ nama_tahap: "", bobot: 0 });
			if (aksi === "hapus") tahap.splice(Number($b.attr("data-i")), 1);
			if (aksi === "contoh") {
				const selesai = tahap.filter((x) => x.selesai);
				tahap = [...selesai, ...CONTOH[$b.attr("data-contoh")].filter(([n]) => !selesai.some((x) => x.nama_tahap === n)).map(([nama_tahap, bobot]) => ({ nama_tahap, bobot }))];
			}
			render_tahap();
			if (aksi === "tambah") $f.find(".kpa-tahap-baris:last input:first").trigger("focus");
		});

		const simpan = () => {
			const v = {
				subject: (nilai("subject") || "").trim(),
				wbs_item: nilai("wbs_item"),
				priority: nilai("priority"),
				exp_start_date: nilai("exp_start_date"),
				exp_end_date: nilai("exp_end_date"),
				predecessor: nilai("predecessor") ? [nilai("predecessor")] : [],
				metode_progres: nilai("metode_progres"),
				target_volume: flt(nilai("target_volume")),
				satuan: nilai("satuan"),
				pj: nilai("pj"),
				description: nilai("description"),
				tahapan: tahap.filter((x) => (x.nama_tahap || "").trim()),
			};
			const salah = [];
			if (!v.subject) salah.push(__("Nama Aktivitas"));
			if (!v.wbs_item) salah.push(__("Item WBS"));
			if (!v.exp_start_date || !v.exp_end_date) salah.push(__("Jadwal Mulai & Selesai"));
			if (salah.length) return frappe.msgprint(__("Lengkapi: {0}", [salah.join(", ")]));
			if (v.exp_end_date < v.exp_start_date) return frappe.msgprint(__("Tanggal Selesai tidak boleh sebelum Mulai."));
			if (v.metode_progres === "Tahapan") {
				const total = v.tahapan.reduce((s, x) => s + flt(x.bobot), 0);
				if (!v.tahapan.length) return frappe.msgprint(__("Tambahkan minimal satu tahap."));
				if (Math.abs(total - 100) >= 0.01) return frappe.msgprint(__("Total bobot tahapan harus 100% (sekarang {0}%).", [format_number(total, null, 2)]));
			} else if (!v.target_volume) {
				return frappe.msgprint(__("Isi Target Volume."));
			}
			this.call("simpan_aktivitas", { ...v, name: t.name || null }, baru ? __("Aktivitas ditambahkan") : __("Aktivitas disimpan")).then(() => dialog.hide());
		};

		isi_dari_wbs(false);
		render_tahap();
		render_metode();
		render_durasi();
		dialog.show();
	}

	dialog_upload() {
		const dialog = new frappe.ui.Dialog({
			title: __("Upload Excel Aktivitas"),
			fields: [
				{ fieldtype: "HTML", options: `<p class="text-muted small">${__(
					"Gunakan format dari Template Excel. Isi file akan dicek dulu dan ditampilkan sebelum diimpor; aktivitas dengan Nama & Kode WBS yang sama diperbarui, bukan dibuat dobel."
				)}</p>` },
				{ fieldname: "file_url", fieldtype: "Attach", label: __("File Excel (.xlsx)"), reqd: 1,
					options: { restrictions: { allowed_file_types: [".xlsx"] } } },
			],
			primary_action_label: __("Periksa"),
			primary_action: (v) =>
				frappe
					.call({ method: KPA_API + "baca_excel", args: { project: this.project, file_url: v.file_url }, freeze: true, freeze_message: __("Membaca file Excel...") })
					.then((r) => {
						dialog.hide();
						this.dialog_pratinjau(r.message);
					}),
		});
		dialog.show();
	}

	dialog_pratinjau({ rows, hasil }) {
		const error = hasil.filter((b) => b.error.length).length;
		const peringatan = hasil.filter((b) => b.peringatan.length).length;
		const baru = hasil.filter((b) => !b.task).length;
		const baris = hasil
			.map((b) => {
				const catatan = [
					...b.error.map((x) => `<div class="kpa-merah">✕ ${kpa_esc(x)}</div>`),
					...b.peringatan.map((x) => `<div class="kpa-oranye">! ${kpa_esc(x)}</div>`),
				].join("");
				const ukur = b.metode === "Tahapan"
					? __("Tahapan ({0})", [b.tahapan.length])
					: `${kpa_angka(b.target_volume)} ${kpa_esc(b.satuan || "")}`;
				return `<tr class="${b.error.length ? "kpa-pratinjau-error" : ""}">
					<td>${kpa_esc(b.no)}</td>
					<td class="kpa-wrap"><b>${kpa_esc(b.subject)}</b><div class="kpa-sub">${kpa_esc(b.kode_wbs)} ${kpa_esc(b.uraian_wbs)}</div></td>
					<td>${b.mulai ? `${kpa_tgl(b.mulai)} – ${kpa_tgl(b.selesai)}` : "—"}${b.durasi ? `<div class="kpa-sub">${b.durasi} hk${b.setelah.length ? ` · ${__("setelah No")} ${kpa_esc(b.setelah.join(", "))}` : ""}</div>` : ""}</td>
					<td>${ukur}</td>
					<td class="kpa-wrap">${kpa_esc(b.pj_nama || "—")}</td>
					<td>${b.task ? `<span class="kpa-status kpa-status-biru">${__("Perbarui")}</span>` : `<span class="kpa-status kpa-status-hijau">${__("Baru")}</span>`}</td>
					<td class="kpa-wrap kpa-pratinjau-catatan">${catatan || '<span class="kpa-ok">✓</span>'}</td>
				</tr>`;
			})
			.join("");
		const ringkas = error
			? `<div class="kpa-pratinjau-ringkas kpa-merah">${__("{0} baris error — perbaiki file lalu upload ulang. Tidak ada yang diimpor sebelum semua baris benar.", [error])}</div>`
			: `<div class="kpa-pratinjau-ringkas kpa-ok">${__("{0} aktivitas siap diimpor: {1} baru, {2} diperbarui.", [hasil.length, baru, hasil.length - baru])}${
					peringatan ? ` <span class="kpa-oranye">${__("{0} baris dengan catatan (tetap bisa diimpor).", [peringatan])}</span>` : ""
			  }</div>`;
		const dialog = new frappe.ui.Dialog({
			title: __("Pratinjau Upload Aktivitas"),
			size: "extra-large",
			fields: [{ fieldname: "isi", fieldtype: "HTML" }],
			primary_action_label: error ? __("Tutup") : __("Impor {0} Aktivitas", [hasil.length]),
			primary_action: () => {
				if (error) return dialog.hide();
				frappe
					.call({ method: KPA_API + "impor_excel", args: { project: this.project, rows }, freeze: true, freeze_message: __("Mengimpor aktivitas...") })
					.then((r) => {
						dialog.hide();
						const m = r.message || {};
						frappe.show_alert({ message: __("{0} aktivitas dibuat, {1} diperbarui", [m.dibuat, m.diperbarui]), indicator: "green" });
						this.muat();
					});
			},
			secondary_action_label: error ? null : __("Batal"),
			secondary_action: error ? null : () => dialog.hide(),
		});
		dialog.fields_dict.isi.$wrapper.html(`<div class="kpr kpw kpa">${ringkas}
			<div class="kpw-tabel-wrap kpa-pratinjau"><table class="kpw-tabel kpa-tabel">
				<colgroup><col style="width:44px"><col><col style="width:200px"><col style="width:120px"><col style="width:150px"><col style="width:90px"><col style="width:300px"></colgroup>
				<thead><tr><th>${__("No")}</th><th>${__("Aktivitas")}</th><th>${__("Jadwal")}</th><th>${__("Target")}</th><th>${__("PJ")}</th><th></th><th>${__("Pemeriksaan")}</th></tr></thead>
				<tbody>${baris}</tbody>
			</table></div></div>`);
		dialog.show();
	}

	dialog_lapor(t) {
		frappe.xcall(KPA_API + "get_riwayat", { project: this.project, task: t.name }).then((r) => this.tampil_dialog_lapor(t, r));
	}

	tampil_dialog_lapor(t, r) {
		const d = this.data;
		const volume = t.metode_progres !== "Tahapan";
		const satuan = t.satuan || "";
		const target = flt(t.target_volume);
		const realisasi = flt(t.realisasi_volume);
		const sisa = Math.max(target - realisasi, 0);
		const tahap_menunggu = new Set(r.menunggu_tahap || []);
		const tahap_sisa = (t.tahapan || []).filter((x) => !x.selesai && !tahap_menunggu.has(x.nama_tahap));
		const total_bobot = (t.tahapan || []).reduce((s, x) => s + flt(x.bobot), 0) || (t.tahapan || []).length || 1;
		const bobot = (x) => (flt(x.bobot) || ((t.tahapan || []).some((y) => flt(y.bobot)) ? 0 : 1)) / total_bobot * 100;
		const bisa_setujui = d.bisa_setujui;
		const hari_ini = frappe.datetime.get_today();
		const terlambat = t.exp_end_date && String(t.exp_end_date).slice(0, 10) < hari_ini && flt(t.progress) < 100;

		// Pelapor: personel Tim Proyek (+ diri sendiri bila punya Data Personel).
		const personel = [...d.personel];
		if (r.pegawai_saya && !personel.some((p) => p.employee === r.pegawai_saya.name)) {
			personel.unshift({ employee: r.pegawai_saya.name, nama_personel: r.pegawai_saya.employee_name, jabatan: "" });
		}
		const pelapor_awal = r.pegawai_saya?.name || t.pj || "";

		const dialog = new frappe.ui.Dialog({
			title: __("Lapor Progres — {0}", [t.subject]),
			size: "extra-large",
			fields: [{ fieldname: "form", fieldtype: "HTML" }],
			primary_action_label: bisa_setujui ? __("Simpan (langsung disetujui)") : __("Kirim Laporan"),
			primary_action: () => simpan(),
			secondary_action_label: __("Batal"),
			secondary_action: () => dialog.hide(),
		});
		dialog.$wrapper.addClass("kpa-form-dialog");
		const $f = dialog.fields_dict.form.$wrapper;
		const baris = (label, isi, wajib) =>
			`<div class="kpa-form-baris kpa-lapor-baris"><label class="kpa-form-label">${label}${wajib ? ' <span class="kpa-wajib">*</span>' : ""}</label><div class="kpa-form-isi">${isi}</div></div>`;

		const info_target = volume ? `${kpa_angka(target)} ${kpa_esc(satuan)}` : __("{0} tahap", [(t.tahapan || []).length]);
		const info_progres_sub = volume
			? __("{0} {1} disetujui", [kpa_angka(realisasi), kpa_esc(satuan)])
			: __("{0} / {1} tahap disetujui", [(t.tahapan || []).filter((x) => x.selesai).length, (t.tahapan || []).length]);
		const info_menunggu = r.menunggu
			? volume
				? `${kpa_angka(r.menunggu_volume)} ${kpa_esc(satuan)}<div class="kpa-sub">${__("{0} laporan", [r.menunggu])}</div>`
				: `${r.menunggu_tahap.map(kpa_esc).join(", ")}<div class="kpa-sub">${__("{0} laporan", [r.menunggu])}</div>`
			: "—";

		const isian = volume
			? baris(__("Volume Dikerjakan ({0})", [kpa_esc(satuan || "-")]),
				`<input type="number" step="any" min="0" class="form-control" name="volume">
				<div class="kpa-form-ket">${__("Sisa target {0} {1} dari {2} {1}.", [kpa_angka(sisa), kpa_esc(satuan), kpa_angka(target)])}</div>`, true)
			: baris(__("Tahap Selesai"),
				tahap_sisa.length
					? `<div class="kpa-lapor-tahap">${tahap_sisa
							.map((x) => `<label class="kpa-cek"><input type="checkbox" name="tahap" value="${kpa_esc(x.nama_tahap)}"> <span>${kpa_esc(x.nama_tahap)}</span> <span class="kpa-sub">${kpa_persen(bobot(x), 1)}</span></label>`)
							.join("")}</div>`
					: `<div class="kpa-form-ket">${__("Semua tahap sudah dilaporkan.")}</div>`,
				true);

		const riwayat = r.riwayat.length
			? `<table class="kpa-riwayat"><thead><tr>
					<th>${__("Tanggal")}</th><th class="text-right">${__("Dikerjakan")}</th>
					<th class="text-right">${__("Progres")}<div class="kpa-th-sub">${__("kumulatif disetujui")}</div></th>
					<th>${__("Pelapor")}</th><th>${__("Status")}</th><th>${__("Keterangan")}</th></tr></thead>
				<tbody>${r.riwayat
					.slice()
					.reverse()
					.map((x) => {
						const warna = { Menunggu: "oranye", Disetujui: "hijau", Ditolak: "merah" }[x.status];
						const kerja = volume ? `${kpa_angka(x.volume)} ${kpa_esc(satuan)}` : x.tahap.map(kpa_esc).join(", ");
						return `<tr><td>${kpa_tgl(x.tanggal)}</td><td class="text-right">${kerja}</td>
							<td class="text-right">${x.status === "Disetujui" ? kpa_persen(x.progres_kumulatif, 1) : "—"}</td>
							<td>${kpa_esc(x.nama_pelapor || x.owner)}</td>
							<td><span class="kpa-status kpa-status-${warna}">${__(x.status)}</span></td>
							<td class="kpa-wrap">${kpa_esc(x.catatan || "")}${x.alasan_tolak ? `<div class="kpa-sub kpa-merah">${__("Ditolak")}: ${kpa_esc(x.alasan_tolak)}</div>` : ""}</td></tr>`;
					})
					.join("")}</tbody></table>`
			: `<div class="kpa-form-ket">${__("Belum ada laporan untuk aktivitas ini.")}</div>`;

		$f.html(`<div class="kpa-lapor-form">
			<div class="kpa-lapor-ringkas">
				<div><div class="kpa-lapor-label">${__("Target")}</div><div class="kpa-lapor-nilai">${info_target}</div></div>
				<div><div class="kpa-lapor-label">${__("Progres saat ini")}</div><div class="kpa-lapor-nilai">${kpa_persen(t.progress, 1)}</div><div class="kpa-sub">${info_progres_sub}</div></div>
				<div><div class="kpa-lapor-label">${__("Menunggu persetujuan")}</div><div class="kpa-lapor-nilai">${info_menunggu}</div></div>
				<div><div class="kpa-lapor-label">${__("Jadwal")}</div><div class="kpa-lapor-nilai">${kpa_tgl(t.exp_start_date)} – ${kpa_tgl(t.exp_end_date)}</div></div>
			</div>
			${baris(__("Tanggal Pekerjaan"), `<input type="date" class="form-control kpa-input-tanggal" name="tanggal" value="${hari_ini}" max="${hari_ini}">`, true)}
			${baris(__("Dilaporkan Oleh"), `<select class="form-control" name="pelapor">${[
				`<option value="">— ${__("Pilih personel")} —</option>`,
				...personel.map((p) => `<option value="${kpa_esc(p.employee)}" ${p.employee === pelapor_awal ? "selected" : ""}>${kpa_esc(p.nama_personel)}${p.jabatan ? ` · ${kpa_esc(p.jabatan)}` : ""}</option>`),
			].join("")}</select>`, true)}
			${isian}
			${baris(__("Progres"), `<div class="kpa-pratinjau-progres">${volume ? __("Isi volume untuk melihat progres") : __("Pilih tahap untuk melihat progres")}</div>`)}
			${baris(__("Keterangan"), `<textarea class="form-control" name="catatan" rows="3" placeholder="${__("mis. area / grid yang dikerjakan, kendala, jumlah pekerja")}"></textarea>`)}
			<div class="kpa-form-judul kpa-riwayat-judul">${__("Riwayat Laporan ({0})", [r.riwayat.length])}</div>
			${terlambat ? `<div class="kpa-peringatan">${volume
				? __("Sudah lewat jadwal selesai ({0}), sisa {1} {2}.", [kpa_tgl(t.exp_end_date), kpa_angka(sisa), kpa_esc(satuan)])
				: __("Sudah lewat jadwal selesai ({0}), {1} tahap belum selesai.", [kpa_tgl(t.exp_end_date), tahap_sisa.length])}</div>` : ""}
			${riwayat}
		</div>`);

		const nilai = (name) => $f.find(`[name="${name}"]`).val();
		const tahap_dipilih = () => $f.find('[name="tahap"]:checked').map((_, el) => el.value).get();
		const pratinjau = () => {
			const $p = $f.find(".kpa-pratinjau-progres");
			let tambah = 0;
			if (volume) {
				const v = flt(nilai("volume"));
				if (!v) return $p.removeClass("kpa-aktif kpa-lebih").text(__("Isi volume untuk melihat progres"));
				tambah = target ? (v / target) * 100 : 0;
				const lebih = realisasi + v > target;
				$p.toggleClass("kpa-lebih", lebih);
			} else {
				const dipilih = tahap_dipilih();
				if (!dipilih.length) return $p.removeClass("kpa-aktif").text(__("Pilih tahap untuk melihat progres"));
				tambah = (t.tahapan || []).filter((x) => dipilih.includes(x.nama_tahap)).reduce((s, x) => s + bobot(x), 0);
			}
			const baru = Math.min(flt(t.progress) + tambah, 100);
			$p.addClass("kpa-aktif").html(
				`${kpa_persen(t.progress, 1)} → <b>${kpa_persen(baru, 1)}</b> <span class="kpa-sub">(+${kpa_persen(tambah, 1)}${
					volume && realisasi + flt(nilai("volume")) > target ? ` · ${__("melebihi target, progres maksimal 100%")}` : ""
				})</span>${bisa_setujui ? "" : ` <span class="kpa-sub">· ${__("setelah disetujui")}</span>`}`
			);
		};
		$f.on("input change", '[name="volume"], [name="tahap"]', pratinjau);

		const simpan = () => {
			const v = {
				tanggal: nilai("tanggal"),
				pelapor: nilai("pelapor"),
				volume: flt(nilai("volume")),
				tahap: tahap_dipilih(),
				catatan: nilai("catatan"),
			};
			const salah = [];
			if (!v.tanggal) salah.push(__("Tanggal Pekerjaan"));
			if (!v.pelapor) salah.push(__("Dilaporkan Oleh"));
			if (volume && v.volume <= 0) salah.push(__("Volume Dikerjakan"));
			if (!volume && !v.tahap.length) salah.push(__("Tahap Selesai"));
			if (salah.length) return frappe.msgprint(__("Lengkapi: {0}", [salah.join(", ")]));
			if (v.tanggal > hari_ini) return frappe.msgprint(__("Tanggal pekerjaan tidak boleh di masa depan."));
			this.call("simpan_laporan", { ...v, task: t.name, langsung_setujui: bisa_setujui ? 1 : 0 },
				bisa_setujui ? __("Laporan disimpan & disetujui") : __("Laporan dikirim, menunggu persetujuan")
			).then(() => dialog.hide());
		};
		dialog.show();
	}
}
