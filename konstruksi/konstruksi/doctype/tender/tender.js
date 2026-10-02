// Copyright (c) 2026, Imogi Indonesia and contributors
// For license information, please see license.txt

// Sama dengan BATAS_HARGA_WAJAR di tender.py.
const BATAS_HARGA_WAJAR = 80;

frappe.ui.form.on("Tender", {
	onload(frm) {
		if (frm.is_new()) {
			frappe
				.call("konstruksi.konstruksi.doctype.tender.tender.get_next_kode")
				.then((r) => r.message && frm.set_value("kode", r.message));
		}
	},

	refresh(frm) {
		update_persen_hps_note(frm);
	},

	hps(frm) {
		set_persen_hps(frm);
	},

	nilai_penawaran(frm) {
		set_persen_hps(frm);
	},

	status_ppn(frm) {
		frm.set_value("tarif_ppn", frm.doc.status_ppn === "PPN" ? 11 : 0);
	},
});

function set_persen_hps(frm) {
	const hps = flt(frm.doc.hps);
	const penawaran = flt(frm.doc.nilai_penawaran);
	frm.set_value("persen_hps", hps && penawaran ? flt((penawaran / hps) * 100, 2) : 0);
	update_persen_hps_note(frm);
}

function update_persen_hps_note(frm) {
	const hps = flt(frm.doc.hps);
	const persen = flt(frm.doc.persen_hps);
	let note = "";

	if (persen > 100) {
		note = `<span class="text-danger">${__(
			"Melebihi HPS {0}% — pada tender pemerintah penawaran ini gugur.",
			[format_number(persen - 100, null, 2)]
		)}</span>`;
	} else if (persen && persen < BATAS_HARGA_WAJAR) {
		note = `<span class="text-warning">${__(
			"{0}% di bawah HPS — wajib klarifikasi kewajaran harga; bila menang jaminan pelaksanaan 5% HPS = {1}.",
			[format_number(100 - persen, null, 2), format_currency(hps * 0.05, "IDR")]
		)}</span>`;
	} else if (persen) {
		note = __("{0}% di bawah HPS.", [format_number(100 - persen, null, 2)]);
	}

	frm.set_df_property("persen_hps", "description", note);
}
