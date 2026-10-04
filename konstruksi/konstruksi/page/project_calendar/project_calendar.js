// Project Calendar: kalender bulanan proyek — hari kerja, hari libur, milestone, agenda, jumlah aktivitas berjalan.
// Data & aksi: konstruksi.konstruksi.project_calendar. Gaya: kelas kpc-* di konstruksi.bundle.css.
// Route: /app/project-calendar/<ID Project>.

frappe.pages["project-calendar"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Project Calendar"), single_column: true });
	wrapper.kalender = new KalenderProyek(page, wrapper);
};

frappe.pages["project-calendar"].on_page_show = function (wrapper) {
	wrapper.kalender?.tampil();
};

const KPC_API = "konstruksi.konstruksi.project_calendar.";
const KPC_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const KPC_BULAN_SINGKAT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
// Urutan kolom kalender mulai Minggu (getDay JS: 0 = Minggu). Weekday Python: 0 = Senin … 6 = Minggu.
const KPC_HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const KPC_HARI_PANJANG = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const KPC_KATEGORI = [
	{ value: "Meeting", label: __("Rapat") },
	{ value: "Event", label: __("Kunjungan / Inspeksi") },
	{ value: "Call", label: __("Telepon / Online") },
	{ value: "Other", label: __("Lainnya") },
];
const KPC_STORAGE = "konstruksi.project_calendar.project";

const kpc_esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));
const kpc_py = (js_day) => (js_day + 6) % 7;
const kpc_iso = (d) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const kpc_parse = (s) => {
	const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
	return new Date(y, m - 1, d);
};
const kpc_tgl = (s, dengan_hari) => {
	const d = kpc_parse(s);
	const teks = `${d.getDate()} ${KPC_BULAN_SINGKAT[d.getMonth()]} ${d.getFullYear()}`;
	return dengan_hari ? `${KPC_HARI_PANJANG[d.getDay()]}, ${teks}` : teks;
};
const kpc_jam = (dt) => String(dt || "").slice(11, 16);

class KalenderProyek {
	constructor(page, wrapper) {
		this.page = page;
		this.wrapper = wrapper;
		const hari_ini = new Date();
		this.tahun = hari_ini.getFullYear();
		this.bulan = hari_ini.getMonth();
		this.data = null;

		this.field_project = page.add_field({
			fieldname: "project",
			fieldtype: "Link",
			options: "Project",
			label: __("Proyek"),
			get_query: () => ({ filters: { kontrak_project: ["is", "set"] } }),
			change: () => {
				const project = this.field_project.get_value();
				if (project && project !== this.project) this.ganti_project(project);
			},
		});
		page.set_primary_action(__("Agenda Baru"), () => this.dialog_agenda({}), "add");
		page.add_inner_button(__("Buka Project Master"), () => this.project && frappe.set_route("Form", "Project", this.project));

		this.$body = $(`<div class="kpc"></div>`).appendTo(page.main);
		this.$body.on("click", "[data-kpc]", (e) => this.aksi(e));
	}

	tampil() {
		const dari_route = frappe.get_route()[1];
		let simpanan = null;
		try {
			simpanan = localStorage.getItem(KPC_STORAGE);
		} catch (e) {
			// localStorage tidak tersedia (mode privat): tetap jalan tanpa ingatan proyek terakhir.
		}
		const project = dari_route || this.project || simpanan;
		if (project) return this.ganti_project(project);
		frappe.db
			.get_list("Project", { filters: { kontrak_project: ["is", "set"] }, fields: ["name"], order_by: "creation desc", limit: 1 })
			.then((rows) => (rows.length ? this.ganti_project(rows[0].name) : this.kosong()));
	}

	kosong() {
		this.$body.html(`<div class="kpc-kosong">${__("Belum ada Project Master. Buat dari Kontrak Project terlebih dahulu.")}</div>`);
	}

	ganti_project(project) {
		this.project = project;
		if (this.field_project.get_value() !== project) this.field_project.set_value(project);
		try {
			localStorage.setItem(KPC_STORAGE, project);
		} catch (e) {
			// abaikan
		}
		if (frappe.get_route()[1] !== project) frappe.set_route("project-calendar", project);
		this.muat();
	}

	muat() {
		if (!this.project) return;
		return frappe
			.xcall(KPC_API + "get_kalender", { project: this.project, tahun: this.tahun, bulan: this.bulan + 1 })
			.then((data) => {
				this.data = data;
				this.render();
			});
	}

	call(method, args, pesan) {
		return frappe.xcall(KPC_API + method, { project: this.project, ...args }).then((r) => {
			if (pesan) frappe.show_alert({ message: pesan, indicator: "green" });
			return this.muat().then(() => r);
		});
	}

	// ---------- render ----------

	render() {
		const d = this.data;
		const p = d.project;
		const periode = p.mulai && p.selesai ? `${kpc_tgl(p.mulai)} – ${kpc_tgl(p.selesai)}` : __("Menunggu SPMK");
		this.page.set_title(__("Project Calendar"));
		this.$body.html(`
			<div class="kpc-head">
				<a class="kpc-crumb" href="/app/project/${encodeURIComponent(p.name)}">${kpc_esc(p.name)} · ${kpc_esc(p.project_name)}</a>
				<div class="kpc-sub">${__("Hari kerja, hari libur, dan agenda proyek.")}</div>
				<div class="kpc-chips">
					<span class="kpc-chip kpc-chip-blue">${__("Pelaksanaan")}: ${periode}</span>
					${p.akhir_pemeliharaan ? `<span class="kpc-chip">${__("Akhir Pemeliharaan")}: ${kpc_tgl(p.akhir_pemeliharaan)}</span>` : ""}
					${p.status_proyek ? `<span class="kpc-chip">${__("Status")}: ${kpc_esc(__(p.status_proyek))}</span>` : ""}
				</div>
			</div>
			<div class="kpc-layout">
				<div class="kpc-card kpc-cal">${this.html_kalender()}</div>
				<div class="kpc-side">
					${this.html_hari_kerja()}
					${this.html_libur()}
					${this.html_agenda_mendatang()}
				</div>
			</div>`);
	}

	html_kalender() {
		const d = this.data;
		const awal_bulan = new Date(this.tahun, this.bulan, 1);
		const awal = new Date(this.tahun, this.bulan, 1 - awal_bulan.getDay());
		const hari_ini = kpc_iso(new Date());
		const off = new Set(d.libur_mingguan);
		const libur = Object.fromEntries(d.libur.map((l) => [l.tanggal, l.keterangan]));
		const [periode_dari, periode_sampai] = [d.project.mulai, d.project.akhir_pemeliharaan || d.project.selesai];

		const per_tanggal = {};
		const tambah = (tgl, item) => (per_tanggal[tgl] = per_tanggal[tgl] || []).push(item);
		d.milestone.forEach((m) => tambah(m.tanggal, { jenis: "milestone", ...m }));
		d.agenda.forEach((a) => {
			const mulai = kpc_parse(a.starts_on);
			const selesai = a.ends_on ? kpc_parse(a.ends_on) : mulai;
			for (let t = new Date(mulai); t <= selesai; t.setDate(t.getDate() + 1)) tambah(kpc_iso(t), { jenis: "agenda", ...a });
		});
		const penanda = {};
		if (d.project.mulai) penanda[String(d.project.mulai)] = __("Mulai Pelaksanaan");
		if (d.project.selesai) penanda[String(d.project.selesai)] = __("Batas Selesai");
		if (d.project.akhir_pemeliharaan) penanda[String(d.project.akhir_pemeliharaan)] = __("Akhir Pemeliharaan");

		let sel = "";
		for (let i = 0; i < 42; i++) {
			const t = new Date(awal.getFullYear(), awal.getMonth(), awal.getDate() + i);
			const iso = kpc_iso(t);
			const kelas = ["kpc-day"];
			if (t.getMonth() !== this.bulan) kelas.push("kpc-luar-bulan");
			if (off.has(kpc_py(t.getDay()))) kelas.push("kpc-off");
			if (libur[iso]) kelas.push("kpc-libur");
			if (iso === hari_ini) kelas.push("kpc-today");
			if ((periode_dari && iso < String(periode_dari)) || (periode_sampai && iso > String(periode_sampai))) kelas.push("kpc-luar-periode");

			const item = [];
			if (penanda[iso]) item.push(`<div class="kpc-ev kpc-ev-penanda" title="${kpc_esc(penanda[iso])}">⚑ ${kpc_esc(penanda[iso])}</div>`);
			if (libur[iso]) item.push(`<div class="kpc-ev kpc-ev-libur" title="${kpc_esc(libur[iso])}">${kpc_esc(libur[iso])}</div>`);
			(per_tanggal[iso] || []).forEach((x) => {
				if (x.jenis === "milestone") {
					item.push(`<div class="kpc-ev kpc-ev-milestone" data-kpc="task" data-name="${kpc_esc(x.name)}" title="${kpc_esc(x.subject)}">◆ ${kpc_esc(x.subject)}</div>`);
				} else {
					const jam = x.all_day ? "" : `<b>${kpc_jam(x.starts_on)}</b> `;
					item.push(`<div class="kpc-ev kpc-ev-agenda" data-kpc="agenda" data-name="${kpc_esc(x.name)}" title="${kpc_esc(x.subject)}">${jam}${kpc_esc(x.subject)}</div>`);
				}
			});
			const maks = 3;
			const lebih = item.length > maks ? `<div class="kpc-ev-lebih">+${item.length - maks} ${__("lagi")}</div>` : "";
			const jumlah = d.aktivitas[iso];
			sel += `<div class="${kelas.join(" ")}" data-kpc="hari" data-tanggal="${iso}">
				<div class="kpc-day-top">
					<span class="kpc-day-num">${t.getDate()}</span>
					${jumlah ? `<span class="kpc-day-count" title="${__("{0} aktivitas berjalan", [jumlah])}">${jumlah}</span>` : ""}
				</div>
				${item.slice(0, maks).join("")}${lebih}
			</div>`;
		}

		return `
			<div class="kpc-nav">
				<button class="btn btn-default btn-sm kpc-nav-btn" data-kpc="bulan" data-arah="-1" title="${__("Bulan sebelumnya")}">${frappe.utils.icon("left", "sm")}</button>
				<div class="kpc-nav-judul">${KPC_BULAN[this.bulan]} ${this.tahun}</div>
				<button class="btn btn-default btn-sm kpc-nav-btn" data-kpc="bulan" data-arah="1" title="${__("Bulan berikutnya")}">${frappe.utils.icon("right", "sm")}</button>
				<button class="btn btn-default btn-sm" data-kpc="hari-ini">${__("Hari ini")}</button>
			</div>
			<div class="kpc-grid">
				${KPC_HARI.map((h) => `<div class="kpc-dow">${h}</div>`).join("")}
				${sel}
			</div>
			<div class="kpc-legend">
				<span><i class="kpc-dot kpc-dot-libur"></i>${__("Hari libur")}</span>
				<span><i class="kpc-dot kpc-dot-off"></i>${__("Tidak kerja")}</span>
				<span><i class="kpc-dot kpc-dot-milestone"></i>${__("Milestone")}</span>
				<span><i class="kpc-dot kpc-dot-agenda"></i>${__("Agenda")}</span>
				<span><i class="kpc-dot kpc-dot-penanda"></i>${__("Tanggal kontrak")}</span>
				<span><i class="kpc-dot kpc-dot-count"></i>${__("Jumlah aktivitas berjalan")}</span>
			</div>`;
	}

	html_hari_kerja() {
		const d = this.data;
		const off = new Set(d.libur_mingguan);
		const tombol = KPC_HARI.map((h, js) => {
			const kerja = !off.has(kpc_py(js));
			return `<button class="kpc-hk ${kerja ? "kpc-hk-on" : ""}" data-kpc="hari-kerja" data-py="${kpc_py(js)}"
				${d.bisa_ubah ? "" : "disabled"} title="${KPC_HARI_PANJANG[js]}: ${kerja ? __("hari kerja") : __("tidak kerja")}">${h}</button>`;
		}).join("");
		const info =
			d.total_hari_kerja == null
				? __("Tanggal pelaksanaan belum ada (menunggu SPMK).")
				: __("Total {0} hari kerja dalam masa pelaksanaan. Dipakai untuk menghitung durasi aktivitas.", [
						`<b>${d.total_hari_kerja}</b>`,
				  ]);
		return `<div class="kpc-card">
			<div class="kpc-card-head"><div class="kpc-card-title">${__("Hari Kerja")}</div></div>
			<div class="kpc-hk-row">${tombol}</div>
			<div class="kpc-note">${info}</div>
		</div>`;
	}

	html_libur() {
		const d = this.data;
		const hari_ini = kpc_iso(new Date());
		const rows = d.libur.length
			? d.libur
					.map(
						(l) => `<div class="kpc-li ${l.tanggal < hari_ini ? "kpc-li-lewat" : ""}">
					<span class="kpc-li-dot kpc-dot-libur"></span>
					<div class="kpc-li-isi"><div class="kpc-li-judul">${kpc_esc(l.keterangan)}</div><div class="kpc-li-sub">${kpc_tgl(l.tanggal, true)}</div></div>
					${d.bisa_ubah ? `<button class="kpc-li-hapus" data-kpc="hapus-libur" data-tanggal="${l.tanggal}" title="${__("Hapus")}">${frappe.utils.icon("close", "xs")}</button>` : ""}
				</div>`
					)
					.join("")
			: `<div class="kpc-note">${__("Belum ada hari libur.")}</div>`;
		const tombol = d.bisa_ubah
			? `<div class="kpc-card-actions">
				<button class="btn btn-default btn-xs" data-kpc="impor-nasional" title="${__("Tambahkan libur nasional Indonesia dalam periode proyek")}">${__("Libur Nasional")}</button>
				<button class="btn btn-default btn-xs" data-kpc="tambah-libur">${frappe.utils.icon("add", "xs")} ${__("Tambah")}</button>
			</div>`
			: "";
		return `<div class="kpc-card">
			<div class="kpc-card-head"><div class="kpc-card-title">${__("Hari Libur")} <span class="kpc-count">${d.libur.length}</span></div>${tombol}</div>
			<div class="kpc-list">${rows}</div>
		</div>`;
	}

	html_agenda_mendatang() {
		const d = this.data;
		const rows = d.agenda_mendatang.length
			? d.agenda_mendatang
					.map((a) => {
						const waktu = a.all_day ? __("Sepanjang hari") : kpc_jam(a.starts_on) + (a.ends_on ? `–${kpc_jam(a.ends_on)}` : "");
						const kategori = KPC_KATEGORI.find((k) => k.value === a.event_category)?.label || "";
						return `<div class="kpc-li kpc-li-klik" data-kpc="agenda" data-name="${kpc_esc(a.name)}">
							<span class="kpc-li-dot kpc-dot-agenda"></span>
							<div class="kpc-li-isi">
								<div class="kpc-li-judul">${kpc_esc(a.subject)}</div>
								<div class="kpc-li-sub">${kpc_tgl(a.starts_on, true)} · ${waktu}${a.location ? ` · ${kpc_esc(a.location)}` : ""}</div>
								${kategori ? `<div class="kpc-li-sub">${kpc_esc(kategori)}</div>` : ""}
							</div>
						</div>`;
					})
					.join("")
			: `<div class="kpc-note">${__("Tidak ada agenda.")}</div>`;
		return `<div class="kpc-card">
			<div class="kpc-card-head"><div class="kpc-card-title">${__("Agenda Mendatang")}</div></div>
			<div class="kpc-list">${rows}</div>
		</div>`;
	}

	// ---------- aksi ----------

	aksi(e) {
		const $el = $(e.target).closest("[data-kpc]");
		const jenis = $el.attr("data-kpc");
		// Klik chip di dalam sel hari: jangan ikut membuka dialog hari.
		if (jenis !== "hari") e.stopPropagation();
		const d = this.data;
		switch (jenis) {
			case "bulan": {
				const t = new Date(this.tahun, this.bulan + Number($el.attr("data-arah")), 1);
				[this.tahun, this.bulan] = [t.getFullYear(), t.getMonth()];
				return this.muat();
			}
			case "hari-ini": {
				const t = new Date();
				[this.tahun, this.bulan] = [t.getFullYear(), t.getMonth()];
				return this.muat();
			}
			case "hari":
				return this.dialog_hari($el.attr("data-tanggal"));
			case "agenda": {
				const name = $el.attr("data-name");
				const a = [...d.agenda, ...d.agenda_mendatang].find((x) => x.name === name);
				return a && this.dialog_agenda(a);
			}
			case "task":
				return frappe.set_route("Form", "Task", $el.attr("data-name"));
			case "hari-kerja": {
				const py = Number($el.attr("data-py"));
				const off = new Set(d.libur_mingguan);
				off.has(py) ? off.delete(py) : off.add(py);
				const kerja = [0, 1, 2, 3, 4, 5, 6].filter((h) => !off.has(h));
				return this.call("set_hari_kerja", { hari_kerja: kerja }, __("Hari kerja diperbarui"));
			}
			case "tambah-libur":
				return this.dialog_libur();
			case "hapus-libur": {
				const tanggal = $el.attr("data-tanggal");
				const l = d.libur.find((x) => x.tanggal === tanggal);
				return frappe.confirm(__("Hapus hari libur {0} ({1})?", [kpc_esc(l?.keterangan), kpc_tgl(tanggal)]), () =>
					this.call("hapus_libur", { tanggal }, __("Hari libur dihapus"))
				);
			}
			case "impor-nasional":
				return this.call("impor_libur_nasional", {}).then((n) =>
					frappe.show_alert({
						message: n ? __("{0} libur nasional ditambahkan", [n]) : __("Semua libur nasional sudah ada"),
						indicator: n ? "green" : "blue",
					})
				);
		}
	}

	dialog_hari(tanggal) {
		const d = this.data;
		const libur = d.libur.find((l) => l.tanggal === tanggal);
		const off = new Set(d.libur_mingguan).has(kpc_py(kpc_parse(tanggal).getDay()));
		const agenda = d.agenda.filter((a) => {
			const mulai = String(a.starts_on).slice(0, 10);
			const selesai = String(a.ends_on || a.starts_on).slice(0, 10);
			return mulai <= tanggal && tanggal <= selesai;
		});
		const milestone = d.milestone.filter((m) => m.tanggal === tanggal);
		const status = libur
			? `<span class="kpc-chip kpc-chip-red">${__("Hari libur")}: ${kpc_esc(libur.keterangan)}</span>`
			: off
			? `<span class="kpc-chip">${__("Tidak kerja")}</span>`
			: `<span class="kpc-chip kpc-chip-blue">${__("Hari kerja")}</span>`;
		const isi = [
			...milestone.map((m) => `<div class="kpc-li"><span class="kpc-li-dot kpc-dot-milestone"></span><div class="kpc-li-isi"><div class="kpc-li-judul">${kpc_esc(m.subject)}</div><div class="kpc-li-sub">${__("Milestone")}</div></div></div>`),
			...agenda.map(
				(a) => `<div class="kpc-li kpc-li-klik" data-agenda="${kpc_esc(a.name)}"><span class="kpc-li-dot kpc-dot-agenda"></span><div class="kpc-li-isi"><div class="kpc-li-judul">${kpc_esc(a.subject)}</div><div class="kpc-li-sub">${a.all_day ? __("Sepanjang hari") : kpc_jam(a.starts_on)}${a.location ? ` · ${kpc_esc(a.location)}` : ""}</div></div></div>`
			),
		].join("");
		const jumlah = d.aktivitas[tanggal];

		const dialog = new frappe.ui.Dialog({
			title: kpc_tgl(tanggal, true),
			fields: [{ fieldname: "isi", fieldtype: "HTML" }],
		});
		dialog.fields_dict.isi.$wrapper.html(`<div class="kpc">
			<div class="kpc-chips">${status}${jumlah ? `<span class="kpc-chip">${__("{0} aktivitas berjalan", [jumlah])}</span>` : ""}</div>
			<div class="kpc-list kpc-list-dialog">${isi || `<div class="kpc-note">${__("Tidak ada agenda atau milestone.")}</div>`}</div>
		</div>`);
		dialog.fields_dict.isi.$wrapper.on("click", "[data-agenda]", (e) => {
			const a = agenda.find((x) => x.name === $(e.currentTarget).attr("data-agenda"));
			dialog.hide();
			this.dialog_agenda(a);
		});
		if (d.bisa_ubah) {
			dialog.set_primary_action(__("Tambah Agenda"), () => {
				dialog.hide();
				this.dialog_agenda({ tanggal });
			});
			if (libur) {
				dialog.set_secondary_action_label(__("Hapus Hari Libur"));
				dialog.set_secondary_action(() => {
					dialog.hide();
					this.call("hapus_libur", { tanggal }, __("Hari libur dihapus"));
				});
			} else {
				dialog.set_secondary_action_label(__("Jadikan Hari Libur"));
				dialog.set_secondary_action(() => {
					dialog.hide();
					this.dialog_libur(tanggal);
				});
			}
		}
		dialog.show();
	}

	dialog_libur(tanggal) {
		const dialog = new frappe.ui.Dialog({
			title: __("Tambah Hari Libur"),
			fields: [
				{ fieldname: "keterangan", fieldtype: "Data", label: __("Keterangan"), reqd: 1, description: __("Mis. Cuti Bersama Idul Fitri, Libur Proyek, Hujan Lebat") },
				{ fieldname: "dari", fieldtype: "Date", label: __("Tanggal"), reqd: 1, default: tanggal },
				{ fieldname: "sampai", fieldtype: "Date", label: __("Sampai Tanggal"), description: __("Isi bila liburnya lebih dari satu hari.") },
			],
			primary_action_label: __("Simpan"),
			primary_action: (v) => {
				dialog.hide();
				this.call("tambah_libur", v, __("Hari libur ditambahkan"));
			},
		});
		dialog.show();
	}

	dialog_agenda(a) {
		const baru = !a.name;
		const bisa_ubah = this.data?.bisa_ubah;
		const dialog = new frappe.ui.Dialog({
			title: baru ? __("Agenda Baru") : __("Agenda"),
			fields: [
				{ fieldname: "subject", fieldtype: "Data", label: __("Judul"), reqd: 1, default: a.subject },
				{ fieldname: "kategori", fieldtype: "Select", label: __("Jenis"), options: KPC_KATEGORI, default: a.event_category || "Meeting" },
				{ fieldname: "tanggal", fieldtype: "Date", label: __("Tanggal"), reqd: 1, default: a.tanggal || (a.starts_on ? String(a.starts_on).slice(0, 10) : frappe.datetime.get_today()) },
				{ fieldname: "sampai", fieldtype: "Date", label: __("Sampai Tanggal"), description: __("Isi bila agendanya lebih dari satu hari."),
					default: a.ends_on && String(a.ends_on).slice(0, 10) !== String(a.starts_on).slice(0, 10) ? String(a.ends_on).slice(0, 10) : null },
				{ fieldname: "all_day", fieldtype: "Check", label: __("Sepanjang hari"), default: baru ? 0 : a.all_day },
				{ fieldname: "jam_mulai", fieldtype: "Time", label: __("Jam Mulai"), depends_on: "eval:!doc.all_day", default: a.starts_on ? String(a.starts_on).slice(11, 19) : "09:00:00" },
				{ fieldname: "jam_selesai", fieldtype: "Time", label: __("Jam Selesai"), depends_on: "eval:!doc.all_day", default: a.ends_on ? String(a.ends_on).slice(11, 19) : null },
				{ fieldname: "lokasi", fieldtype: "Data", label: __("Lokasi"), default: a.location },
				{ fieldname: "keterangan", fieldtype: "Small Text", label: __("Keterangan"), default: a.description ? frappe.utils.html2text(a.description) : null },
			],
		});
		if (bisa_ubah) {
			dialog.set_primary_action(__("Simpan"), (v) => {
				dialog.hide();
				this.call("simpan_agenda", { ...v, name: a.name || null }, __("Agenda disimpan"));
			});
			if (!baru) {
				dialog.set_secondary_action_label(__("Hapus"));
				dialog.set_secondary_action(() =>
					frappe.confirm(__("Hapus agenda {0}?", [kpc_esc(a.subject)]), () => {
						dialog.hide();
						this.call("hapus_agenda", { name: a.name }, __("Agenda dihapus"));
					})
				);
			}
		} else {
			dialog.fields.forEach((df) => dialog.set_df_property(df.fieldname, "read_only", 1));
		}
		dialog.show();
	}
}
