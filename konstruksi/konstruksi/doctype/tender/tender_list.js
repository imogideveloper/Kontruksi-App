frappe.listview_settings["Tender"] = {
	add_fields: ["status"],
	get_indicator(doc) {
		const colors = {
			Persiapan: "gray",
			"Penawaran Dikirim": "blue",
			Evaluasi: "orange",
			Menang: "green",
			Kalah: "red",
			Batal: "darkgrey",
		};
		return [__(doc.status), colors[doc.status] || "gray", "status,=," + doc.status];
	},
};
