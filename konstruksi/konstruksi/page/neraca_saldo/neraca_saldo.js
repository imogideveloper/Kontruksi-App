// Neraca Saldo (Keuangan): tampilan premium Trial Balance ERPNext — kartu ringkasan (debit = kredit, saldo per jenis
// akun), tabel tree akun dengan saldo awal · mutasi · saldo akhir, buka/tutup group, klik akun → General Ledger,
// unduh Excel (CSV) & cetak PDF landscape. Data: konstruksi.konstruksi.neraca_saldo. Gaya: kelas kpns-*.

frappe.pages["neraca-saldo"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Neraca Saldo"), single_column: true });
	wrapper.neraca_saldo = new HalamanNeracaSaldo(page);
};

frappe.pages["neraca-saldo"].on_page_show = function (wrapper) {
	wrapper.neraca_saldo?.tampil();
};

const KPNS_API = "konstruksi.konstruksi.neraca_saldo.";
const KPNS_KOLOM = ["opening_debit", "opening_credit", "debit", "credit", "closing_debit", "closing_credit"];
const kpns_esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));
const kpns_angka = (v) => (Math.abs(flt(v)) < 0.5 ? `<span class="kpns-nol">–</span>` : format_number(flt(v), null, 0));
const kpns_rp = (v) => format_currency(flt(v), "IDR", 0);

class HalamanNeracaSaldo {
	constructor(page) {
		this.page = page;
		this.tertutup = new Set();
		// Beberapa filter bisa berubah beruntun (set_value asinkron): muat ulang sekali saja.
		const tunda = frappe.utils.debounce(() => this.muat(), 250);
		const muat = () => !this.diam && tunda();
		this.f = {
			company: page.add_field({ fieldname: "company", fieldtype: "Link", options: "Company", label: __("Perusahaan"), change: muat }),
			from_date: page.add_field({ fieldname: "from_date", fieldtype: "Date", label: __("Dari"), change: muat }),
			to_date: page.add_field({ fieldname: "to_date", fieldtype: "Date", label: __("Sampai"), change: muat }),
			project: page.add_field({ fieldname: "project", fieldtype: "Link", options: "Project", label: __("Proyek"), change: muat }),
			cost_center: page.add_field({
				fieldname: "cost_center", fieldtype: "Link", options: "Cost Center", label: __("Cost Center"), change: muat,
				get_query: () => ({ filters: { company: this.f.company.get_value() } }),
			}),
			show_zero: page.add_field({ fieldname: "show_zero", fieldtype: "Check", label: __("Tampilkan saldo nol"), change: muat }),
		};
		this.$body = $(`<div class="kpns"></div>`).appendTo(page.main);
		this.$body.on("click", "[data-kpns]", (e) => this.aksi(e));

		page.add_inner_button(__("Bulan Ini"), () => this.periode("bulan"), __("Periode"));
		page.add_inner_button(__("Kuartal Ini"), () => this.periode("kuartal"), __("Periode"));
		page.add_inner_button(__("Tahun Fiskal Berjalan"), () => this.periode("tahun"), __("Periode"));
		page.add_inner_button(__("Unduh Excel"), () => this.unduh_excel());
		page.set_primary_action(__("Cetak PDF"), () => this.cetak(), "printer");
	}

	tampil() {
		// Halaman modul Konstruksi: selalu dengan sidebar Konstruksi.
		const sidebar = frappe.app?.sidebar;
		if (sidebar && sidebar.sidebar_title !== "Konstruksi" && frappe.boot.workspace_sidebar_item?.konstruksi) {
			sidebar.setup("Konstruksi");
			sidebar.set_active_workspace_item?.();
		}
		if (this.awal) return this.muat();
		return frappe.xcall(KPNS_API + "get_awal").then((a) => {
			this.awal = a;
			this.diam = true;
			this.f.company.set_value(a.company);
			this.f.from_date.set_value(a.from_date);
			this.f.to_date.set_value(a.to_date);
			this.diam = false;
			this.muat();
		});
	}

	periode(jenis) {
		const t = moment();
		let dari = this.awal?.from_date;
		if (jenis === "bulan") dari = t.clone().startOf("month").format("YYYY-MM-DD");
		if (jenis === "kuartal") dari = t.clone().startOf("quarter").format("YYYY-MM-DD");
		this.diam = true;
		this.f.from_date.set_value(dari);
		this.f.to_date.set_value(t.format("YYYY-MM-DD"));
		this.diam = false;
		this.muat();
	}

	filter() {
		return {
			company: this.f.company.get_value(),
			from_date: this.f.from_date.get_value(),
			to_date: this.f.to_date.get_value(),
			project: this.f.project.get_value() || null,
			cost_center: this.f.cost_center.get_value() || null,
			show_zero: this.f.show_zero.get_value() ? 1 : 0,
		};
	}

	muat() {
		if (this.diam) return;
		const f = this.filter();
		if (!f.company || !f.from_date || !f.to_date) return;
		this.$body.html(`<div class="kpns-muat">${__("Memuat…")}</div>`);
		return frappe
			.xcall(KPNS_API + "get_neraca_saldo", f)
			.then((d) => {
				this.data = d;
				this.render();
			})
			.catch(() => this.$body.html(`<div class="kpns-kartu kpns-kosong">${__("Data tidak bisa dimuat — periksa filter.")}</div>`));
	}

	render() {
		const d = this.data;
		const t = d.total;
		const status = d.seimbang
			? `<div class="kpns-kartu kpns-kartu-ok"><div class="kpns-label">${__("Status")}</div><div class="kpns-nilai">${__("Seimbang")} ✓</div>
				<div class="kpns-sub">${__("Total debit = total kredit")}</div></div>`
			: `<div class="kpns-kartu kpns-kartu-salah"><div class="kpns-label">${__("Status")}</div><div class="kpns-nilai">${__("Tidak Seimbang")}</div>
				<div class="kpns-sub">${__("Selisih {0}", [kpns_rp(d.selisih)])}</div></div>`;
		const jenis = d.per_jenis
			.map((x) => `<div class="kpns-kartu kpns-kartu-jenis"><div class="kpns-label">${__(x.label)}</div>
				<div class="kpns-nilai-kecil">${kpns_rp(Math.abs(x.saldo))} <span class="kpns-dk">${x.saldo >= 0 ? "D" : "K"}</span></div></div>`)
			.join("");
		this.$body.html(`
			<div class="kpns-ringkasan">
				<div class="kpns-kartu"><div class="kpns-label">${__("Total Mutasi Debit")}</div><div class="kpns-nilai">${kpns_rp(t.debit)}</div>
					<div class="kpns-sub">${__("periode {0} – {1}", [frappe.datetime.str_to_user(this.f.from_date.get_value()), frappe.datetime.str_to_user(this.f.to_date.get_value())])}</div></div>
				<div class="kpns-kartu"><div class="kpns-label">${__("Total Mutasi Kredit")}</div><div class="kpns-nilai">${kpns_rp(t.credit)}</div>
					<div class="kpns-sub">${__("tahun fiskal {0}", [kpns_esc(d.fiscal_year)])}</div></div>
				${status}
			</div>
			${jenis ? `<div class="kpns-jenis">${jenis}</div>` : ""}
			<div class="kpns-kartu kpns-tabel-kartu">
				<div class="kpns-tabel-judul">${__("Daftar Akun")}
					<span class="kpns-aksi">
						<button class="btn btn-default btn-xs" data-kpns="buka-semua" title="${__("Buka semua")}">${frappe.utils.icon("chevrons-up-down", "xs")} ${__("Buka semua")}</button>
						<button class="btn btn-default btn-xs" data-kpns="tutup-semua" title="${__("Tutup semua")}">${frappe.utils.icon("chevrons-down-up", "xs")} ${__("Tutup semua")}</button>
					</span></div>
				<div class="kpns-tabel-wrap"><table class="kpns-tabel">
					<colgroup><col><col class="kpns-k"><col class="kpns-k"><col class="kpns-k"><col class="kpns-k"><col class="kpns-k"><col class="kpns-k"></colgroup>
					<thead>
						<tr><th rowspan="2">${__("Akun")}</th><th colspan="2" class="kpns-grup">${__("Saldo Awal")}</th>
							<th colspan="2" class="kpns-grup">${__("Mutasi")}</th><th colspan="2" class="kpns-grup">${__("Saldo Akhir")}</th></tr>
						<tr>${KPNS_KOLOM.map((k) => `<th class="text-right">${k.endsWith("credit") ? __("Kredit") : __("Debit")}</th>`).join("")}</tr>
					</thead>
					<tbody>${this.html_baris()}</tbody>
					<tfoot><tr class="kpns-total"><td>${__("Total")}</td>${KPNS_KOLOM.map((k) => `<td class="text-right">${kpns_angka(t[k])}</td>`).join("")}</tr></tfoot>
				</table></div>
			</div>`);
	}

	html_baris() {
		const rows = this.data.rows;
		if (!rows.length) return `<tr><td colspan="7" class="kpns-kosong">${__("Tidak ada transaksi pada periode ini.")}</td></tr>`;
		// Baris tersembunyi bila salah satu leluhurnya tertutup.
		const leluhur_tutup = (r) => {
			let p = r.parent;
			while (p) {
				if (this.tertutup.has(p)) return true;
				p = this.induk_dari[p];
			}
			return false;
		};
		this.induk_dari = Object.fromEntries(rows.map((r) => [r.account, r.parent]));
		return rows
			.filter((r) => !leluhur_tutup(r))
			.map((r) => {
				const tutup = this.tertutup.has(r.account);
				const ikon = r.group
					? `<span class="kpns-toggle" data-kpns="toggle" data-akun="${kpns_esc(r.account)}">${frappe.utils.icon(tutup ? "chevron-right" : "chevron-down", "xs")}</span>`
					: `<span class="kpns-toggle-kosong"></span>`;
				const nama = r.group
					? `<span class="kpns-nama">${kpns_esc(r.nama)}</span>`
					: `<a class="kpns-nama" data-kpns="ledger" data-akun="${kpns_esc(r.account)}" title="${__("Buka General Ledger")}">${kpns_esc(r.nama)}</a>`;
				return `<tr class="${r.group ? `kpns-group kpns-level-${Math.min(r.indent, 2)}` : "kpns-daun"}">
					<td><div class="kpns-akun" style="padding-left:${r.indent * 18}px">${ikon}${r.nomor ? `<span class="kpns-nomor">${kpns_esc(r.nomor)}</span>` : ""}${nama}</div></td>
					${KPNS_KOLOM.map((k) => `<td class="text-right">${kpns_angka(r[k])}</td>`).join("")}
				</tr>`;
			})
			.join("");
	}

	aksi(e) {
		const $el = $(e.target).closest("[data-kpns]");
		const akun = $el.attr("data-akun");
		switch ($el.attr("data-kpns")) {
			case "toggle":
				this.tertutup.has(akun) ? this.tertutup.delete(akun) : this.tertutup.add(akun);
				return this.$body.find(".kpns-tabel tbody").html(this.html_baris());
			case "buka-semua":
				this.tertutup.clear();
				return this.$body.find(".kpns-tabel tbody").html(this.html_baris());
			case "tutup-semua":
				// Tutup sampai level teratas: hanya kelompok utama (Aset, Kewajiban, ...) yang tampil.
				this.data.rows.filter((r) => r.group).forEach((r) => this.tertutup.add(r.account));
				return this.$body.find(".kpns-tabel tbody").html(this.html_baris());
			case "ledger": {
				const f = this.filter();
				return frappe.set_route("query-report", "General Ledger", {
					company: f.company, from_date: f.from_date, to_date: f.to_date, account: [akun],
					...(f.project ? { project: [f.project] } : {}), group_by: "Group by Voucher (Consolidated)",
				});
			}
		}
	}

	unduh_excel() {
		if (!this.data) return;
		const judul = [__("Nomor"), __("Akun"), __("Saldo Awal Debit"), __("Saldo Awal Kredit"), __("Mutasi Debit"), __("Mutasi Kredit"),
			__("Saldo Akhir Debit"), __("Saldo Akhir Kredit")];
		const baris = this.data.rows.map((r) => [r.nomor, `${"    ".repeat(r.indent)}${r.nama}`, ...KPNS_KOLOM.map((k) => flt(r[k]))]);
		baris.push(["", __("Total"), ...KPNS_KOLOM.map((k) => flt(this.data.total[k]))]);
		const f = this.filter();
		frappe.tools.downloadify([judul, ...baris], null, `Neraca Saldo ${f.company} ${f.from_date} sd ${f.to_date}`);
	}

	cetak() {
		const f = this.filter();
		if (!f.company) return;
		const q = Object.entries(f).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
		window.open(`/api/method/${KPNS_API}cetak_neraca_saldo?${q}`);
	}
}
