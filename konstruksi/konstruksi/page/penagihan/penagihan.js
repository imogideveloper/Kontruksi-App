// Penagihan: uang muka & termin proyek → Sales Invoice ERPNext (draft, diperiksa lalu di-submit dari form invoice).
// Data & aksi: konstruksi.konstruksi.penagihan. Gaya: kelas kpg-* (+ kptl-*, kpbs-* kartu) di konstruksi.bundle.css.
// Route: /app/penagihan (daftar proyek) · /app/penagihan/<ID Project>.

frappe.pages["penagihan"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Penagihan"), single_column: true });
	wrapper.penagihan = new HalamanPenagihan(page);
};

frappe.pages["penagihan"].on_page_show = function (wrapper) {
	wrapper.penagihan?.tampil();
};

const KPG_API = "konstruksi.konstruksi.penagihan.";
const KPG_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const kpg_esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));
const kpg_rp = (v) => format_currency(flt(v), "IDR", 0);
const kpg_tgl = (s) => {
	if (!s) return "—";
	const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
	return `${String(d).padStart(2, "0")} ${KPG_BULAN[m - 1]} ${y}`;
};
const kpg_persen = (v) => `${format_number(flt(v), null, flt(v) % 1 ? 2 : 0)}%`;
// Status invoice → label & warna.
const kpg_status_inv = (inv) => {
	if (!inv) return "";
	if (inv.docstatus === 0) return `<span class="kpbs-var kpg-st-draft">${__("Draft")}</span>`;
	const peta = { Paid: ["Lunas", "maju"], Unpaid: ["Belum Dibayar", "baru"], Overdue: ["Jatuh Tempo", "mundur"], "Partly Paid": ["Dibayar Sebagian", "baru"] };
	const [label, warna] = peta[inv.status] || [inv.status, "sesuai"];
	return `<span class="kpbs-var kpbs-var-${warna}">${__(label)}</span>`;
};

class HalamanPenagihan {
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
				if (project && project !== this.project) frappe.set_route("penagihan", project);
			},
		});
		this.$body = $(`<div class="kptl kpg"></div>`).appendTo(page.main);
		this.$body.on("click", "[data-kpg]", (e) => this.aksi(e));
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
		this.page.add_inner_button(__("Semua Proyek"), () => frappe.set_route("penagihan"));
		this.page.add_inner_button(__("Milestone & Termin"), () => frappe.set_route("milestone-dan-termin", this.project));
		this.page.add_inner_button(__("Daftar Sales Invoice"), () => frappe.set_route("List", "Sales Invoice", { project: this.project }));
	}

	// ---------- daftar proyek ----------

	daftar() {
		this.project = null;
		this.data = null;
		if (this.field_project.get_value()) this.field_project.set_value("");
		this.atur_toolbar("daftar");
		return frappe.xcall(KPG_API + "get_daftar").then((rows) => {
			const kepala = `<div class="kptl-sub">${__("Pilih proyek untuk menagih uang muka & termin milestone yang tercapai.")}</div>`;
			if (!rows.length) {
				this.$body.html(`${kepala}<div class="kptl-card kptl-kosong">${__("Belum ada Project Master. Buat dari Kontrak Project terlebih dahulu.")}</div>`);
				return;
			}
			const warna_um = { Lunas: "maju", "Belum dibayar": "mundur", Draft: "baru", "Belum ditagih": "sesuai" };
			const badge_termin = (r) => {
				if (!r.termin_total) return "—";
				const warna = r.termin_ditagih >= r.termin_total ? "maju" : r.termin_ditagih ? "baru" : "sesuai";
				return `<span class="kpbs-var kpbs-var-${warna}">${r.termin_ditagih} / ${r.termin_total}</span>`;
			};
			const progres = (persen) => `<div class="kpg-progres" title="${__("Nilai termin yang sudah ditagih ÷ nilai kontrak")}">
				<div class="kpg-progres-bar"><span style="width:${Math.min(Math.max(persen, 0), 100)}%"></span></div>
				<span class="kpg-progres-angka">${format_number(persen, null, 1)}%</span></div>`;
			const baris = rows
				.map((r) => `<tr class="kptl-baris-proyek" data-kpg="buka" data-project="${kpg_esc(r.name)}">
					<td class="kptl-mono">${kpg_esc(r.name)}</td>
					<td class="kptl-potong"><b>${kpg_esc(r.project_name)}</b></td>
					<td class="kptl-potong">${kpg_esc(r.customer || "—")}</td>
					<td class="text-right">${kpg_rp(r.nilai_kontrak)}</td>
					<td>${progres(r.progres_tagih)}</td>
					<td class="kpg-sel-tagih">${r.uang_muka_total ? `<span class="kpg-nominal">${kpg_rp(r.uang_muka_total)}</span>` : ""}
						<span class="kpbs-var kpbs-var-${warna_um[r.uang_muka] || "sesuai"}">${__(r.uang_muka)}</span></td>
					<td class="kpg-sel-tagih">${r.termin_total_tagih ? `<span class="kpg-nominal">${kpg_rp(r.termin_total_tagih)}</span>` : ""}
						${badge_termin(r)}</td>
					<td class="text-right">${kpg_rp(r.diterima)}</td>
					<td class="text-right">${r.piutang > 0.5 ? `<b>${kpg_rp(r.piutang)}</b>` : kpg_rp(0)}</td>
					<td class="text-right">${r.retensi_ditahan > 0.5 ? kpg_rp(r.retensi_ditahan) : "—"}</td>
					<td class="text-right">${r.siap_ditagih ? `<span class="kpbs-var kpbs-var-baru kpg-siap">${__("{0} termin", [r.siap_ditagih])}</span>` : "—"}</td>
					<td class="text-right kptl-buka">${__("Buka")} ${frappe.utils.icon("right", "xs")}</td>
				</tr>`)
				.join("");
			const judul = (teks, info) => `<th class="${info?.kanan ? "text-right" : ""}" title="${kpg_esc(info?.ket || "")}">${teks}</th>`;
			this.$body.html(`${kepala}<div class="kptl-card kptl-card-tabel"><div class="kptl-tabel-wrap"><table class="kptl-tabel kpg-tabel">
				<thead><tr>${judul(__("ID Proyek"))}${judul(__("Nama Proyek"))}${judul(__("Klien"))}
					${judul(__("Nilai Kontrak"), { kanan: 1 })}
					${judul(__("Progres Tagih"), { ket: __("Nilai termin yang sudah ditagih ÷ nilai kontrak (uang muka tidak dihitung)") })}
					${judul(__("Uang Muka"))}
					${judul(__("Termin"), { ket: __("Jumlah termin yang invoicenya sudah di-submit / total milestone") })}
					${judul(__("Diterima"), { kanan: 1, ket: __("Pembayaran yang sudah diterima dari invoice uang muka & termin") })}
					${judul(__("Piutang"), { kanan: 1, ket: __("Invoice yang belum dibayar, termasuk retensi") })}
					${judul(__("Retensi Ditahan"), { kanan: 1, ket: __("Retensi yang belum diterima — ditagih setelah masa pemeliharaan") })}
					${judul(__("Siap Ditagih"), { kanan: 1, ket: __("Milestone tercapai yang belum dibuat invoicenya") })}<th></th></tr></thead>
				<tbody>${baris}</tbody></table></div></div>`);
		});
	}

	// ---------- satu proyek ----------

	buka(project) {
		if (this.project !== project) this.layar = null;
		this.project = project;
		if (this.field_project.get_value() !== project) this.field_project.set_value(project);
		return frappe.xcall(KPG_API + "get_penagihan", { project }).then((d) => {
			this.data = d;
			this.atur_toolbar("proyek");
			this.render();
		});
	}

	render() {
		const d = this.data;
		const p = d.project;
		const k = d.kontrak;
		const r = d.ringkasan;
		const kartu = (warna, label, nilai, sub) => `<div class="kptl-card kpbs-kartu kpbs-garis-${warna}">
			<div class="kpbs-kartu-label">${label}</div><div class="kpbs-kartu-nilai kpg-nilai">${nilai}</div><div class="kptl-sub-kecil">${sub}</div></div>`;
		const retensi_sub = r.retensi_sisa > 0.5
			? `${r.retensi_lewat ? `<b class="kptl-merah">${__("Sudah jatuh tempo")}</b>` : __("Jatuh tempo")} ${kpg_tgl(r.retensi_jatuh_tempo)}`
			: r.retensi_total ? __("Semua retensi sudah diterima") : __("Belum ada retensi ditahan");

		this.$body.html(`
			<div class="kptl-head"><div class="kpbs-kepala">
				<a class="kptl-crumb" href="/app/project/${encodeURIComponent(p.name)}">${kpg_esc(p.name)} · ${kpg_esc(p.project_name)}</a>
				<span class="kpbs-sub">${__("Tagihan uang muka & termin ke {0} · kontrak {1}", [kpg_esc(k.customer), kpg_esc(k.nomor_kontrak || k.kontrak)])}</span>
			</div></div>
			<div class="kpbs-kartu-baris kpg-kartu-baris">
				${kartu("abu", __("Nilai Kontrak"), kpg_rp(r.nilai_kontrak), __("Termasuk PPN {0}%", [format_number(k.ppn, null, 0)]))}
				${kartu("hijau", __("Sudah Ditagih"), kpg_rp(r.ditagih), __("Uang muka + {0} termin ({1} nilai kontrak)", [d.alur.termin_ditagih, kpg_persen(r.persen_ditagih)]))}
				${kartu("hijau", __("Diterima"), kpg_rp(r.diterima), __("Pembayaran yang sudah masuk"))}
				${kartu(r.piutang ? "oranye" : "abu", __("Piutang"), kpg_rp(r.piutang), __("Belum dibayar, di luar retensi"))}
				${kartu(r.retensi_sisa > 0.5 ? (r.retensi_lewat ? "merah" : "oranye") : "abu", __("Retensi Ditahan"), kpg_rp(r.retensi_sisa), retensi_sub)}
			</div>
			${this.html_alur()}
			<div class="kpg-layar">${this.html_layar()}</div>`);
	}

	// Panduan alur: langkah yang sudah selesai diberi tanda ✓.
	// Langkah alur = navigasi layar (satu tahap per layar). Bawaan: langkah pertama yang belum selesai.
	langkah() {
		const a = this.data.alur;
		const k = this.data.kontrak;
		const daftar = [];
		if (a.uang_muka !== null) {
			daftar.push({ kunci: "uang_muka", ok: a.uang_muka, judul: __("Uang Muka"), ket: a.uang_muka ? __("Sudah ditagih") : __("Syarat: jaminan uang muka") });
		}
		daftar.push({ kunci: "termin", ok: a.termin_total && a.termin_ditagih === a.termin_total, judul: __("Termin"),
			ket: __("{0} dari {1} milestone ditagih", [a.termin_ditagih, a.termin_total]) });
		daftar.push({ kunci: "pembayaran", ok: this.data.invoice.some((x) => x.docstatus === 1) && a.piutang_termin <= 0.5, judul: __("Pembayaran"),
			ket: a.piutang_termin > 0.5 ? __("Piutang {0}", [kpg_rp(a.piutang_termin)]) : __("Tidak ada piutang") });
		daftar.push({ kunci: "retensi", ok: a.termin_total > 0 && a.termin_ditagih === a.termin_total && a.retensi_sisa <= 0.5, judul: __("Retensi"),
			ket: a.retensi_sisa > 0.5 ? __("Sisa {0} · setelah {1}", [kpg_rp(a.retensi_sisa), kpg_tgl(k.akhir_pemeliharaan)]) : __("Ditagih setelah masa pemeliharaan") });
		return daftar;
	}

	html_alur() {
		const daftar = this.langkah();
		if (!daftar.some((x) => x.kunci === this.layar)) this.layar = (daftar.find((x) => !x.ok) || daftar[daftar.length - 1]).kunci;
		return `<div class="kpg-alur" role="tablist">${daftar
			.map((x, i) => `<a class="kpg-alur-langkah ${x.ok ? "kpg-alur-ok" : ""} ${x.kunci === this.layar ? "kpg-alur-aktif" : ""}"
				role="tab" data-kpg="layar" data-layar="${x.kunci}">
				<span class="kpg-alur-no">${x.ok ? "✓" : i + 1}</span><div><b>${x.judul}</b><div class="kptl-sub-kecil">${x.ket}</div></div></a>`)
			.join('<span class="kpg-alur-panah">›</span>')}</div>`;
	}

	html_layar() {
		return { uang_muka: () => this.html_uang_muka(), termin: () => this.html_termin(), pembayaran: () => this.html_pembayaran(),
			retensi: () => this.html_retensi() }[this.layar]();
	}

	html_pembayaran() {
		const d = this.data;
		const inv = d.invoice;
		const baris = inv
			.map((x) => `<tr>
				<td><a href="/app/sales-invoice/${encodeURIComponent(x.name)}">${kpg_esc(x.name)}</a></td>
				<td class="kptl-potong" title="${kpg_esc(x.label)}"><b>${kpg_esc(x.label)}</b></td>
				<td>${kpg_tgl(x.posting_date)}</td>
				<td class="text-right">${kpg_rp(x.total)}</td>
				<td class="text-right">${flt(x.nilai_retensi) ? kpg_rp(x.nilai_retensi) : "—"}</td>
				<td class="text-right">${x.docstatus === 1 ? kpg_rp(x.dibayar) : "—"}</td>
				<td class="text-right"><b>${x.docstatus === 1 ? kpg_rp(x.sisa_termin) : "—"}</b></td>
				<td>${kpg_status_inv(x)}</td>
				<td class="text-right kpg-aksi">${x.docstatus === 1 && x.sisa_termin > 0.5 ? this.tombol_bayar(x.name, x.label === __("Uang Muka") ? "semua" : "termin", __("Catat Pembayaran"))
					: x.docstatus === 0 ? `<a class="btn btn-default btn-xs" href="/app/sales-invoice/${encodeURIComponent(x.name)}">${__("Periksa & Submit")}</a>` : ""}</td>
			</tr>`)
			.join("");
		const riwayat = d.pembayaran
			.map((p) => `<tr>
				<td>${kpg_tgl(p.posting_date)}</td>
				<td><a href="/app/payment-entry/${encodeURIComponent(p.name)}">${kpg_esc(p.name)}</a></td>
				<td class="kptl-potong" title="${kpg_esc(p.label)}">${kpg_esc(p.label)} <span class="kptl-sub-kecil">${kpg_esc(p.invoice)}</span></td>
				<td>${kpg_esc(p.mode_of_payment || "—")}</td>
				<td>${kpg_esc(p.reference_no || "—")}</td>
				<td class="text-right"><b>${kpg_rp(p.jumlah)}</b></td>
			</tr>`)
			.join("");
		return `<div class="kptl-card kpbs-tabel-kartu">
				<div class="kpbs-tabel-judul">${__("Invoice Proyek")}<span class="kptl-sub-kecil">${__("Sisa = belum dibayar di luar retensi (retensi dipantau di layar Retensi)")}</span></div>
				<div class="kptl-tabel-wrap"><table class="kptl-tabel kpg-tabel">
					<colgroup><col style="width:170px"><col><col style="width:110px"><col style="width:140px"><col style="width:130px"><col style="width:140px"><col style="width:140px"><col style="width:130px"><col style="width:170px"></colgroup>
					<thead><tr><th>${__("Invoice")}</th><th>${__("Tagihan")}</th><th>${__("Tanggal")}</th><th class="text-right">${__("Total")}</th><th class="text-right">${__("Retensi")}</th>
						<th class="text-right">${__("Sudah Dibayar")}</th><th class="text-right">${__("Sisa")}</th><th>${__("Status")}</th><th class="text-right">${__("Aksi")}</th></tr></thead>
					<tbody>${baris || `<tr><td colspan="9" class="kptl-kosong">${__("Belum ada invoice. Tagih uang muka / termin dulu.")}</td></tr>`}</tbody>
				</table></div></div>
			<div class="kptl-card kpbs-tabel-kartu">
				<div class="kpbs-tabel-judul">${__("Riwayat Pembayaran")}</div>
				<div class="kptl-tabel-wrap"><table class="kptl-tabel kpg-tabel">
					<colgroup><col style="width:120px"><col style="width:190px"><col><col style="width:150px"><col style="width:170px"><col style="width:160px"></colgroup>
					<thead><tr><th>${__("Tanggal")}</th><th>${__("Payment Entry")}</th><th>${__("Untuk Tagihan")}</th><th>${__("Cara Bayar")}</th><th>${__("No. Referensi")}</th><th class="text-right">${__("Jumlah")}</th></tr></thead>
					<tbody>${riwayat || `<tr><td colspan="6" class="kptl-kosong">${__("Belum ada pembayaran yang diterima.")}</td></tr>`}</tbody>
				</table></div></div>`;
	}

	tombol_bayar(inv, bagian, label) {
		if (!this.data.bisa_bayar) return "";
		return `<button class="btn btn-default btn-xs" data-kpg="bayar" data-invoice="${kpg_esc(inv)}" data-bagian="${bagian}">${frappe.utils.icon("banknote", "xs")} ${label}</button>`;
	}

	html_uang_muka() {
		const d = this.data;
		const um = d.uang_muka;
		const k = d.kontrak;
		if (!um.rincian) return "";
		const x = um.rincian;
		const inv = um.invoice;
		let aksi;
		if (inv) {
			aksi = `${kpg_status_inv(inv)} <a class="btn btn-default btn-xs" href="/app/sales-invoice/${encodeURIComponent(inv.name)}">${kpg_esc(inv.name)}</a>`;
			if (inv.docstatus === 1 && flt(inv.outstanding_amount) > 0.5) aksi += ` ${this.tombol_bayar(inv.name, "semua", __("Catat Pembayaran"))}`;
		} else if (!k.jaminan_um) aksi = `<span class="kpbs-var kpbs-var-mundur" title="${__("Isi & tandai Jaminan Uang Muka di Kontrak Project")}">${__("Jaminan uang muka belum diserahkan")}</span>`;
		else if (d.bisa_buat) aksi = `<button class="btn btn-primary btn-xs" data-kpg="tagih-um">${frappe.utils.icon("receipt", "xs")} ${__("Buat Tagihan Uang Muka")}</button>`;
		else aksi = "";
		const dasar = k.um_nilai
			? __("{0}% × nilai kontrak awal {1} (sebelum addendum)", [format_number(k.um_persen, null, 2), kpg_rp(k.nilai_kontrak_awal)])
			: __("{0}% × nilai kontrak", [format_number(k.um_persen, null, 2)]);
		return `<div class="kptl-card kpbs-tabel-kartu">
			<div class="kpbs-tabel-judul">${__("Uang Muka {0}%", [format_number(k.um_persen, null, 2)])}
				<span class="kptl-sub-kecil">${dasar}</span></div>
			<div class="kptl-tabel-wrap"><table class="kptl-tabel kpg-tabel">
				<thead><tr><th class="text-right">${__("Nilai Uang Muka (bruto)")}</th><th class="text-right">DPP</th><th class="text-right">${__("PPN")}</th>
					<th class="text-right">${__("PPh Final")}</th><th class="text-right">${__("Total Tagihan")}</th><th class="text-right">${__("Sisa Piutang")}</th>
					<th class="text-right">${__("Status / Aksi")}</th></tr></thead>
				<tbody><tr>
					<td class="text-right">${kpg_rp(x.bruto)}</td><td class="text-right">${kpg_rp(x.dpp)}</td><td class="text-right">${kpg_rp(x.ppn)}</td>
					<td class="text-right kptl-merah">−${kpg_rp(x.pph)}</td><td class="text-right"><b>${kpg_rp(inv ? inv.total : x.total)}</b></td>
					<td class="text-right">${inv && inv.docstatus === 1 ? kpg_rp(inv.outstanding_amount) : "—"}</td>
					<td class="text-right kpg-aksi">${aksi}</td>
				</tr></tbody></table></div>
		</div>`;
	}

	html_termin() {
		const d = this.data;
		const k = d.kontrak;
		const angka = (o) => `
			<td class="text-right">${o.potong_um ? `−${kpg_rp(o.potong_um)}` : kpg_rp(0)}</td>
			<td class="text-right">${kpg_rp(o.dpp_net)}</td>
			<td class="text-right">${kpg_rp(o.ppn)}</td>
			<td class="text-right kptl-merah">−${kpg_rp(o.pph)}</td>
			<td class="text-right"><b>${kpg_rp(o.total)}</b></td>
			<td class="text-right">${kpg_rp(o.retensi)}</td>
			<td class="text-right">${kpg_rp(o.total - o.retensi)}</td>`;
		const baris = d.termin
			.map((t) => {
				const inv = t.invoice;
				const rc = t.rincian;
				let isi, aksi;
				if (inv) {
					isi = angka({ potong_um: inv.potongan_uang_muka, dpp_net: flt(inv.net_total) - flt(inv.potongan_uang_muka), ppn: inv.ppn,
						pph: inv.nilai_pph_final, total: inv.total, retensi: inv.nilai_retensi });
					aksi = `${kpg_status_inv(inv)} <a class="btn btn-default btn-xs" href="/app/sales-invoice/${encodeURIComponent(inv.name)}">${kpg_esc(inv.name)}</a>`;
					if (inv.docstatus === 1 && inv.sisa_termin > 0.5) aksi += ` ${this.tombol_bayar(inv.name, "termin", __("Catat Pembayaran"))}`;
				} else if (rc) {
					isi = angka(rc);
					aksi = !d.bisa_buat
						? ""
						: t.tunggu_um
						? `<span class="kpbs-var kpbs-var-mundur" title="${__("Supaya termin ini dipotong uang muka secara proporsional")}">${__("Tagih uang muka dulu")}</span>`
						: `<button class="btn btn-primary btn-xs" data-kpg="tagih-termin" data-name="${kpg_esc(t.name)}">${frappe.utils.icon("receipt", "xs")} ${__("Buat Tagihan")}</button>`;
				} else {
					isi = `<td colspan="7" class="kptl-sub-kecil">${__("Ditagih setelah milestone tercapai")}</td>`;
					aksi = `<span class="kpbs-var kpbs-var-sesuai">${__(t.status)}</span>`;
				}
				return `<tr>
					<td class="kptl-mono">T${t.urutan}</td>
					<td class="kptl-potong" title="${kpg_esc(t.nama_milestone)}"><b>${kpg_esc(t.nama_milestone)}</b></td>
					<td class="kpg-tgl">${t.status === "Tercapai"
						? `${kpg_tgl(t.tanggal_tercapai)} <span class="kptl-sub-kecil">${__("tercapai")}</span>`
						: `<span class="text-muted">${kpg_tgl(t.tanggal_target)}</span> <span class="kptl-sub-kecil">${__("target")}</span>`}</td>
					<td class="text-right">${kpg_rp(t.nilai_termin)}<div class="kptl-sub-kecil">${__("bobot {0}", [kpg_persen(t.bobot)])}</div></td>
					${isi}
					<td class="text-right kpg-aksi">${aksi}</td>
				</tr>`;
			})
			.join("");
		const kepala_kolom = (judul, info) => `<th class="text-right" title="${kpg_esc(info)}">${judul}</th>`;
		return `<div class="kptl-card kpbs-tabel-kartu">
			<div class="kpbs-tabel-judul">${__("Termin per Milestone")}
				<span class="kptl-sub-kecil">${__("Arahkan kursor ke judul kolom untuk cara hitungnya")}</span></div>
			<div class="kptl-tabel-wrap"><table class="kptl-tabel kpg-tabel kpg-tabel-termin">
				<colgroup><col style="width:46px"><col><col style="width:150px"><col style="width:130px"><col style="width:110px"><col style="width:120px"><col style="width:105px"><col style="width:105px">
					<col style="width:120px"><col style="width:105px"><col style="width:125px"><col style="width:250px"></colgroup>
				<thead><tr><th>${__("Termin")}</th><th>${__("Milestone")}</th>
					<th title="${__("Tanggal milestone tercapai; bila belum tercapai, tanggal targetnya")}">${__("Tanggal")}</th>
					${kepala_kolom(__("Nilai Termin"), __("Bobot × nilai kontrak, termasuk PPN (bruto)"))}
					${kepala_kolom(__("Pot. Uang Muka"), __("Uang muka % × DPP termin, dipotong sampai uang muka habis"))}
					${kepala_kolom(__("DPP Ditagih"), __("Nilai termin tanpa PPN, dikurangi potongan uang muka"))}
					${kepala_kolom(__("PPN"), __("PPN % × DPP ditagih"))}
					${kepala_kolom(__("PPh Final"), __("PPh final % × DPP ditagih, dipotong pemberi kerja"))}
					${kepala_kolom(__("Total Tagihan"), __("DPP ditagih + PPN − PPh final (nilai invoice)"))}
					${kepala_kolom(__("Retensi"), __("Retensi % × nilai termin; ditahan sampai akhir pemeliharaan"))}
					${kepala_kolom(__("Dibayar Sekarang"), __("Total tagihan − retensi"))}
					<th class="text-right">${__("Status / Aksi")}</th></tr></thead>
				<tbody>${baris || `<tr><td colspan="12" class="kptl-kosong">${__("Belum ada milestone. Buat di Milestone & Termin.")}</td></tr>`}</tbody>
			</table></div></div>`;
	}

	html_retensi() {
		const d = this.data;
		const k = d.kontrak;
		const r = d.ringkasan;
		const rows = d.retensi;
		const warna = { Lunas: "maju", "Jatuh Tempo": "mundur", Ditahan: "baru" };
		const baris = rows
			.map((x) => `<tr>
				<td class="kptl-mono">T${x.urutan}</td>
				<td class="kptl-potong" title="${kpg_esc(x.nama_milestone)}">${kpg_esc(x.nama_milestone)}</td>
				<td><a href="/app/sales-invoice/${encodeURIComponent(x.invoice)}">${kpg_esc(x.invoice)}</a></td>
				<td class="text-right">${kpg_rp(x.retensi)}</td>
				<td>${kpg_tgl(x.jatuh_tempo)}</td>
				<td class="text-right">${kpg_rp(x.diterima)}</td>
				<td class="text-right"><b>${kpg_rp(x.sisa)}</b></td>
				<td><span class="kpbs-var kpbs-var-${warna[x.status]}">${__(x.status)}</span></td>
				<td class="text-right kpg-aksi">${x.sisa > 0.5 && x.sisa_termin <= 0.5 ? this.tombol_bayar(x.invoice, "retensi", __("Catat Penerimaan Retensi"))
					: x.sisa > 0.5 ? `<span class="kptl-sub-kecil" title="${__("Bagian termin invoice ini belum lunas")}">${__("Lunasi termin dulu")}</span>` : ""}</td>
			</tr>`)
			.join("");
		return `<div class="kptl-card kpbs-tabel-kartu">
			<div class="kpbs-tabel-judul">${__("Retensi {0}%", [format_number(k.retensi_persen, null, 2)])}
				<span class="kptl-sub-kecil">${__("Ditahan pemberi kerja dari tiap termin, wajib ditagih kembali setelah masa pemeliharaan berakhir ({0}).", [kpg_tgl(k.akhir_pemeliharaan)])}</span></div>
			<div class="kptl-tabel-wrap"><table class="kptl-tabel kpg-tabel">
				<colgroup><col style="width:56px"><col><col style="width:170px"><col style="width:140px"><col style="width:120px"><col style="width:140px"><col style="width:140px"><col style="width:110px"><col style="width:220px"></colgroup>
				<thead><tr><th>${__("Termin")}</th><th>${__("Milestone")}</th><th>${__("Invoice")}</th><th class="text-right">${__("Retensi")}</th><th>${__("Jatuh Tempo")}</th>
					<th class="text-right">${__("Sudah Diterima")}</th><th class="text-right">${__("Sisa")}</th><th>${__("Status")}</th><th class="text-right">${__("Aksi")}</th></tr></thead>
				<tbody>${baris || `<tr><td colspan="9" class="kptl-kosong">${__("Belum ada retensi — retensi muncul setelah invoice termin di-submit.")}</td></tr>`}</tbody>
				${rows.length ? `<tfoot><tr class="kpg-total">
					<td colspan="3" class="text-right">${__("Total")}</td><td class="text-right">${kpg_rp(r.retensi_total)}</td><td></td>
					<td class="text-right">${kpg_rp(r.retensi_diterima)}</td>
					<td class="text-right ${r.retensi_sisa > 0.5 ? "kptl-merah" : ""}">${kpg_rp(r.retensi_sisa)}</td>
					<td colspan="2" class="kptl-sub-kecil">${r.retensi_sisa > 0.5 ? __("harus ditagih kembali") : __("semua retensi sudah diterima")}</td>
				</tr></tfoot>` : ""}
			</table></div></div>`;
	}

	aksi(e) {
		const $el = $(e.target).closest("[data-kpg]");
		switch ($el.attr("data-kpg")) {
			case "layar":
				this.layar = $el.attr("data-layar");
				this.$body.find(".kpg-alur-langkah").removeClass("kpg-alur-aktif").filter(`[data-layar="${this.layar}"]`).addClass("kpg-alur-aktif");
				return this.$body.find(".kpg-layar").html(this.html_layar());
			case "buka":
				return frappe.set_route("penagihan", $el.attr("data-project"));
			case "tagih-um":
				return frappe
					.call({ method: KPG_API + "buat_tagihan_uang_muka", args: { project: this.project }, freeze: true, freeze_message: __("Membuat invoice uang muka…") })
					.then((r) => r.message && frappe.set_route("Form", "Sales Invoice", r.message));
			case "bayar":
				return frappe
					.call({ method: KPG_API + "buat_pembayaran", args: { project: this.project, invoice: $el.attr("data-invoice"), bagian: $el.attr("data-bagian") },
						freeze: true, freeze_message: __("Menyiapkan pembayaran…") })
					.then((r) => {
						if (!r.message) return;
						const doc = frappe.model.sync(r.message)[0];
						frappe.set_route("Form", doc.doctype, doc.name);
					});
			case "tagih-termin":
				return frappe
					.call({ method: KPG_API + "buat_tagihan_termin", args: { project: this.project, milestone: $el.attr("data-name") }, freeze: true, freeze_message: __("Membuat invoice termin…") })
					.then((r) => r.message && frappe.set_route("Form", "Sales Invoice", r.message));
		}
	}
}
