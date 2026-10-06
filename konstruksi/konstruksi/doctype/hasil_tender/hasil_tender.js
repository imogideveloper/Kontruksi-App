// Copyright (c) 2026, Imogi Indonesia and contributors
// For license information, please see license.txt

frappe.ui.form.on("Hasil Tender", {
	refresh(frm) {
		atur_harga_pemenang(frm);
		if (!frm.is_new() && frm.doc.hasil === "Menang" && !frm.is_dirty()) {
			// Hanya tender yang menang dilanjutkan ke kontrak.
			frm.add_custom_button(__("Kontrak Project"), () =>
				frappe
					.call({
						method: "konstruksi.konstruksi.doctype.kontrak_project.kontrak_project.get_or_create",
						args: { tender: frm.doc.tender },
						freeze: true,
					})
					.then((r) => frappe.set_route("Form", "Kontrak Project", r.message))
			).addClass("btn-primary");
		}
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
		frm.set_query("tender", () => ({ filters: { status: ["not in", ["Menang", "Kalah", "Batal / Mundur"]] } }));
	},

	hasil(frm) {
		if (frm.doc.hasil !== "Menunggu" && !frm.doc.tanggal_pengumuman) {
			frm.set_value("tanggal_pengumuman", frappe.datetime.get_today());
		}
		// Isi langsung saat Hasil dipilih (sama dengan aturan server di hasil_tender.py), tidak menunggu Save.
		if (frm.doc.hasil === "Menang") {
			frm.set_value("pemenang", "Kita");
			frm.set_value("harga_pemenang", flt(frm.doc.penawaran_kita));
		} else {
			if (frm.doc.pemenang === "Kita") frm.set_value("pemenang", "");
			// Harga dari kemenangan sebelumnya (= penawaran kita) dikosongkan; Kalah → isi harga pemenang lawan.
			if (["Menunggu", "Batal / Mundur"].includes(frm.doc.hasil) || flt(frm.doc.harga_pemenang) === flt(frm.doc.penawaran_kita)) {
				frm.set_value("harga_pemenang", 0);
			}
		}
		atur_harga_pemenang(frm);
		hitung_selisih(frm);
	},

	harga_pemenang: hitung_selisih,
});

// Menang: Harga Pemenang = Nilai Penawaran Kita (dikunci, ubah dari Tender).
function atur_harga_pemenang(frm) {
	frm.set_df_property("harga_pemenang", "read_only", frm.doc.hasil === "Menang" ? 1 : 0);
}

// Selisih langsung terhitung (rumus sama dengan server): positif = penawaran kita lebih mahal dari pemenang.
function hitung_selisih(frm) {
	const harga = flt(frm.doc.harga_pemenang);
	const penawaran = flt(frm.doc.penawaran_kita);
	frm.set_value("selisih_persen", harga && penawaran ? flt(((penawaran - harga) / harga) * 100, 2) : 0);
}
