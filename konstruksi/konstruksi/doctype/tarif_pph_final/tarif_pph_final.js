// Copyright (c) 2026, Imogi Indonesia and contributors
// For license information, please see license.txt

// Sama dengan KUALIFIKASI_PER_JASA di tarif_pph_final.py.
const KUALIFIKASI_PPH = {
	"Pekerjaan Konstruksi": ["Kecil / Perseorangan", "Menengah / Besar", "Tidak Memiliki Sertifikat"],
	"Pekerjaan Konstruksi Terintegrasi": ["Bersertifikat", "Tidak Memiliki Sertifikat"],
	"Konsultansi Konstruksi": ["Bersertifikat", "Tidak Memiliki Sertifikat"],
};

frappe.ui.form.on("Tarif PPh Final", {
	refresh: set_pilihan_kualifikasi,
	jenis_jasa: set_pilihan_kualifikasi,
});

function set_pilihan_kualifikasi(frm) {
	const pilihan = KUALIFIKASI_PPH[frm.doc.jenis_jasa] || [];
	frm.set_df_property("kualifikasi", "options", ["", ...pilihan].join("\n"));
	if (frm.doc.kualifikasi && !pilihan.includes(frm.doc.kualifikasi)) frm.set_value("kualifikasi", "");
}
