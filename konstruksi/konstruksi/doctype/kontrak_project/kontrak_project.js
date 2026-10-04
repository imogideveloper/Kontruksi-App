// Copyright (c) 2026, Imogi Indonesia and contributors
// For license information, please see license.txt

const BULAN_KONTRAK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const KONTRAK_METHOD = "konstruksi.konstruksi.doctype.kontrak_project.kontrak_project";

// Field yang memengaruhi hitungan (uang muka, tanggal, jaminan) atau checklist kelengkapan: tiap perubahan
// menghitung ulang di server sebelum disimpan.
const FIELD_KELENGKAPAN = [
	"masa_pemeliharaan",
	"nomor_kontrak",
	"tanggal_kontrak",
	"nomor_spmk",
	"tanggal_spmk",
	"file_kontrak",
	"syarat_bayar_dikonfirmasi",
	"uang_muka_persen",
	"jaminan_pelaksanaan_wajib",
	"jaminan_pelaksanaan_diserahkan",
	"jaminan_pelaksanaan_penerbit",
	"jaminan_pelaksanaan_berlaku",
	"jaminan_uang_muka_diserahkan",
	"jaminan_uang_muka_penerbit",
	"jaminan_uang_muka_berlaku",
	"nilai_kontrak",
	"status_ppn",
	"tarif_ppn",
];
// Field yang tampil di tab Ringkasan (kartu, timeline, panel Data Kontrak).
const FIELD_RINGKASAN = [
	"nilai_kontrak",
	"tarif_ppn",
	"status_ppn",
	"tanggal_spmk",
	"masa_pelaksanaan",
	"masa_pemeliharaan",
	"nomor_kontrak",
	"tanggal_kontrak",
	"wakil_pemberi_kerja",
	"konsultan_pengawas",
	"project_manager",
	"cara_pembayaran",
	"uang_muka_persen",
	"retensi_persen",
	"pph_final_persen",
	"kualifikasi_usaha",
];

// Sama dengan KUALIFIKASI_PER_JASA di tarif_pph_final.py.
const KUALIFIKASI_PER_JASA = {
	"Pekerjaan Konstruksi": ["Kecil / Perseorangan", "Menengah / Besar", "Tidak Memiliki Sertifikat"],
	"Pekerjaan Konstruksi Terintegrasi": ["Bersertifikat", "Tidak Memiliki Sertifikat"],
	"Konsultansi Konstruksi": ["Bersertifikat", "Tidak Memiliki Sertifikat"],
};

const kontrak_events = {
	jenis_jasa(frm) {
		set_pilihan_kualifikasi(frm);
		muat_tarif_pph(frm);
	},
	kualifikasi_usaha: (frm) => muat_tarif_pph(frm),

	setup(frm) {
		// Hanya tender yang menang dan belum punya kontrak.
		frm.set_query("tender", () => ({ query: `${KONTRAK_METHOD}.cari_tender_menang` }));
	},

	onload(frm) {
		frm.__kelengkapan = frm.doc.__onload?.kelengkapan || null;
	},

	tender(frm) {
		// Nilai & PPN terisi dari Tender lewat fetch_from.
		if (frm.doc.tender) muat_kelengkapan(frm);
	},

	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__("Tender"), () => frappe.set_route("Form", "Tender", frm.doc.tender), __("Buka"));
			frm.add_custom_button(__("Hasil Tender"), () => frappe.set_route("Form", "Hasil Tender", frm.doc.tender), __("Buka"));
		}
		set_pilihan_kualifikasi(frm);
		const [label, warna] = kontrak_status(frm.doc);
		if (!frm.is_new()) frm.page.set_indicator(label, warna);
		// Setelah simpan / reload, checklist dari server sudah sesuai data tersimpan.
		if (!frm.is_dirty()) frm.__kelengkapan = frm.doc.__onload?.kelengkapan || frm.__kelengkapan;
		render_ringkasan_kontrak(frm);
		render_tabel_nilai(frm);
		if (frm.is_new() && frm.doc.tender && !frm.__kelengkapan) muat_kelengkapan(frm);
	},
};

// Ringkasan & checklist ikut berubah sebelum disimpan supaya isian langsung terlihat hasilnya.
[...new Set([...FIELD_RINGKASAN, ...FIELD_KELENGKAPAN])].forEach((fieldname) => {
	kontrak_events[fieldname] = (frm) => {
		// Tarif PPh mengikuti yang berlaku pada tanggal kontrak.
		if (fieldname === "tanggal_kontrak") muat_tarif_pph(frm);
		if (FIELD_RINGKASAN.includes(fieldname)) {
			render_ringkasan_kontrak(frm);
			render_tabel_nilai(frm);
		}
		if (FIELD_KELENGKAPAN.includes(fieldname)) muat_kelengkapan(frm);
	};
});

frappe.ui.form.on("Kontrak Project", kontrak_events);

function set_pilihan_kualifikasi(frm) {
	const pilihan = KUALIFIKASI_PER_JASA[frm.doc.jenis_jasa] || [];
	frm.set_df_property("kualifikasi_usaha", "options", ["", ...pilihan].join("\n"));
	if (frm.doc.kualifikasi_usaha && !pilihan.includes(frm.doc.kualifikasi_usaha)) frm.set_value("kualifikasi_usaha", "");
}

// Tarif PPh Final langsung tampil sebelum disimpan; saat simpan server mengambilnya lagi dari master.
function muat_tarif_pph(frm) {
	if (!frm.doc.jenis_jasa || !frm.doc.kualifikasi_usaha) {
		frm.set_value({ pph_final_persen: 0, tarif_pph_final: "" });
		return;
	}
	frappe
		.call("konstruksi.konstruksi.doctype.tarif_pph_final.tarif_pph_final.get_tarif", {
			jenis_jasa: frm.doc.jenis_jasa,
			kualifikasi: frm.doc.kualifikasi_usaha,
			tanggal: frm.doc.tanggal_kontrak,
		})
		.then((r) => {
			if (!r.message) {
				frappe.show_alert({ message: __("Tarif PPh Final untuk pilihan ini belum ada di master."), indicator: "orange" });
			}
			frm.set_value({ pph_final_persen: r.message?.tarif || 0, tarif_pph_final: r.message?.name || "" });
		});
}

// Dihitung di server (logika sama dengan saat simpan); ditunda sedikit agar tidak memanggil server tiap ketikan.
const muat_kelengkapan = frappe.utils.debounce((frm) => {
	if (!frm.doc.tender) return;
	frappe
		.call({ method: `${KONTRAK_METHOD}.get_kelengkapan_live`, args: { doc: frm.doc }, type: "POST" })
		.then((r) => {
			const { kelengkapan = [], hitungan = {} } = r.message || {};
			frm.__kelengkapan = kelengkapan;
			// Field hitungan read-only: isi langsung lalu tampilkan ulang (tanpa memicu event field).
			Object.entries(hitungan).forEach(([fieldname, value]) => {
				if (frm.doc[fieldname] !== value) {
					frm.doc[fieldname] = value;
					frm.refresh_field(fieldname);
				}
			});
			render_ringkasan_kontrak(frm);
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

// Tab Ringkasan: kepala kontrak, kartu angka utama, timeline, lalu panel Kelengkapan & Data Kontrak berdampingan.
// Semua dari frm.doc (ikut berubah sebelum disimpan); checklist dari server (frm.__kelengkapan).
function render_ringkasan_kontrak(frm) {
	const field = frm.fields_dict.ringkasan;
	if (!field) return;
	const doc = frm.doc;

	if (!doc.tender) {
		field.$wrapper.html(`<div class="dok-kosong">
			${frappe.utils.icon("file-text", "lg")}
			<div>${__("Ringkasan kontrak muncul setelah Asal Tender dipilih.")}</div>
			<button class="btn btn-primary btn-sm kp-ke-field" data-field="tender">${__("Pilih Asal Tender")}</button>
		</div>`);
		pasang_aksi_ringkasan(frm, field.$wrapper);
		return;
	}

	field.$wrapper.html(`<div class="dok-tender kp-ringkasan">
		${html_kepala_kontrak(frm)}
		${html_kartu_kontrak(frm)}
		${html_timeline_kontrak(frm)}
		<div class="kp-grid">
			${html_panel_kelengkapan(frm)}
			${html_panel_data(frm)}
		</div>
	</div>`);
	pasang_aksi_ringkasan(frm, field.$wrapper);
}

function pasang_aksi_ringkasan(frm, $w) {
	// Tombol "Isi" dan tautan field: pindah ke tab & field yang dimaksud.
	$w.find(".kp-ke-field").on("click", function (e) {
		e.preventDefault();
		frm.scroll_to_field($(this).attr("data-field"));
	});
}

// Tanggal-tanggal kontrak dihitung ulang di sini juga, karena server baru menghitungnya saat simpan.
function jadwal_kontrak(doc) {
	const masa = cint(doc.masa_pelaksanaan);
	const pemeliharaan = cint(doc.masa_pemeliharaan);
	const mulai = doc.tanggal_spmk || null;
	const selesai = mulai && masa ? frappe.datetime.add_days(mulai, masa - 1) : null;
	const akhir = selesai && pemeliharaan ? frappe.datetime.add_days(selesai, pemeliharaan) : null;
	return { masa, pemeliharaan, mulai, selesai, akhir };
}

function html_kepala_kontrak(frm) {
	const doc = frm.doc;
	const esc = frappe.utils.escape_html;
	const [status, warna] = kontrak_status(doc);
	const sub = [doc.pemberi_kerja, doc.lokasi, doc.jenis_project].filter(Boolean).map(esc).join(" · ");
	const nomor = doc.nomor_kontrak
		? `<div class="kp-kepala-nomor">${__("Kontrak No.")} <b>${esc(doc.nomor_kontrak)}</b></div>
			<div class="kp-kepala-tanggal">${doc.tanggal_kontrak ? tanggal_kontrak(doc.tanggal_kontrak) : ""}</div>`
		: `<a href="#" class="kp-ke-field kp-kepala-kosong" data-field="nomor_kontrak">${__("Nomor kontrak belum diisi")}</a>`;

	return `<div class="kp-kepala">
		<div class="kp-kepala-kiri">
			<div class="kp-kepala-kode">${frm.is_new() ? __("Kontrak baru") : esc(doc.name)} · ${__("Tender")}
				<a href="/app/tender/${encodeURIComponent(doc.tender)}">${esc(doc.tender)}</a></div>
			<div class="kp-kepala-judul">${esc(doc.nama_project || "")}</div>
			<div class="kp-kepala-sub">${sub}</div>
		</div>
		<div class="kp-kepala-kanan">
			<span class="indicator-pill ${warna}">${status}</span>
			${nomor}
		</div>
	</div>`;
}

function html_kartu_kontrak(frm) {
	const doc = frm.doc;
	const { masa, mulai, selesai } = jadwal_kontrak(doc);
	const nilai = flt(doc.nilai_kontrak);
	const tarif = doc.status_ppn === "PPN" ? flt(doc.tarif_ppn) : 0;
	const sebelum_ppn = nilai / (1 + tarif / 100);
	const uang_muka = flt(doc.uang_muka_persen);

	const items = frm.__kelengkapan || [];
	const total = items.length;
	const terisi = items.filter((item) => item.ok).length;
	const persen = total ? Math.round((terisi / total) * 100) : 0;
	const lengkap = total && terisi === total;

	const kartu = (label, nilai_html, sub_html, kelas = "") => `<div class="dok-tile ${kelas}">
		<div class="dok-tile-label">${label}</div>
		<div class="dok-tile-nilai">${nilai_html}</div>
		${sub_html}
	</div>`;
	const sub = (teks) => `<div class="dok-tile-sub">${teks}</div>`;

	return `<div class="dok-ringkasan">
		${kartu(
			__("Nilai kontrak"),
			nilai ? rupiah(nilai) : "—",
			sub(nilai ? (tarif ? __("{0} + PPN {1}%", [rupiah(sebelum_ppn), format_number(tarif, null, 0)]) : __("Tidak kena PPN")) : __("Belum ada nilai"))
		)}
		${kartu(
			__("Waktu pelaksanaan"),
			masa ? `${masa} <span>${__("hari")}</span>` : "—",
			sub(selesai ? `${tanggal_kontrak(mulai)} – ${tanggal_kontrak(selesai)}` : __("Menunggu tanggal SPMK"))
		)}
		${kartu(
			__("Uang muka"),
			uang_muka ? rupiah((nilai * uang_muka) / 100) : "—",
			sub(uang_muka ? __("{0}% dari nilai kontrak", [format_number(uang_muka, null, 0)]) : __("Tanpa uang muka"))
		)}
		${kartu(
			__("Kelengkapan kontrak"),
			total ? `${terisi} <span>/ ${total}</span>` : "—",
			`<div class="dok-progress"><div style="width: ${persen}%"></div></div>
			${sub(lengkap ? __("Semua lengkap") : __("{0} item belum lengkap", [total - terisi]))}`,
			lengkap ? "dok-tile-ok" : ""
		)}
	</div>`;
}

function html_timeline_kontrak(frm) {
	const { masa, pemeliharaan, mulai, selesai, akhir } = jadwal_kontrak(frm.doc);
	if (!selesai) {
		return `<div class="kp-panel kp-timeline kp-timeline-kosong">
			<div class="kp-panel-judul">${__("Timeline")}</div>
			<div class="text-muted">${__("Timeline muncul setelah Tanggal SPMK dan Masa Pelaksanaan terisi.")}
				<a href="#" class="kp-ke-field" data-field="tanggal_spmk">${__("Isi Tanggal SPMK")}</a></div>
		</div>`;
	}

	const total = masa + pemeliharaan;
	const lebar_pelaksanaan = (masa / total) * 100;
	const hari_ini = frappe.datetime.get_today();
	const hari_ke = frappe.datetime.get_day_diff(hari_ini, mulai); // 0 = hari SPMK
	const posisi = Math.min(Math.max(((hari_ke + 1) / total) * 100, 0), 100);

	let keterangan;
	if (hari_ke < 0) {
		keterangan = __("Mulai {0} hari lagi", [-hari_ke]);
	} else if (hari_ini <= selesai) {
		keterangan = __("Hari ke-{0} dari {1} · sisa {2} hari pelaksanaan", [
			hari_ke + 1,
			masa,
			frappe.datetime.get_day_diff(selesai, hari_ini),
		]);
	} else if (akhir && hari_ini <= akhir) {
		keterangan = __("Masa pemeliharaan · sisa {0} hari", [frappe.datetime.get_day_diff(akhir, hari_ini)]);
	} else {
		keterangan = __("Kontrak selesai");
	}
	const penanda =
		hari_ke >= 0 && posisi < 100
			? `<div class="kp-timeline-hari-ini" style="left: ${posisi}%"><span>${__("Hari ini")}</span></div>`
			: "";

	return `<div class="kp-panel kp-timeline">
		<div class="kp-panel-judul">${__("Timeline")} <span class="kp-panel-judul-sub">${keterangan}</span></div>
		<div class="kp-timeline-bar">
			<div class="kp-timeline-isi" style="width: ${posisi}%"></div>
			<div class="kp-timeline-segmen kp-timeline-pelaksanaan" style="width: ${lebar_pelaksanaan}%">
				<span>${__("Pelaksanaan {0} hari", [masa])}</span></div>
			${
				pemeliharaan
					? `<div class="kp-timeline-segmen kp-timeline-pemeliharaan" style="width: ${100 - lebar_pelaksanaan}%">
						<span>${__("Pemeliharaan {0} hari", [pemeliharaan])}</span></div>`
					: ""
			}
			${penanda}
		</div>
		<div class="kp-timeline-tanggal">
			<div><b>${__("SPMK")}</b><br>${tanggal_kontrak(mulai)}</div>
			<div class="${pemeliharaan ? "" : "text-right"}" style="${pemeliharaan ? `position: absolute; left: ${lebar_pelaksanaan}%; transform: translateX(-50%); text-align: center;` : ""}">
				<b>${__("Selesai (PHO)")}</b><br>${tanggal_kontrak(selesai)}</div>
			${akhir ? `<div class="text-right"><b>${__("Akhir pemeliharaan (FHO)")}</b><br>${tanggal_kontrak(akhir)}</div>` : ""}
		</div>
	</div>`;
}

function html_panel_kelengkapan(frm) {
	const esc = frappe.utils.escape_html;
	const items = frm.__kelengkapan || [];
	const terisi = items.filter((item) => item.ok).length;

	const rows = items
		.map((item) => {
			let aksi;
			if (item.field) {
				aksi = `<button class="btn btn-default btn-xs kp-ke-field" data-field="${item.field}">
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

	return `<div class="kp-panel kp-panel-flush">
		<div class="kp-panel-judul">${__("Kelengkapan Kontrak")}
			${items.length ? `<span class="dok-chip ${terisi === items.length ? "dok-chip-ok" : "dok-chip-kurang"}">${terisi}/${items.length}</span>` : ""}
		</div>
		<div class="kp-kelengkapan">${rows || `<div class="kp-cek text-muted">${__("Memuat checklist…")}</div>`}</div>
		${catatan}
	</div>`;
}

function html_panel_data(frm) {
	const doc = frm.doc;
	const esc = frappe.utils.escape_html;
	const { pemeliharaan } = jadwal_kontrak(doc);
	const kosong = (fieldname) =>
		`<a href="#" class="kp-ke-field kp-data-kosong" data-field="${fieldname}">${__("Belum diisi")}</a>`;
	const baris = (label, nilai, fieldname) =>
		`<div class="kp-data-baris"><div class="kp-data-label">${label}</div>
			<div class="kp-data-nilai">${nilai || (fieldname ? kosong(fieldname) : `<span class="text-muted">—</span>`)}</div></div>`;
	const grup = (judul, isi) => `<div class="kp-data-grup"><div class="kp-data-grup-judul">${judul}</div>${isi}</div>`;
	const persen = (value) => `${format_number(flt(value), null, 2).replace(/[.,]?0+$/, "")}%`;

	const uang_muka = flt(doc.uang_muka_persen);
	const jaminan = (wajib, diserahkan, penerbit, berlaku, teks_tidak_wajib) => {
		if (!wajib) return `<span class="text-muted">${teks_tidak_wajib}</span>`;
		if (!diserahkan) return `<span class="kp-data-kurang">${__("Belum diserahkan")}</span>`;
		return `${esc(penerbit || __("Diserahkan"))}${berlaku ? ` · ${__("s.d.")} ${tanggal_kontrak(berlaku)}` : ""}`;
	};

	return `<div class="kp-panel">
		<div class="kp-panel-judul">${__("Data Kontrak")}</div>
		${grup(
			__("Kontrak"),
			baris(__("Nomor"), esc(doc.nomor_kontrak || ""), "nomor_kontrak") +
				baris(__("Tanggal"), doc.tanggal_kontrak ? tanggal_kontrak(doc.tanggal_kontrak) : "", "tanggal_kontrak") +
				baris(__("Jenis Kontrak"), esc(doc.jenis_kontrak || "")) +
				baris(__("Sumber Dana"), esc(doc.sumber_dana || "")) +
				baris(__("Pemeliharaan"), pemeliharaan ? __("{0} hari", [pemeliharaan]) : "", "masa_pemeliharaan")
		)}
		${grup(
			__("Para Pihak"),
			baris(__("Wakil Pemberi Kerja"), esc(doc.wakil_pemberi_kerja || ""), "wakil_pemberi_kerja") +
				baris(__("Konsultan Pengawas"), esc(doc.konsultan_pengawas || ""), "konsultan_pengawas") +
				baris(__("Project Manager"), doc.project_manager ? esc(frappe.user.full_name(doc.project_manager)) : "", "project_manager")
		)}
		${grup(
			__("Pembayaran"),
			baris(__("Cara Pembayaran"), esc(doc.cara_pembayaran || ""), "cara_pembayaran") +
				baris(
					__("Uang Muka"),
					uang_muka ? `${persen(uang_muka)} · ${rupiah((flt(doc.nilai_kontrak) * uang_muka) / 100)}` : `<span class="text-muted">${__("Tanpa uang muka")}</span>`
				) +
				baris(__("Retensi"), flt(doc.retensi_persen) ? persen(doc.retensi_persen) : "", "retensi_persen") +
				baris(
					__("PPh Final"),
					doc.kualifikasi_usaha ? `${persen(doc.pph_final_persen)} · ${esc(doc.kualifikasi_usaha)}` : "",
					"kualifikasi_usaha"
				)
		)}
		${grup(
			__("Jaminan"),
			baris(
				__("Pelaksanaan"),
				jaminan(
					doc.jaminan_pelaksanaan_wajib,
					doc.jaminan_pelaksanaan_diserahkan,
					doc.jaminan_pelaksanaan_penerbit,
					doc.jaminan_pelaksanaan_berlaku,
					__("Tidak disyaratkan")
				)
			) +
				baris(
					__("Uang Muka"),
					jaminan(
						uang_muka,
						doc.jaminan_uang_muka_diserahkan,
						doc.jaminan_uang_muka_penerbit,
						doc.jaminan_uang_muka_berlaku,
						__("Tidak diperlukan")
					)
				)
		)}
	</div>`;
}

// Rincian nilai kontrak dalam satu baris tabel. Semua angka mengikuti Tender (tidak diedit di sini);
// lebar kolom dikunci (colgroup + table-layout: fixed) supaya tidak bergeser mengikuti isi.
function render_tabel_nilai(frm) {
	const field = frm.fields_dict.nilai_tabel;
	if (!field) return;
	const doc = frm.doc;
	const esc = frappe.utils.escape_html;
	const nilai = flt(doc.nilai_kontrak);
	const kena_ppn = doc.status_ppn === "PPN";
	const tarif = kena_ppn ? flt(doc.tarif_ppn) : 0;
	const sebelum_ppn = nilai / (1 + tarif / 100);
	const kosong = `<span class="text-muted">—</span>`;
	const isi = (value) => (nilai ? rupiah(value) : kosong);

	const sumber = doc.tender
		? `<div class="kp-tabel-sumber text-muted">
			${frappe.utils.icon("info", "xs")}
			${__("Nilai & PPN mengikuti data Tender {0}. Untuk mengubah, edit di Tender.", [
				`<a href="/app/tender/${encodeURIComponent(doc.tender)}">${esc(doc.tender)}</a>`,
			])}
		</div>`
		: "";

	field.$wrapper.html(`<div class="kp-tabel-wrap">
		<table class="kp-tabel kp-tabel-nilai">
			<colgroup>
				<col style="width: 16%">
				<col style="width: 19%">
				<col style="width: 15%">
				<col style="width: 12%">
				<col style="width: 17%">
				<col style="width: 21%">
			</colgroup>
			<thead>
				<tr>
					<th>${__("Uraian")}</th>
					<th class="text-right">${__("Nilai Sebelum PPN")}</th>
					<th>${__("Status PPN")}</th>
					<th class="text-right">${__("Tarif PPN")}</th>
					<th class="text-right">${__("PPN")}</th>
					<th class="text-right">${__("Nilai Kontrak")}<div class="kp-tabel-sub">${__("termasuk PPN")}</div></th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td><b>${__("Kontrak awal")}</b></td>
					<td class="text-right">${isi(sebelum_ppn)}</td>
					<td>${doc.status_ppn ? esc(__(doc.status_ppn)) : kosong}</td>
					<td class="text-right">${kena_ppn ? `${format_number(tarif, null, 0)}%` : kosong}</td>
					<td class="text-right">${tarif ? isi(nilai - sebelum_ppn) : kosong}</td>
					<td class="text-right"><b>${isi(nilai)}</b></td>
				</tr>
			</tbody>
		</table>
	</div>${sumber}`);
}
