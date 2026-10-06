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

	// ===== Tampilan Purchase Order (kppo): elemen bawaan ERPNext yang tidak dipakai pengadaan proyek disembunyikan,
	// gaya disamakan dengan Sales Invoice tagihan proyek (kpsi). Pembelian langsung ke site, rupiah, tanpa gudang.
	const KELAS_PO = "kppo";
	const FIELD_PO_TIDAK_PERLU = [
		// Subkontrak manufaktur, gudang & barcode (material langsung ke site, item non-stok).
		"is_subcontracted", "supplier_warehouse", "scan_barcode", "set_from_warehouse", "set_warehouse", "set_reserve_warehouse",
		// Mata uang & daftar harga (selalu rupiah), berat, aturan harga, ekspor-impor.
		"currency_and_price_list", "total_qty", "total_net_weight", "section_break_48", "tax_category", "shipping_rule",
		"incoterm", "named_place",
		// Terbilang, uang muka pembelian, rincian pajak, kirim langsung ke alamat lain, berulang otomatis, info tambahan.
		"in_words", "base_in_words", "section_break_tnkm", "sec_tax_breakup", "dispatch_address", "dispatch_address_display",
		"auto_repeat_section", "additional_info_section",
	];
	// Versi "(Company Currency)" sama persis dengan versi mata uang dokumen bila keduanya rupiah.
	const FIELD_PO_MATA_UANG_PERUSAHAAN = [
		"base_total", "base_net_total", "base_taxes_and_charges_added", "base_taxes_and_charges_deducted",
		"base_total_taxes_and_charges", "base_totals_section", "base_grand_total", "base_rounding_adjustment",
		"base_rounded_total", "base_discount_amount",
	];
	// Kolom tabel Items: Item · Item WBS · Qty · Satuan · Harga · Jumlah (Required By per baris = tanggal di atas;
	// Target Warehouse tidak dipakai).
	const KOLOM_ITEM_PO = { item_code: 3, wbs_item: 2, qty: 1, uom: 1, rate: 1, amount: 2 };
	const KOLOM_ITEM_PO_SEMBUNYI = ["schedule_date", "warehouse"];

	function atur_kolom_item_po(frm) {
		const grid = frm.fields_dict.items?.grid;
		if (!grid || grid.__kppo_kunci === frm.docname) return;
		grid.__kppo_kunci = frm.docname;
		KOLOM_ITEM_PO_SEMBUNYI.forEach((fn) => (grid.column_disp_overrides[fn] = 1));
		Object.entries(KOLOM_ITEM_PO).forEach(([fn, lebar]) => {
			const df = frappe.meta.get_docfield(grid.doctype, fn, frm.docname);
			if (df) Object.assign(df, { in_list_view: 1, columns: lebar });
		});
		grid.visible_columns = [];
		grid.grid_rows = [];
		$(grid.parent).find(".grid-body .grid-row").remove();
		grid.refresh();
	}

	// Label tanpa "(IDR)" — dokumen selalu rupiah.
	function label_tanpa_mata_uang(frm) {
		if (frm.__kppo_label) return;
		frm.__kppo_label = true;
		frm.set_currency_labels = function (fields, currency, parentfield) {
			if (!currency) return;
			const ada = (fields || []).filter((f) => (parentfield ? true : this.fields_dict[f]));
			return this.reset_currency_labels(ada, parentfield);
		};
		frm.cscript._last_currency = null;
		frm.cscript.set_dynamic_labels?.();
	}

	// Checkbox Disable Rounded Total dipindah ke paling kiri baris Total Taxes and Charges (seperti Sales Invoice).
	function pindahkan_disable_rounded_po(frm) {
		const cek = frm.fields_dict.disable_rounded_total?.$wrapper;
		const body = frm.layout?.sections?.find((s) => s.df?.fieldname === "totals")?.body;
		if (!cek?.length || !body?.length) return;
		let kiri = body.children(".kppo-kolom-kiri");
		if (!kiri.length) kiri = $('<div class="kppo-kolom-kiri col-sm-6"><form></form></div>').prependTo(body);
		cek.appendTo(kiri.children("form"));
	}

	function rapikan_po(frm) {
		frm.page.wrapper.addClass(KELAS_PO);
		frm.toggle_display(FIELD_PO_TIDAK_PERLU, false);
		if (frm.doc.currency === erpnext.get_currency(frm.doc.company)) frm.toggle_display(FIELD_PO_MATA_UANG_PERUSAHAAN, false);
		label_tanpa_mata_uang(frm);
		atur_kolom_item_po(frm);
		pindahkan_disable_rounded_po(frm);
		atur_pembulatan_po(frm);
		frm.fields_dict.supplier?.$input?.attr("title", frm.doc.supplier || "");
	}

	// Pembulatan mati: Rounding Adjustment & Rounded Total (= Grand Total) tidak perlu tampil.
	function atur_pembulatan_po(frm) {
		frm.toggle_display(["rounding_adjustment", "rounded_total"], !frm.doc.disable_rounded_total);
	}

	frappe.ui.form.on("Purchase Order", {
		refresh: rapikan_po,
		disable_rounded_total: atur_pembulatan_po,
		supplier: rapikan_po,
	});

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
