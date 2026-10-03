// Copyright (c) 2026, Imogi Indonesia and contributors
// For license information, please see license.txt

// Sama dengan BATAS_HARGA_WAJAR di tender.py.
const BATAS_HARGA_WAJAR = 80;

frappe.ui.form.on("Tender", {
	onload(frm) {
		set_pratinjau_kode(frm);
	},

	tanggal(frm) {
		// Tahun pada kode mengikuti tahun Tanggal.
		set_pratinjau_kode(frm);
	},

	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__("Dokumen Tender"), () => {
				frappe
					.call("konstruksi.konstruksi.doctype.dokumen_tender.dokumen_tender.get_or_create", {
						tender: frm.doc.name,
					})
					.then((r) => frappe.set_route("Form", "Dokumen Tender", r.message));
			});
		}
		update_persen_hps_note(frm);
		["hps", "nilai_penawaran"].forEach((fieldname) => format_ribuan_saat_mengetik(frm, fieldname));
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

function set_pratinjau_kode(frm) {
	if (!frm.is_new()) return;
	frappe
		.call("konstruksi.konstruksi.doctype.tender.tender.get_next_kode", { tanggal: frm.doc.tanggal })
		.then((r) => r.message && frm.set_value("kode", r.message));
}

// Pemisah ribuan langsung muncul saat mengetik (bukan menunggu pindah kursor).
function format_ribuan_saat_mengetik(frm, fieldname) {
	const $input = frm.fields_dict[fieldname]?.$input;
	if (!$input) return;

	$input.off("input.ribuan").on("input.ribuan", function () {
		const { decimal_str, group_sep } = get_number_format_info(get_number_format());
		const value = this.value;
		// Posisi kursor dihitung dari jumlah digit di kirinya, agar tidak loncat setelah diformat.
		const digit_sebelum_kursor = value.slice(0, this.selectionStart).replace(/[^\d]/g, "").length;

		const pos_desimal = value.indexOf(decimal_str);
		let bulat = (pos_desimal === -1 ? value : value.slice(0, pos_desimal)).replace(/\D/g, "");
		bulat = bulat.replace(/^0+(?=\d)/, "");
		let hasil = bulat.replace(/\B(?=(\d{3})+(?!\d))/g, group_sep);
		if (pos_desimal !== -1) {
			hasil += decimal_str + value.slice(pos_desimal + 1).replace(/\D/g, "");
		}
		if (hasil === value) return;

		this.value = hasil;
		let kursor = 0;
		for (let digit = 0; kursor < hasil.length && digit < digit_sebelum_kursor; kursor++) {
			if (/\d/.test(hasil[kursor])) digit++;
		}
		this.setSelectionRange(kursor, kursor);
	});
}

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
