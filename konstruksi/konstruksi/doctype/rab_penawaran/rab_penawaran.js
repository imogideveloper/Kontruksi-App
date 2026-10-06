// Copyright (c) 2026, Imogi Indonesia and contributors
// For license information, please see license.txt

const RAB_METHOD = "konstruksi.konstruksi.doctype.rab_penawaran.rab_penawaran";

frappe.ui.form.on("RAB Penawaran", {
	onload(frm) {
		// Saran uraian dari RAB lain untuk kolom Uraian Pekerjaan di tabel item.
		frappe.call(`${RAB_METHOD}.get_saran_uraian`).then((r) => {
			frm.__saran_uraian = r.message || [];
			render_rab_tree(frm);
		});
	},

	refresh(frm) {
		const terkunci = harga_terkunci(frm);
		const hak = hak_rab(frm);
		frm.add_custom_button(__("Download Template"), () => {
			window.open(`/api/method/${RAB_METHOD}.download_template`);
		}, __("Excel"));
		if (!frm.is_new()) {
			frm.add_custom_button(__("Download Isi RAB"), () => {
				window.open(`/api/method/${RAB_METHOD}.download_isi?name=${encodeURIComponent(frm.doc.name)}`);
			}, __("Excel"));
		}
		// Setelah penawaran diajukan, upload hanya untuk memperbarui Harga Pokok (bila boleh mengubah biaya).
		if (hak.ubah_harga || (hak.ubah_biaya && !frm.is_new())) {
			frm.add_custom_button(__("Upload Excel"), () => upload_excel(frm), __("Excel"));
		}

		// Struktur pekerjaan standar dari master Jenis Project tender ini (tanpa harga). Selalu tampil di RAB yang bisa
		// diedit; syarat (tender dipilih, harga belum dikunci) dicek saat diklik supaya user tahu alasannya.
		if (Boolean(frm.perm?.[0]?.write) && frm.doc.docstatus === 0) {
			frm.add_custom_button(__("Generate Template RAB"), () => muat_template_rab(frm)).addClass("btn-primary-light");
		}

		// Penawaran sudah diajukan: item & harga dikunci di tabel item, Harga Satuan Pokok (biaya) tetap bisa diisi.
		if (terkunci) {
			frm.dashboard.set_headline(
				__("Penawaran sudah diajukan di Dokumen Tender: item & harga RAB dikunci. Harga Satuan Pokok (biaya) tetap bisa diubah."),
				"blue"
			);
		}
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
	harga_satuan_pokok: hitung_total_dari_item,
	items_remove: hitung_total_dari_item,
	items_add: render_rab_tree,
	kode_wbs: render_rab_tree,
	uraian_pekerjaan: render_rab_tree,
	spesifikasi: render_rab_tree,
	satuan: render_rab_tree,
});

function harga_terkunci(frm) {
	return Boolean(frm.doc.__onload?.harga_terkunci);
}

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
		item.jumlah_biaya = flt(flt(item.volume) * flt(item.harga_satuan_pokok), 2);
		item.margin_persen =
			item.jumlah_harga && item.jumlah_biaya ? flt(((item.jumlah_harga - item.jumlah_biaya) / item.jumlah_harga) * 100, 2) : 0;
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

	const total_biaya = items.reduce((sum, item) => sum + flt(item.jumlah_biaya), 0);
	frm.doc.total_biaya = total_biaya;
	frm.doc.estimasi_margin = total_biaya ? total - total_biaya : 0;
	frm.doc.persen_margin = total_biaya && total ? flt(((total - total_biaya) / total) * 100, 2) : 0;

	frm.refresh_fields([
		"items",
		"total_sebelum_ppn",
		"total_ppn",
		"total_rab",
		"persen_hps",
		"total_biaya",
		"estimasi_margin",
		"persen_margin",
	]);
	render_rab_tree(frm);
}

function upload_excel(frm) {
	const hak = hak_rab(frm);
	const MODE_GANTI = __("Ganti semua item");
	const MODE_TAMBAH = __("Tambahkan di bawah item yang ada");
	const MODE_POKOK = __("Perbarui Harga Pokok saja (cocokkan Kode WBS)");
	const mode = [
		...(hak.ubah_harga ? [MODE_GANTI, MODE_TAMBAH] : []),
		...(hak.ubah_biaya && (frm.doc.items || []).length ? [MODE_POKOK] : []),
	];

	const dialog = new frappe.ui.Dialog({
		title: __("Upload Excel RAB"),
		fields: [
			{
				fieldtype: "HTML",
				options: `<p class="text-muted small">${__(
					"Gunakan format dari Excel → Download Template, atau Download Isi RAB untuk mengedit item yang sudah ada."
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
				label: __("Cara import"),
				options: mode.join("\n"),
				default: mode[0],
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
					const baris = r.message || [];
					let pesan;
					if (values.mode === MODE_POKOK) {
						// Hanya Harga Satuan Pokok yang diisi; item & harga penawaran tidak disentuh.
						const by_kode = {};
						(frm.doc.items || []).forEach((item) => {
							if ((item.kode_wbs || "").trim()) by_kode[item.kode_wbs.trim()] = item;
						});
						let cocok = 0;
						const tidak = [];
						baris.forEach((row) => {
							const item = by_kode[String(row.kode_wbs || "").trim()];
							if (!item) {
								if (flt(row.harga_satuan_pokok)) tidak.push(row.kode_wbs || row.uraian_pekerjaan);
								return;
							}
							if (row.harga_satuan_pokok !== undefined) {
								item.harga_satuan_pokok = flt(row.harga_satuan_pokok);
								cocok++;
							}
						});
						pesan = __("Harga Pokok diperbarui untuk {0} item.", [cocok]);
						if (tidak.length) pesan += " " + __("{0} baris tidak cocok dengan Kode WBS mana pun: {1}", [tidak.length, tidak.slice(0, 5).join(", ")]);
					} else {
						if (values.mode === MODE_GANTI) frm.clear_table("items");
						baris.forEach((row) => frm.add_child("items", row));
						pesan = __("{0} item diimport dari Excel.", [baris.length]);
					}
					hitung_total(frm);
					frm.dirty();
					dialog.hide();
					frappe.show_alert({ message: `${pesan} ${__("Jangan lupa Save.")}`, indicator: "green" }, 7);
				});
		},
	});
	dialog.show();
}

// ---------------------------------------------------------------------------
// Tabel item RAB: satu-satunya tampilan item. Dikelompokkan per WBS level 1 (kode tanpa titik: 1, 2, 3, ...)
// dengan subtotal, dan tiap sel bisa diketik langsung. Data tetap tersimpan di tabel anak `items` (disembunyikan).

const TANPA_KELOMPOK = "__tanpa_kelompok__";
const ITEM_DOCTYPE = "RAB Penawaran Item";
const FIELD_ANGKA = ["volume", "harga_satuan", "harga_satuan_pokok"];

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

function format_angka(value) {
	const v = flt(value);
	return v ? format_number(v, null, Number.isInteger(v) ? 0 : 2) : "";
}

function hak_rab(frm) {
	const bisa_ubah = Boolean(frm.perm?.[0]?.write) && frm.doc.docstatus === 0;
	return {
		ubah_harga: bisa_ubah && !harga_terkunci(frm),
		lihat_biaya: Boolean(frm.perm?.[1]?.read),
		ubah_biaya: bisa_ubah && Boolean(frm.perm?.[1]?.write),
	};
}

// Kode WBS berikutnya: kelompok baru = angka tertinggi + 1; item dalam kelompok = <kelompok>.<nomor tertinggi + 1>.
function kode_berikutnya(items, kelompok) {
	if (!kelompok) {
		const angka = items.map((i) => cint((i.kode_wbs || "").split(".")[0])).filter(Boolean);
		return String((angka.length ? Math.max(...angka) : 0) + 1);
	}
	const nomor = items
		.map((i) => (i.kode_wbs || "").trim())
		.filter((k) => k.startsWith(`${kelompok}.`) && k.split(".").length === 2)
		.map((k) => cint(k.split(".")[1]));
	return `${kelompok}.${(nomor.length ? Math.max(...nomor) : 0) + 1}`;
}

function render_rab_tree(frm) {
	const field = frm.fields_dict.rab_tree;
	if (!field) return;
	const state = (frm.__rab_tree = frm.__rab_tree || { tutup: new Set(), cari: "", belum_harga: false });
	const items = frm.doc.items || [];
	const total = flt(frm.doc.total_sebelum_ppn);
	const esc = frappe.utils.escape_html;
	const cari = state.cari.toLowerCase();
	const hak = hak_rab(frm);
	// Kolom aksi (tambah/hapus) hanya ada bila item boleh diubah.
	const ada_aksi = hak.ubah_harga;
	const kolom = 8 + (hak.lihat_biaya ? 2 : 0) + (ada_aksi ? 1 : 0);
	const sel_aksi = (isi) => (ada_aksi ? `<td class="rab-aksi-sel">${isi}</td>` : "");

	// Sel input: bisa diketik bila boleh diubah; bila tidak, tampil sebagai teks.
	const sel = (item, fieldname, kelas = "") => {
		const angka = FIELD_ANGKA.includes(fieldname);
		const nilai = angka ? format_angka(item[fieldname]) : item[fieldname] || "";
		const boleh = fieldname === "harga_satuan_pokok" ? hak.ubah_biaya : hak.ubah_harga;
		if (!boleh) return `<span class="rab-teks ${kelas}">${esc(nilai)}</span>`;
		return `<input class="rab-input ${angka ? "rab-input-angka" : ""} ${kelas}" data-row="${item.name}" data-field="${fieldname}"
			value="${esc(nilai)}" ${angka ? 'inputmode="decimal"' : ""} ${fieldname === "uraian_pekerjaan" ? 'list="rab-saran-uraian"' : ""}>`;
	};
	const persen_margin = (harga, biaya) =>
		flt(harga) && flt(biaya) ? `${format_number(((flt(harga) - flt(biaya)) / flt(harga)) * 100, null, 1)}%` : "";
	const sel_biaya = (isi) => (hak.lihat_biaya ? isi : "");

	const cocok = (item) => {
		if (state.belum_harga && flt(item.harga_satuan)) return false;
		if (!cari) return true;
		return `${item.uraian_pekerjaan || ""} ${item.spesifikasi || ""}`.toLowerCase().includes(cari);
	};
	const sedang_filter = Boolean(cari || state.belum_harga);
	const aksi_hapus = (item) =>
		hak.ubah_harga
			? `<button class="rab-aksi rab-hapus" data-row="${item.name}" title="${__("Hapus baris")}">${frappe.utils.icon("delete", "xs")}</button>`
			: "";

	let rows = "";
	kelompokkan_item(items).forEach((grup) => {
		const anak = grup.anak.filter(cocok);
		const induk_cocok = grup.induk && !state.belum_harga && cari && cocok(grup.induk);
		if (sedang_filter && !anak.length && !induk_cocok) return;

		const semua = grup.induk ? [grup.induk, ...grup.anak] : grup.anak;
		const subtotal = semua.reduce((s, i) => s + flt(i.jumlah_harga), 0);
		const subbiaya = semua.reduce((s, i) => s + flt(i.jumlah_biaya), 0);
		const terbuka = sedang_filter || !state.tutup.has(grup.key);

		const judul = grup.induk
			? sel(grup.induk, "uraian_pekerjaan", "rab-input-judul")
			: `<span class="rab-teks rab-input-judul">${__("Tanpa Kode WBS")}</span>`;
		rows += `<tr class="rab-grup ${terbuka ? "terbuka" : ""}" data-grup="${esc(grup.key)}">
			<td>${grup.induk ? sel(grup.induk, "kode_wbs", "rab-input-kode") : ""}</td>
			<td class="rab-uraian"><span class="rab-chevron">${frappe.utils.icon("right", "sm")}</span>${judul}</td>
			<td><span class="rab-badge">${__("{0} item", [grup.anak.length])}</span></td>
			<td></td><td></td><td></td>
			<td class="rab-angka rab-tebal">${format_rupiah(subtotal)}</td>
			<td class="rab-angka">${total ? format_number((subtotal / total) * 100, null, 2) : 0}%</td>
			${sel_biaya(`<td class="rab-angka rab-tebal rab-biaya">${subbiaya ? format_rupiah(subbiaya) : ""}</td>
				<td class="rab-angka rab-biaya">${persen_margin(subtotal, subbiaya)}</td>`)}
			${sel_aksi(
				(grup.induk
					? `<button class="rab-aksi rab-tambah-anak" data-grup="${esc(grup.key)}" title="${__("Tambah item di kelompok ini")}">${frappe.utils.icon("add", "xs")}</button>`
					: "") + (grup.induk ? aksi_hapus(grup.induk) : "")
			)}
		</tr>`;

		if (!terbuka) return;
		anak.forEach((item) => {
			const level = Math.max((item.kode_wbs || "").split(".").length - 1, 1);
			rows += `<tr class="rab-item ${flt(item.harga_satuan) ? "" : "rab-belum-harga"}" data-row="${item.name}">
				<td>${sel(item, "kode_wbs", "rab-input-kode")}</td>
				<td class="rab-uraian" style="padding-left: ${8 + level * 18}px">${sel(item, "uraian_pekerjaan")}</td>
				<td>${sel(item, "spesifikasi")}</td>
				<td>${sel(item, "satuan", "rab-input-tengah")}</td>
				<td>${sel(item, "volume")}</td>
				<td>${sel(item, "harga_satuan")}</td>
				<td class="rab-angka">${flt(item.jumlah_harga) ? format_rupiah(item.jumlah_harga) : ""}</td>
				<td class="rab-angka">${flt(item.bobot) ? `${format_number(flt(item.bobot), null, 2)}%` : ""}</td>
				${sel_biaya(`<td class="rab-biaya">${sel(item, "harga_satuan_pokok")}</td>
					<td class="rab-angka rab-biaya">${persen_margin(item.jumlah_harga, item.jumlah_biaya)}</td>`)}
				${sel_aksi(aksi_hapus(item))}
			</tr>`;
		});
	});

	if (!rows) {
		rows = `<tr><td colspan="${kolom}" class="rab-kosong">${
			items.length ? __("Tidak ada item yang cocok.") : __("Belum ada item. Klik + Kelompok untuk mulai, atau Excel → Upload Excel.")
		}</td></tr>`;
	}
	const total_biaya = flt(frm.doc.total_biaya);
	const kaki = items.length
		? `<tfoot><tr>
			<td></td><td class="rab-tebal">${__("Total sebelum PPN")}</td><td></td><td></td><td></td><td></td>
			<td class="rab-angka rab-tebal">${format_rupiah(total)}</td><td class="rab-angka">100%</td>
			${sel_biaya(`<td class="rab-angka rab-tebal rab-biaya">${total_biaya ? format_rupiah(total_biaya) : ""}</td>
				<td class="rab-angka rab-tebal rab-biaya">${persen_margin(total, total_biaya)}</td>`)}
			${sel_aksi("")}
		</tr></tfoot>`
		: "";

	// Lebar kolom (%): Jumlah Harga & Harga Pokok cukup untuk subtotal kelompok (mis. Rp 412.000.000).
	const lebar = hak.lihat_biaya ? [5, 20, 13, 6, 7, 11, 14, 6, 13, 5] : [5, 26, 16, 6, 8, 13, 17, 9];
	const fokus = simpan_fokus(field.$wrapper);

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
				${
					hak.ubah_harga
						? `<button class="btn btn-default btn-sm rab-tambah-kelompok">${frappe.utils.icon("add", "sm")} ${__("Kelompok")}</button>`
						: ""
				}
			</div>
			<div class="rab-table-wrap">
				<table class="rab-table">
					<colgroup>${lebar.map((w) => `<col style="width: ${w}%">`).join("")}${ada_aksi ? '<col style="width: 56px">' : ""}</colgroup>
					<thead><tr>
						<th>${__("No")}</th>
						<th>${__("Uraian Pekerjaan")}</th>
						<th>${__("Spesifikasi")}</th>
						<th class="rab-tengah">${__("Satuan")}</th>
						<th class="rab-angka">${__("Volume")}</th>
						<th class="rab-angka">${__("Harga Satuan")}</th>
						<th class="rab-angka">${__("Jumlah Harga")}</th>
						<th class="rab-angka">${__("Bobot")}</th>
						${sel_biaya(`<th class="rab-angka rab-biaya">${__("Harga Pokok")}</th><th class="rab-angka rab-biaya">${__("Margin")}</th>`)}
						${ada_aksi ? "<th></th>" : ""}
					</tr></thead>
					<tbody>${rows}</tbody>
					${kaki}
				</table>
			</div>
			<datalist id="rab-saran-uraian">${(frm.__saran_uraian || []).map((s) => `<option value="${esc(s)}">`).join("")}</datalist>
		</div>`);

	pulihkan_fokus(field.$wrapper, fokus);
	pasang_event_rab(frm, field.$wrapper, state, items);
}

// Tabel dirender ulang tiap angka berubah; kursor dikembalikan ke sel yang sedang diisi.
function simpan_fokus($w) {
	const aktif = document.activeElement;
	if (!aktif || !$w[0].contains(aktif) || !aktif.dataset?.row) return null;
	return { row: aktif.dataset.row, field: aktif.dataset.field, pos: aktif.selectionStart };
}

function pulihkan_fokus($w, fokus) {
	if (!fokus) return;
	const input = $w.find(`.rab-input[data-row="${fokus.row}"][data-field="${fokus.field}"]`)[0];
	if (!input) return;
	input.focus();
	if (fokus.pos != null) input.setSelectionRange(fokus.pos, fokus.pos);
}

function pasang_event_rab(frm, $w, state, items) {
	const semua_grup = () => kelompokkan_item(items).map((g) => g.key);
	$w.find(".rab-buka-semua").on("click", () => {
		state.tutup.clear();
		render_rab_tree(frm);
	});
	$w.find(".rab-tutup-semua").on("click", () => {
		state.tutup = new Set(semua_grup());
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

	// Buka/tutup kelompok: klik baris kelompok di luar sel input & tombol.
	$w.find("tr.rab-grup").on("click", function (e) {
		if ($(e.target).closest("input, button").length) return;
		const key = $(this).attr("data-grup");
		state.tutup.has(key) ? state.tutup.delete(key) : state.tutup.add(key);
		render_rab_tree(frm);
	});

	// Simpan isian sel ke tabel item; angka dihitung ulang lewat event field (hitung_total).
	$w.find(".rab-input")
		// Angka tetap berformat lokal (mis. 7.500.000); flt() membacanya sesuai format angka sistem.
		.on("focus", function () {
			this.select();
		})
		.on("change", function () {
			const { row, field } = this.dataset;
			const nilai = FIELD_ANGKA.includes(field) ? flt(this.value) : this.value.trim();
			frappe.model.set_value(ITEM_DOCTYPE, row, field, nilai);
		})
		.on("keydown", function (e) {
			// Enter: pindah ke sel yang sama di baris berikutnya.
			if (e.key !== "Enter") return;
			e.preventDefault();
			const sejenis = $w.find(`.rab-input[data-field="${this.dataset.field}"]`).toArray();
			const berikut = sejenis[sejenis.indexOf(this) + 1];
			$(this).trigger("change");
			if (berikut) setTimeout(() => $w.find(`.rab-input[data-row="${berikut.dataset.row}"][data-field="${this.dataset.field}"]`).focus(), 50);
		});

	const tambah = (kode, induk) => {
		const row = frm.add_child("items", { kode_wbs: kode });
		frm.refresh_field("items");
		if (induk) state.tutup.delete(induk);
		frm.dirty();
		render_rab_tree(frm);
		frm.fields_dict.rab_tree.$wrapper.find(`.rab-input[data-row="${row.name}"][data-field="uraian_pekerjaan"]`).focus();
	};
	$w.find(".rab-tambah-kelompok").on("click", () => tambah(kode_berikutnya(items, null)));
	$w.find(".rab-tambah-anak").on("click", function (e) {
		e.stopPropagation();
		const grup = $(this).attr("data-grup");
		tambah(kode_berikutnya(items, grup), grup);
	});

	$w.find(".rab-hapus").on("click", function (e) {
		e.stopPropagation();
		const item = locals[ITEM_DOCTYPE][$(this).attr("data-row")];
		if (!item) return;
		const induk = !(item.kode_wbs || "").includes(".") && (item.kode_wbs || "").trim();
		const pesan = induk
			? __("Hapus judul kelompok <b>{0}</b>? Item di dalamnya tidak ikut terhapus (pindah ke Tanpa Kode WBS).", [
					frappe.utils.escape_html(item.uraian_pekerjaan || item.kode_wbs),
			  ])
			: __("Hapus item <b>{0}</b>?", [frappe.utils.escape_html(item.uraian_pekerjaan || __("tanpa uraian"))]);
		frappe.confirm(pesan, () => {
			frm.doc.items = frm.doc.items.filter((i) => i.name !== item.name);
			frm.doc.items.forEach((i, idx) => (i.idx = idx + 1));
			frappe.model.clear_doc(ITEM_DOCTYPE, item.name);
			frm.refresh_field("items");
			frm.dirty();
			hitung_total(frm);
		});
	});
}

// Generate Template RAB: isi item dari tabel Template RAB di master Jenis Project tender. Bila RAB sudah berisi, pilih
// ganti semua atau tambahkan di bawah (kode kelompok template digeser setelah kelompok terakhir).
function muat_template_rab(frm) {
	if (!frm.doc.tender) {
		frappe.msgprint(__("Pilih Tender dulu: template diambil dari Jenis Project tender tersebut."));
		return;
	}
	if (harga_terkunci(frm)) {
		frappe.msgprint(__("Penawaran sudah diajukan di Dokumen Tender: item RAB dikunci, template tidak bisa dimuat."));
		return;
	}
	frappe.call({ method: `${RAB_METHOD}.get_template_rab`, args: { tender: frm.doc.tender } }).then((r) => {
		const { jenis_project, rows } = r.message || {};
		if (!rows?.length) {
			frappe.msgprint(__("Template RAB untuk Jenis Project {0} masih kosong. Isi di master Jenis Project → Template RAB.", [
				`<a href="/app/jenis-project/${encodeURIComponent(jenis_project)}">${frappe.utils.escape_html(jenis_project)}</a>`,
			]));
			return;
		}
		const kelompok = rows.filter((x) => !String(x.kode_wbs).includes(".")).length;
		const isi = (frm.doc.items || []).filter((x) => (x.uraian_pekerjaan || "").trim()).length;
		const terapkan = (mode) => {
			let geser = 0;
			if (mode === "tambah") {
				geser = Math.max(0, ...(frm.doc.items || []).map((x) => cint(String(x.kode_wbs || "").split(".")[0])));
			} else {
				frm.clear_table("items");
			}
			rows.forEach((x) => {
				const bagian = String(x.kode_wbs).split(".");
				bagian[0] = String(cint(bagian[0]) + geser);
				frm.add_child("items", { kode_wbs: bagian.join("."), uraian_pekerjaan: x.uraian_pekerjaan, satuan: x.satuan || "" });
			});
			hitung_total(frm);
			render_rab_tree(frm);
			frm.dirty();
			frappe.show_alert({
				message: __("Template {0} dimuat: {1} kelompok, {2} item. Isi volume & harga satuan, lalu Save.", [jenis_project, kelompok, rows.length - kelompok]),
				indicator: "green",
			}, 7);
		};
		if (!isi) return terapkan("ganti");
		const d = new frappe.ui.Dialog({
			title: __("Generate Template RAB — {0}", [jenis_project]),
			fields: [{
				fieldtype: "Select", fieldname: "mode", label: __("RAB ini sudah berisi {0} item", [isi]), reqd: 1,
				options: [
					{ value: "tambah", label: __("Tambahkan di bawah item yang ada") },
					{ value: "ganti", label: __("Ganti semua item dengan template") },
				],
				default: "tambah",
			}],
			primary_action_label: __("Generate"),
			primary_action: (v) => {
				d.hide();
				terapkan(v.mode);
			},
		});
		d.show();
	});
}
