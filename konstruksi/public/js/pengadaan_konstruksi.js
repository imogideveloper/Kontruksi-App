// Purchase Order & Purchase Invoice untuk pengadaan proyek (material langsung ke site, biaya langsung ke proyek).
// Project di header disalin ke semua baris item; Item WBS dipilih dari pekerjaan Project baris tersebut.
// Validasi & akun beban di server: konstruksi.konstruksi.pengadaan.lengkapi_pengadaan.
(() => {
	const QUERY_WBS = "konstruksi.konstruksi.pengadaan.cari_wbs";
	const ANAK = { "Purchase Order": "Purchase Order Item", "Purchase Invoice": "Purchase Invoice Item" };

	function pasang_query(frm) {
		// Hanya Project Master (punya kontrak); pembelian non-proyek: kosongkan Project.
		const proyek = () => ({ filters: { kontrak_project: ["is", "set"] } });
		frm.set_query("project", proyek);
		frm.set_query("project", "items", proyek);
		frm.set_query("wbs_item", "items", (doc, cdt, cdn) => {
			const row = locals[cdt][cdn];
			return { query: QUERY_WBS, filters: { project: row.project || frm.doc.project || "" } };
		});
	}

	// Project header berubah: baris yang kosong atau masih sama dengan Project lama ikut diganti; Item WBS lama dilepas.
	function salin_project(frm) {
		const lama = frm.__project_header;
		(frm.doc.items || []).forEach((row) => {
			if (!row.project || row.project === lama) {
				if (row.project !== frm.doc.project) row.wbs_item = "";
				row.project = frm.doc.project || "";
			}
		});
		frm.__project_header = frm.doc.project;
		frm.refresh_field("items");
	}

	Object.keys(ANAK).forEach((doctype) => {
		frappe.ui.form.on(doctype, {
			setup: pasang_query,
			onload(frm) {
				frm.__project_header = frm.doc.project;
			},
			refresh: pasang_query,
			project: salin_project,
		});
		frappe.ui.form.on(ANAK[doctype], {
			items_add(frm, cdt, cdn) {
				if (frm.doc.project && !locals[cdt][cdn].project) frappe.model.set_value(cdt, cdn, "project", frm.doc.project);
			},
			project(frm, cdt, cdn) {
				// Item WBS milik Project lain tidak berlaku lagi.
				if (locals[cdt][cdn].wbs_item) frappe.model.set_value(cdt, cdn, "wbs_item", "");
			},
		});
	});
})();
