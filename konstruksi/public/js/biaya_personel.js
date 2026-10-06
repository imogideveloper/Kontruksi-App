// Timesheet & Expense Claim: pilihan Project hanya proyek konstruksi tempat personel ditugaskan (plus proyek umum
// tanpa kontrak). Validasi & peringatannya di konstruksi.konstruksi.tim_proyek.cek_penugasan_biaya.
(() => {
	const QUERY = "konstruksi.konstruksi.tim_proyek.cari_proyek_personel";

	function filter_proyek(frm) {
		const query = () => ({ query: QUERY, filters: { employee: frm.doc.employee, customer: frm.doc.customer } });
		if (frm.doctype === "Timesheet") {
			frm.set_query("project", "time_logs", query);
			// Hanya Activity Type yang punya tarif biaya (bawaan ERPNext seperti Communication bertarif 0 → biaya Rp 0).
			frm.set_query("activity_type", "time_logs", () => ({ filters: { costing_rate: [">", 0], disabled: 0 } }));
		} else {
			frm.set_query("project", query);
			frm.set_query("project", "expenses", query);
		}
	}

	const events = { refresh: filter_proyek, employee: filter_proyek };
	// ERPNext mengganti filter Project di Timesheet saat Customer berubah; pasang ulang sesudahnya.
	events.customer = (frm) => setTimeout(() => filter_proyek(frm), 0);

	frappe.ui.form.on("Timesheet", events);
	// Expense Claim, section Totals: kotak nilai total tepat di bawah kolom Sanctioned Amount tabel Expenses
	// (posisi & lebar diukur dari header kolom; CSS .kec-rata-total di konstruksi.bundle.css).
	const TOTAL_EXPENSE = [
		"total_sanctioned_amount", "total_advance_amount", "grand_total", "total_claimed_amount",
		"total_taxes_and_charges", "total_amount_reimbursed", "base_total_sanctioned_amount",
		"base_total_advance_amount", "base_grand_total", "base_total_claimed_amount", "base_total_taxes_and_charges",
	];

	function rata_total_expense(frm) {
		const grid = frm.fields_dict.expenses?.grid;
		const kol = grid?.wrapper.find('.grid-heading-row [data-fieldname="sanctioned_amount"]')[0];
		const k = kol?.getBoundingClientRect();
		if (!k?.width) return;
		TOTAL_EXPENSE.forEach((fieldname) => {
			const el = frm.fields_dict[fieldname]?.$wrapper?.[0];
			if (!el || !el.offsetParent) return;
			const c = el.getBoundingClientRect();
			const kiri = k.left - c.left;
			const pas = window.innerWidth >= 768 && kiri >= 120 && k.right <= c.right + 1;
			el.classList.toggle("kec-rata-total", pas);
			el.style.setProperty("--kec-kiri", `${kiri}px`);
			el.style.setProperty("--kec-lebar", `${k.width}px`);
		});
	}

	function pasang_rata_total(frm) {
		const jalankan = () => requestAnimationFrame(() => rata_total_expense(frm));
		jalankan();
		const grid_el = frm.fields_dict.expenses?.grid?.wrapper?.[0];
		// Ukuran grid berubah saat tab dibuka / layar di-resize / sidebar dibuka-tutup.
		if (grid_el && frm._kec_rata_el !== grid_el) {
			frm._kec_ro?.disconnect();
			frm._kec_ro = new ResizeObserver(jalankan);
			frm._kec_ro.observe(grid_el);
			frm._kec_ro.observe(frm.layout.wrapper[0]);
			frm._kec_rata_el = grid_el;
		}
	}

	frappe.ui.form.on("Expense Claim", { refresh: pasang_rata_total, after_save: pasang_rata_total });

	// Expense Claim: Expense Approver terisi otomatis dari Data Personel / Department saat Employee dipilih;
	// pilihannya tetap dari HRMS, ditambah nama & jabatan.
	frappe.ui.form.on("Expense Claim", {
		employee(frm) {
			if (!frm.doc.employee || frm.doc.docstatus !== 0) return;
			frappe
				.xcall("konstruksi.konstruksi.tim_proyek.approver_bawaan", { employee: frm.doc.employee })
				.then((approver) => frm.set_value("expense_approver", approver || ""));
		},
		refresh(frm) {
			frm.set_query("expense_approver", () => ({
				query: "konstruksi.konstruksi.tim_proyek.cari_approver",
				filters: { employee: frm.doc.employee, doctype: frm.doc.doctype },
			}));
		},
	});
	frappe.ui.form.on("Expense Claim", events);

	// Timesheet: Total Working Hours ditampilkan sebagai baris total di bawah tabel Time Sheets
	// (field total_hours di bagian Totals disembunyikan supaya tidak dobel).
	function render_total_jam(frm) {
		const grid = frm.fields_dict.time_logs?.grid;
		if (!grid) return;
		frm.set_df_property("total_hours", "hidden", 1);
		const logs = frm.doc.time_logs || [];
		const jam = logs.reduce((s, row) => s + flt(row.hours), 0);
		const biaya = logs.reduce((s, row) => s + flt(row.costing_amount), 0);
		grid.wrapper.find(".konstruksi-total-jam").remove();
		grid.wrapper.find(".form-grid").after(`<div class="konstruksi-total-jam">
			<span>${__("Total Working Hours")}</span>
			<b>${format_number(jam, null, 2).replace(/[.,]00$/, "")} ${__("jam")}</b>
			${biaya ? `<span class="text-muted">· ${__("Biaya")} ${format_currency(biaya, frm.doc.currency, 0)}</span>` : ""}
		</div>`);
	}

	frappe.ui.form.on("Timesheet", { refresh: render_total_jam, time_logs_remove: render_total_jam });
	frappe.ui.form.on("Timesheet Detail", {
		hours: (frm) => setTimeout(() => render_total_jam(frm), 0),
		from_time: (frm) => setTimeout(() => render_total_jam(frm), 0),
		to_time: (frm) => setTimeout(() => render_total_jam(frm), 0),
		activity_type: (frm) => setTimeout(() => render_total_jam(frm), 500),
	});
})();
