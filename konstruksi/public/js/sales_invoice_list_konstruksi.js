// List Sales Invoice (tagihan proyek): kolom ID paling kiri; kolom Proyek, Tagihan (uraian termin), Outstanding diatur lewat property setter &
// List View Settings (install.atur_list_sales_invoice). Di sini: aksi massal "Delivery Note" bawaan ERPNext tidak
// ditampilkan (tagihan jasa konstruksi tidak punya pengiriman barang). Dimuat setelah sales_invoice_list.js ERPNext.
(() => {
	const bawaan = frappe.listview_settings["Sales Invoice"] || {};

	function id_paling_kiri(listview) {
		const kolom = listview.columns || [];
		const subjek = kolom[0];
		const i_id = kolom.findIndex((c) => c.type === "Field" && c.df?.fieldname === "name");
		if (!subjek || subjek.df?.fieldname === "name" || i_id < 0) return;
		kolom.splice(i_id, 1);
		kolom[0] = { type: "Subject", df: { label: __("ID"), fieldname: "name" } };
		// Sesudah kolom Tag (indeks 1, tersembunyi).
		kolom.splice(2, 0, { type: "Field", df: { ...subjek.df, label: __("Customer") } });
	}
	frappe.listview_settings["Sales Invoice"] = {
		...bawaan,
		onload(listview) {
			// Kolom pertama (subjek, dengan checkbox & tautan) = ID invoice; nama customer jadi kolom biasa di sebelahnya.
			const kolom_asli = listview.setup_columns.bind(listview);
			listview.setup_columns = () => {
				kolom_asli();
				id_paling_kiri(listview);
			};
			listview.setup_columns();
			listview.render_header(true);

			const tambah_asli = listview.page.add_action_item.bind(listview.page);
			listview.page.add_action_item = (label, ...args) => (label === __("Delivery Note") ? null : tambah_asli(label, ...args));
			try {
				bawaan.onload?.(listview);
			} finally {
				listview.page.add_action_item = tambah_asli;
			}
		},
	};
})();
