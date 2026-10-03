// Copyright (c) 2026, Imogi Indonesia and contributors
// For license information, please see license.txt

frappe.ui.form.on("Hasil Tender", {
	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__("Buka Tender"), () => frappe.set_route("Form", "Tender", frm.doc.tender));
			frm.add_custom_button(__("Dokumen Tender"), () =>
				frappe
					.call("konstruksi.konstruksi.doctype.dokumen_tender.dokumen_tender.get_or_create", {
						tender: frm.doc.tender,
					})
					.then((r) => frappe.set_route("Form", "Dokumen Tender", r.message))
			);
		}
	},

	setup(frm) {
		// Hanya tender yang hasilnya belum dicatat.
		frm.set_query("tender", () => ({ filters: { status: ["not in", ["Menang", "Kalah", "Batal"]] } }));
	},

	hasil(frm) {
		if (frm.doc.hasil !== "Menunggu" && !frm.doc.tanggal_pengumuman) {
			frm.set_value("tanggal_pengumuman", frappe.datetime.get_today());
		}
		if (frm.doc.hasil === "Menang") {
			frm.set_value("pemenang", "Kita");
		} else if (frm.doc.pemenang === "Kita") {
			frm.set_value("pemenang", "");
		}
	},
});
