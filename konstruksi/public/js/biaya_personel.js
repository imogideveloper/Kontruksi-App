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
	frappe.ui.form.on("Expense Claim", events);
})();
