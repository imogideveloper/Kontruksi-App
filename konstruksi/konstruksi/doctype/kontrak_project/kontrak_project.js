// Copyright (c) 2026, Imogi Indonesia and contributors
// For license information, please see license.txt

const BULAN_KONTRAK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const KONTRAK_METHOD = "konstruksi.konstruksi.doctype.kontrak_project.kontrak_project";

// Field yang memengaruhi checklist kelengkapan: tiap perubahan menghitung ulang checklist sebelum disimpan.
const FIELD_KELENGKAPAN = [
	"nomor_kontrak",
	"tanggal_kontrak",
	"nomor_spmk",
	"tanggal_spmk",
	"file_kontrak",
	"syarat_bayar_dikonfirmasi",
	"uang_muka_persen",
	"jaminan_pelaksanaan_wajib",
	"jaminan_pelaksanaan_diserahkan",
	"jaminan_uang_muka_diserahkan",
	"nilai_kontrak",
	"status_ppn",
	"tarif_ppn",
];
// Field yang memengaruhi kartu ringkasan.
const FIELD_RINGKASAN = ["nilai_kontrak", "tarif_ppn", "status_ppn", "tanggal_spmk", "masa_pelaksanaan", "masa_pemeliharaan"];

const kontrak_events = {
	setup(frm) {
		// Hanya tender yang menang dan belum punya kontrak.
		frm.set_query("tender", () => ({ query: `${KONTRAK_METHOD}.cari_tender_menang` }));
	},

	onload(frm) {
		frm.__kelengkapan = frm.doc.__onload?.kelengkapan || null;
	},

	tender(frm) {
		// Dibuat dari list: nilai kontrak awal diambil dari Harga Pemenang / Kontrak di Hasil Tender.
		if (!frm.doc.tender) return;
		frappe.db.get_value("Hasil Tender", { tender: frm.doc.tender }, "harga_pemenang").then((r) => {
			const harga = flt(r.message?.harga_pemenang);
			if (harga && !flt(frm.doc.nilai_kontrak)) frm.set_value("nilai_kontrak", harga);
			muat_kelengkapan(frm);
		});
	},

	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__("Tender"), () => frappe.set_route("Form", "Tender", frm.doc.tender), __("Buka"));
			frm.add_custom_button(__("Hasil Tender"), () => frappe.set_route("Form", "Hasil Tender", frm.doc.tender), __("Buka"));
		}
		const [label, warna] = kontrak_status(frm.doc);
		if (!frm.is_new()) frm.page.set_indicator(label, warna);
		// Setelah simpan / reload, checklist dari server sudah sesuai data tersimpan.
		if (!frm.is_dirty()) frm.__kelengkapan = frm.doc.__onload?.kelengkapan || frm.__kelengkapan;
		render_ringkasan_kontrak(frm);
		render_kelengkapan_kontrak(frm);
		if (frm.is_new() && frm.doc.tender && !frm.__kelengkapan) muat_kelengkapan(frm);
	},
};

// Ringkasan & checklist ikut berubah sebelum disimpan supaya isian langsung terlihat hasilnya.
[...new Set([...FIELD_RINGKASAN, ...FIELD_KELENGKAPAN])].forEach((fieldname) => {
	kontrak_events[fieldname] = (frm) => {
		if (FIELD_RINGKASAN.includes(fieldname)) render_ringkasan_kontrak(frm);
		if (FIELD_KELENGKAPAN.includes(fieldname)) muat_kelengkapan(frm);
	};
});

frappe.ui.form.on("Kontrak Project", kontrak_events);

// Dihitung di server (logika sama dengan saat simpan); ditunda sedikit agar tidak memanggil server tiap ketikan.
const muat_kelengkapan = frappe.utils.debounce((frm) => {
	if (!frm.doc.tender) return;
	frappe
		.call({ method: `${KONTRAK_METHOD}.get_kelengkapan_live`, args: { doc: frm.doc }, type: "POST" })
		.then((r) => {
			frm.__kelengkapan = r.message || [];
			render_ringkasan_kontrak(frm);
			render_kelengkapan_kontrak(frm);
		});
}, 400);

function tanggal_kontrak(value) {
	if (!value) return "";
	const m = moment(value);
	return `${m.format("DD")} ${BULAN_KONTRAK[m.month()]} ${m.format("YYYY")}`;
}

function rupiah(value) {
	return format_currency(flt(value), "IDR", 0);
}

// Status dihitung dari tanggal (bukan disimpan) supaya selalu sesuai hari ini. Sama dengan kontrak_project_list.js.
function kontrak_status(doc) {
	const hari_ini = frappe.datetime.get_today();
	if (!doc.tanggal_spmk || hari_ini < doc.tanggal_spmk) return [__("Persiapan"), "orange"];
	if (!doc.tanggal_selesai || hari_ini <= doc.tanggal_selesai) return [__("Pelaksanaan"), "blue"];
	if (doc.akhir_pemeliharaan && hari_ini <= doc.akhir_pemeliharaan) return [__("Pemeliharaan"), "purple"];
	return [__("Selesai"), "green"];
}

function render_ringkasan_kontrak(frm) {
	const field = frm.fields_dict.ringkasan;
	if (!field) return;
	const doc = frm.doc;

	const tarif = doc.status_ppn === "PPN" ? flt(doc.tarif_ppn) : 0;
	const sebelum_ppn = flt(doc.nilai_kontrak) / (1 + tarif / 100);
	const sub_nilai = tarif
		? __("{0} + PPN {1}%", [rupiah(sebelum_ppn), format_number(tarif, null, 0)])
		: __("Tidak kena PPN");

	// Tanggal selesai dihitung ulang di sini juga, karena server baru menghitungnya saat simpan.
	const masa = cint(doc.masa_pelaksanaan);
	const selesai = doc.tanggal_spmk && masa ? frappe.datetime.add_days(doc.tanggal_spmk, masa - 1) : null;
	let sub_waktu = __("Mulai dari tanggal SPMK (belum diisi)");
	if (selesai) {
		sub_waktu = `${tanggal_kontrak(doc.tanggal_spmk)} – ${tanggal_kontrak(selesai)}`;
		const hari_ini = frappe.datetime.get_today();
		if (hari_ini >= doc.tanggal_spmk && hari_ini <= selesai) {
			sub_waktu += ` · <b>${__("sisa {0} hari", [frappe.datetime.get_day_diff(selesai, hari_ini) + 1])}</b>`;
		}
	}

	const pemeliharaan = cint(doc.masa_pemeliharaan);
	const akhir = selesai && pemeliharaan ? frappe.datetime.add_days(selesai, pemeliharaan) : null;

	const items = frm.__kelengkapan || [];
	const total = items.length;
	const terisi = items.filter((item) => item.ok).length;
	const persen = total ? Math.round((terisi / total) * 100) : 0;
	const lengkap = total && terisi === total;

	field.$wrapper.html(`<div class="dok-tender">
		<div class="dok-ringkasan">
			<div class="dok-tile">
				<div class="dok-tile-label">${__("Nilai kontrak")}</div>
				<div class="dok-tile-nilai">${flt(doc.nilai_kontrak) ? rupiah(doc.nilai_kontrak) : "—"}</div>
				<div class="dok-tile-sub">${flt(doc.nilai_kontrak) ? sub_nilai : __("Belum diisi")}</div>
			</div>
			<div class="dok-tile">
				<div class="dok-tile-label">${__("Masa pelaksanaan")}</div>
				<div class="dok-tile-nilai">${masa ? `${masa} <span>${__("hari")}</span>` : "—"}</div>
				<div class="dok-tile-sub">${sub_waktu}</div>
			</div>
			<div class="dok-tile">
				<div class="dok-tile-label">${__("Masa pemeliharaan")}</div>
				<div class="dok-tile-nilai">${pemeliharaan ? `${pemeliharaan} <span>${__("hari")}</span>` : "—"}</div>
				<div class="dok-tile-sub">${
					akhir ? __("sampai {0}", [tanggal_kontrak(akhir)]) : pemeliharaan ? __("menunggu tanggal SPMK") : __("Belum diisi")
				}</div>
			</div>
			<div class="dok-tile ${lengkap ? "dok-tile-ok" : ""}">
				<div class="dok-tile-label">${__("Kelengkapan kontrak")}</div>
				<div class="dok-tile-nilai">${total ? `${terisi} <span>/ ${total}</span>` : "—"}</div>
				<div class="dok-progress"><div style="width: ${persen}%"></div></div>
				<div class="dok-tile-sub">${
					!total
						? __("Pilih Asal Tender dulu")
						: lengkap
						? __("Semua lengkap")
						: __("{0} item belum lengkap", [total - terisi])
				}</div>
			</div>
		</div>
	</div>`);
}

function render_kelengkapan_kontrak(frm) {
	const field = frm.fields_dict.kelengkapan_html;
	if (!field) return;
	const esc = frappe.utils.escape_html;
	const items = frm.__kelengkapan || [];

	if (!items.length) {
		field.$wrapper.html(`<div class="text-muted small">${__("Checklist muncul setelah Asal Tender dipilih.")}</div>`);
		return;
	}

	const rows = items
		.map((item, i) => {
			let aksi = "";
			if (item.field) {
				aksi = `<button class="btn btn-default btn-xs kp-isi" data-field="${item.field}">
					${frappe.utils.icon("edit", "xs")} ${item.ok ? __("Ubah") : __("Isi")}</button>`;
			} else if (item.rab) {
				aksi = `<a class="btn btn-default btn-xs" href="/app/rab-penawaran/${encodeURIComponent(item.rab)}">
					${__("Buka RAB")} ${frappe.utils.icon("right", "xs")}</a>`;
			} else {
				aksi = `<a class="btn btn-default btn-xs" href="/app/rab-penawaran/new?tender=${encodeURIComponent(
					frm.doc.tender
				)}">${__("Buat RAB")}</a>`;
			}
			return `<div class="kp-cek ${item.ok ? "kp-cek-ok" : "kp-cek-kurang"}">
				<span class="kp-cek-ikon">${frappe.utils.icon(item.ok ? "check" : "circle-alert", "sm")}</span>
				<div class="kp-cek-info">
					<div class="kp-cek-label">${esc(item.label)}</div>
					<div class="kp-cek-ket">${esc(item.ket || "")}</div>
				</div>
				<div class="kp-cek-aksi">${aksi}</div>
			</div>`;
		})
		.join("");

	const catatan = frm.is_dirty()
		? `<div class="kp-cek-catatan text-muted small">${frappe.utils.icon("info", "xs")} ${__(
				"Checklist sudah mengikuti isian terbaru. Jangan lupa simpan."
		  )}</div>`
		: "";
	field.$wrapper.html(`<div class="dok-tender kp-kelengkapan">${rows}</div>${catatan}`);
	field.$wrapper.find(".kp-isi").on("click", function () {
		const fieldname = $(this).attr("data-field");
		frm.scroll_to_field(fieldname);
	});
}
