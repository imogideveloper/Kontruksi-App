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
			const baris = rows
				.map((r) => `<tr class="kptl-baris-proyek" data-kpg="buka" data-project="${kpg_esc(r.name)}">
					<td class="kptl-mono">${kpg_esc(r.name)}</td>
					<td><b>${kpg_esc(r.project_name)}</b></td>
					<td class="kptl-potong" title="${kpg_esc(r.customer || "")}">${kpg_esc(r.customer || "—")}</td>
					<td class="text-right">${kpg_rp(r.nilai_kontrak)}</td>
					<td>${r.uang_muka ? `<span class="kpbs-var kpbs-var-maju">${__("Ditagih")}</span>` : `<span class="kpbs-var kpbs-var-sesuai">${__("Belum")}</span>`}</td>
					<td class="text-right">${kpg_rp(r.ditagih)}</td>
					<td class="text-right">${kpg_rp(r.piutang)}</td>
					<td class="text-right ${r.siap_ditagih ? "kpg-siap" : ""}">${r.siap_ditagih || "—"}</td>
					<td class="text-right kptl-buka">${__("Buka")} ${frappe.utils.icon("right", "xs")}</td>
				</tr>`)
				.join("");
			this.$body.html(`${kepala}<div class="kptl-card kptl-card-tabel"><div class="kptl-tabel-wrap"><table class="kptl-tabel">
				<colgroup><col style="width:130px"><col><col style="width:200px"><col style="width:150px"><col style="width:100px"><col style="width:150px"><col style="width:150px"><col style="width:110px"><col style="width:80px"></colgroup>
				<thead><tr><th>${__("ID Proyek")}</th><th>${__("Nama Proyek")}</th><th>${__("Klien")}</th><th class="text-right">${__("Nilai Kontrak")}</th>
					<th>${__("Uang Muka")}</th><th class="text-right">${__("Sudah Ditagih")}</th><th class="text-right">${__("Piutang")}</th><th class="text-right">${__("Siap Ditagih")}</th><th></th></tr></thead>
				<tbody>${baris}</tbody></table></div></div>`);
		});
	}

	// ---------- satu proyek ----------

	buka(project) {
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

		this.$body.html(`
			<div class="kptl-head"><div class="kpbs-kepala">
				<a class="kptl-crumb" href="/app/project/${encodeURIComponent(p.name)}">${kpg_esc(p.name)} · ${kpg_esc(p.project_name)}</a>
				<span class="kpbs-sub">${__("Tagihan uang muka & termin ke {0} · kontrak {1}", [kpg_esc(k.customer), kpg_esc(k.nomor_kontrak || k.kontrak)])}</span>
			</div></div>
			<div class="kpbs-kartu-baris kpg-kartu-baris">
				${kartu("abu", __("Nilai Kontrak"), kpg_rp(r.nilai_kontrak), __("Termasuk PPN {0}%", [format_number(k.ppn, null, 0)]))}
				${kartu("hijau", __("Sudah Ditagih"), kpg_rp(r.ditagih), __("{0} termin dari nilai kontrak", [kpg_persen(r.persen_ditagih)]))}
				${kartu("hijau", __("Diterima"), kpg_rp(r.diterima), __("Pembayaran yang sudah masuk"))}
				${kartu(r.piutang ? "oranye" : "abu", __("Piutang"), kpg_rp(r.piutang), __("termasuk retensi {0}", [kpg_rp(r.retensi)]))}
				${kartu(r.bisa_ditagih ? "oranye" : "abu", __("Siap Ditagih"), kpg_rp(r.bisa_ditagih), __("Milestone tercapai belum ditagih"))}
			</div>
			${this.html_uang_muka()}
			${this.html_termin()}
			<div class="kptl-sub-kecil kpg-catatan">${__(
				"Invoice dibuat sebagai Draft: periksa, lampirkan dokumen (BA, faktur pajak), lalu Submit dari form Sales Invoice. Uang muka {0}% dipotong proporsional di tiap termin; retensi {1}% ditagih di jadwal pembayaran terakhir (jatuh tempo akhir pemeliharaan {2}); PPh final {3}% dipotong langsung di invoice.",
				[format_number(k.um_persen, null, 2), format_number(k.retensi_persen, null, 2), kpg_tgl(k.akhir_pemeliharaan), format_number(k.pph_persen, null, 2)]
			)}</div>`);
	}

	html_uang_muka() {
		const d = this.data;
		const um = d.uang_muka;
		const k = d.kontrak;
		if (!um.rincian) return "";
		const x = um.rincian;
		const inv = um.invoice;
		let aksi;
		if (inv) aksi = `${kpg_status_inv(inv)} <a class="btn btn-default btn-sm" href="/app/sales-invoice/${encodeURIComponent(inv.name)}">${kpg_esc(inv.name)}</a>`;
		else if (!k.jaminan_um) aksi = `<span class="kpbs-var kpbs-var-mundur" title="${__("Isi & tandai Jaminan Uang Muka di Kontrak Project")}">${__("Jaminan uang muka belum diserahkan")}</span>`;
		else if (d.bisa_buat) aksi = `<button class="btn btn-primary btn-sm" data-kpg="tagih-um">${frappe.utils.icon("receipt", "xs")} ${__("Buat Tagihan Uang Muka")}</button>`;
		else aksi = "";
		return `<div class="kptl-card kpbs-tabel-kartu">
			<div class="kpbs-tabel-judul">${__("Uang Muka {0}%", [format_number(k.um_persen, null, 2)])}<span class="kpg-aksi-kanan">${aksi}</span></div>
			<div class="kptl-tabel-wrap"><table class="kptl-tabel kpg-tabel">
				<thead><tr><th class="text-right">${__("Nilai Uang Muka (bruto)")}</th><th class="text-right">DPP</th><th class="text-right">${__("PPN")}</th>
					<th class="text-right">${__("PPh Final")}</th><th class="text-right">${__("Total Tagihan")}</th><th class="text-right">${__("Sisa Piutang")}</th></tr></thead>
				<tbody><tr>
					<td class="text-right">${kpg_rp(x.bruto)}</td><td class="text-right">${kpg_rp(x.dpp)}</td><td class="text-right">${kpg_rp(x.ppn)}</td>
					<td class="text-right kptl-merah">−${kpg_rp(x.pph)}</td><td class="text-right"><b>${kpg_rp(inv ? inv.rounded_total || inv.grand_total : x.total)}</b></td>
					<td class="text-right">${inv && inv.docstatus === 1 ? kpg_rp(inv.outstanding_amount) : "—"}</td>
				</tr></tbody></table></div>
			<div class="kptl-sub-kecil kpg-catatan-kartu">${__("Dokumen pendukung: Jaminan Uang Muka, Surat Permohonan Pembayaran Uang Muka, Faktur Pajak uang muka, Berita Acara Pembayaran — lampirkan di invoice.")}</div>
		</div>`;
	}

	html_termin() {
		const d = this.data;
		const baris = d.termin
			.map((t) => {
				const inv = t.invoice;
				const rc = t.rincian;
				let isi, aksi;
				if (inv) {
					const dpp_net = flt(inv.net_total) - flt(inv.potongan_uang_muka);
					isi = `<td class="text-right">${kpg_rp(inv.potongan_uang_muka ? -inv.potongan_uang_muka : 0)}</td>
						<td class="text-right">${kpg_rp(dpp_net)}</td>
						<td class="text-right kptl-merah">−${kpg_rp(inv.nilai_pph_final)}</td>
						<td class="text-right"><b>${kpg_rp(inv.rounded_total || inv.grand_total)}</b></td>
						<td class="text-right">${kpg_rp(inv.nilai_retensi)}</td>`;
					aksi = `${kpg_status_inv(inv)} <a class="btn btn-default btn-xs" href="/app/sales-invoice/${encodeURIComponent(inv.name)}">${kpg_esc(inv.name)}</a>`;
				} else if (rc) {
					isi = `<td class="text-right">${rc.potong_um ? `−${kpg_rp(rc.potong_um)}` : kpg_rp(0)}</td>
						<td class="text-right">${kpg_rp(rc.dpp_net)}</td>
						<td class="text-right kptl-merah">−${kpg_rp(rc.pph)}</td>
						<td class="text-right"><b>${kpg_rp(rc.total)}</b></td>
						<td class="text-right">${kpg_rp(rc.retensi)}</td>`;
					aksi = d.bisa_buat
						? `<button class="btn btn-primary btn-xs" data-kpg="tagih-termin" data-name="${kpg_esc(t.name)}">${frappe.utils.icon("receipt", "xs")} ${__("Buat Tagihan")}</button>`
						: "";
				} else {
					isi = `<td colspan="5" class="kptl-sub-kecil">${__("Ditagih setelah milestone tercapai")}</td>`;
					aksi = `<span class="kpbs-var kpbs-var-sesuai">${__(t.status)}</span>`;
				}
				return `<tr>
					<td class="kptl-mono">T${t.urutan}</td>
					<td class="kptl-potong" title="${kpg_esc(t.nama_milestone)}"><b>${kpg_esc(t.nama_milestone)}</b>
						<div class="kptl-sub-kecil">${t.status === "Tercapai" ? __("Tercapai {0}", [kpg_tgl(t.tanggal_tercapai)]) : __("Target {0}", [kpg_tgl(t.tanggal_target)])}</div></td>
					<td class="text-right">${kpg_persen(t.bobot)}</td>
					<td class="text-right">${kpg_rp(t.nilai_termin)}</td>
					${isi}
					<td class="text-right kpg-aksi">${aksi}</td>
				</tr>`;
			})
			.join("");
		return `<div class="kptl-card kpbs-tabel-kartu">
			<div class="kpbs-tabel-judul">${__("Termin per Milestone")}</div>
			<div class="kptl-tabel-wrap"><table class="kptl-tabel kpg-tabel kpg-tabel-termin">
				<colgroup><col style="width:56px"><col><col style="width:80px"><col style="width:140px"><col style="width:130px"><col style="width:140px"><col style="width:120px"><col style="width:140px"><col style="width:120px"><col style="width:230px"></colgroup>
				<thead><tr><th>${__("Termin")}</th><th>${__("Milestone")}</th><th class="text-right">${__("Bobot")}</th><th class="text-right">${__("Nilai Termin")}</th>
					<th class="text-right">${__("Pot. Uang Muka")}</th><th class="text-right">${__("DPP Ditagih")}</th><th class="text-right">${__("PPh Final")}</th>
					<th class="text-right">${__("Total Tagihan")}</th><th class="text-right">${__("Retensi")}</th><th class="text-right">${__("Invoice")}</th></tr></thead>
				<tbody>${baris || `<tr><td colspan="10" class="kptl-kosong">${__("Belum ada milestone. Buat di Milestone & Termin.")}</td></tr>`}</tbody>
			</table></div></div>`;
	}

	aksi(e) {
		const $el = $(e.target).closest("[data-kpg]");
		switch ($el.attr("data-kpg")) {
			case "buka":
				return frappe.set_route("penagihan", $el.attr("data-project"));
			case "tagih-um":
				return frappe
					.call({ method: KPG_API + "buat_tagihan_uang_muka", args: { project: this.project }, freeze: true, freeze_message: __("Membuat invoice uang muka…") })
					.then((r) => r.message && frappe.set_route("Form", "Sales Invoice", r.message));
			case "tagih-termin":
				return frappe
					.call({ method: KPG_API + "buat_tagihan_termin", args: { project: this.project, milestone: $el.attr("data-name") }, freeze: true, freeze_message: __("Membuat invoice termin…") })
					.then((r) => r.message && frappe.set_route("Form", "Sales Invoice", r.message));
		}
	}
}
