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

// Tab Ringkasan = dashboard kontrak. Menjawab 3 hal secepat mungkin: tahap kontrak (kepala), apa yang harus
// dikerjakan (Perlu Tindakan, hanya muncul bila ada), lalu uang & waktu (kartu + timeline). Detail ada di tab lain.
// Semua dari frm.doc (ikut berubah sebelum disimpan); checklist dari server (frm.__kelengkapan).
// Gaya: kelas kpr-* di konstruksi.bundle.css, terpisah dari Dokumen Tender.

// Peringatan tanggal: jaminan yang habis dalam sekian hari, dan sisa masa pelaksanaan.
const HARI_PERINGATAN_JAMINAN = 30;
const HARI_PERINGATAN_PELAKSANAAN = 14;

function render_ringkasan_kontrak(frm) {
	const field = frm.fields_dict.ringkasan;
	if (!field) return;
	const doc = frm.doc;

	if (!doc.tender) {
		field.$wrapper.html(`<div class="kpr">
			<div class="kpr-card kpr-kosong">
				<div class="kpr-ikon kpr-ikon-biru">${frappe.utils.icon("file-text", "md")}</div>
				<div>${__("Ringkasan kontrak muncul setelah Asal Tender dipilih.")}</div>
				<button class="btn btn-primary btn-sm kp-ke-field" data-field="tender">${__("Pilih Asal Tender")}</button>
			</div>
		</div>`);
		pasang_aksi_ringkasan(frm, field.$wrapper);
		return;
	}

	field.$wrapper.html(`<div class="kpr">
		${html_kepala_kontrak(frm)}
		${html_perlu_tindakan(frm)}
		${html_kartu_kontrak(frm)}
		${frm.__kelengkapan_semua ? html_checklist_kontrak(frm) : ""}
		${html_timeline_kontrak(frm)}
	</div>`);
	pasang_aksi_ringkasan(frm, field.$wrapper);
	field.$wrapper.find(".kpr-lihat-checklist").on("click", (e) => {
		e.preventDefault();
		frm.__kelengkapan_semua = !frm.__kelengkapan_semua;
		render_ringkasan_kontrak(frm);
	});
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
	const titik = '<span class="kpr-titik">•</span>';
	const nomor = doc.nomor_kontrak
		? `${__("Kontrak No.")} <b>${esc(doc.nomor_kontrak)}</b>${doc.tanggal_kontrak ? ` · ${tanggal_kontrak(doc.tanggal_kontrak)}` : ""}`
		: `<a href="#" class="kp-ke-field kpr-tautan-kurang" data-field="nomor_kontrak">${__("Nomor kontrak belum diisi")}</a>`;
	const meta = [
		frm.is_new() ? __("Kontrak baru") : esc(doc.name),
		`<a href="/app/tender/${encodeURIComponent(doc.tender)}">${esc(doc.tender)}</a>`,
		...[doc.pemberi_kerja, doc.lokasi].filter(Boolean).map(esc),
		nomor,
	].join(titik);

	return `<div class="kpr-card kpr-kepala">
		<div class="kpr-kepala-baris">
			<div class="kpr-kepala-judul">${esc(doc.nama_project || "")}</div>
			<span class="indicator-pill ${warna}">${status}</span>
		</div>
		<div class="kpr-kepala-sub">${meta}</div>
	</div>`;
}

// Hal yang perlu ditindaklanjuti: peringatan tanggal (merah = sudah lewat, oranye = segera) lalu item checklist
// yang belum lengkap. Kotak tidak tampil bila tidak ada apa-apa.
function daftar_tindakan(frm) {
	const doc = frm.doc;
	const hari_ini = frappe.datetime.get_today();
	const { selesai } = jadwal_kontrak(doc);
	const tindakan = [];

	// Jaminan hanya perlu berlaku selama pelaksanaan (sampai PHO); setelah itu habisnya tidak diperingatkan.
	const cek_jaminan = (nama, berlaku, aktif, field) => {
		if (!aktif || !berlaku || (selesai && hari_ini > selesai)) return;
		const sisa = frappe.datetime.get_day_diff(berlaku, hari_ini);
		if (sisa < 0) {
			tindakan.push({ tingkat: "merah", judul: __("{0} sudah habis", [nama]), ket: __("Berakhir {0} · minta perpanjangan", [tanggal_kontrak(berlaku)]), field });
		} else if (sisa <= HARI_PERINGATAN_JAMINAN) {
			tindakan.push({ tingkat: "oranye", judul: __("{0} habis dalam {1} hari", [nama, sisa]), ket: __("Berlaku sampai {0}", [tanggal_kontrak(berlaku)]), field });
		}
	};
	cek_jaminan(__("Jaminan pelaksanaan"), doc.jaminan_pelaksanaan_berlaku,
		doc.jaminan_pelaksanaan_wajib && doc.jaminan_pelaksanaan_diserahkan, "jaminan_pelaksanaan_berlaku");
	cek_jaminan(__("Jaminan uang muka"), doc.jaminan_uang_muka_berlaku,
		flt(doc.uang_muka_persen) && doc.jaminan_uang_muka_diserahkan, "jaminan_uang_muka_berlaku");

	if (selesai && doc.tanggal_spmk <= hari_ini && hari_ini <= selesai) {
		const sisa = frappe.datetime.get_day_diff(selesai, hari_ini);
		if (sisa <= HARI_PERINGATAN_PELAKSANAAN) {
			tindakan.push({ tingkat: "oranye", judul: __("Masa pelaksanaan tinggal {0} hari", [sisa]), ket: __("Selesai (PHO) {0}", [tanggal_kontrak(selesai)]), field: "tanggal_spmk" });
		}
	}

	(frm.__kelengkapan || [])
		.filter((item) => !item.ok)
		.forEach((item) => tindakan.push({ tingkat: "oranye", judul: item.label, ket: item.ket, field: item.field, rab: item.rab, tender: frm.doc.tender }));

	return tindakan.sort((a, b) => (a.tingkat === "merah" ? 0 : 1) - (b.tingkat === "merah" ? 0 : 1));
}

function tombol_tindakan(item) {
	if (item.field) return `<button class="btn btn-xs kpr-aksi-isi kp-ke-field" data-field="${item.field}">${__("Isi")} →</button>`;
	if (item.rab) return `<a class="btn btn-xs kpr-aksi-isi" href="/app/rab-penawaran/${encodeURIComponent(item.rab)}">${__("Buka RAB")} →</a>`;
	return `<a class="btn btn-xs kpr-aksi-isi" href="/app/rab-penawaran/new?tender=${encodeURIComponent(item.tender || "")}">${__("Buat RAB")} →</a>`;
}

function html_perlu_tindakan(frm) {
	const esc = frappe.utils.escape_html;
	const tindakan = daftar_tindakan(frm);
	if (!tindakan.length) return "";
	const ada_merah = tindakan.some((item) => item.tingkat === "merah");

	return `<div class="kpr-card kpr-tindakan ${ada_merah ? "kpr-tindakan-merah" : ""}">
		<div class="kpr-tindakan-judul">${frappe.utils.icon("circle-alert", "sm")} ${__("Perlu Tindakan")}
			<span class="kpr-badge kpr-badge-${ada_merah ? "merah" : "kurang"}">${tindakan.length}</span></div>
		${tindakan
			.map(
				(item) => `<div class="kpr-tindakan-baris kpr-tingkat-${item.tingkat}">
					<span class="kpr-tindakan-titik"></span>
					<div class="kpr-tindakan-info"><b>${esc(item.judul)}</b><span>${esc(item.ket || "")}</span></div>
					${tombol_tindakan(item)}
				</div>`
			)
			.join("")}
		${frm.is_dirty() ? `<div class="kpr-catatan">${__("Sudah mengikuti isian terbaru. Jangan lupa simpan.")}</div>` : ""}
	</div>`;
}

function html_kartu_kontrak(frm) {
	const doc = frm.doc;
	const { masa, mulai, selesai, akhir } = jadwal_kontrak(doc);
	const nilai = flt(doc.nilai_kontrak);
	const tarif = doc.status_ppn === "PPN" ? flt(doc.tarif_ppn) : 0;
	const sebelum_ppn = nilai / (1 + tarif / 100);
	const hari_ini = frappe.datetime.get_today();

	const items = frm.__kelengkapan || [];
	const total = items.length;
	const terisi = items.filter((item) => item.ok).length;
	const lengkap = total && terisi === total;

	const kartu = (ikon, warna, label, nilai_html, sub_html) => `<div class="kpr-card kpr-kartu">
		<div class="kpr-kartu-atas">
			<div class="kpr-ikon kpr-ikon-${warna}">${frappe.utils.icon(ikon, "sm")}</div>
			<div class="kpr-kartu-label">${label}</div>
		</div>
		<div class="kpr-kartu-nilai">${nilai_html}</div>
		<div class="kpr-kartu-sub">${sub_html}</div>
	</div>`;
	const progress = (persen, kelas = "") =>
		`<div class="kpr-progress ${kelas}"><div style="width: ${Math.min(Math.max(persen, 0), 100)}%"></div></div>`;

	// Sisa waktu sesuai tahap kontrak.
	let waktu_nilai = "—";
	let waktu_sub = `<a href="#" class="kp-ke-field" data-field="tanggal_spmk">${__("Isi tanggal SPMK")} →</a>`;
	if (selesai) {
		const terpakai = frappe.datetime.get_day_diff(hari_ini, mulai) + 1;
		if (hari_ini < mulai) {
			waktu_nilai = `${-frappe.datetime.get_day_diff(hari_ini, mulai)} <span>${__("hari lagi")}</span>`;
			waktu_sub = __("Mulai {0} · {1} hari kerja", [tanggal_kontrak(mulai), masa]);
		} else if (hari_ini <= selesai) {
			const persen = Math.round((terpakai / masa) * 100);
			waktu_nilai = `${frappe.datetime.get_day_diff(selesai, hari_ini)} <span>${__("hari lagi")}</span>`;
			waktu_sub = progress(persen, persen > 85 ? "" : "kpr-progress-biru") + __("{0}% waktu terpakai · selesai {1}", [persen, tanggal_kontrak(selesai)]);
		} else if (akhir && hari_ini <= akhir) {
			waktu_nilai = __("Pemeliharaan");
			waktu_sub = __("Sisa {0} hari · sampai {1}", [frappe.datetime.get_day_diff(akhir, hari_ini), tanggal_kontrak(akhir)]);
		} else {
			waktu_nilai = __("Selesai");
			waktu_sub = __("Berakhir {0}", [tanggal_kontrak(akhir || selesai)]);
		}
	}

	return `<div class="kpr-kartu-baris kpr-kartu-3">
		${kartu(
			"wallet",
			"biru",
			__("Nilai Kontrak"),
			nilai ? rupiah(nilai) : "—",
			nilai ? (tarif ? __("{0} sebelum PPN {1}%", [rupiah(sebelum_ppn), format_number(tarif, null, 0)]) : __("Tidak kena PPN")) : __("Belum ada nilai")
		)}
		${kartu("calendar", "ungu", __("Sisa Waktu"), waktu_nilai, waktu_sub)}
		${kartu(
			"clipboard-check",
			lengkap ? "hijau" : "oranye",
			__("Kelengkapan"),
			total ? `${terisi}<span>/${total}</span>` : "—",
			progress(total ? (terisi / total) * 100 : 0, lengkap ? "kpr-progress-ok" : "") +
				`${lengkap ? __("Semua lengkap") : __("{0} belum beres", [total - terisi])} ·
				<a href="#" class="kpr-lihat-checklist">${frm.__kelengkapan_semua ? __("Tutup checklist") : __("Lihat checklist")}</a>`
		)}
	</div>`;
}

// Checklist lengkap, hanya saat dibuka dari kartu Kelengkapan.
function html_checklist_kontrak(frm) {
	const esc = frappe.utils.escape_html;
	const rows = (frm.__kelengkapan || [])
		.map(
			(item) => `<div class="kpr-cek ${item.ok ? "kpr-cek-ok" : "kpr-cek-kurang"}">
				<span class="kpr-cek-ikon">${frappe.utils.icon(item.ok ? "check" : "circle-alert", "xs")}</span>
				<div class="kpr-cek-info">
					<div class="kpr-cek-label">${esc(item.label)}</div>
					<div class="kpr-cek-ket">${esc(item.ket || "")}</div>
				</div>
				<div class="kpr-cek-aksi">${
					item.ok
						? item.field
							? `<button class="kpr-aksi-ikon kp-ke-field" data-field="${item.field}" title="${__("Ubah")}">${frappe.utils.icon("edit", "xs")}</button>`
							: ""
						: tombol_tindakan({ ...item, tender: frm.doc.tender })
				}</div>
			</div>`
		)
		.join("");
	return `<div class="kpr-card">
		<div class="kpr-judul">${__("Checklist Kelengkapan")}
			<a href="#" class="kpr-lihat-checklist kpr-lihat-semua">${__("Tutup")}</a></div>
		<div class="kpr-cek-daftar">${rows}</div>
	</div>`;
}

function html_timeline_kontrak(frm) {
	const { masa, pemeliharaan, mulai, selesai, akhir } = jadwal_kontrak(frm.doc);
	if (!selesai) {
		return `<div class="kpr-card">
			<div class="kpr-judul">${__("Timeline")}</div>
			<div class="kpr-muted">${__("Timeline muncul setelah Tanggal SPMK dan Masa Pelaksanaan terisi.")}
				<a href="#" class="kp-ke-field" data-field="tanggal_spmk">${__("Isi Tanggal SPMK")} →</a></div>
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
		keterangan = __("Hari ke-{0} dari {1} · sisa {2} hari", [hari_ke + 1, masa, frappe.datetime.get_day_diff(selesai, hari_ini)]);
	} else if (akhir && hari_ini <= akhir) {
		keterangan = __("Masa pemeliharaan · sisa {0} hari", [frappe.datetime.get_day_diff(akhir, hari_ini)]);
	} else {
		keterangan = __("Kontrak selesai");
	}

	// Titik hari ini di bawah bar (label di bawah titik) supaya tidak menimpa teks apa pun.
	const penanda =
		hari_ke >= 0 && posisi < 100
			? `<div class="kpr-tl-hari-ini" style="left: ${posisi}%"><span>${__("Hari ini")}</span></div>`
			: "";
	const milestone = (kelas, judul, tanggal, posisi_persen, rata) =>
		`<div class="kpr-tl-milestone ${kelas}" style="left: ${posisi_persen}%; --rata: ${rata}">
			<div class="kpr-tl-milestone-judul">${judul}</div>
			<div class="kpr-tl-milestone-tanggal">${tanggal_kontrak(tanggal)}</div>
		</div>`;

	return `<div class="kpr-card">
		<div class="kpr-judul">${__("Timeline")}
			<span class="kpr-badge">${keterangan}</span>
			<span class="kpr-legenda">
				<span><i class="kpr-dot kpr-dot-biru"></i>${__("Pelaksanaan {0} hari", [masa])}</span>
				${pemeliharaan ? `<span><i class="kpr-dot kpr-dot-ungu"></i>${__("Pemeliharaan {0} hari", [pemeliharaan])}</span>` : ""}
			</span>
		</div>
		<div class="kpr-tl">
			<div class="kpr-tl-bar">
				<div class="kpr-tl-segmen kpr-tl-pelaksanaan" style="width: ${lebar_pelaksanaan}%">
					<div class="kpr-tl-isi" style="width: ${Math.min((posisi / lebar_pelaksanaan) * 100, 100)}%"></div>
				</div>
				${
					pemeliharaan
						? `<div class="kpr-tl-segmen kpr-tl-pemeliharaan" style="width: ${100 - lebar_pelaksanaan}%">
							<div class="kpr-tl-isi" style="width: ${Math.max(((posisi - lebar_pelaksanaan) / (100 - lebar_pelaksanaan)) * 100, 0)}%"></div>
						</div>`
						: ""
				}
			</div>
			${penanda}
			<div class="kpr-tl-milestones">
				${milestone("", __("SPMK"), mulai, 0, "0%")}
				${milestone("", __("Selesai (PHO)"), selesai, lebar_pelaksanaan, akhir ? "-50%" : "-100%")}
				${akhir ? milestone("", __("Akhir Pemeliharaan (FHO)"), akhir, 100, "-100%") : ""}
			</div>
		</div>
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
