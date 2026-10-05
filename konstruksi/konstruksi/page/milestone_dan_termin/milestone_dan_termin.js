// Milestone & Termin: tahapan capaian pekerjaan sebagai dasar penagihan termin ke klien.
// Data & aksi: konstruksi.konstruksi.milestone. Gaya: kelas kpm2-* (+ kpw-*, kpa-*, kpr-*) di konstruksi.bundle.css.
// Route: /app/milestone-dan-termin (daftar proyek) · /app/milestone-dan-termin/<ID Project>.

frappe.pages["milestone-dan-termin"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Milestone & Termin"), single_column: true });
	wrapper.milestone = new HalamanMilestone(page);
};

frappe.pages["milestone-dan-termin"].on_page_show = function (wrapper) {
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
				if (project && project !== this.project) frappe.set_route("milestone-dan-termin", project);
			},
		});
		this.$body = $(`<div class="kpr kpw kpa kpm2"></div>`).appendTo(page.main);
		this.$body.on("click", "[data-kpm2]", (e) => this.aksi(e));
	}

	tampil() {
		// Dibuka dari list / form Milestone Termin (+ Add): langsung buka dialog milestone baru.
		this.buka_dialog_baru = !!frappe.route_options?.milestone_baru;
		if (this.buka_dialog_baru) frappe.route_options = null;
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
		this.page.add_inner_button(__("Semua Proyek"), () => frappe.set_route("milestone-dan-termin"));
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
		if (this.buka_dialog_baru) {
			this.buka_dialog_baru = false;
			frappe.show_alert({ message: __("Pilih proyek dulu, lalu klik Milestone / Termin Baru."), indicator: "blue" });
		}
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
						<td class="kpw-kode">${kpm2_esc(r.name)}</td>
						<td><div class="kpw-proyek-nama">${kpm2_esc(r.project_name)}</div></td>
						<td class="kpm2-klien" title="${kpm2_esc(r.customer || "")}">${r.customer ? kpm2_esc(r.customer) : '<span class="kpw-strip">—</span>'}</td>
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
					<colgroup><col style="width:130px"><col><col style="width:200px"><col style="width:170px"><col style="width:110px"><col style="width:100px"><col style="width:120px"><col style="width:200px"><col style="width:80px"></colgroup>
					<thead><tr><th>${__("ID Proyek")}</th><th>${__("Nama Proyek")}</th><th>${__("Klien")}</th><th class="text-right">${__("Nilai Kontrak")}</th><th class="text-right">${__("Tercapai")}</th>
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
			if (this.buka_dialog_baru && data.bisa_buat) {
				this.buka_dialog_baru = false;
				this.dialog_milestone({});
			}
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
						: `<span class="kpa-oranye">${__("Belum ditagih")}</span>`;
				} else if (manual && d.bisa_ubah) {
					ket_status = `<a class="kpm2-tautkan" data-kpm2="ubah" data-name="${kpm2_esc(m.name)}">${__("Belum ditautkan ke WBS — klik")} ${frappe.utils.icon("pencil", "xs")}</a>`;
				}
				const lingkup = manual
					? '<span class="kpw-strip">—</span>'
					: `<div class="kpm2-lingkup">${m.lingkup.map((w) => `<span class="kpw-badge" title="${kpm2_esc(w.uraian)}">${kpm2_esc(w.kode)}</span>`).join("")}</div>`;
				// Tombol baris hanya untuk langkah maju; pembatalan ada di menu Aksi (lihat html_aksi).
				const tombol = [];
				const ditagih = m.status_tagih?.docstatus === 1;
				if (m.status !== "Tercapai") {
					if (d.bisa_ubah) {
						tombol.push(`<button class="btn btn-xs btn-default" data-kpm2="tercapai" data-name="${kpm2_esc(m.name)}">${frappe.utils.icon("check", "xs")} ${__("Tandai tercapai")}</button>`);
					}
				} else if (ditagih) {
					tombol.push(`<a class="btn btn-xs btn-default" href="/app/sales-invoice/${encodeURIComponent(m.sales_invoice)}">${frappe.utils.icon("file-text", "xs")} ${kpm2_esc(m.sales_invoice)}</a>`);
				} else {
					tombol.push(`<button class="btn btn-xs btn-primary" data-kpm2="tagih" data-name="${kpm2_esc(m.name)}" title="${__("Buat Sales Invoice termin ini (draft)")}">${frappe.utils.icon("receipt", "xs")} ${__("Buat Tagihan")}</button>`);
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
					<td>${this.html_dokumen(m)}</td>
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
						<th>${__("Dokumen")}</th><th>${__("Status")}</th><th class="text-right">${__("Aksi")}</th></tr></thead>
					<tbody>${baris || `<tr><td colspan="10" class="kpa-kosong">${__("Belum ada milestone. Klik Milestone / Termin Baru untuk menambahkan.")}</td></tr>`}</tbody>
					${d.milestone.length ? `<tfoot><tr class="kpw-total"><td colspan="5" class="text-right">${__("Total")}</td>
						<td class="text-right ${bobot_pas ? "" : "kpa-oranye"}">${kpm2_persen(d.total_bobot)}</td><td class="text-right">${kpm2_rp(d.total_nilai)}</td>
						<td colspan="3" class="kpa-sub">${bobot_pas ? "" : __("Total bobot belum 100%")}</td></tr></tfoot>` : ""}
				</table></div>
			</div>`);
	}

	html_dokumen(m) {
		const wajib = m.dokumen_wajib || [];
		if (!wajib.length) return m.dokumen ? `<a href="${encodeURI(m.dokumen)}" target="_blank">${frappe.utils.icon("file-text", "sm")}</a>` : '<span class="kpw-strip">—</span>';
		const ada = wajib.filter((x) => x.file).length;
		const daftar = wajib.map((x) => `${x.file ? "✓" : "○"} ${x.nama_dokumen}`).join("\n");
		return `<a class="kpm2-dok ${ada === wajib.length ? "kpa-ok" : "kpa-oranye"}" data-kpm2="dokumen" data-name="${kpm2_esc(m.name)}" title="${kpm2_esc(daftar)}">
			${frappe.utils.icon("file-text", "xs")} ${ada}/${wajib.length}</a>`;
	}

	html_aksi(m) {
		const d = this.data;
		const item = (aksi, ikon, label, kelas = "") =>
			`<a class="dropdown-item kpt-aksi-item ${kelas}" data-kpm2="${aksi}" data-name="${kpm2_esc(m.name)}">
				<span class="kpt-aksi-ikon">${frappe.utils.icon(ikon, "sm")}</span><span>${label}</span></a>`;
		// Isi menu mengikuti status: tercapai → lingkup & bobot terkunci (tanpa Ubah / Hapus); sudah ditagih → tanpa
		// pembatalan. Aksi berisiko (Batalkan / Hapus) selalu di bawah, merah, dan perlu konfirmasi.
		const tercapai = m.status === "Tercapai";
		const ditagih = m.status_tagih?.docstatus === 1;
		const menu = [];
		if (d.bisa_ubah && !tercapai) menu.push(item("ubah", "pencil", __("Ubah Milestone")));
		if (d.bisa_ubah && (m.dokumen_wajib || []).length) menu.push(item("dokumen", "file-text", __("Dokumen")));
		menu.push(item("form", "external-link", __("Buka Form")));
		if (tercapai && !ditagih && d.bisa_batalkan) {
			menu.push('<div class="dropdown-divider"></div>', item("batalkan", "rotate-ccw", __("Batalkan status tercapai"), "kpt-aksi-bahaya"));
		}
		if (!tercapai && d.bisa_hapus) menu.push('<div class="dropdown-divider"></div>', item("hapus", "trash-2", __("Hapus"), "kpt-aksi-bahaya"));
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
				return frappe.set_route("milestone-dan-termin", $el.attr("data-project"));
			case "ubah":
				return m.status === "Tercapai" ? this.dialog_tercapai(m, true) : this.dialog_milestone(m);
			case "form":
				return frappe.set_route("Form", "Milestone Termin", name);
			case "tercapai":
			case "dokumen":
				return this.dialog_tercapai(m, jenis === "dokumen");
			case "tagih":
				return frappe
					.call({ method: "konstruksi.konstruksi.penagihan.buat_tagihan_termin", args: { project: this.project, milestone: name },
						freeze: true, freeze_message: __("Membuat invoice termin…") })
					.then((r) => r.message && frappe.set_route("Form", "Sales Invoice", r.message));
			case "batalkan":
				return this.dialog_batalkan(m);
			case "hapus":
				return frappe.confirm(__("Hapus milestone {0}?", [kpm2_esc(m.nama_milestone)]), () => this.call("hapus_milestone", { name }, __("Milestone dihapus")));
		}
	}

	// Dokumen wajib menurut lingkup (aturan sama dengan server: konstruksi.konstruksi.milestone.dokumen_wajib_untuk).
	dokumen_wajib(uraian, terakhir) {
		const a = this.data.aturan_dokumen;
		const teks = uraian.join(" ").toLowerCase();
		const hasil = [...a.dasar];
		a.aturan.forEach(([kata, dok]) => {
			if (kata.some((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(teks)) && !hasil.includes(dok)) hasil.push(dok);
		});
		if (terakhir || teks.includes("serah terima") || teks.includes("pho")) a.akhir.forEach((dok) => !hasil.includes(dok) && hasil.push(dok));
		return hasil;
	}

	dialog_milestone(m) {
		const d = this.data;
		const baru = !m.name;
		const wbs = d.wbs;
		const per_nama = Object.fromEntries(wbs.map((w) => [w.name, w]));
		const anak = {};
		wbs.forEach((w) => (anak[w.parent_wbs || ""] = anak[w.parent_wbs || ""] || []).push(w));
		const daun_dari = (name) => {
			const sub = anak[name] || [];
			return sub.length ? sub.flatMap((x) => daun_dari(x.name)) : [name];
		};
		// Item tanpa sub-item yang terpakai milestone LAIN (dikunci).
		const terpakai = Object.fromEntries(Object.entries(d.terpakai).filter(([, v]) => v[1] !== m.name));
		const dipilih = new Set((m.lingkup || []).flatMap((x) => daun_dari(x.name)));
		const bobot_lain = d.total_bobot - (baru ? 0 : flt(m.bobot));

		const dialog = new frappe.ui.Dialog({
			title: baru ? __("Milestone / Termin Baru") : __("Ubah Milestone"),
			size: "large",
			fields: [{ fieldname: "form", fieldtype: "HTML" }],
			primary_action_label: __("Simpan"),
			primary_action: () => simpan(),
			secondary_action_label: __("Batal"),
			secondary_action: () => dialog.hide(),
		});
		dialog.$wrapper.addClass("kpa-form-dialog");
		const $f = dialog.fields_dict.form.$wrapper;
		$f.html(`<div class="kpm2-form">
			<label class="kpm2-label">${__("Nama & Lingkup Pekerjaan (WBS)")} <span class="kpa-wajib">*</span></label>
			<div class="kpm2-pohon"></div>
			<label class="kpm2-label">${__("Dihitung Otomatis")}</label>
			<div class="kpm2-otomatis"></div>
			<label class="kpm2-label">${__("Dokumen Wajib (otomatis)")}</label>
			<div class="kpm2-dokumen"></div>
		</div>`);

		const status_item = (name) => {
			const daun = daun_dari(name).filter((x) => !terpakai[x]);
			const n = daun.filter((x) => dipilih.has(x)).length;
			return { semua: daun.length && n === daun.length, sebagian: n > 0 && n < daun.length, kosong: !daun.length };
		};
		const render_pohon = () => {
			const baris = [];
			const tulis = (w) => {
				const sub = anak[w.name] || [];
				const st = sub.length ? status_item(w.name) : { semua: dipilih.has(w.name), sebagian: false, kosong: !!terpakai[w.name] };
				const kunci = sub.length ? st.kosong : !!terpakai[w.name];
				const ket = kunci
					? `<span class="kpm2-terpakai">${__("sudah di {0}", [kpm2_esc(sub.length ? __("milestone lain") : terpakai[w.name][0])])}</span>`
					: "";
				baris.push(`<div class="kpm2-pohon-baris kpm2-level-${Math.min(w.level, 4)} ${kunci ? "kpm2-kunci" : ""}">
					<label class="kpm2-pohon-cek">
						<input type="checkbox" data-wbs="${kpm2_esc(w.name)}" ${st.semua ? "checked" : ""} ${kunci ? "disabled" : ""}>
						<span class="kpm2-pohon-kode">${kpm2_esc(w.kode)}</span>
						<span class="kpm2-pohon-uraian ${w.level === 1 ? "kpm2-tebal" : ""}">${kpm2_esc(w.uraian)}</span>
						${ket}
					</label>
					<span class="kpm2-pohon-bobot">${kpm2_persen(flt(w.bobot).toFixed(2))}</span>
				</div>`);
				// Sub-item tampil saat induknya dicentang (seluruh / sebagian) supaya bisa dikurangi.
				if (sub.length && (st.semua || st.sebagian)) sub.forEach(tulis);
			};
			(anak[""] || []).forEach(tulis);
			$f.find(".kpm2-pohon").html(baris.join("") || `<div class="kpa-form-ket">${__("WBS proyek belum ada.")}</div>`);
			$f.find(".kpm2-pohon input[type=checkbox]").each((_, el) => {
				const w = per_nama[el.dataset.wbs];
				if ((anak[w.name] || []).length) el.indeterminate = status_item(w.name).sebagian;
			});
		};

		// Lingkup tersimpan: item induk bila semua sub-itemnya dipilih, selain itu sub-item yang dipilih.
		const lingkup_ringkas = () => {
			const hasil = [];
			const telusur = (w) => {
				const sub = anak[w.name] || [];
				if (!sub.length) return dipilih.has(w.name) && hasil.push(w);
				const daun = daun_dari(w.name).filter((x) => !terpakai[x]);
				if (daun.length && daun.every((x) => dipilih.has(x)) && !daun_dari(w.name).some((x) => terpakai[x])) return hasil.push(w);
				sub.forEach(telusur);
			};
			(anak[""] || []).forEach(telusur);
			return hasil;
		};
		const hitung = () => {
			const lingkup = lingkup_ringkas();
			const daun = [...dipilih].map((x) => per_nama[x]).filter(Boolean);
			const bobot = daun.reduce((s, w) => s + flt(w.bobot), 0);
			const nama = lingkup.length
				? `${lingkup.map((w) => w.uraian).slice(0, 2).join(" & ")}${lingkup.length > 2 ? ` ${__("dll.")}` : ""} ${__("selesai")}`
				: "";
			// Target = selesai aktivitas terakhir di lingkup; belum ada aktivitas → tanggal selesai proyek.
			const target_aktivitas = daun.map((w) => w.akhir_task).filter(Boolean).sort().pop() || "";
			return { lingkup, daun, bobot, nama, target: target_aktivitas || d.project.selesai || "", dari_aktivitas: !!target_aktivitas,
				terakhir: bobot_lain + bobot >= 99.99 };
		};
		const render_otomatis = () => {
			const h = hitung();
			const $o = $f.find(".kpm2-otomatis");
			if (!h.daun.length) {
				$o.html(`<div class="kpm2-kosong">${__("Centang item WBS level 1 dan sub-item lingkupnya di atas.")}</div>`);
				$f.find(".kpm2-dokumen").html(`<div class="kpm2-kosong">${__("Pilih lingkup pekerjaan untuk melihat dokumen yang wajib di-upload.")}</div>`);
				return;
			}
			const lebih = bobot_lain + h.bobot > 100.01;
			$o.html(`<div class="kpm2-otomatis-angka kpm2-otomatis-4">
				<div><div class="kpa-lapor-label">${__("Nama Milestone")}</div><div class="kpm2-otomatis-nama">${kpm2_esc(h.nama)}</div>
					<div class="kpa-sub">${__("{0} item WBS", [h.daun.length])}</div></div>
				<div><div class="kpa-lapor-label">${__("Target")}</div><div class="kpa-lapor-nilai">${h.target ? kpm2_tgl(h.target) : "—"}</div>
					<div class="kpa-sub">${h.dari_aktivitas ? __("aktivitas terakhir selesai") : __("belum ada aktivitas · akhir proyek")}</div></div>
				<div><div class="kpa-lapor-label">${__("Bobot = Termin")}</div><div class="kpa-lapor-nilai ${lebih ? "kpa-merah" : ""}">${kpm2_persen(flt(h.bobot).toFixed(2))}</div>
					<div class="kpa-sub">${__("kumulatif {0}", [kpm2_persen(flt(bobot_lain + h.bobot).toFixed(2))])}${lebih ? ` · ${__("melebihi 100%")}` : ""}</div></div>
				<div><div class="kpa-lapor-label">${__("Nilai Termin")}</div><div class="kpa-lapor-nilai">${kpm2_rp((d.project.nilai_kontrak * h.bobot) / 100)}</div>
					<div class="kpa-sub">${__("bruto + PPN, sebelum potongan")}</div></div>
			</div>`);
			const dok = this.dokumen_wajib([...h.lingkup.map((w) => w.uraian), ...h.daun.map((w) => w.uraian), h.nama], h.terakhir);
			$f.find(".kpm2-dokumen").html(`<div class="kpm2-dok-list">${dok.map((x) => `<div>${frappe.utils.icon("file-text", "xs")} ${kpm2_esc(x)}</div>`).join("")}</div>
				<div class="kpa-form-ket">${__("Semua dokumen ini wajib di-upload saat milestone ditandai tercapai.")}</div>`);
		};

		$f.on("change", ".kpm2-pohon input[type=checkbox]", (e) => {
			const daun = daun_dari(e.target.dataset.wbs).filter((x) => !terpakai[x]);
			daun.forEach((x) => (e.target.checked ? dipilih.add(x) : dipilih.delete(x)));
			render_pohon();
			render_otomatis();
		});

		const simpan = () => {
			const h = hitung();
			if (!h.lingkup.length) return frappe.msgprint(__("Centang minimal satu item WBS sebagai lingkup milestone."));
			if (!h.target) return frappe.msgprint(__("Target tidak bisa dihitung: belum ada aktivitas di lingkup ini dan tanggal selesai proyek kosong."));
			if (bobot_lain + h.bobot > 100.01) return frappe.msgprint(__("Total bobot termin melebihi 100%."));
			this.call(
				"simpan_milestone",
				{ nama_milestone: h.nama, tanggal_target: h.target, lingkup: h.lingkup.map((w) => w.name), name: m.name || null },
				baru ? __("Milestone ditambahkan") : __("Milestone disimpan")
			).then(() => dialog.hide());
		};

		render_pohon();
		render_otomatis();
		dialog.show();
	}

	dialog_batalkan(m) {
		frappe.xcall(KPM2_API + "get_aktivitas_milestone", { project: this.project, name: m.name }).then((akt) =>
			this.tampil_dialog_batalkan(m, akt || [])
		);
	}

	tampil_dialog_batalkan(m, akt) {
		const LAINNYA = __("Lainnya");
		const ALASAN = [
			__("Dokumen BAST / berita acara belum lengkap"),
			__("Dokumen salah atau belum ditandatangani"),
			__("Tanggal tercapai salah input"),
			__("Salah pilih milestone"),
			__("Pemeriksaan konsultan pengawas belum disetujui"),
			__("Pekerjaan ditemukan cacat / perlu perbaikan"),
			__("Volume / progres belum sesuai opname"),
			__("Perubahan lingkup pekerjaan (addendum)"),
			__("Permintaan pemberi kerja"),
			LAINNYA,
		];
		const dialog = new frappe.ui.Dialog({
			title: __("Batalkan Status Tercapai — {0}", [m.nama_milestone]),
			size: "extra-large",
			fields: [
				{ fieldname: "info", fieldtype: "HTML", options: `<div class="kpa-peringatan">${__(
					"Milestone akan kembali berstatus Rencana / Terlambat dan termin {0} tidak bisa ditagih sampai ditandai tercapai lagi. Pembatalan dicatat di riwayat milestone.",
					[kpm2_rp(m.nilai_termin)]
				)}</div>` },
				{ fieldname: "tanggal", fieldtype: "Date", label: __("Tanggal Pembatalan"), default: frappe.datetime.get_today(), read_only: 1 },
				{ fieldname: "alasan", fieldtype: "Select", label: __("Alasan Pembatalan"), reqd: 1, options: ["", ...ALASAN] },
				{ fieldname: "alasan_lain", fieldtype: "Small Text", label: __("Alasan Lainnya"),
					depends_on: `eval:doc.alasan==${JSON.stringify(LAINNYA)}`, mandatory_depends_on: `eval:doc.alasan==${JSON.stringify(LAINNYA)}` },
				{ fieldname: "dokumen_info", fieldtype: "HTML", options: (m.dokumen_wajib || []).some((x) => x.file)
					? `<div class="kpa-form-ket">${__("{0} dokumen capaian yang sudah di-upload akan diarsipkan ke riwayat milestone; saat ditandai tercapai lagi wajib upload dokumen baru.",
						[(m.dokumen_wajib || []).filter((x) => x.file).length])}</div>`
					: "" },
				{ fieldname: "aktivitas_section", fieldtype: "Section Break", label: __("Aktivitas yang Ikut Dibatalkan") },
				{ fieldname: "aktivitas", fieldtype: "HTML" },
			],
			primary_action_label: __("Batalkan Status Tercapai"),
			primary_action: (v) => {
				const alasan = v.alasan === LAINNYA ? `${LAINNYA}: ${(v.alasan_lain || "").trim()}` : v.alasan;
				const laporan_batal = $a.find("[data-lap]:checked").map((_, el) => el.dataset.lap).get();
				this.call("batalkan_tercapai", { name: m.name, alasan, laporan_batal }, __("Status tercapai dibatalkan")).then((r) => {
					dialog.hide();
					if (r?.laporan_dibatalkan) {
						frappe.show_alert({ message: __("{0} laporan progres dibatalkan — aktivitasnya bisa dilaporkan ulang di Task & Activity", [r.laporan_dibatalkan]), indicator: "orange" }, 7);
					}
				});
			},
			secondary_action_label: __("Tutup"),
			secondary_action: () => dialog.hide(),
		});
		dialog.$wrapper.addClass("kpm2-dialog-batal");
		dialog.get_primary_btn().removeClass("btn-primary").addClass("btn-danger");

		// Aktivitas di lingkup milestone: centang aktivitas → laporan terakhir (yang membuatnya selesai) otomatis
		// terpilih untuk dibatalkan; PM boleh mengubah pilihan laporannya. Progres kembali ke posisi sebelum laporan itu.
		const $a = dialog.fields_dict.aktivitas.$wrapper;
		const persen = (v) => `${format_number(flt(v), null, flt(v) % 1 ? 1 : 0)}%`;
		const angka = (v) => format_number(flt(v), null, flt(v) % 1 ? 2 : 0);
		const isi = (t, r) =>
			t.metode_progres === "Tahapan"
				? r.tahap.map((n) => `${kpm2_esc(n)}${t.bobot_tahap[n] ? ` (${persen(t.bobot_tahap[n])})` : ""}`).join(", ")
				: `${angka(r.volume)} ${kpm2_esc(t.satuan || "")}`;
		$a.html(
			akt.length
				? `<div class="kpa-form-ket kpm2-ab-ket">${__(
						"Centang aktivitas yang ikut dibatalkan. Laporan terakhir (yang membuatnya selesai) otomatis terpilih; laporan terpilih menjadi Dibatalkan, progres kembali ke posisi sebelum laporan itu, dan tombol Lapor aktif lagi."
				  )}</div>
				<div class="kpm2-ab-wrap"><table class="kpm2-ab">
					<colgroup><col style="width:40px"><col><col style="width:170px"><col style="width:240px"></colgroup>
					<tbody>${akt
						.map((t, ti) => `<tr class="kpm2-ab-akt">
							<td><input type="checkbox" data-akt="${ti}"></td>
							<td><span class="kpw-kode">${kpm2_esc(t.kode_wbs)}</span> <b>${kpm2_esc(t.subject)}</b>
								<span class="kpw-badge">${__("{0} laporan", [t.laporan.length])}</span></td>
							<td class="text-right">${t.metode_progres === "Tahapan" ? __("Tahapan") : `${angka(t.realisasi_volume)} / ${angka(t.target_volume)} ${kpm2_esc(t.satuan || "")}`}</td>
							<td class="text-right" data-progres="${ti}"></td>
						</tr>${t.laporan
							.map((r, ri) => `<tr class="kpm2-ab-lap" data-baris="${ti}" style="display:none">
								<td></td>
								<td><label class="kpm2-ab-cek"><input type="checkbox" data-lap="${kpm2_esc(r.name)}" data-t="${ti}" data-r="${ri}">
									${kpm2_tgl(r.tanggal)} · ${kpm2_esc(r.nama_pelapor || r.owner)}
									${ri === 0 ? `<span class="kpw-badge kpw-badge-biru">${__("terakhir")}</span>` : ""}</label>
									<div class="kpa-sub">${kpm2_esc(r.name)}${r.status === "Direvisi" ? ` · ${__("pernah direvisi")}` : ""}</div></td>
								<td class="text-right">${isi(t, r)}</td>
								<td></td>
							</tr>`)
							.join("")}`)
						.join("")}</tbody>
				</table></div>
				<div class="kpm2-ab-ringkas"></div>
				<div class="kpm2-ab-penerus"></div>`
				: `<div class="kpa-form-ket">${__("Tidak ada aktivitas di lingkup milestone ini.")}</div>`
		);
		const perbarui = () => {
			let n_lap = 0;
			let n_akt = 0;
			const penerus = [];
			akt.forEach((t, ti) => {
				const aktif = $a.find(`[data-akt="${ti}"]`).prop("checked");
				$a.find(`tr[data-baris="${ti}"]`).toggle(aktif);
				let turun = 0;
				t.laporan.forEach((r, ri) => {
					const $c = $a.find(`[data-t="${ti}"][data-r="${ri}"]`);
					if (!aktif) $c.prop("checked", false);
					if (!$c.prop("checked")) return;
					n_lap++;
					if (t.metode_progres === "Tahapan") {
						const total = Object.values(t.bobot_tahap).reduce((a, b) => a + flt(b), 0) || 1;
						turun += r.tahap.reduce((a, x) => a + (flt(t.bobot_tahap[x]) / total) * 100, 0);
					} else if (flt(t.target_volume)) {
						turun += (flt(r.volume) / flt(t.target_volume)) * 100;
					}
				});
				if (turun > 0.0001) {
					n_akt++;
					(t.penerus_selesai || []).forEach((x) => penerus.push(`${kpm2_esc(x.kode_wbs)} ${kpm2_esc(x.subject)} (${__("setelah")} ${kpm2_esc(t.subject)})`));
				}
				// Progres tersimpan dibatasi 100%; laporan berlebih (realisasi > target) diperhitungkan dari realisasi.
				const asal = t.metode_progres === "Tahapan" || !flt(t.target_volume) ? flt(t.progress) : (flt(t.realisasi_volume) / flt(t.target_volume)) * 100;
				const baru = Math.min(Math.max(asal - turun, 0), 100);
				$a.find(`[data-progres="${ti}"]`).html(
					turun > 0.0001
						? `${persen(t.progress)} → <b class="kpa-oranye">${persen(baru)}</b><div class="kpa-sub">${__("Lapor aktif lagi")}</div>`
						: `<span class="kpa-sub">${__("Progres")} ${persen(t.progress)}</span>`
				);
			});
			$a.find(".kpm2-ab-penerus").html(
				penerus.length
					? `<div class="kpa-peringatan kpm2-ab-peringatan">${__("Aktivitas berikut sudah Selesai tapi pendahulunya akan dibuka kembali — periksa di Task & Activity:")}
						<ul>${[...new Set(penerus)].map((x) => `<li>${x}</li>`).join("")}</ul></div>`
					: ""
			);
			$a.find(".kpm2-ab-ringkas").html(
				n_lap
					? __("{0} laporan dibatalkan · {1} aktivitas kembali bisa dilaporkan", [`<b>${n_lap}</b>`, `<b>${n_akt}</b>`])
					: `<span class="kpa-sub">${__("Tidak ada aktivitas dipilih — hanya status milestone yang dibatalkan.")}</span>`
			);
		};
		$a.on("change", "[data-akt]", (e) => {
			const ti = e.target.dataset.akt;
			// Bawaan: laporan terakhir (paling atas = terbaru) terpilih.
			if (e.target.checked) $a.find(`[data-t="${ti}"][data-r="0"]`).prop("checked", true);
			perbarui();
		});
		$a.on("change", "[data-lap]", perbarui);
		perbarui();
		dialog.show();
	}

	dialog_tercapai(m, hanya_dokumen) {
		const manual = !m.lingkup.length;
		const belum = !manual && flt(m.progres) < 100;
		const wajib = m.dokumen_wajib || [];
		const fields = [
			{ fieldname: "info", fieldtype: "HTML", options: !hanya_dokumen && belum
				? `<div class="kpa-peringatan">${__("Progres lingkup WBS baru {0}. Pastikan pekerjaan memang sudah selesai di lapangan.", [kpm2_persen(m.progres)])}</div>`
				: "" },
		];
		if (!hanya_dokumen) fields.push({ fieldname: "tanggal", fieldtype: "Date", label: __("Tanggal Tercapai"), reqd: 1, default: frappe.datetime.get_today() });
		if (wajib.length) {
			fields.push({ fieldname: "dok_section", fieldtype: "Section Break", label: __("Dokumen Wajib") });
			wajib.forEach((x, i) => fields.push({ fieldname: `dok_${i}`, fieldtype: "Attach", label: x.nama_dokumen, reqd: hanya_dokumen ? 0 : 1, default: x.file }));
		}
		fields.push({ fieldname: "lain_section", fieldtype: "Section Break" },
			{ fieldname: "catatan", fieldtype: "Small Text", label: __("Catatan"), default: m.catatan });
		const dialog = new frappe.ui.Dialog({
			title: hanya_dokumen ? __("Dokumen — {0}", [m.nama_milestone]) : __("Tandai Tercapai — {0}", [m.nama_milestone]),
			fields,
			primary_action_label: hanya_dokumen ? __("Simpan Dokumen") : __("Tandai Tercapai"),
			primary_action: (v) => {
				const file_dokumen = Object.fromEntries(wajib.map((x, i) => [x.nama_dokumen, v[`dok_${i}`] || null]));
				const args = { name: m.name, file_dokumen, catatan: v.catatan };
				const aksi = hanya_dokumen
					? this.call("simpan_dokumen", args, __("Dokumen disimpan"))
					: this.call("tandai_tercapai", { ...args, tanggal: v.tanggal }, __("Milestone ditandai tercapai"));
				aksi.then(() => dialog.hide());
			},
		});
		dialog.show();
	}
}
