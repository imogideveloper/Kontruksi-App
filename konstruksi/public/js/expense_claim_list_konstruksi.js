// List Expense Claim (Expense Claim HRMS): ID, personel, proyek, tanggal, diajukan vs disetujui, status berwarna.
// Pengaturan bawaan HRMS (add_fields company) tetap dipakai.
(() => {
	const bawaan = frappe.listview_settings["Expense Claim"] || {};
	const KOLOM = ["employee_name", "project", "posting_date", "total_claimed_amount", "total_sanctioned_amount"];
	const JUDUL = {
		employee_name: __("Personel"),
		project: __("Project"),
		posting_date: __("Tanggal"),
		total_claimed_amount: __("Diajukan"),
		total_sanctioned_amount: __("Disetujui"),
	};

	frappe.listview_settings["Expense Claim"] = {
		...bawaan,
		add_fields: [...new Set([...(bawaan.add_fields || []), ...KOLOM, "approval_status", "status"])],
		hide_name_column: true,

		get_indicator(doc) {
			if (doc.docstatus === 2) return [__("Dibatalkan"), "red", "docstatus,=,2"];
			if (doc.approval_status === "Rejected") return [__("Ditolak"), "red", "approval_status,=,Rejected"];
			if (doc.docstatus === 0) {
				return doc.approval_status === "Approved"
					? [__("Disetujui, Belum Submit"), "yellow", "docstatus,=,0|approval_status,=,Approved"]
					: [__("Menunggu Approval"), "orange", "docstatus,=,0|approval_status,=,Draft"];
			}
			if (doc.status === "Paid") return [__("Lunas"), "green", "status,=,Paid"];
			if (doc.status === "Unpaid") return [__("Belum Dibayar"), "blue", "status,=,Unpaid"];
			return [__(doc.status), "gray", "status,=," + doc.status];
		},

		formatters: {
			...(bawaan.formatters || {}),
			project(value) {
				if (!value) return `<span class="text-muted">${__("Belum diisi")}</span>`;
				const judul = frappe.utils.get_link_title("Project", value);
				return frappe.utils.escape_html(judul ? `${judul} · ${value}` : value);
			},
		},

		onload(listview) {
			bawaan.onload && bawaan.onload(listview);
			// Susun ulang kolom (lihat project_list_konstruksi.js) dengan judul berbahasa Indonesia.
			const setup_columns = listview.setup_columns.bind(listview);
			listview.setup_columns = function () {
				setup_columns();
				const get_df = (fieldname) => frappe.meta.get_docfield("Expense Claim", fieldname);
				this.columns = [
					{ type: "Subject", df: { label: __("ID"), fieldname: "name" } },
					{ type: "Tag" },
					...KOLOM.map((fieldname) => ({ type: "Field", df: { ...get_df(fieldname), label: JUDUL[fieldname] } })),
					{ type: "Status" },
				];
			};
			listview.setup_columns();
			listview.render_header(true);
		},
	};
})();
