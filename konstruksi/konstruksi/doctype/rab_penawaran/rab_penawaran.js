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
		render_rab_tree(frm);
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
	items_add: render_rab_tree,
	kode_wbs: render_rab_tree,
	uraian_pekerjaan: render_rab_tree,
	spesifikasi: render_rab_tree,
	satuan: render_rab_tree,
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
	render_rab_tree(frm);
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

// ---------------------------------------------------------------------------
// Tampilan item berkelompok per WBS level 1 (kode tanpa titik: 1, 2, 3, ...).
// Data tetap di tabel `items`; tampilan ini hanya membaca dan membuka form baris untuk edit.

const TANPA_KELOMPOK = "__tanpa_kelompok__";

function kelompokkan_item(items) {
	const kelompok = [];
	const by_kode = {};
	items.forEach((item) => {
		const kode = (item.kode_wbs || "").trim();
		if (kode && !kode.includes(".") && !by_kode[kode]) {
			by_kode[kode] = { key: kode, induk: item, anak: [] };
			kelompok.push(by_kode[kode]);
		}
	});

	const tanpa = { key: TANPA_KELOMPOK, induk: null, anak: [] };
	items.forEach((item) => {
		const kode = (item.kode_wbs || "").trim();
		if (kode && by_kode[kode] && by_kode[kode].induk === item) return;
		const grup = kode.includes(".") ? by_kode[kode.split(".")[0]] : null;
		(grup || tanpa).anak.push(item);
	});
	if (tanpa.anak.length) kelompok.push(tanpa);
	return kelompok;
}

function format_rupiah(value) {
	return format_currency(flt(value), "IDR", 0);
}

function format_volume(value) {
	const v = flt(value);
	return format_number(v, null, Number.isInteger(v) ? 0 : 2);
}

function render_rab_tree(frm) {
	const field = frm.fields_dict.rab_tree;
	if (!field) return;
	const state = (frm.__rab_tree = frm.__rab_tree || { buka: new Set(), cari: "", belum_harga: false });
	const items = frm.doc.items || [];
	const total = flt(frm.doc.total_sebelum_ppn);
	const esc = frappe.utils.escape_html;
	const cari = state.cari.toLowerCase();

	const cocok = (item) => {
		if (state.belum_harga && flt(item.harga_satuan)) return false;
		if (!cari) return true;
		return `${item.uraian_pekerjaan || ""} ${item.spesifikasi || ""}`.toLowerCase().includes(cari);
	};
	const sedang_filter = Boolean(cari || state.belum_harga);

	let rows = "";
	kelompokkan_item(items).forEach((grup) => {
		const anak = grup.anak.filter(cocok);
		const induk_cocok = grup.induk && !state.belum_harga && cari && cocok(grup.induk);
		if (sedang_filter && !anak.length && !induk_cocok) return;

		const subtotal = grup.anak.reduce((s, i) => s + flt(i.jumlah_harga), flt(grup.induk?.jumlah_harga));
		const terbuka = sedang_filter || state.buka.has(grup.key);
		const judul = grup.induk ? esc(grup.induk.uraian_pekerjaan || "") : __("Tanpa Kode WBS");
		const kode = grup.induk ? esc(grup.key) : "";
		const induk_attr = grup.induk ? `data-row="${grup.induk.name}"` : "";

		rows += `<tr class="rab-grup ${terbuka ? "terbuka" : ""}" data-grup="${esc(grup.key)}">
			<td class="rab-no">${kode}</td>
			<td class="rab-uraian">
				<span class="rab-chevron">${frappe.utils.icon("right", "sm")}</span>
				<span class="rab-judul" ${induk_attr}>${judul}</span>
				<span class="rab-badge">${__("{0} item", [grup.anak.length])}</span>
			</td>
			<td class="rab-spek text-muted">—</td>
			<td></td><td></td><td></td>
			<td class="rab-angka rab-tebal">${format_rupiah(subtotal)}</td>
			<td class="rab-angka">${total ? format_number((subtotal / total) * 100, null, 2) : 0}%</td>
		</tr>`;

		if (!terbuka) return;
		anak.forEach((item) => {
			const level = Math.max((item.kode_wbs || "").split(".").length - 1, 1);
			rows += `<tr class="rab-item ${flt(item.harga_satuan) ? "" : "rab-belum-harga"}" data-row="${item.name}">
				<td class="rab-no">${esc(item.kode_wbs || "")}</td>
				<td class="rab-uraian" style="padding-left: ${12 + level * 22}px">${esc(item.uraian_pekerjaan || "")}</td>
				<td class="rab-spek">${esc(item.spesifikasi || "")}</td>
				<td class="rab-tengah">${esc(item.satuan || "")}</td>
				<td class="rab-angka">${format_volume(item.volume)}</td>
				<td class="rab-angka">${format_rupiah(item.harga_satuan)}</td>
				<td class="rab-angka">${format_rupiah(item.jumlah_harga)}</td>
				<td class="rab-angka">${format_number(flt(item.bobot), null, 2)}%</td>
			</tr>`;
		});
	});

	if (!rows) {
		rows = `<tr><td colspan="8" class="rab-kosong">${
			items.length ? __("Tidak ada item yang cocok.") : __("Belum ada item. Tambah item atau upload Excel.")
		}</td></tr>`;
	}

	field.$wrapper.html(`
		<div class="rab-tree">
			<div class="rab-toolbar">
				<div class="btn-group">
					<button class="btn btn-default btn-sm rab-buka-semua">${frappe.utils.icon("down", "sm")} ${__("Buka semua")}</button>
					<button class="btn btn-default btn-sm rab-tutup-semua">${frappe.utils.icon("right", "sm")} ${__("Tutup semua")}</button>
				</div>
				<div class="rab-cari">
					<input type="text" class="form-control input-sm" placeholder="${__("Cari uraian / spesifikasi...")}" value="${esc(state.cari)}">
				</div>
				<label class="rab-filter-harga">
					<input type="checkbox" ${state.belum_harga ? "checked" : ""}> ${__("Hanya yang belum ada harga")}
				</label>
				<button class="btn btn-default btn-sm rab-tambah">${frappe.utils.icon("add", "sm")} ${__("Tambah Item")}</button>
			</div>
			<table class="rab-table">
				<thead><tr>
					<th class="rab-no">${__("No")}</th>
					<th>${__("Uraian Pekerjaan")}</th>
					<th class="rab-spek">${__("Spesifikasi")}</th>
					<th class="rab-tengah">${__("Satuan")}</th>
					<th class="rab-angka">${__("Volume")}</th>
					<th class="rab-angka">${__("Harga Satuan")}</th>
					<th class="rab-angka">${__("Jumlah Harga")}</th>
					<th class="rab-angka">${__("Bobot")}</th>
				</tr></thead>
				<tbody>${rows}</tbody>
			</table>
		</div>`);

	const $w = field.$wrapper;
	const semua_grup = () => kelompokkan_item(items).map((g) => g.key);
	$w.find(".rab-buka-semua").on("click", () => {
		state.buka = new Set(semua_grup());
		render_rab_tree(frm);
	});
	$w.find(".rab-tutup-semua").on("click", () => {
		state.buka.clear();
		render_rab_tree(frm);
	});
	$w.find(".rab-cari input").on(
		"input",
		frappe.utils.debounce((e) => {
			state.cari = e.target.value;
			render_rab_tree(frm);
			const input = frm.fields_dict.rab_tree.$wrapper.find(".rab-cari input")[0];
			input.focus();
			input.setSelectionRange(input.value.length, input.value.length);
		}, 250)
	);
	$w.find(".rab-filter-harga input").on("change", (e) => {
		state.belum_harga = e.target.checked;
		render_rab_tree(frm);
	});
	$w.find(".rab-tambah").on("click", () => {
		const row = frm.add_child("items");
		frm.refresh_field("items");
		render_rab_tree(frm);
		frm.fields_dict.items.grid.grid_rows_by_docname[row.name]?.show_form();
	});
	$w.find("tr.rab-grup").on("click", function (e) {
		if ($(e.target).closest(".rab-judul[data-row]").length) return;
		const key = $(this).attr("data-grup");
		state.buka.has(key) ? state.buka.delete(key) : state.buka.add(key);
		render_rab_tree(frm);
	});
	$w.find("tr.rab-item, .rab-judul[data-row]").on("click", function (e) {
		e.stopPropagation();
		frm.fields_dict.items.grid.grid_rows_by_docname[$(this).attr("data-row")]?.show_form();
	});
}
