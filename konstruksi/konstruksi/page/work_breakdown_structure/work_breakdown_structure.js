// Work Breakdown Structure: pohon item WBS proyek (disalin otomatis dari RAB Penawaran) dengan volume, nilai,
// bobot, dan progres. Data & aksi: konstruksi.konstruksi.wbs. Gaya: kelas kpw-* (+ kpr-*, kpt-aksi-*) di
// konstruksi.bundle.css. Route: /app/work-breakdown-structure/<ID Project>.

frappe.pages["work-breakdown-structure"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Work Breakdown Structure"), single_column: true });
	wrapper.wbs = new HalamanWBS(page);
};

frappe.pages["work-breakdown-structure"].on_page_show = function (wrapper) {
	wrapper.wbs?.tampil();
};

const KPW_API = "konstruksi.konstruksi.wbs.";
const KPW_STORAGE = "konstruksi.wbs.project";
const KPW_TERTUTUP = "konstruksi.wbs.tertutup";

const kpw_esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));
const kpw_rp = (v) => format_currency(flt(v), "IDR", 0);
const kpw_angka = (v) => format_number(flt(v), null, flt(v) % 1 ? 2 : 0);
const kpw_persen = (v, d = 2) => `${format_number(flt(v), null, d)}%`;

class HalamanWBS {
	constructor(page) {
		this.page = page;
		this.tertutup = new Set();
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
		page.add_inner_button(__("Buka Project Master"), () => this.project && frappe.set_route("Form", "Project", this.project));
		page.add_inner_button(__("Project Calendar"), () => this.project && frappe.set_route("project-calendar", this.project));

		this.$body = $(`<div class="kpr kpw"></div>`).appendTo(page.main);
		this.$body.on("click", "[data-kpw]", (e) => this.aksi(e));
	}

	tampil() {
		// Halaman modul Konstruksi: selalu dengan sidebar Konstruksi (lihat sidebar_konstruksi.bundle.js).
		const sidebar = frappe.app?.sidebar;
		if (sidebar && sidebar.sidebar_title !== "Konstruksi" && frappe.boot.workspace_sidebar_item?.konstruksi) {
			sidebar.setup("Konstruksi");
			sidebar.set_active_workspace_item?.();
		}
		const dari_route = frappe.get_route()[1];
		let simpanan = null;
		try {
			simpanan = localStorage.getItem(KPW_STORAGE);
		} catch (e) {
			// localStorage tidak tersedia: tetap jalan tanpa ingatan proyek terakhir.
		}
		const project = dari_route || this.project || simpanan;
		if (project) return this.ganti_project(project);
		frappe.db
			.get_list("Project", { filters: { kontrak_project: ["is", "set"] }, fields: ["name"], order_by: "creation desc", limit: 1 })
			.then((rows) => (rows.length ? this.ganti_project(rows[0].name) : this.kosong()));
	}

	kosong() {
		this.$body.html(`<div class="kpr-card kpr-kosong">${__("Belum ada Project Master. Buat dari Kontrak Project terlebih dahulu.")}</div>`);
	}

	ganti_project(project) {
		const ganti = this.project !== project;
		this.project = project;
		if (this.field_project.get_value() !== project) this.field_project.set_value(project);
		try {
			localStorage.setItem(KPW_STORAGE, project);
			if (ganti) this.tertutup = new Set(JSON.parse(localStorage.getItem(`${KPW_TERTUTUP}.${project}`) || "[]"));
		} catch (e) {
			// abaikan
		}
		if (frappe.get_route()[1] !== project) frappe.set_route("work-breakdown-structure", project);
		this.muat();
	}

	simpan_tertutup() {
		try {
			localStorage.setItem(`${KPW_TERTUTUP}.${this.project}`, JSON.stringify([...this.tertutup]));
		} catch (e) {
			// abaikan
		}
	}

	muat() {
		if (!this.project) return;
		return frappe.xcall(KPW_API + "get_wbs", { project: this.project }).then((data) => {
			this.data = data;
			this.render();
		});
	}

	call(method, args, pesan) {
		return frappe.xcall(KPW_API + method, { project: this.project, ...args }).then((r) => {
			if (pesan) frappe.show_alert({ message: pesan, indicator: "green" });
			return this.muat().then(() => r);
		});
	}

	// ---------- render ----------

	render() {
		const d = this.data;
		const p = d.project;
		this.page.clear_primary_action();
		if (d.bisa_buat && d.items.length) {
			this.page.set_primary_action(__("Item Level 1"), () => this.dialog_item({}), "add");
		}
		const kepala = `<div class="kpw-head">
			<a class="kpw-crumb" href="/app/project/${encodeURIComponent(p.name)}">${kpw_esc(p.name)} · ${kpw_esc(p.project_name)}</a>
			<div class="kpw-sub">${__("Pemecahan lingkup pekerjaan secara hierarkis beserta volume, nilai, bobot, dan progres.")}</div>
			<div class="kpw-sumber">${
				d.rab
					? __("Disalin dari {0} · PPN {1}% mengikuti Project Master.", [
							`<a href="/app/rab-penawaran/${encodeURIComponent(d.rab)}">${kpw_esc(d.rab)}</a>`,
							format_number(p.tarif_ppn, null, 0),
					  ])
					: __("RAB Penawaran untuk tender proyek ini tidak ditemukan.")
			}</div>
		</div>`;

		if (!d.items.length) {
			const tombol = d.bisa_buat && d.rab
				? `<button class="btn btn-primary btn-sm" data-kpw="buat">${__("Buat WBS dari RAB Penawaran")}</button>`
				: "";
			this.$body.html(`${kepala}<div class="kpr-card kpr-kosong">
				<div>${__("WBS proyek ini belum ada.")}</div>${tombol}</div>`);
			return;
		}
		this.$body.html(`${kepala}${this.html_kartu()}${this.html_tabel()}`);
	}

	html_kartu() {
		const d = this.data;
		const p = d.project;
		const total_ppn = d.total + d.ppn;
		const cocok = p.nilai_kontrak && Math.abs(total_ppn - p.nilai_kontrak) < 1;
		const level1 = d.items.filter((it) => !it.parent_wbs).length;
		const daun = d.items.filter((it) => !it.is_group);
		const total_bobot = daun.reduce((s, it) => s + flt(it.bobot), 0);
		const kartu = (warna, label, nilai, sub, kelas = "") => `<div class="kpr-card kpw-kartu ${kelas}">
			<div class="kpw-kartu-label">${label}</div>
			<div class="kpw-kartu-nilai">${nilai}</div>
			<div class="kpw-kartu-sub">${sub}</div>
			<span class="kpw-kartu-garis kpw-garis-${warna}"></span></div>`;
		const sub_kontrak = p.nilai_kontrak
			? cocok
				? `<span class="kpw-ok">${frappe.utils.icon("check", "xs")} ${__("Sama dengan nilai kontrak")}</span>`
				: `<span class="kpw-beda">${__("Nilai kontrak {0} (selisih {1})", [kpw_rp(p.nilai_kontrak), kpw_rp(total_ppn - p.nilai_kontrak)])}</span>`
			: __("Nilai kontrak belum ada");
		return `<div class="kpw-kartu-baris">
			${kartu("biru", __("Nilai WBS sebelum PPN"), kpw_rp(d.total), __("Jumlah harga semua item"))}
			${kartu(cocok ? "hijau" : "oranye", __("WBS + PPN {0}%", [format_number(p.tarif_ppn, null, 0)]), kpw_rp(total_ppn), sub_kontrak)}
			${kartu("ungu", __("Total Bobot"), kpw_persen(total_bobot, 2), __("Otomatis dari nilai item"))}
			${kartu("biru", __("Progres Proyek"), kpw_persen(d.progres, 2), `<div class="kpr-progress kpr-progress-biru"><div style="width:${Math.min(flt(d.progres), 100)}%"></div></div>${__("Bobot × progres tiap item")}`)}
			${kartu("abu", __("Item WBS"), d.items.length, __("{0} item level 1 · {1} aktivitas terhubung", [level1, d.aktivitas]))}
		</div>`;
	}

	html_tabel() {
		const d = this.data;
		const per_induk = {};
		d.items.forEach((it) => (per_induk[it.parent_wbs || ""] = per_induk[it.parent_wbs || ""] || []).push(it));
		const tersembunyi = (it) => {
			let induk = it.parent_wbs;
			const peta = Object.fromEntries(d.items.map((x) => [x.name, x]));
			while (induk) {
				if (this.tertutup.has(induk)) return true;
				induk = peta[induk]?.parent_wbs;
			}
			return false;
		};

		const baris = d.items
			.filter((it) => !tersembunyi(it))
			.map((it) => {
				const anak = (per_induk[it.name] || []).length;
				const buka = !this.tertutup.has(it.name);
				const toggle = it.is_group
					? `<span class="kpw-toggle">${frappe.utils.icon(buka ? "down" : "right", "xs")}</span>`
					: `<span class="kpw-toggle-kosong"></span>`;
				const progres = Math.min(flt(it.progres), 100);
				return `<tr class="${it.is_group ? "kpw-induk" : ""} kpw-level-${Math.min(it.level, 4)}" ${it.is_group ? `data-kpw="toggle" data-name="${kpw_esc(it.name)}"` : ""}>
					<td class="kpw-kode">${kpw_esc(it.kode)}</td>
					<td class="kpw-uraian"><div class="kpw-uraian-isi" style="padding-left:${(it.level - 1) * 20}px">
						${toggle}<span class="kpw-uraian-teks" title="${kpw_esc(it.uraian)}">${kpw_esc(it.uraian)}</span>
						${it.is_group ? `<span class="kpw-badge">${anak} item</span>` : ""}
						${it.jumlah_task ? `<span class="kpw-badge kpw-badge-biru" title="${__("Aktivitas (Task) terhubung")}">${it.jumlah_task} ${__("aktivitas")}</span>` : ""}
					</div></td>
					<td class="kpw-spek" title="${kpw_esc(it.spesifikasi)}">${it.spesifikasi ? kpw_esc(it.spesifikasi) : '<span class="kpw-strip">—</span>'}</td>
					<td>${it.is_group ? "" : kpw_esc(it.satuan || "")}</td>
					<td class="text-right">${it.is_group ? "" : kpw_angka(it.volume)}</td>
					<td class="text-right">${it.is_group ? "" : kpw_rp(it.harga_satuan)}</td>
					<td class="text-right kpw-nilai">${kpw_rp(it.jumlah_harga)}</td>
					<td class="text-right">${kpw_persen(it.bobot)}</td>
					<td><div class="kpw-progres"><div class="kpr-progress ${progres >= 100 ? "kpr-progress-ok" : "kpr-progress-biru"}"><div style="width:${progres}%"></div></div>
						<span>${kpw_persen(progres, 0)}</span></div></td>
					<td class="text-right kpt-aksi">${this.html_aksi(it)}</td>
				</tr>`;
			})
			.join("");

		return `<div class="kpr-card kpw-tabel-card">
			<div class="kpw-toolbar">
				<div class="btn-group">
					<button class="btn btn-default btn-sm" data-kpw="buka-semua">${frappe.utils.icon("down", "xs")} ${__("Buka semua")}</button>
					<button class="btn btn-default btn-sm" data-kpw="tutup-semua">${frappe.utils.icon("right", "xs")} ${__("Tutup semua")}</button>
				</div>
				<span class="kpw-petunjuk">${__("Klik baris induk untuk membuka / menutup sub-itemnya.")}</span>
			</div>
			<div class="kpw-tabel-wrap">
				<table class="kpw-tabel">
					<colgroup>
						<col style="width:70px"><col><col style="width:16%"><col style="width:70px"><col style="width:80px">
						<col style="width:130px"><col style="width:150px"><col style="width:80px"><col style="width:130px"><col style="width:84px">
					</colgroup>
					<thead><tr>
						<th>${__("Kode")}</th><th>${__("Uraian Pekerjaan")}</th><th>${__("Spesifikasi")}</th><th>${__("Satuan")}</th>
						<th class="text-right">${__("Volume")}</th><th class="text-right">${__("Harga Satuan")}</th>
						<th class="text-right">${__("Jumlah Harga")}</th><th class="text-right">${__("Bobot")}</th>
						<th>${__("Progres")}*</th><th></th>
					</tr></thead>
					<tbody>${baris}</tbody>
					<tfoot>
						<tr><td colspan="6" class="text-right">${__("Jumlah (sebelum PPN)")}</td><td class="text-right">${kpw_rp(d.total)}</td>
							<td class="text-right"><b>100%</b></td><td colspan="2" rowspan="3" class="kpw-catatan">* ${__("Progres otomatis dari Task yang terhubung ke item WBS (menu Task & Activity Management).")}</td></tr>
						<tr><td colspan="6" class="text-right">${__("PPN {0}%", [format_number(d.project.tarif_ppn, null, 0)])}</td><td class="text-right">${kpw_rp(d.ppn)}</td><td></td></tr>
						<tr class="kpw-total"><td colspan="6" class="text-right">${__("Total termasuk PPN")}</td><td class="text-right">${kpw_rp(d.total + d.ppn)}</td><td></td></tr>
					</tfoot>
				</table>
			</div>
		</div>`;
	}

	html_aksi(it) {
		const d = this.data;
		const item = (aksi, ikon, label, kelas = "") =>
			`<a class="dropdown-item kpt-aksi-item ${kelas}" data-kpw="${aksi}" data-name="${kpw_esc(it.name)}">
				<span class="kpt-aksi-ikon">${frappe.utils.icon(ikon, "sm")}</span><span>${label}</span></a>`;
		const menu = [];
		if (d.bisa_ubah) menu.push(item("ubah", "pencil", __("Ubah Item")));
		if (d.bisa_buat) menu.push(item("sub", "plus", __("Tambah Sub-item")));
		menu.push(item("task", "list-checks", it.jumlah_task ? __("Lihat Aktivitas ({0})", [it.jumlah_task]) : __("Lihat Aktivitas")));
		if (d.bisa_ubah && !it.is_group && !it.jumlah_task) {
			menu.push('<div class="dropdown-divider"></div>', item("hapus", "trash-2", __("Hapus Item"), "kpt-aksi-bahaya"));
		}
		return `<div class="dropdown kpt-aksi-dropdown">
			<button class="btn btn-xs kpt-aksi-btn" data-toggle="dropdown">${__("Aksi")} ${frappe.utils.icon("down", "xs")}</button>
			<div class="dropdown-menu dropdown-menu-right kpt-aksi-menu">${menu.join("")}</div>
		</div>`;
	}

	// ---------- aksi ----------

	aksi(e) {
		const $el = $(e.target).closest("[data-kpw]");
		const jenis = $el.attr("data-kpw");
		const name = $el.attr("data-name");
		const it = this.data?.items.find((x) => x.name === name);
		if (jenis !== "toggle") e.stopPropagation();
		// Klik tombol / menu Aksi di baris induk: jangan ikut membuka-tutup baris.
		if (jenis === "toggle" && $(e.target).closest(".kpt-aksi-dropdown").length) return;
		switch (jenis) {
			case "toggle":
				this.tertutup.has(name) ? this.tertutup.delete(name) : this.tertutup.add(name);
				this.simpan_tertutup();
				return this.render();
			case "buka-semua":
				this.tertutup.clear();
				this.simpan_tertutup();
				return this.render();
			case "tutup-semua":
				this.tertutup = new Set(this.data.items.filter((x) => x.is_group).map((x) => x.name));
				this.simpan_tertutup();
				return this.render();
			case "buat":
				return this.call("buat_wbs", {}).then((n) => frappe.show_alert({ message: __("{0} item WBS dibuat dari RAB", [n]), indicator: "green" }));
			case "ubah":
				return this.dialog_item(it);
			case "sub":
				return this.dialog_item({ induk: it });
			case "task":
				return frappe.set_route("List", "Task", { project: this.project, wbs_item: name });
			case "hapus":
				return frappe.confirm(__("Hapus item {0} {1}?", [kpw_esc(it.kode), kpw_esc(it.uraian)]), () =>
					this.call("hapus_item", { name }, __("Item dihapus"))
				);
		}
	}

	dialog_item(it) {
		const baru = !it.name;
		const induk = it.induk;
		const is_group = !baru && it.is_group;
		const judul = baru
			? induk
				? __("Sub-item dari {0} {1}", [induk.kode, induk.uraian])
				: __("Item Level 1")
			: __("Ubah Item {0}", [it.kode]);
		const dialog = new frappe.ui.Dialog({
			title: judul,
			fields: [
				{ fieldname: "uraian", fieldtype: "Data", label: __("Uraian Pekerjaan"), reqd: 1, default: it.uraian },
				{ fieldname: "spesifikasi", fieldtype: "Small Text", label: __("Spesifikasi"), default: it.spesifikasi },
				{ fieldname: "nilai_section", fieldtype: "Section Break", hidden: is_group ? 1 : 0 },
				{ fieldname: "satuan", fieldtype: "Data", label: __("Satuan"), default: it.satuan },
				{ fieldname: "volume", fieldtype: "Float", label: __("Volume"), default: it.volume },
				{ fieldname: "nilai_col", fieldtype: "Column Break" },
				{ fieldname: "harga_satuan", fieldtype: "Currency", label: __("Harga Satuan"), options: "IDR", default: it.harga_satuan },
				{ fieldname: "lain_section", fieldtype: "Section Break" },
				{
					fieldname: "keterangan",
					fieldtype: "Small Text",
					label: __("Keterangan"),
					default: it.keterangan,
					description: baru ? __("Mis. nomor addendum bila item ini pekerjaan tambah.") : "",
				},
			],
			primary_action_label: __("Simpan"),
			primary_action: (v) => {
				dialog.hide();
				this.call(
					"simpan_item",
					{ ...v, name: it.name || null, induk: induk?.name || null },
					baru ? __("Item ditambahkan") : __("Item disimpan")
				);
			},
		});
		if (is_group) {
			dialog.set_df_property("spesifikasi", "description", __("Nilai item induk = jumlah sub-itemnya."));
		}
		dialog.show();
	}
}
