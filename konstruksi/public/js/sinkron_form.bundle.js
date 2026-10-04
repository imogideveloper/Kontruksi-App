// Form yang datanya disalin dari Tender (Kontrak Project, Hasil Tender, Dokumen Tender) selalu menampilkan versi
// terbaru: saat form ditampilkan atau tab browser kembali aktif, `modified` di server dicek; bila lebih baru dan
// form belum diedit, form di-reload. Pelengkap sinyal realtime doc_update (konstruksi.api.beri_tahu_form), yang
// tidak sampai bila tab sedang tidak terbuka atau koneksi realtime terputus.
frappe.provide("konstruksi");

const DOCTYPE_IKUT_TENDER = ["Kontrak Project", "Hasil Tender", "Dokumen Tender"];

konstruksi.cek_versi_server = function (frm) {
	if (!frm?.doc || frm.is_new() || frm.is_dirty() || !DOCTYPE_IKUT_TENDER.includes(frm.doctype)) return;
	frappe.db.get_value(frm.doctype, frm.docname, "modified").then((r) => {
		const modified = r.message?.modified;
		if (modified && modified !== frm.doc.modified && !frm.is_dirty()) frm.reload_doc();
	});
};

$(document).on("form-refresh", (e, frm) => konstruksi.cek_versi_server(frm));

document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "visible" && frappe.get_route()?.[0] === "Form") {
		konstruksi.cek_versi_server(window.cur_frm);
	}
});
