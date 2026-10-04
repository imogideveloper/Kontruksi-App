// Timesheet & Expense Claim: pilihan Project hanya proyek konstruksi tempat personel ditugaskan (plus proyek umum
// tanpa kontrak). Validasi & peringatannya di konstruksi.konstruksi.tim_proyek.cek_penugasan_biaya.
(() => {
	const QUERY = "konstruksi.konstruksi.tim_proyek.cari_proyek_personel";

	function filter_proyek(frm) {
		const query = () => ({ query: QUERY, filters: { employee: frm.doc.employee, customer: frm.doc.customer } });
		if (frm.doctype === "Timesheet") {
			frm.set_query("project", "time_logs", query);
		} else {
			frm.set_query("project", query);
			frm.set_query("project", "expenses", query);
		}
	}

	const events = { refresh: filter_proyek, employee: filter_proyek };
	// ERPNext mengganti filter Project di Timesheet saat Customer berubah; pasang ulang sesudahnya.
	events.customer = (frm) => setTimeout(() => filter_proyek(frm), 0);

	frappe.ui.form.on("Timesheet", events);
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
