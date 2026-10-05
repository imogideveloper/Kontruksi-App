// List Sales Invoice (tagihan proyek): kolom Proyek, Jenis Tagihan, Outstanding diatur lewat property setter &
// List View Settings (install.atur_list_sales_invoice). Di sini: aksi massal "Delivery Note" bawaan ERPNext tidak
// ditampilkan (tagihan jasa konstruksi tidak punya pengiriman barang). Dimuat setelah sales_invoice_list.js ERPNext.
(() => {
	const bawaan = frappe.listview_settings["Sales Invoice"] || {};
	frappe.listview_settings["Sales Invoice"] = {
		...bawaan,
		onload(listview) {
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
