// Project Timeline: Gantt per kelompok WBS (periode kontrak, milestone termin, aktivitas, jalur kritis, hari libur,
// garis hari ini) + Kurva S rencana vs aktual. Data: konstruksi.konstruksi.timeline. Gaya: kelas kptl-* di
// konstruksi.bundle.css. Route: /app/project-timeline (daftar proyek) · /app/project-timeline/<ID Project>.

frappe.pages["project-timeline"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Project Timeline"), single_column: true });
	wrapper.timeline = new HalamanTimeline(page);
};

frappe.pages["project-timeline"].on_page_show = function (wrapper) {
	wrapper.timeline?.tampil();
};

const KPTL_API = "konstruksi.konstruksi.timeline.";
const KPTL_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const KPTL_HARI_MS = 86400000;
// Piksel per hari untuk tiap skala ("pas" dihitung dari lebar layar).
const KPTL_SKALA = { hari: 34, minggu: 11, bulan: 4, tahun: 1.6 };
const KPTL_WARNA_STATUS = { Selesai: "selesai", Berjalan: "berjalan", Terlambat: "terlambat", "Belum Mulai": "belum", "Menunggu Review": "berjalan" };
const KPTL_LABEL_W = 320;

const kptl_esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));
const kptl_tgl = (s) => {
	if (!s) return null;
	const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
	return new Date(y, m - 1, d);
};
const kptl_iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const kptl_teks_tgl = (s) => {
	const d = kptl_tgl(s);
	return d ? `${String(d.getDate()).padStart(2, "0")} ${KPTL_BULAN[d.getMonth()]} ${d.getFullYear()}` : "—";
};
const kptl_persen = (v, dp = 1) => `${format_number(flt(v), null, flt(v) % 1 ? dp : 0)}%`;
const kptl_selisih_hari = (a, b) => Math.round((b - a) / KPTL_HARI_MS);

class HalamanTimeline {
	constructor(page) {
		this.page = page;
		this.tab = "gantt";
		this.skala = "pas";
		this.cari = "";
		this.filter_status = new Set();
		this.hanya_kritis = false;
		this.tertutup = new Set();
		this.opsi = { label: true, kritis: true, libur: true, milestone: true };
		this.field_project = page.add_field({
			fieldname: "project",
			fieldtype: "Link",
			options: "Project",
			label: __("Proyek"),
			get_query: () => ({ filters: { kontrak_project: ["is", "set"] } }),
			change: () => {
				const project = this.field_project.get_value();
				if (project && project !== this.project) frappe.set_route("project-timeline", project);
			},
		});
		this.$body = $(`<div class="kptl"></div>`).appendTo(page.main);
		this.$body.on("click", "[data-kptl]", (e) => this.aksi(e));
		// Menu Filter / Tampilan tetap terbuka saat mencentang beberapa pilihan.
		this.$body.on("click", ".kptl-menu", (e) => e.stopPropagation());
		this.$body.on("input", ".kptl-cari", frappe.utils.debounce((e) => {
			this.cari = e.target.value.toLowerCase();
			this.render_gantt();
		}, 200));
		$(window).on("resize", frappe.utils.debounce(() => this.data && this.tab === "gantt" && this.skala === "pas" && this.render_gantt(), 200));
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
		this.page.add_inner_button(__("Semua Proyek"), () => frappe.set_route("project-timeline"));
		this.page.add_inner_button(__("Task & Activity"), () => frappe.set_route("task-activity-management", this.project));
		this.page.add_inner_button(__("Milestone & Termin"), () => frappe.set_route("milestone-dan-termin", this.project));
	}

	// ---------- daftar proyek ----------

	daftar() {
		this.project = null;
		this.data = null;
		if (this.field_project.get_value()) this.field_project.set_value("");
		this.atur_toolbar("daftar");
		return frappe.xcall(KPTL_API + "get_daftar").then((rows) => {
			const kepala = `<div class="kptl-sub">${__("Pilih proyek untuk melihat jadwal aktivitas (Gantt) dan Kurva S rencana vs aktual.")}</div>`;
			if (!rows.length) {
				this.$body.html(`${kepala}<div class="kptl-card kptl-kosong">${__("Belum ada Project Master. Buat dari Kontrak Project terlebih dahulu.")}</div>`);
				return;
			}
			const baris = rows
				.map((r) => {
					const p = Math.min(flt(r.progres), 100);
					return `<tr class="kptl-baris-proyek" data-kptl="buka" data-project="${kptl_esc(r.name)}">
						<td class="kptl-mono">${kptl_esc(r.name)}</td>
						<td><b>${kptl_esc(r.project_name)}</b></td>
						<td class="kptl-potong" title="${kptl_esc(r.customer || "")}">${kptl_esc(r.customer || "—")}</td>
						<td>${r.status_proyek ? `<span class="kptl-chip">${kptl_esc(__(r.status_proyek))}</span>` : ""}</td>
						<td class="text-right">${r.jumlah}</td>
						<td class="text-right ${r.terlambat ? "kptl-merah" : ""}">${r.terlambat}</td>
						<td><div class="kptl-bar-mini"><div style="width:${p}%"></div></div><span class="kptl-sub-kecil">${kptl_persen(p)}</span></td>
						<td class="text-right kptl-buka">${__("Buka")} ${frappe.utils.icon("right", "xs")}</td>
					</tr>`;
				})
				.join("");
			this.$body.html(`${kepala}<div class="kptl-card kptl-card-tabel"><div class="kptl-tabel-wrap"><table class="kptl-tabel">
				<colgroup><col style="width:130px"><col><col style="width:200px"><col style="width:120px"><col style="width:90px"><col style="width:90px"><col style="width:180px"><col style="width:80px"></colgroup>
				<thead><tr><th>${__("ID Proyek")}</th><th>${__("Nama Proyek")}</th><th>${__("Klien")}</th><th>${__("Status")}</th>
					<th class="text-right">${__("Aktivitas")}</th><th class="text-right">${__("Terlambat")}</th><th>${__("Progres")}</th><th></th></tr></thead>
				<tbody>${baris}</tbody></table></div></div>`);
		});
	}

	// ---------- satu proyek ----------

	buka(project) {
		this.project = project;
		if (this.field_project.get_value() !== project) this.field_project.set_value(project);
		return frappe.xcall(KPTL_API + "get_timeline", { project }).then((data) => {
			this.data = data;
			this.atur_toolbar("proyek");
			this.render();
		});
	}

	render() {
		const d = this.data;
		const p = d.project;
		const r = d.ringkasan;
		const dev = flt(r.deviasi);
		const kelas_dev = dev >= 0 ? "kptl-chip-hijau" : dev > -5 ? "kptl-chip-oranye" : "kptl-chip-merah";
		this.$body.html(`
			<div class="kptl-head">
				<div><a class="kptl-crumb" href="/app/project/${encodeURIComponent(p.name)}">${kptl_esc(p.name)} · ${kptl_esc(p.project_name)}</a></div>
				<div class="kptl-chips">
					<span class="kptl-chip">${__("Periode")} <b>${kptl_teks_tgl(p.mulai)} – ${kptl_teks_tgl(p.selesai)}</b></span>
					<span class="kptl-chip">${__("Progres")} <b>${kptl_persen(r.progres)}</b></span>
					<span class="kptl-chip ${kelas_dev}" title="${__("Progres aktual dikurangi rencana hari ini ({0})", [kptl_persen(r.rencana)])}">${__("Deviasi")} <b>${dev > 0 ? "+" : ""}${kptl_persen(dev, 2)}</b></span>
					<span class="kptl-chip ${r.terlambat ? "kptl-chip-merah" : ""}">${__("Terlambat")} <b>${r.terlambat}/${r.aktivitas}</b></span>
					<span class="kptl-chip">${__("Milestone")} <b>${r.milestone_tercapai}/${r.milestone}</b></span>
					<button class="btn btn-default btn-sm" data-kptl="cetak">${frappe.utils.icon("printer", "xs")} ${__("Cetak")}</button>
				</div>
			</div>
			<div class="kptl-tabs">
				<a class="kptl-tab ${this.tab === "gantt" ? "kptl-tab-aktif" : ""}" data-kptl="tab" data-tab="gantt">${__("Gantt Chart")}</a>
				<a class="kptl-tab ${this.tab === "kurva" ? "kptl-tab-aktif" : ""}" data-kptl="tab" data-tab="kurva">${__("Kurva S")}</a>
			</div>
			<div class="kptl-card kptl-isi"></div>`);
		this.tab === "kurva" ? this.render_kurva() : this.render_gantt_kerangka();
	}

	// ---------- Gantt ----------

	render_gantt_kerangka() {
		const skala = [["hari", __("Hari")], ["minggu", __("Minggu")], ["bulan", __("Bulan")], ["tahun", __("Tahun")], ["pas", __("Pas")]];
		const status = ["Belum Mulai", "Berjalan", "Terlambat", "Selesai"];
		this.$body.find(".kptl-isi").html(`
			<div class="kptl-toolbar">
				<div class="btn-group kptl-skala">${skala
					.map(([v, l]) => `<button class="btn btn-default btn-sm ${this.skala === v ? "active" : ""}" data-kptl="skala" data-skala="${v}">${l}</button>`)
					.join("")}</div>
				<input type="search" class="form-control input-sm kptl-cari" placeholder="${__("Cari aktivitas / PJ...")}" value="${kptl_esc(this.cari)}">
				<div class="dropdown">
					<button class="btn btn-default btn-sm" data-toggle="dropdown">${frappe.utils.icon("filter", "xs")} ${__("Filter")}${
						this.filter_status.size || this.hanya_kritis ? ` <span class="kptl-badge">${this.filter_status.size + (this.hanya_kritis ? 1 : 0)}</span>` : ""
					}</button>
					<div class="dropdown-menu kptl-menu">
						<div class="kptl-menu-judul">${__("Status")}</div>
						${status.map((s) => `<label class="kptl-menu-cek"><input type="checkbox" data-kptl="filter-status" data-status="${s}" ${this.filter_status.has(s) ? "checked" : ""}> ${__(s)}</label>`).join("")}
						<div class="dropdown-divider"></div>
						<label class="kptl-menu-cek"><input type="checkbox" data-kptl="filter-kritis" ${this.hanya_kritis ? "checked" : ""}> ${__("Hanya jalur kritis")}</label>
					</div>
				</div>
				<div class="btn-group kptl-buka-tutup">
					<button class="btn btn-default btn-sm" data-kptl="buka-semua" title="${__("Tampilkan semua aktivitas (detail)")}">${frappe.utils.icon("down", "sm")} ${__("Buka semua")}</button>
					<button class="btn btn-default btn-sm" data-kptl="tutup-semua" title="${__("Tampilkan kelompok WBS saja (ringkasan)")}">${frappe.utils.icon("right", "sm")} ${__("Tutup semua")}</button>
				</div>
				<div class="kptl-toolbar-kanan">
					<button class="btn btn-default btn-sm" data-kptl="hari-ini">${frappe.utils.icon("calendar", "xs")} ${__("Hari ini")}</button>
					<div class="dropdown">
						<button class="btn btn-default btn-sm" data-toggle="dropdown">${frappe.utils.icon("sliders-horizontal", "xs")} ${__("Tampilan")}</button>
						<div class="dropdown-menu dropdown-menu-right kptl-menu">
							${[["label", __("Label aktivitas di batang")], ["kritis", __("Tandai jalur kritis")], ["libur", __("Arsir hari libur")], ["milestone", __("Baris milestone")]]
								.map(([k, l]) => `<label class="kptl-menu-cek"><input type="checkbox" data-kptl="opsi" data-opsi="${k}" ${this.opsi[k] ? "checked" : ""}> ${l}</label>`)
								.join("")}
						</div>
					</div>
					<button class="btn btn-primary btn-sm" data-kptl="layar-penuh">${frappe.utils.icon("maximize-2", "xs")} ${__("Layar penuh")}</button>
				</div>
			</div>
			<div class="kptl-legenda">
				<span><i class="kptl-l kptl-l-selesai"></i>${__("Selesai")}</span>
				<span><i class="kptl-l kptl-l-berjalan"></i>${__("Berjalan")}</span>
				<span><i class="kptl-l kptl-l-terlambat"></i>${__("Terlambat")}</span>
				<span><i class="kptl-l kptl-l-belum"></i>${__("Belum mulai")}</span>
				<span><i class="kptl-l kptl-l-grup"></i>${__("Kelompok WBS")}</span>
				<span><i class="kptl-l kptl-l-kritis"></i>${__("Jalur kritis")}</span>
				<span><i class="kptl-l-diamond"></i>${__("Milestone")}</span>
				<span><i class="kptl-l-hariini"></i>${__("Hari ini")}</span>
			</div>
			<div class="kptl-gantt"></div>`);
		this.render_gantt();
	}

	rentang() {
		const d = this.data;
		const tanggal = [d.project.mulai, d.project.selesai, d.project.akhir_pemeliharaan, ...d.milestone.map((m) => m.tanggal_target)];
		d.kelompok.forEach((g) => g.aktivitas.forEach((a) => tanggal.push(a.mulai, a.selesai)));
		const ada = tanggal.filter(Boolean).map(kptl_tgl);
		const hari_ini = new Date();
		ada.push(new Date(hari_ini.getFullYear(), hari_ini.getMonth(), hari_ini.getDate()));
		const min = new Date(Math.min(...ada));
		const max = new Date(Math.max(...ada));
		// Awal di tanggal 1 bulan pertama, akhir di akhir bulan terakhir (header bulan utuh).
		return { awal: new Date(min.getFullYear(), min.getMonth(), 1), akhir: new Date(max.getFullYear(), max.getMonth() + 1, 0) };
	}

	render_gantt() {
		const $g = this.$body.find(".kptl-gantt");
		if (!$g.length) return;
		const d = this.data;
		const { awal, akhir } = this.rentang();
		const hari = kptl_selisih_hari(awal, akhir) + 1;
		const lebar_tersedia = Math.max(($g.width() || 900) - KPTL_LABEL_W - 2, 300);
		const px = this.skala === "pas" ? Math.max(lebar_tersedia / hari, 0.5) : KPTL_SKALA[this.skala];
		const lebar = Math.round(hari * px);
		const x = (s) => kptl_selisih_hari(awal, kptl_tgl(s)) * px;
		const w = (a, b) => Math.max((kptl_selisih_hari(kptl_tgl(a), kptl_tgl(b)) + 1) * px, 3);
		const hari_ini = new Date();
		const x_hari_ini = kptl_selisih_hari(awal, new Date(hari_ini.getFullYear(), hari_ini.getMonth(), hari_ini.getDate())) * px + px / 2;

		// Header 2 tingkat: atas = tahun (atau bulan-tahun untuk skala hari), bawah = bulan / minggu / hari.
		const atas = [], bawah = [];
		const mode_hari = px >= 20, mode_minggu = !mode_hari && px >= 7;
		for (let t = new Date(awal); t <= akhir; ) {
			const akhir_bulan = new Date(t.getFullYear(), t.getMonth() + 1, 0);
			const sampai = akhir_bulan > akhir ? akhir : akhir_bulan;
			const left = x(kptl_iso(t)), width = (kptl_selisih_hari(t, sampai) + 1) * px;
			if (mode_hari || mode_minggu) atas.push(`<div class="kptl-h" style="left:${left}px;width:${width}px">${KPTL_BULAN[t.getMonth()]} ${t.getFullYear()}</div>`);
			else bawah.push(`<div class="kptl-h" style="left:${left}px;width:${width}px">${width >= 26 ? KPTL_BULAN[t.getMonth()] : KPTL_BULAN[t.getMonth()][0]}</div>`);
			t = new Date(t.getFullYear(), t.getMonth() + 1, 1);
		}
		if (!mode_hari && !mode_minggu) {
			for (let y = awal.getFullYear(); y <= akhir.getFullYear(); y++) {
				const a = new Date(Math.max(new Date(y, 0, 1), awal)), b = new Date(Math.min(new Date(y, 11, 31), akhir));
				atas.push(`<div class="kptl-h" style="left:${x(kptl_iso(a))}px;width:${(kptl_selisih_hari(a, b) + 1) * px}px">${y}</div>`);
			}
		} else if (mode_hari) {
			for (let t = new Date(awal); t <= akhir; t = new Date(t.getTime() + KPTL_HARI_MS)) {
				bawah.push(`<div class="kptl-h kptl-h-hari ${[0, 6].includes(t.getDay()) ? "kptl-h-akhirpekan" : ""}" style="left:${x(kptl_iso(t))}px;width:${px}px">${t.getDate()}</div>`);
			}
		} else {
			// Mingguan: mulai Senin.
			let t = new Date(awal);
			while (t.getDay() !== 1) t = new Date(t.getTime() + KPTL_HARI_MS);
			for (; t <= akhir; t = new Date(t.getTime() + 7 * KPTL_HARI_MS)) {
				bawah.push(`<div class="kptl-h kptl-h-hari" style="left:${x(kptl_iso(t))}px;width:${7 * px}px">${t.getDate()}</div>`);
			}
		}

		// Baris-baris.
		const cari = this.cari;
		const lolos = (a) =>
			(!cari || `${a.subject} ${a.kode_wbs} ${a.pj_nama || ""} ${a.pj_jabatan || ""}`.toLowerCase().includes(cari)) &&
			(!this.filter_status.size || this.filter_status.has(a.status_tampil)) &&
			(!this.hanya_kritis || a.kritis);
		const baris = [];
		const p = d.project;
		if (p.mulai && p.selesai) {
			baris.push(`<div class="kptl-row kptl-row-khusus">
				<div class="kptl-label"><b>${__("Periode kontrak")}</b></div>
				<div class="kptl-track">
					<div class="kptl-periode" style="left:${x(p.mulai)}px;width:${w(p.mulai, p.selesai)}px" title="${__("Masa pelaksanaan")}: ${kptl_teks_tgl(p.mulai)} – ${kptl_teks_tgl(p.selesai)}"></div>
					${p.akhir_pemeliharaan ? `<div class="kptl-periode kptl-pemeliharaan" style="left:${x(p.selesai) + px}px;width:${Math.max(w(p.selesai, p.akhir_pemeliharaan) - px, 2)}px" title="${__("Masa pemeliharaan s.d.")} ${kptl_teks_tgl(p.akhir_pemeliharaan)}"></div>` : ""}
				</div></div>`);
		}
		if (this.opsi.milestone && d.milestone.length) {
			// Milestone berdekatan dibagi ke 2 lajur supaya label T-nya tidak bertumpuk.
			const LEBAR_LABEL = 46;
			const akhir_lajur = [-Infinity, -Infinity];
			const ms = d.milestone
				.map((m) => ({ ...m, kiri: x(m.tanggal_target) + px / 2 }))
				.sort((a, b) => a.kiri - b.kiri)
				.map((m) => {
					let lajur = m.kiri - akhir_lajur[0] >= LEBAR_LABEL ? 0 : m.kiri - akhir_lajur[1] >= LEBAR_LABEL ? 1 : akhir_lajur[0] <= akhir_lajur[1] ? 0 : 1;
					akhir_lajur[lajur] = m.kiri;
					return { ...m, lajur };
				});
			const dua_lajur = ms.some((m) => m.lajur === 1);
			baris.push(`<div class="kptl-row kptl-row-khusus ${dua_lajur ? "kptl-row-ms2" : ""}">
				<div class="kptl-label"><b>${__("Milestone / Termin")}</b></div>
				<div class="kptl-track">${ms
					.map((m) => {
						const warna = { Tercapai: "hijau", Terlambat: "merah" }[m.status] || "ungu";
						const info = `T${m.urutan} ${m.nama_milestone}\n${__("Target")}: ${kptl_teks_tgl(m.tanggal_target)}${m.tanggal_tercapai ? `\n${__("Tercapai")}: ${kptl_teks_tgl(m.tanggal_tercapai)}` : ""}\n${__("Bobot")}: ${kptl_persen(m.bobot, 2)} · ${format_currency(m.nilai_termin, "IDR", 0)}\n${__(m.status)}`;
						return `<div class="kptl-ms kptl-ms-${warna} kptl-ms-lajur${m.lajur}" style="left:${m.kiri}px" title="${kptl_esc(info)}" data-kptl="milestone"><i></i><span>T${m.urutan}</span></div>`;
					})
					.join("")}</div></div>`);
		}
		d.kelompok.forEach((g) => {
			const akt = g.aktivitas.filter(lolos);
			if (!akt.length) return;
			const tutup = this.tertutup.has(g.kode);
			const prog = Math.min(flt(g.progres), 100);
			const telat = g.aktivitas.filter((a) => a.status_tampil === "Terlambat").length;
			baris.push(`<div class="kptl-row kptl-row-grup" data-kptl="grup" data-kode="${kptl_esc(g.kode)}">
				<div class="kptl-label"><span class="kptl-toggle">${frappe.utils.icon(tutup ? "right" : "down", "xs")}</span>
					<span class="kptl-kode">${kptl_esc(g.kode)}</span><b class="kptl-potong" title="${kptl_esc(g.uraian)}">${kptl_esc(g.uraian)}</b>
					<span class="kptl-sub-kecil">${kptl_persen(prog)}</span></div>
				<div class="kptl-track">${g.mulai ? `<div class="kptl-bar-grup ${telat ? "kptl-bar-grup-telat" : ""}" style="left:${x(g.mulai)}px;width:${w(g.mulai, g.selesai)}px"
						title="${kptl_esc(g.uraian)}: ${kptl_teks_tgl(g.mulai)} – ${kptl_teks_tgl(g.selesai)} · ${kptl_persen(prog)}${telat ? ` · ${__("{0} aktivitas terlambat", [telat])}` : ""}"><div style="width:${prog}%"></div></div>
					${this.opsi.label ? `<span class="kptl-bar-label kptl-grup-tgl" style="left:${x(g.mulai) + w(g.mulai, g.selesai) + 6}px">${kptl_teks_tgl(g.mulai).slice(0, 6)} – ${kptl_teks_tgl(g.selesai).slice(0, 6)}${telat ? ` · <b class="kptl-merah">${__("{0} terlambat", [telat])}</b>` : ""}</span>` : ""}` : ""}</div>
			</div>`);
			if (tutup) return;
			akt.forEach((a) => {
				const warna = KPTL_WARNA_STATUS[a.status_tampil] || "belum";
				const prog_a = Math.min(flt(a.progress), 100);
				const lebar_bar = a.mulai ? w(a.mulai, a.selesai) : 0;
				const ket = a.metode_progres === "Tahapan" ? __("Tahapan") : `${format_number(a.realisasi_volume)} / ${format_number(a.target_volume)} ${a.satuan || ""}`;
				const info = `${a.kode_wbs} ${a.subject}\n${kptl_teks_tgl(a.mulai)} – ${kptl_teks_tgl(a.selesai)} (${a.durasi_hk || 0} hk)\n${__("Progres")}: ${kptl_persen(prog_a)} · ${ket}\n${__("Status")}: ${__(a.status_tampil)}${a.pj_nama ? `\nPJ: ${a.pj_nama}` : ""}${a.kritis ? `\n${__("Jalur kritis")}` : ""}`;
				baris.push(`<div class="kptl-row">
					<div class="kptl-label kptl-label-akt"><span class="kptl-kode">${kptl_esc(a.kode_wbs)}</span>
						<a class="kptl-potong kptl-nama" data-kptl="task" data-name="${kptl_esc(a.name)}" title="${kptl_esc(a.subject)}">${kptl_esc(a.subject)}</a></div>
					<div class="kptl-track">${a.mulai ? `
						<div class="kptl-bar kptl-bar-${warna} ${this.opsi.kritis && a.kritis ? "kptl-bar-kritis" : ""}" style="left:${x(a.mulai)}px;width:${lebar_bar}px"
							title="${kptl_esc(info)}" data-kptl="task" data-name="${kptl_esc(a.name)}">
							${prog_a > 0 && warna !== "selesai" ? `<div class="kptl-bar-isi" style="width:${prog_a}%"></div>` : ""}
							${lebar_bar >= 34 ? `<span class="kptl-bar-persen">${kptl_persen(prog_a, 0)}</span>` : ""}
						</div>
						${this.opsi.label ? `<span class="kptl-bar-label" style="left:${x(a.mulai) + lebar_bar + 6}px">${kptl_esc(a.subject)}</span>` : ""}` : ""}
					</div></div>`);
			});
		});
		if (!d.kelompok.length) baris.push(`<div class="kptl-kosong">${__("Belum ada aktivitas. Buat di Task & Activity Management.")}</div>`);

		// Lapisan latar: garis bulan, arsir hari libur & akhir pekan, garis hari ini.
		const latar = [];
		for (let t = new Date(awal.getFullYear(), awal.getMonth() + 1, 1); t <= akhir; t = new Date(t.getFullYear(), t.getMonth() + 1, 1)) {
			latar.push(`<div class="kptl-garis-bulan" style="left:${x(kptl_iso(t))}px"></div>`);
		}
		// Arsir hari libur hanya di skala Hari / Minggu (di skala lebih rapat jadi terlalu ramai).
		if (this.opsi.libur && ["hari", "minggu"].includes(this.skala)) {
			const libur = new Set(d.libur);
			for (let t = new Date(awal); t <= akhir; t = new Date(t.getTime() + KPTL_HARI_MS)) {
				const iso = kptl_iso(t);
				if (libur.has(iso)) latar.push(`<div class="kptl-libur" style="left:${x(iso)}px;width:${px}px"></div>`);
			}
		}
		if (x_hari_ini >= 0 && x_hari_ini <= lebar) latar.push(`<div class="kptl-hari-ini" style="left:${x_hari_ini}px"></div>`);

		$g.html(`<div class="kptl-scroll"><div class="kptl-kanvas" style="width:${KPTL_LABEL_W + lebar}px">
			<div class="kptl-row kptl-header">
				<div class="kptl-label kptl-label-header">${__("Aktivitas")}</div>
				<div class="kptl-track kptl-track-header"><div class="kptl-h-atas">${atas.join("")}</div><div class="kptl-h-bawah">${bawah.join("")}</div></div>
			</div>
			<div class="kptl-badan"><div class="kptl-latar" style="left:${KPTL_LABEL_W}px;width:${lebar}px">${latar.join("")}</div>${baris.join("")}</div>
		</div></div>`);
		this.x_hari_ini = x_hari_ini;
	}

	gulir_hari_ini() {
		const $s = this.$body.find(".kptl-scroll");
		if (!$s.length || this.x_hari_ini == null) return;
		$s.animate({ scrollLeft: Math.max(this.x_hari_ini - ($s.width() - KPTL_LABEL_W) / 3, 0) }, 250);
	}

	// ---------- Kurva S ----------

	render_kurva() {
		const d = this.data;
		const titik = d.kurva_s || [];
		const $isi = this.$body.find(".kptl-isi");
		if (!titik.length) {
			$isi.html(`<div class="kptl-kosong">${__("Kurva S belum bisa dibuat: jadwal proyek / aktivitas belum ada.")}</div>`);
			return;
		}
		$isi.html(`<div class="kptl-kurva-kepala">
				<div class="kptl-kurva-judul">${__("Kurva S — progres kumulatif")}</div>
				<div class="kptl-legenda kptl-legenda-kurva">
					<span><i class="kptl-k kptl-k-rencana"></i>${__("Rencana")}</span>
					<span><i class="kptl-k kptl-k-aktual"></i>${__("Aktual")}</span>
					<span><i class="kptl-l-hariini"></i>${__("Hari ini")}</span>
				</div>
				<button class="btn btn-default btn-sm" data-kptl="tabel-kurva">${frappe.utils.icon("table", "xs")} ${this.tabel_kurva ? __("Sembunyikan tabel") : __("Tabel data")}</button>
			</div>
			<div class="kptl-kurva"></div>
			<div class="kptl-kurva-tabel"></div>`);
		this.gambar_kurva();
		if (this.tabel_kurva) this.render_tabel_kurva();
	}

	gambar_kurva() {
		const titik = this.data.kurva_s;
		const $k = this.$body.find(".kptl-kurva");
		const W = Math.max($k.width() || 900, 480), H = 360;
		const m = { kiri: 48, kanan: 90, atas: 16, bawah: 40 };
		const iw = W - m.kiri - m.kanan, ih = H - m.atas - m.bawah;
		const t0 = kptl_tgl(this.data.project.mulai) || kptl_tgl(titik[0].tanggal);
		const t1 = kptl_tgl(titik[titik.length - 1].tanggal);
		const awal = new Date(t0.getTime() - 7 * KPTL_HARI_MS);
		const span = Math.max(kptl_selisih_hari(awal, t1), 1);
		const sx = (s) => m.kiri + (kptl_selisih_hari(awal, kptl_tgl(s)) / span) * iw;
		const sy = (v) => m.atas + ih - (flt(v) / 100) * ih;
		const data = [{ tanggal: kptl_iso(awal), rencana: 0, aktual: 0 }, ...titik];
		const garis = (k) =>
			data.filter((p) => p[k] != null).map((p, i) => `${i ? "L" : "M"}${sx(p.tanggal).toFixed(1)},${sy(p[k]).toFixed(1)}`).join(" ");
		const akhir_aktual = [...data].reverse().find((p) => p.aktual != null);
		const akhir_rencana = data[data.length - 1];
		const grid = [0, 25, 50, 75, 100]
			.map((v) => `<line class="kptl-k-grid" x1="${m.kiri}" x2="${m.kiri + iw}" y1="${sy(v)}" y2="${sy(v)}"/><text class="kptl-k-sumbu" x="${m.kiri - 8}" y="${sy(v) + 4}" text-anchor="end">${v}%</text>`)
			.join("");
		const bulan = [];
		for (let t = new Date(awal.getFullYear(), awal.getMonth() + 1, 1); t <= t1; t = new Date(t.getFullYear(), t.getMonth() + 1, 1)) {
			const xx = sx(kptl_iso(t));
			bulan.push(`<line class="kptl-k-tick" x1="${xx}" x2="${xx}" y1="${m.atas + ih}" y2="${m.atas + ih + 5}"/><text class="kptl-k-sumbu" x="${xx}" y="${m.atas + ih + 20}" text-anchor="middle">${KPTL_BULAN[t.getMonth()]}${t.getMonth() === 0 ? ` ${t.getFullYear()}` : ""}</text>`);
		}
		const hari_ini = new Date();
		const xh = sx(kptl_iso(hari_ini));
		const label_akhir = (p, k, kelas, nama) =>
			p ? `<text class="kptl-k-label ${kelas}" x="${sx(p.tanggal) + 8}" y="${sy(p[k]) + 4}">${nama} ${kptl_persen(p[k])}</text>` : "";
		$k.html(`<svg class="kptl-kurva-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${__("Kurva S rencana vs aktual")}">
			${grid}${bulan.join("")}
			<line class="kptl-k-sumbu-garis" x1="${m.kiri}" x2="${m.kiri + iw}" y1="${m.atas + ih}" y2="${m.atas + ih}"/>
			${xh >= m.kiri && xh <= m.kiri + iw ? `<line class="kptl-k-hariini" x1="${xh}" x2="${xh}" y1="${m.atas}" y2="${m.atas + ih}"/>` : ""}
			<path class="kptl-k-rencana-garis" d="${garis("rencana")}"/>
			<path class="kptl-k-aktual-garis" d="${garis("aktual")}"/>
			${akhir_aktual ? `<circle class="kptl-k-titik" cx="${sx(akhir_aktual.tanggal)}" cy="${sy(akhir_aktual.aktual)}" r="5"/>` : ""}
			${label_akhir(akhir_rencana, "rencana", "kptl-k-label-rencana", __("Rencana"))}
			${label_akhir(akhir_aktual, "aktual", "kptl-k-label-aktual", __("Aktual"))}
			<line class="kptl-k-cross" x1="0" x2="0" y1="${m.atas}" y2="${m.atas + ih}" style="display:none"/>
			<rect class="kptl-k-hit" x="${m.kiri}" y="${m.atas}" width="${iw}" height="${ih}"/>
		</svg><div class="kptl-k-tip" style="display:none"></div>`);

		// Crosshair + tooltip: titik minggu terdekat.
		const $svg = $k.find("svg"), $tip = $k.find(".kptl-k-tip"), $cross = $k.find(".kptl-k-cross");
		$k.find(".kptl-k-hit")
			.on("mousemove", (e) => {
				const rect = $svg[0].getBoundingClientRect();
				const mx = e.clientX - rect.left;
				let terdekat = titik[0];
				titik.forEach((p) => Math.abs(sx(p.tanggal) - mx) < Math.abs(sx(terdekat.tanggal) - mx) && (terdekat = p));
				const xx = sx(terdekat.tanggal);
				$cross.attr({ x1: xx, x2: xx }).show();
				const dev = terdekat.aktual != null ? flt(terdekat.aktual) - flt(terdekat.rencana) : null;
				$tip.html(`<div class="kptl-k-tip-judul">${__("Minggu s.d.")} ${kptl_teks_tgl(terdekat.tanggal)}</div>
					<div><i class="kptl-k kptl-k-rencana"></i>${__("Rencana")} <b>${kptl_persen(terdekat.rencana)}</b></div>
					<div><i class="kptl-k kptl-k-aktual"></i>${__("Aktual")} <b>${terdekat.aktual != null ? kptl_persen(terdekat.aktual) : "—"}</b></div>
					${dev != null ? `<div>${__("Deviasi")} <b>${dev > 0 ? "+" : ""}${kptl_persen(dev, 2)}</b></div>` : ""}`)
					.css({ left: Math.min(xx + 12, W - 190), top: m.atas + 8 })
					.show();
			})
			.on("mouseleave", () => {
				$tip.hide();
				$cross.hide();
			});
	}

	render_tabel_kurva() {
		const rows = this.data.kurva_s
			.map((p) => {
				const dev = p.aktual != null ? flt(p.aktual) - flt(p.rencana) : null;
				return `<tr><td>${kptl_teks_tgl(p.tanggal)}</td><td class="text-right">${kptl_persen(p.rencana)}</td>
					<td class="text-right">${p.aktual != null ? kptl_persen(p.aktual) : "—"}</td>
					<td class="text-right ${dev != null && dev < 0 ? "kptl-merah" : ""}">${dev != null ? `${dev > 0 ? "+" : ""}${kptl_persen(dev, 2)}` : "—"}</td></tr>`;
			})
			.join("");
		this.$body.find(".kptl-kurva-tabel").html(`<div class="kptl-tabel-wrap"><table class="kptl-tabel kptl-tabel-kurva">
			<thead><tr><th>${__("Minggu s.d.")}</th><th class="text-right">${__("Rencana")}</th><th class="text-right">${__("Aktual")}</th><th class="text-right">${__("Deviasi")}</th></tr></thead>
			<tbody>${rows}</tbody></table></div>`);
	}

	// ---------- aksi ----------

	aksi(e) {
		const $el = $(e.target).closest("[data-kptl]");
		const jenis = $el.attr("data-kptl");
		switch (jenis) {
			case "buka":
				return frappe.set_route("project-timeline", $el.attr("data-project"));
			case "tab":
				this.tab = $el.attr("data-tab");
				return this.render();
			case "skala":
				this.skala = $el.attr("data-skala");
				this.$body.find(".kptl-skala .btn").removeClass("active");
				$el.addClass("active");
				this.render_gantt();
				return this.skala !== "pas" && this.gulir_hari_ini();
			case "grup": {
				if ($(e.target).closest(".kptl-bar-grup").length) return;
				const kode = $el.attr("data-kode");
				this.tertutup.has(kode) ? this.tertutup.delete(kode) : this.tertutup.add(kode);
				return this.render_gantt();
			}
			case "buka-semua":
				this.tertutup = new Set();
				return this.render_gantt();
			case "tutup-semua":
				this.tertutup = new Set(this.data.kelompok.map((g) => g.kode));
				return this.render_gantt();
			case "filter-status": {
				const s = $el.attr("data-status");
				e.target.checked ? this.filter_status.add(s) : this.filter_status.delete(s);
				e.stopPropagation();
				return this.render_gantt();
			}
			case "filter-kritis":
				this.hanya_kritis = e.target.checked;
				e.stopPropagation();
				return this.render_gantt();
			case "opsi":
				this.opsi[$el.attr("data-opsi")] = e.target.checked;
				e.stopPropagation();
				return this.render_gantt();
			case "hari-ini":
				if (this.skala === "pas") {
					this.skala = "minggu";
					this.$body.find(".kptl-skala .btn").removeClass("active").filter('[data-skala="minggu"]').addClass("active");
					this.render_gantt();
				}
				return this.gulir_hari_ini();
			case "layar-penuh": {
				const el = this.$body.find(".kptl-isi")[0];
				if (document.fullscreenElement) return document.exitFullscreen();
				return el?.requestFullscreen?.().then(() => setTimeout(() => this.render_gantt(), 100));
			}
			case "cetak":
				return window.print();
			case "task":
				return frappe.set_route("Form", "Task", $el.attr("data-name"));
			case "milestone":
				return frappe.set_route("milestone-dan-termin", this.project);
			case "tabel-kurva":
				this.tabel_kurva = !this.tabel_kurva;
				return this.render_kurva();
		}
	}
}
