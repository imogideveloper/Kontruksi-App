frappe.listview_settings["Tarif PPh Final"] = {
	add_fields: ["disabled"],
	get_indicator(doc) {
		return doc.disabled ? [__("Nonaktif"), "gray", "disabled,=,1"] : [__("Aktif"), "green", "disabled,=,0"];
	},
};
