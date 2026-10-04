// Data Personel (Employee): tombol "Buat Akun Login" — membuat User dengan Role Profile sesuai jabatan, lalu
// menautkannya ke personel & penugasan proyeknya (konstruksi.konstruksi.tim_proyek.buat_akun_login).
frappe.ui.form.on("Employee", {
	setup(frm) {
		// Pilihan Expense Approver menampilkan nama & jabatan (konstruksi.konstruksi.tim_proyek.cari_approver).
		frm.set_query("expense_approver", () => ({ query: "konstruksi.konstruksi.tim_proyek.cari_approver" }));
	},
	refresh(frm) {
		if (frm.is_new() || frm.doc.user_id || !frappe.model.can_create("User")) return;
		frm.add_custom_button(__("Buat Akun Login"), () => dialog_akun_login(frm));
	},
});

function dialog_akun_login(frm) {
	const doc = frm.doc;
	const d = new frappe.ui.Dialog({
		title: __("Buat Akun Login untuk {0}", [doc.employee_name]),
		fields: [
			{ fieldname: "email", fieldtype: "Data", options: "Email", label: __("Email Login"), reqd: 1,
				default: doc.prefered_email || doc.company_email || doc.personal_email },
			{ fieldname: "role_profile", fieldtype: "Link", options: "Role Profile", label: __("Role Profile (Akses Sistem)"),
				description: __("Bawaan dari jabatan {0}; bisa diganti.", [doc.designation || "-"]) },
			{ fieldname: "kirim_email", fieldtype: "Check", label: __("Kirim email undangan untuk membuat password"), default: 0 },
		],
		primary_action_label: __("Buat Akun"),
		primary_action(values) {
			frappe
				.call({
					method: "konstruksi.konstruksi.tim_proyek.buat_akun_login",
					args: { employee: doc.name, ...values },
					freeze: true,
				})
				.then((r) => {
					d.hide();
					frappe.show_alert({ message: __("Akun {0} dibuat dan ditautkan.", [r.message]), indicator: "green" });
					frm.reload_doc();
				});
		},
	});
	if (doc.designation) {
		frappe.db.get_value("Designation", doc.designation, "role_profile_bawaan").then((r) => {
			if (r.message?.role_profile_bawaan) d.set_value("role_profile", r.message.role_profile_bawaan);
		});
	}
	d.show();
}
