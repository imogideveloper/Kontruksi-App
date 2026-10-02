// Copyright (c) 2026, Imogi Indonesia and contributors
// For license information, please see license.txt

const RAB_METHOD = "konstruksi.konstruksi.doctype.rab_penawaran.rab_penawaran";

frappe.ui.form.on("RAB Penawaran", {
	onload(frm) {
		frappe.call(`${RAB_METHOD}.get_saran_uraian`).then((r) => {
			frm.fields_dict.items.grid.update_docfield_property(
				"uraian_pekerjaan",
				"options",
				r.message || []
			);
		});
	},

	refresh(frm) {
		frm.add_custom_button(__("Download Template"), () => {
			window.open(`/api/method/${RAB_METHOD}.download_template`);
		}, __("Excel"));
		frm.add_custom_button(__("Upload Excel"), () => upload_excel(frm), __("Excel"));
	},

	tender(frm) {
		// Tunggu field hasil fetch (HPS, tarif PPN) terisi dulu.
		setTimeout(() => hitung_total(frm), 500);
	},
});

frappe.ui.form.on("RAB Penawaran Item", {
	volume: hitung_total_dari_item,
	harga_satuan: hitung_total_dari_item,
	items_remove: hitung_total_dari_item,
});

function hitung_total_dari_item(frm) {
	hitung_total(frm);
}

// Sama dengan RABPenawaran.hitung_total di rab_penawaran.py.
function hitung_total(frm) {
	const tarif = frm.doc.status_ppn === "PPN" ? flt(frm.doc.tarif_ppn) : 0;
	const items = frm.doc.items || [];

	items.forEach((item) => {
		item.jumlah_harga = flt(flt(item.volume) * flt(item.harga_satuan), 2);
		item.ppn = flt((item.jumlah_harga * tarif) / 100, 2);
		item.jumlah_harga_ppn = item.jumlah_harga + item.ppn;
	});

	const total = items.reduce((sum, item) => sum + item.jumlah_harga, 0);
	const total_ppn = items.reduce((sum, item) => sum + item.ppn, 0);
	items.forEach((item) => {
		item.bobot = total ? flt((item.jumlah_harga / total) * 100, 2) : 0;
	});

	frm.doc.total_sebelum_ppn = total;
	frm.doc.total_ppn = total_ppn;
	frm.doc.total_rab = total + total_ppn;
	frm.doc.persen_hps = flt(frm.doc.hps) ? flt((frm.doc.total_rab / flt(frm.doc.hps)) * 100, 2) : 0;

	frm.refresh_fields(["items", "total_sebelum_ppn", "total_ppn", "total_rab", "persen_hps"]);
}

function upload_excel(frm) {
	const dialog = new frappe.ui.Dialog({
		title: __("Upload Excel RAB"),
		fields: [
			{
				fieldtype: "HTML",
				options: `<p class="text-muted small">${__(
					"Gunakan format dari tombol Excel → Download Template."
				)}</p>`,
			},
			{
				fieldname: "file_url",
				fieldtype: "Attach",
				label: __("File Excel (.xlsx)"),
				reqd: 1,
				options: { restrictions: { allowed_file_types: [".xlsx"] } },
			},
			{
				fieldname: "mode",
				fieldtype: "Select",
				label: __("Item yang sudah ada"),
				options: [__("Ganti semua item"), __("Tambahkan di bawah item yang ada")].join("\n"),
				default: __("Ganti semua item"),
				depends_on: () => (frm.doc.items || []).length,
			},
		],
		primary_action_label: __("Import"),
		primary_action(values) {
			frappe
				.call({
					method: `${RAB_METHOD}.baca_excel`,
					args: { file_url: values.file_url },
					freeze: true,
					freeze_message: __("Membaca file Excel..."),
				})
				.then((r) => {
					if (values.mode === __("Ganti semua item")) {
						frm.clear_table("items");
					}
					(r.message || []).forEach((row) => frm.add_child("items", row));
					hitung_total(frm);
					frm.dirty();
					dialog.hide();
					frappe.show_alert({
						message: __("{0} item diimport dari Excel. Jangan lupa Save.", [r.message.length]),
						indicator: "green",
					});
				});
		},
	});
	dialog.show();
}
