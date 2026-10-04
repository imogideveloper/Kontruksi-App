// Copyright (c) 2026, Imogi Indonesia and contributors
// For license information, please see license.txt

// Sama dengan BATAS_TAMBAH_NILAI di addendum.py.
const BATAS_TAMBAH_NILAI = 10;

frappe.ui.form.on("Addendum", {
	refresh(frm) {
		if (frm.doc.kontrak_project) {
			frm.add_custom_button(__("Kontrak Project"), () => frappe.set_route("Form", "Kontrak Project", frm.doc.kontrak_project));
		}
		if (frm.doc.docstatus === 0 && !frm.is_new()) {
			frm.dashboard.set_headline(
				__("Addendum ini belum mengubah kontrak. Klik <b>Submit</b> untuk menyetujui; nilai & waktu kontrak langsung diperbarui."),
				"blue"
			);
		}
		if (frm.doc.docstatus === 0) muat_kondisi(frm);
	},

	kontrak_project: muat_kondisi,
	jenis: hitung_pratinjau,
	nilai_baru: hitung_pratinjau,
	tambah_hari: hitung_pratinjau,
});

// Kondisi kontrak terkini (tanpa addendum ini) untuk pratinjau; server menghitung ulang saat simpan & submit.
function muat_kondisi(frm) {
	if (!frm.doc.kontrak_project) return;
	frappe
		.call("konstruksi.konstruksi.doctype.addendum.addendum.get_kondisi_kontrak", {
			kontrak_project: frm.doc.kontrak_project,
			addendum: frm.is_new() ? null : frm.doc.name,
		})
		.then((r) => {
			frm.__kondisi = r.message;
			hitung_pratinjau(frm);
		});
}

function hitung_pratinjau(frm) {
	const k = frm.__kondisi;
	if (!k || frm.doc.docstatus !== 0) return;
	const jenis = frm.doc.jenis || "";
	const ubah_nilai = jenis.includes("Tambah / Kurang");
	const ubah_waktu = jenis.includes("Perpanjangan Waktu");

	const selisih = ubah_nilai && flt(frm.doc.nilai_baru) ? flt(frm.doc.nilai_baru) - k.nilai_terkini : 0;
	const tambah = ubah_waktu ? cint(frm.doc.tambah_hari) : 0;
	const masa_baru = k.masa_terkini + tambah;
	const selesai = (masa) => (k.tanggal_spmk && masa ? frappe.datetime.add_days(k.tanggal_spmk, masa - 1) : null);
	const persen = k.nilai_awal ? flt(((k.selisih_lain + selisih) / k.nilai_awal) * 100, 2) : 0;

	// Field hasil hitungan read-only: isi langsung tanpa memicu event.
	const nilai = {
		nilai_sebelumnya: k.nilai_terkini,
		selisih_nilai: selisih,
		persen_kumulatif: persen,
		masa_sebelumnya: k.masa_terkini,
		masa_baru,
		tanggal_selesai_sebelumnya: selesai(k.masa_terkini),
		tanggal_selesai_baru: selesai(masa_baru),
	};
	Object.entries(nilai).forEach(([fieldname, value]) => {
		frm.doc[fieldname] = value;
		frm.refresh_field(fieldname);
	});

	frm.set_df_property(
		"persen_kumulatif",
		"description",
		persen > BATAS_TAMBAH_NILAI
			? `<span class="text-danger">${__("Melebihi batas {0}% untuk kontrak pemerintah.", [BATAS_TAMBAH_NILAI])}</span>`
			: __("Total perubahan semua addendum (termasuk ini) terhadap nilai kontrak awal. Kontrak pemerintah: tambahan maksimal 10%.")
	);
}
