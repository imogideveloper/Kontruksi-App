// List Penugasan Personel (lintas proyek): status SKK sebagai indikator.
frappe.listview_settings["Penugasan Personel"] = {
	add_fields: ["status_skk", "project"],

	get_indicator(doc) {
		if (["Belum Ada", "Kedaluwarsa"].includes(doc.status_skk)) {
			return [__("SKK {0}", [__(doc.status_skk)]), "red", "status_skk,=," + doc.status_skk];
		}
		if (doc.status_skk === "Habis Saat Bertugas") {
			return [__("SKK Habis Saat Bertugas"), "orange", "status_skk,=,Habis Saat Bertugas"];
		}
		return [__("Aktif"), "green", "status_skk,!=,Belum Ada"];
	},
};
