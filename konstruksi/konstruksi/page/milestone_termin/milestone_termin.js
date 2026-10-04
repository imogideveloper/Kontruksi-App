// Milestone & Termin: tahapan capaian pekerjaan sebagai dasar penagihan termin ke klien.
// Data & aksi: konstruksi.konstruksi.milestone. Gaya: kelas kpm2-* (+ kpw-*, kpa-*, kpr-*) di konstruksi.bundle.css.
// Route: /app/milestone-termin (daftar proyek) · /app/milestone-termin/<ID Project>.

frappe.pages["milestone-termin"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Milestone & Termin"), single_column: true });
	wrapper.milestone = new HalamanMilestone(page);
};

frappe.pages["milestone-termin"].on_page_show = function (wrapper) {
	wrapper.milestone?.tampil();
};

const KPM2_API = "konstruksi.konstruksi.milestone.";
const KPM2_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const kpm2_esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));
const kpm2_tgl = (v) => {
	if (!v) return "";
	const [y, m, d] = String(v).slice(0, 10).split("-").map(Number);
	return `${String(d).padStart(2, "0")} ${KPM2_BULAN[m - 1]} ${y}`;
};
const kpm2_rp = (v) => format_currency(flt(v), "IDR", 0);
const kpm2_persen = (v) => `${format_number(flt(v), null, flt(v) % 1 ? 2 : 0)}%`;

class HalamanMilestone {
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
				if (project && project !== this.project) frappe.set_route("milestone-termin", project);
			},
		});
		this.$body = $(`<div class="kpr kpw kpa kpm2"></div>`).appendTo(page.main);
		this.$body.on("click", "[data-kpm2]", (e) => this.aksi(e));
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
		this.page.add_inner_button(__("Semua Proyek"), () => frappe.set_route("milestone-termin"));
		this.page.add_inner_button(__("Work Breakdown Structure"), () => frappe.set_route("work-breakdown-structure", this.project));
		this.page.add_inner_button(__("Project Calendar"), () => frappe.set_route("project-calendar", this.project));
		if (this.data?.bisa_buat) this.page.set_primary_action(__("Milestone / Termin Baru"), () => this.dialog_milestone({}), "add");
	}

	// ---------- daftar proyek ----------

	daftar() {
		this.project = null;
		this.data = null;
		if (this.field_project.get_value()) this.field_project.set_value("");
		this.atur_toolbar("daftar");
		return frappe.xcall(KPM2_API + "get_daftar").then((rows) => {
			const kepala = `<div class="kpw-head"><div class="kpw-sub">${__("Pilih proyek untuk mengatur milestone pekerjaan dan termin penagihannya.")}</div></div>`;
			if (!rows.length) {
				this.$body.html(`${kepala}<div class="kpr-card kpr-kosong">${__("Belum ada Project Master. Buat dari Kontrak Project terlebih dahulu.")}</div>`);
				return;
			}
			const baris = rows
				.map((r) => {
					const p = Math.min(flt(r.bobot_tercapai), 100);
					return `<tr class="kpw-baris-proyek" data-kpm2="buka" data-project="${kpm2_esc(r.name)}">
						<td><div class="kpw-proyek-nama">${kpm2_esc(r.project_name)}</div><div class="kpw-proyek-id">${kpm2_esc(r.name)}${r.customer ? ` · ${kpm2_esc(r.customer)}` : ""}</div></td>
						<td class="text-right">${kpm2_rp(r.nilai_kontrak)}</td>
						<td class="text-right">${r.jumlah ? `${r.tercapai} / ${r.jumlah}` : `<span class="kpw-strip">${__("Belum ada")}</span>`}</td>
						<td class="text-right ${r.terlambat ? "kpa-merah" : ""}">${r.terlambat}</td>
						<td class="text-right ${r.jumlah && Math.abs(r.bobot - 100) > 0.01 ? "kpa-oranye" : ""}">${kpm2_persen(r.bobot)}</td>
						<td><div class="kpw-progres"><div class="kpr-progress kpr-progress-ok"><div style="width:${p}%"></div></div><span>${kpm2_persen(p)}</span></div>
							<div class="kpa-sub">${kpm2_rp(r.nilai_tercapai)}</div></td>
						<td class="text-right"><span class="kpw-buka">${__("Buka")} ${frappe.utils.icon("right", "xs")}</span></td>
					</tr>`;
				})
				.join("");
			this.$body.html(`${kepala}<div class="kpr-card kpw-tabel-card"><div class="kpw-tabel-wrap">
				<table class="kpw-tabel kpw-tabel-daftar">
					<colgroup><col><col style="width:170px"><col style="width:110px"><col style="width:100px"><col style="width:120px"><col style="width:200px"><col style="width:80px"></colgroup>
					<thead><tr><th>${__("Proyek")}</th><th class="text-right">${__("Nilai Kontrak")}</th><th class="text-right">${__("Tercapai")}</th>
						<th class="text-right">${__("Terlambat")}</th><th class="text-right">${__("Total Bobot")}</th><th>${__("Bobot Tercapai")}</th><th></th></tr></thead>
					<tbody>${baris}</tbody>
				</table></div></div>`);
		});
	}

	// ---------- satu proyek ----------

	buka(project) {
		this.project = project;
		if (this.field_project.get_value() !== project) this.field_project.set_value(project);
		return this.muat();
	}

	muat() {
		return frappe.xcall(KPM2_API + "get_milestone", { project: this.project }).then((data) => {
			this.data = data;
			this.atur_toolbar("proyek");
			this.render();
		});
	}

	call(method, args, pesan) {
		return frappe.xcall(KPM2_API + method, { project: this.project, ...args }).then((r) => {
			if (pesan) frappe.show_alert({ message: pesan, indicator: "green" });
			return this.muat().then(() => r);
		});
	}

	render() {
		const d = this.data;
		const p = d.project;
		const kartu = (warna, label, nilai, sub) => `<div class="kpr-card kpw-kartu">
			<div class="kpw-kartu-label">${label}</div><div class="kpw-kartu-nilai">${nilai}</div>
			<div class="kpw-kartu-sub">${sub}</div><span class="kpw-kartu-garis kpw-garis-${warna}"></span></div>`;
		const belum = d.belum_masuk;
		const bobot_pas = Math.abs(d.total_bobot - 100) < 0.01;

		const baris = d.milestone
			.map((m) => {
				const manual = !m.lingkup.length;
				const progres = Math.min(flt(m.progres), 100);
				const warna = { Tercapai: "hijau", Terlambat: "merah", Rencana: "abu" }[m.status];
				let ket_target = "";
				if (m.status === "Tercapai") {
					const s = m.selisih_tercapai;
					ket_target = __("tercapai {0}", [kpm2_tgl(m.tanggal_tercapai)]) + (s ? ` (${s > 0 ? "+" : ""}${s} ${__("hr")})` : "");
				} else if (m.selisih_hari < 0) {
					ket_target = `<span class="kpa-merah">${__("lewat {0} hari", [-m.selisih_hari])}</span>`;
				} else if (m.selisih_hari === 0) {
					ket_target = __("hari ini");
				} else if (m.selisih_hari != null) {
					ket_target = __("{0} hari lagi", [m.selisih_hari]);
				}
				let ket_status = "";
				if (m.status === "Tercapai") {
					ket_status = m.sales_invoice
						? `<a href="/app/sales-invoice/${encodeURIComponent(m.sales_invoice)}">${__("Ditagih")}: ${kpm2_esc(m.sales_invoice)}</a>`
						: `<span class="kpa-oranye">${__("Belum ditagih — buat di menu Penagihan")}</span>`;
				} else if (manual && d.bisa_ubah) {
					ket_status = `<a class="kpm2-tautkan" data-kpm2="ubah" data-name="${kpm2_esc(m.name)}">${__("Belum ditautkan ke WBS — klik")} ${frappe.utils.icon("pencil", "xs")}</a>`;
				}
				const lingkup = manual
					? '<span class="kpw-strip">—</span>'
					: `<div class="kpm2-lingkup">${m.lingkup.map((w) => `<span class="kpw-badge" title="${kpm2_esc(w.uraian)}">${kpm2_esc(w.kode)}</span>`).join("")}</div>`;
				const tombol = [];
				if (d.bisa_ubah) {
					tombol.push(
						m.status === "Tercapai"
							? `<button class="btn btn-xs btn-default" data-kpm2="batalkan" data-name="${kpm2_esc(m.name)}">${frappe.utils.icon("rotate-ccw", "xs")} ${__("Batalkan")}</button>`
							: `<button class="btn btn-xs btn-default" data-kpm2="tercapai" data-name="${kpm2_esc(m.name)}">${frappe.utils.icon("check", "xs")} ${__("Tandai tercapai")}</button>`
					);
				}
				return `<tr>
					<td class="kpw-kode">${m.urutan}</td>
					<td class="kpa-wrap"><a class="kpa-judul" data-kpm2="ubah" data-name="${kpm2_esc(m.name)}">${kpm2_esc(m.nama_milestone)}</a>
						${manual ? `<div><span class="kpm2-manual">${__("Manual — belum ditautkan")}</span></div>` : ""}</td>
					<td class="kpa-wrap">${lingkup}</td>
					<td>${kpm2_tgl(m.tanggal_target)}<div class="kpa-sub">${ket_target}</div></td>
					<td>${manual ? '<span class="kpw-strip">—</span>' : `<div class="kpw-progres"><div class="kpr-progress ${progres >= 100 ? "kpr-progress-ok" : "kpr-progress-biru"}"><div style="width:${progres}%"></div></div><span>${kpm2_persen(progres)}</span></div>`}</td>
					<td class="text-right"><b>${kpm2_persen(m.bobot)}</b><div class="kpa-sub">${kpm2_persen(m.bobot_kumulatif)}</div></td>
					<td class="text-right"><b>${kpm2_rp(m.nilai_termin)}</b><div class="kpa-sub">${kpm2_rp(m.nilai_kumulatif)}</div></td>
					<td>${m.dokumen ? `<a href="${encodeURI(m.dokumen)}" target="_blank" title="${kpm2_esc(m.dokumen.split("/").pop())}">${frappe.utils.icon("file-text", "sm")}</a>` : '<span class="kpw-strip">—</span>'}</td>
					<td class="kpa-wrap"><span class="kpa-status kpa-status-${warna}">${__(m.status)}</span><div class="kpa-sub">${ket_status}</div></td>
					<td class="text-right kpt-aksi">${tombol.join(" ")} ${this.html_aksi(m)}</td>
				</tr>`;
			})
			.join("");

		this.$body.html(`
			<div class="kpw-head">
				<a class="kpw-crumb" href="/app/project/${encodeURIComponent(p.name)}">${kpm2_esc(p.name)} · ${kpm2_esc(p.project_name)}</a>
				<div class="kpw-sub">${__("Tahapan capaian pekerjaan sebagai dasar penagihan termin ke klien.")}</div>
			</div>
			<div class="kpw-kartu-baris">
				${kartu("hijau", __("Milestone Tercapai"), `${d.tercapai} / ${d.milestone.length}`, __("Ditandai tercapai"))}
				${kartu("hijau", __("Bobot Tercapai"), kpm2_persen(d.bobot_tercapai),
					`<div class="kpr-progress kpr-progress-ok"><div style="width:${Math.min(d.bobot_tercapai, 100)}%"></div></div>${__("{0} bisa ditagih", [kpm2_rp(d.nilai_tercapai)])}`)}
				${kartu(d.terlambat ? "oranye" : "abu", __("Terlambat"), d.terlambat, d.terlambat ? __("Lewat target, belum tercapai") : __("Tidak ada"))}
				${kartu(bobot_pas ? "biru" : "oranye", __("Nilai Termin Terjadwal"), kpm2_rp(d.total_nilai),
					__("{0} dari {1} · sebelum potongan uang muka & retensi (lihat Penagihan)", [kpm2_persen(d.total_bobot), kpm2_rp(p.nilai_kontrak)]))}
				${kartu(belum.length ? "oranye" : "hijau", __("Sub-item WBS Belum Masuk Milestone"), belum.length,
					belum.length ? `<span title="${kpm2_esc(belum.map((w) => `${w.kode} ${w.uraian}`).join("\n"))}">${kpm2_esc(belum.slice(0, 6).map((w) => w.kode).join(", "))}${belum.length > 6 ? ", …" : ""}</span>` : __("Semua item WBS tercakup"))}
			</div>
			<div class="kpr-card kpw-tabel-card kpm2-tabel-card">
				<div class="kpw-tabel-wrap"><table class="kpw-tabel kpa-tabel kpm2-tabel">
					<colgroup><col style="width:44px"><col><col style="width:150px"><col style="width:150px"><col style="width:150px"><col style="width:110px">
						<col style="width:170px"><col style="width:80px"><col style="width:200px"><col style="width:220px"></colgroup>
					<thead><tr><th>#</th><th>${__("Milestone")}</th><th>${__("Lingkup WBS")}</th><th>${__("Target")}</th><th>${__("Progres")}</th>
						<th class="text-right">${__("Bobot = Termin")}<div class="kpa-th-sub">${__("kumulatif")}</div></th>
						<th class="text-right">${__("Nilai Termin")}<div class="kpa-th-sub">${__("bruto + PPN, kumulatif")}</div></th>
						<th>${__("Dokumen")}</th><th>${__("Status")}</th><th></th></tr></thead>
					<tbody>${baris || `<tr><td colspan="10" class="kpa-kosong">${__("Belum ada milestone. Klik Milestone / Termin Baru untuk menambahkan.")}</td></tr>`}</tbody>
					${d.milestone.length ? `<tfoot><tr class="kpw-total"><td colspan="5" class="text-right">${__("Total")}</td>
						<td class="text-right ${bobot_pas ? "" : "kpa-oranye"}">${kpm2_persen(d.total_bobot)}</td><td class="text-right">${kpm2_rp(d.total_nilai)}</td>
						<td colspan="3" class="kpa-sub">${bobot_pas ? "" : __("Total bobot belum 100%")}</td></tr></tfoot>` : ""}
				</table></div>
			</div>`);
	}

	html_aksi(m) {
		const d = this.data;
		const item = (aksi, ikon, label, kelas = "") =>
			`<a class="dropdown-item kpt-aksi-item ${kelas}" data-kpm2="${aksi}" data-name="${kpm2_esc(m.name)}">
				<span class="kpt-aksi-ikon">${frappe.utils.icon(ikon, "sm")}</span><span>${label}</span></a>`;
		const menu = [];
		if (d.bisa_ubah) menu.push(item("ubah", "pencil", __("Ubah Milestone")));
		menu.push(item("form", "external-link", __("Buka Form")));
		if (d.bisa_hapus && !m.sales_invoice) menu.push('<div class="dropdown-divider"></div>', item("hapus", "trash-2", __("Hapus"), "kpt-aksi-bahaya"));
		return `<div class="dropdown kpt-aksi-dropdown">
			<button class="btn btn-xs kpt-aksi-btn" data-toggle="dropdown">${__("Aksi")} ${frappe.utils.icon("down", "xs")}</button>
			<div class="dropdown-menu dropdown-menu-right kpt-aksi-menu">${menu.join("")}</div>
		</div>`;
	}

	aksi(e) {
		const $el = $(e.target).closest("[data-kpm2]");
		const jenis = $el.attr("data-kpm2");
		const name = $el.attr("data-name");
		const m = this.data?.milestone.find((x) => x.name === name);
		switch (jenis) {
			case "buka":
				return frappe.set_route("milestone-termin", $el.attr("data-project"));
			case "ubah":
				return this.dialog_milestone(m);
			case "form":
				return frappe.set_route("Form", "Milestone Termin", name);
			case "tercapai":
				return this.dialog_tercapai(m);
			case "batalkan":
				return frappe.confirm(__("Batalkan status tercapai milestone {0}?", [kpm2_esc(m.nama_milestone)]), () =>
					this.call("batalkan_tercapai", { name }, __("Status tercapai dibatalkan"))
				);
			case "hapus":
				return frappe.confirm(__("Hapus milestone {0}?", [kpm2_esc(m.nama_milestone)]), () => this.call("hapus_milestone", { name }, __("Milestone dihapus")));
		}
	}

	dialog_milestone(m) {
		const d = this.data;
		const baru = !m.name;
		const sisa_bobot = 100 - d.total_bobot + (baru ? 0 : flt(m.bobot));
		const opsi_wbs = d.wbs.map((w) => ({
			value: w.name,
			label: `${w.kode} ${w.uraian}`,
			description: w.is_group ? __("termasuk semua sub-item") : "",
		}));
		const dialog = new frappe.ui.Dialog({
			title: baru ? __("Milestone / Termin Baru") : __("Ubah Milestone"),
			size: "large",
			fields: [
				{ fieldname: "nama_milestone", fieldtype: "Data", label: __("Nama Milestone"), reqd: 1, default: m.nama_milestone,
					description: __("Mis. Struktur bawah selesai, Topping off, Serah terima pertama (PHO).") },
				{ fieldname: "tanggal_target", fieldtype: "Date", label: __("Target Tanggal"), reqd: 1, default: m.tanggal_target },
				{ fieldname: "col1", fieldtype: "Column Break" },
				{ fieldname: "bobot", fieldtype: "Percent", label: __("Bobot Termin (%)"), reqd: 1, default: baru ? Math.max(sisa_bobot, 0) : m.bobot,
					description: __("Sisa bobot yang belum dijadwalkan: {0}", [kpm2_persen(sisa_bobot)]) },
				{ fieldname: "nilai", fieldtype: "HTML" },
				{ fieldname: "lingkup_section", fieldtype: "Section Break", label: __("Lingkup WBS") },
				{ fieldname: "lingkup", fieldtype: "MultiSelectList", label: __("Item WBS yang harus selesai"), options: opsi_wbs,
					default: (m.lingkup || []).map((w) => w.name),
					description: __("Progres milestone dihitung otomatis dari item ini. Kosongkan untuk milestone manual.") },
				{ fieldname: "lain_section", fieldtype: "Section Break" },
				{ fieldname: "dokumen", fieldtype: "Attach", label: __("Dokumen (BAST / Berita Acara)"), default: m.dokumen },
				{ fieldname: "col2", fieldtype: "Column Break" },
				{ fieldname: "catatan", fieldtype: "Small Text", label: __("Catatan"), default: m.catatan },
			],
			primary_action_label: __("Simpan"),
			primary_action: (v) => {
				this.call("simpan_milestone", { ...v, lingkup: v.lingkup || [], name: m.name || null }, baru ? __("Milestone ditambahkan") : __("Milestone disimpan"))
					.then(() => dialog.hide());
			},
			secondary_action_label: __("Batal"),
			secondary_action: () => dialog.hide(),
		});
		const tampil_nilai = () => {
			const bobot = flt(dialog.get_value("bobot"));
			dialog.fields_dict.nilai.$wrapper.html(`<div class="kpa-durasi"><div class="kpa-durasi-label">${__("Nilai Termin")}</div>
				<div class="kpa-durasi-nilai">${kpm2_rp((d.project.nilai_kontrak * bobot) / 100)}</div>
				<div class="kpa-sub">${__("{0} × nilai kontrak {1}", [kpm2_persen(bobot), kpm2_rp(d.project.nilai_kontrak)])}</div></div>`);
		};
		dialog.fields_dict.bobot.df.onchange = tampil_nilai;
		dialog.fields_dict.bobot.$input?.on("input", () => setTimeout(tampil_nilai, 0));
		tampil_nilai();
		dialog.show();
	}

	dialog_tercapai(m) {
		const manual = !m.lingkup.length;
		const belum = !manual && flt(m.progres) < 100;
		const dialog = new frappe.ui.Dialog({
			title: __("Tandai Tercapai — {0}", [m.nama_milestone]),
			fields: [
				{ fieldname: "info", fieldtype: "HTML", options: belum
					? `<div class="kpa-peringatan">${__("Progres lingkup WBS baru {0}. Pastikan pekerjaan memang sudah selesai di lapangan.", [kpm2_persen(m.progres)])}</div>`
					: "" },
				{ fieldname: "tanggal", fieldtype: "Date", label: __("Tanggal Tercapai"), reqd: 1, default: frappe.datetime.get_today() },
				{ fieldname: "dokumen", fieldtype: "Attach", label: __("Dokumen (BAST / Berita Acara Kemajuan)"), default: m.dokumen },
				{ fieldname: "catatan", fieldtype: "Small Text", label: __("Catatan"), default: m.catatan },
			],
			primary_action_label: __("Tandai Tercapai"),
			primary_action: (v) => this.call("tandai_tercapai", { ...v, name: m.name }, __("Milestone ditandai tercapai")).then(() => dialog.hide()),
		});
		dialog.show();
	}
}
