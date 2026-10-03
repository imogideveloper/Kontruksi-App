// Copyright (c) 2026, Imogi Indonesia and contributors
// For license information, please see license.txt

const DOK_METHOD = "konstruksi.konstruksi.doctype.dokumen_tender.dokumen_tender";

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

frappe.ui.form.on("Dokumen Tender", {
	refresh(frm) {
		tambah_tombol(frm);
		render_checklist(frm);
	},

	tender(frm) {
		// Checklist dibuat server saat simpan; langsung simpan supaya user bisa mulai unggah.
		if (frm.is_new() && frm.doc.tender) {
			setTimeout(() => frm.save(), 300);
		}
	},
});

function tambah_tombol(frm) {
	if (frm.is_new()) return;
	frm.add_custom_button(__("Buka Tender"), () => frappe.set_route("Form", "Tender", frm.doc.tender));
	if (!bisa_ubah(frm)) return;

	if (frm.doc.jenis_project) {
		frm.add_custom_button(__("Muat Template {0}", [frm.doc.jenis_project]), () => muat_template(frm));
	}

	if (frm.doc.diajukan_pada) {
		frm.add_custom_button(__("Batalkan Pengajuan"), () => batalkan_pengajuan(frm));
	} else {
		frm.add_custom_button(__("Ajukan Penawaran"), () => ajukan_penawaran(frm)).addClass("btn-primary");
	}
}

function bisa_ubah(frm) {
	return Boolean(frm.perm?.[0]?.write);
}

// Section sesuai master Kategori Dokumen Tender (urut), ditambah section yang masih dipakai checklist tapi
// tidak ada di master, supaya dokumennya tetap tampil.
function daftar_kategori(frm) {
	const daftar = (frm.doc.__onload?.kategori || []).map((k) => ({
		nama: k.name,
		sub: k.subjudul,
		bebas_kunci: cint(k.bebas_kunci),
	}));
	(frm.doc.items || []).forEach((item) => {
		if (item.kategori && !daftar.some((k) => k.nama === item.kategori)) {
			daftar.push({ nama: item.kategori, sub: "", bebas_kunci: 0 });
		}
	});
	return daftar;
}

function terkunci(frm, kategori) {
	const k = daftar_kategori(frm).find((k) => k.nama === kategori);
	return Boolean(frm.doc.diajukan_pada) && !k?.bebas_kunci;
}

function panggil(frm, method, args = {}) {
	return frappe
		.call({ method: `${DOK_METHOD}.${method}`, args: { name: frm.doc.name, ...args }, freeze: true })
		.then(() => frm.reload_doc());
}

// ---------------------------------------------------------------------------
// Format tampilan

function format_tanggal(value, dengan_jam = false) {
	if (!value) return "";
	const m = moment(value);
	const tanggal = `${m.format("DD")} ${BULAN[m.month()]} ${m.format("YYYY")}`;
	return dengan_jam ? `${tanggal}, ${m.format("HH:mm")}` : tanggal;
}

function format_ukuran(byte) {
	byte = flt(byte);
	if (byte >= 1024 * 1024) return `${format_number(byte / 1024 / 1024, null, 1)} MB`;
	if (byte >= 1024) return `${Math.round(byte / 1024)} KB`;
	return `${byte} B`;
}

function jenis_file(nama) {
	const ext = (nama || "").split(".").pop().toLowerCase();
	const jenis = {
		pdf: ["PDF", "pdf"],
		doc: ["DOC", "doc"],
		docx: ["DOC", "doc"],
		xls: ["XLS", "xls"],
		xlsx: ["XLS", "xls"],
		csv: ["CSV", "xls"],
		png: ["IMG", "img"],
		jpg: ["IMG", "img"],
		jpeg: ["IMG", "img"],
		webp: ["IMG", "img"],
		zip: ["ZIP", "zip"],
		rar: ["RAR", "zip"],
		dwg: ["DWG", "dwg"],
	};
	return jenis[ext] || [ext.slice(0, 4).toUpperCase() || "FILE", "lain"];
}

// Sisa waktu sampai batas pemasukan: [teks, tingkat] — tingkat: lewat / mendesak / dekat / aman.
function sisa_waktu(batas) {
	if (!batas) return [__("Belum diisi di Tender"), "aman"];
	const jam = moment(batas).diff(moment(), "hours", true);
	if (jam < 0) return [__("Sudah lewat"), "lewat"];
	if (jam < 24) return [__("{0} jam lagi", [Math.max(Math.floor(jam), 1)]), "mendesak"];
	const hari = moment(batas).startOf("day").diff(moment().startOf("day"), "days");
	return [__("{0} hari lagi", [hari]), hari <= 3 ? "dekat" : "aman"];
}

// ---------------------------------------------------------------------------
// Checklist dokumen

function status_item(item, files) {
	if (files.length) return "lengkap";
	if (item.tidak_diperlukan) return "tidak-perlu";
	return item.wajib ? "kurang" : "opsional";
}

function render_checklist(frm) {
	const field = frm.fields_dict.checklist;
	if (!field) return;
	const esc = frappe.utils.escape_html;

	if (frm.is_new()) {
		field.$wrapper.html(`<div class="dok-kosong">
			${frappe.utils.icon("file-text", "lg")}
			<div>${__(
				"Pilih Tender di atas. Daftar dokumen dibuat otomatis dari Template Dokumen di Jenis Project tender tersebut."
			)}</div>
		</div>`);
		return;
	}

	const state = (frm.__dok = frm.__dok || { tutup: new Set(), filter: "semua" });
	const items = frm.doc.items || [];
	const files_per_item = {};
	(frm.doc.files || []).forEach((f) => (files_per_item[f.item] = files_per_item[f.item] || []).push(f));
	const files_of = (item) => files_per_item[item.name] || [];

	const jumlah = { semua: items.length, belum: 0, lengkap: 0 };
	items.forEach((item) => {
		const status = status_item(item, files_of(item));
		if (status === "lengkap") jumlah.lengkap++;
		if (status === "kurang" || status === "opsional") jumlah.belum++;
	});
	const cocok_filter = (item) => {
		const status = status_item(item, files_of(item));
		if (state.filter === "belum") return status === "kurang" || status === "opsional";
		if (state.filter === "lengkap") return status === "lengkap";
		return true;
	};

	const sections = daftar_kategori(frm).map((kategori) => {
		const semua = items.filter((item) => item.kategori === kategori.nama);
		const tampil = semua.filter(cocok_filter);
		if (!semua.length || (state.filter !== "semua" && !tampil.length)) return "";
		return render_kategori(frm, kategori, semua, tampil, files_of, state);
	}).join("");

	const filter_btn = (key, label) =>
		`<button class="btn btn-sm ${state.filter === key ? "dok-filter-aktif" : "btn-default"}" data-filter="${key}">
			${label} <span class="dok-filter-jumlah">${jumlah[key]}</span>
		</button>`;

	field.$wrapper.html(`
		<div class="dok-tender">
			${render_ringkasan(frm, items, files_of)}
			${
				frm.doc.diajukan_pada
					? `<div class="dok-banner">${frappe.utils.icon("lock", "sm")}
						<span>${__(
							"Penawaran sudah diajukan pada {0}. Dokumen penawaran dikunci sesuai yang dikirim ke panitia, tapi bagian <b>Hasil</b> tetap bisa diisi.",
							[format_tanggal(frm.doc.diajukan_pada, true)]
						)}</span></div>`
					: ""
			}
			<div class="dok-toolbar">
				<div class="dok-filter">
					${filter_btn("semua", __("Semua"))}
					${filter_btn("belum", __("Belum ada file"))}
					${filter_btn("lengkap", __("Sudah ada file"))}
				</div>
				<div class="dok-toolbar-kanan text-muted">
					${__("Seret file langsung ke baris dokumen untuk mengunggah.")}
				</div>
			</div>
			${sections || render_kosong(frm)}
		</div>`);

	pasang_event(frm, field.$wrapper, state);
}

function render_kosong(frm) {
	if (items_kosong(frm)) {
		const boleh = bisa_ubah(frm);
		return `<div class="dok-kosong">
			${frappe.utils.icon("file-text", "lg")}
			<div>${
				frm.doc.jenis_project
					? __("Checklist masih kosong. Isi Template Dokumen di Jenis Project {0}, lalu klik Muat Template.", [
							`<a href="/app/jenis-project/${encodeURIComponent(frm.doc.jenis_project)}">${frappe.utils.escape_html(
								frm.doc.jenis_project
							)}</a>`,
					  ])
					: __("Checklist masih kosong. Isi Jenis Project di Tender untuk memakai template dokumennya.")
			}</div>
			${
				boleh
					? `<button class="btn btn-default btn-sm dok-tambah-dokumen">${frappe.utils.icon("add", "sm")} ${__(
							"Tambah dokumen manual"
					  )}</button>`
					: ""
			}
		</div>`;
	}
	return `<div class="dok-kosong">${__("Tidak ada dokumen yang cocok dengan filter.")}</div>`;
}

function items_kosong(frm) {
	return !(frm.doc.items || []).length;
}

function render_ringkasan(frm, items, files_of) {
	const wajib = items.filter((item) => item.wajib);
	const lengkap = wajib.filter((item) => files_of(item).length).length;
	const persen = wajib.length ? Math.round((lengkap / wajib.length) * 100) : 100;
	const kurang = wajib.length - lengkap;
	const total_ukuran = (frm.doc.files || []).reduce((s, f) => s + flt(f.ukuran), 0);
	const opsional_terisi = items.filter((item) => !item.wajib && files_of(item).length).length;
	const [teks_sisa, tingkat_sisa] = sisa_waktu(frm.doc.batas_pemasukan);
	const diajukan = frm.doc.diajukan_pada;

	return `<div class="dok-ringkasan">
		<div class="dok-tile ${kurang ? "" : "dok-tile-ok"}">
			<div class="dok-tile-label">${__("Dokumen wajib")}</div>
			<div class="dok-tile-nilai">${lengkap} <span>/ ${wajib.length}</span></div>
			<div class="dok-progress"><div style="width: ${persen}%"></div></div>
			<div class="dok-tile-sub">${
				kurang ? __("{0} dokumen wajib belum ada file", [kurang]) : __("Semua dokumen wajib lengkap")
			}</div>
		</div>
		<div class="dok-tile">
			<div class="dok-tile-label">${__("File terunggah")}</div>
			<div class="dok-tile-nilai">${(frm.doc.files || []).length} <span>${__("file")}</span></div>
			<div class="dok-tile-sub">${format_ukuran(total_ukuran)} · ${__("{0} dokumen opsional terisi", [
				opsional_terisi,
			])}</div>
		</div>
		<div class="dok-tile">
			<div class="dok-tile-label">${__("Batas pemasukan")}</div>
			<div class="dok-tile-nilai dok-tile-nilai-kecil">${
				frm.doc.batas_pemasukan ? format_tanggal(frm.doc.batas_pemasukan, true) : "–"
			}</div>
			<div class="dok-tile-sub"><span class="dok-sisa dok-sisa-${diajukan ? "aman" : tingkat_sisa}">${
				diajukan ? __("Penawaran sudah diajukan") : teks_sisa
			}</span></div>
		</div>
		<div class="dok-tile">
			<div class="dok-tile-label">${__("Penawaran")}</div>
			<div class="dok-tile-nilai dok-tile-nilai-kecil">${
				diajukan ? format_tanggal(diajukan, true) : __("Belum diajukan")
			}</div>
			<div class="dok-tile-sub">${__("Status tender")}: <b>${__(frm.doc.status_tender || "–")}</b></div>
		</div>
	</div>`;
}

function render_kategori(frm, kategori, semua, tampil, files_of, state) {
	const esc = frappe.utils.escape_html;
	const kunci = terkunci(frm, kategori.nama);
	const tutup = state.tutup.has(kategori.nama);
	const wajib = semua.filter((item) => item.wajib);
	const wajib_ok = wajib.filter((item) => files_of(item).length).length;
	const terisi = semua.filter((item) => files_of(item).length).length;

	const chip = wajib.length
		? `<span class="dok-chip ${wajib_ok === wajib.length ? "dok-chip-ok" : "dok-chip-kurang"}">${__(
				"{0}/{1} wajib",
				[wajib_ok, wajib.length]
		  )}</span>`
		: `<span class="dok-chip">${__("{0}/{1} terisi", [terisi, semua.length])}</span>`;

	let rab = "";
	if (kategori.nama === "Harga") {
		const daftar = frm.doc.__onload?.rab_penawaran || [];
		rab = daftar.length
			? `<a class="dok-rab-link" href="/app/rab-penawaran/${encodeURIComponent(daftar[0].name)}">
				${frappe.utils.icon("calculator", "sm")} ${__("RAB Penawaran")} ${esc(daftar[0].name)} · ${format_currency(
					daftar[0].total_rab,
					"IDR",
					0
			  )}</a>`
			: `<a class="dok-rab-link" href="/app/rab-penawaran/new?tender=${encodeURIComponent(frm.doc.tender)}">
				${frappe.utils.icon("add", "sm")} ${__("Buat RAB Penawaran")}</a>`;
	}

	return `<div class="dok-kategori ${tutup ? "tertutup" : ""}" data-kategori="${esc(kategori.nama)}">
		<div class="dok-kategori-head">
			<span class="dok-chevron">${frappe.utils.icon("down", "sm")}</span>
			<span class="dok-kategori-nama">${esc(__(kategori.nama))}</span>
			<span class="dok-kategori-sub">${kategori.sub ? esc(__(kategori.sub)) : ""}</span>
			${chip}
			${kunci ? `<span class="dok-chip dok-chip-kunci">${frappe.utils.icon("lock", "xs")} ${__("terkunci")}</span>` : ""}
			<span class="dok-kategori-kanan">${rab}</span>
		</div>
		<div class="dok-kategori-body">
			${tampil.map((item) => render_item(frm, item, files_of(item), kunci)).join("")}
			${
				!kunci && bisa_ubah(frm) && state.filter === "semua"
					? `<button class="btn btn-link btn-sm dok-tambah-dokumen" data-kategori="${esc(kategori.nama)}">
						${frappe.utils.icon("add", "sm")} ${__("Tambah dokumen lain")}</button>`
					: ""
			}
		</div>
	</div>`;
}

function render_item(frm, item, files, kunci) {
	const esc = frappe.utils.escape_html;
	const status = status_item(item, files);
	const boleh_ubah = !kunci && bisa_ubah(frm);
	const ikon_status = {
		lengkap: frappe.utils.icon("check", "sm"),
		kurang: frappe.utils.icon("circle-alert", "sm"),
		opsional: "",
		"tidak-perlu": frappe.utils.icon("minus", "sm"),
	}[status];
	const tag = item.wajib
		? `<span class="dok-tag dok-tag-wajib">${__("Wajib")}</span>`
		: `<span class="dok-tag">${__("Bila ada")}</span>`;

	let isi_file;
	if (files.length) {
		isi_file = files.map((f) => render_file(f, boleh_ubah)).join("");
	} else if (item.tidak_diperlukan) {
		isi_file = `<div class="dok-file-kosong dok-file-kosong-diam">${__("Tidak diperlukan di tender ini")}</div>`;
	} else if (boleh_ubah) {
		isi_file = `<button class="dok-file-kosong dok-unggah" data-item="${item.name}">
			${frappe.utils.icon("upload", "sm")} ${__("Seret file ke sini atau klik untuk unggah")}</button>`;
	} else {
		isi_file = `<div class="dok-file-kosong dok-file-kosong-diam">${__("Belum ada file")}</div>`;
	}

	const menu = [];
	if (boleh_ubah) {
		if (files.length) menu.push(["unggah", __("Unggah file lagi")]);
		if (!item.wajib) {
			menu.push(
				item.tidak_diperlukan
					? ["perlu", __("Tandai diperlukan")]
					: ["tidak-perlu", __("Tandai tidak diperlukan")]
			);
		}
		menu.push(["ubah", __("Ubah nama / keterangan")]);
		if (!files.length) menu.push(["hapus", __("Hapus dari daftar")]);
	}

	return `<div class="dok-item dok-status-${status} ${boleh_ubah ? "dok-bisa-drop" : ""}" data-item="${item.name}">
		<div class="dok-item-status" title="${esc(
			{
				lengkap: __("Sudah ada file"),
				kurang: __("Wajib, belum ada file"),
				opsional: __("Opsional, belum ada file"),
				"tidak-perlu": __("Tidak diperlukan"),
			}[status]
		)}">${ikon_status}</div>
		<div class="dok-item-info">
			<div class="dok-item-nama">${esc(item.nama_dokumen)} ${tag}</div>
			${item.keterangan ? `<div class="dok-item-ket">${esc(item.keterangan)}</div>` : ""}
		</div>
		<div class="dok-item-files">${isi_file}</div>
		<div class="dok-item-aksi">
			${
				menu.length
					? `<div class="dropdown">
						<button class="btn btn-default btn-sm dok-menu-btn" data-toggle="dropdown" title="${__("Aksi")}">
							${frappe.utils.icon("dot-horizontal", "sm")}</button>
						<div class="dropdown-menu dropdown-menu-right">
							${menu
								.map(
									([aksi, label]) =>
										`<a class="dropdown-item ${aksi === "hapus" ? "text-danger" : ""}" data-aksi="${aksi}" data-item="${
											item.name
										}">${label}</a>`
								)
								.join("")}
						</div>
					</div>`
					: ""
			}
		</div>
	</div>`;
}

function render_file(f, boleh_hapus) {
	const esc = frappe.utils.escape_html;
	const [label, kelas] = jenis_file(f.nama_file || f.file_url);
	const url = encodeURI(f.file_url);
	return `<div class="dok-file">
		<span class="dok-file-jenis dok-jenis-${kelas}">${label}</span>
		<div class="dok-file-info">
			<a class="dok-file-nama" href="${url}" target="_blank" rel="noopener" title="${esc(f.nama_file || "")}">${esc(
				f.nama_file || f.file_url
			)}</a>
			<div class="dok-file-meta">${format_ukuran(f.ukuran)} · ${format_tanggal(f.diunggah_pada)} · ${esc(
				frappe.user.full_name(f.diunggah_oleh)
			)}</div>
		</div>
		<a class="btn btn-xs btn-default dok-file-btn" href="${url}" download title="${__("Unduh")}">${frappe.utils.icon(
			"download",
			"xs"
		)}</a>
		${
			boleh_hapus
				? `<button class="btn btn-xs btn-default dok-file-btn dok-hapus-file" data-row="${f.name}" title="${__(
						"Hapus file"
				  )}">${frappe.utils.icon("trash-2", "xs")}</button>`
				: ""
		}
	</div>`;
}

function pasang_event(frm, $w, state) {
	$w.find(".dok-filter [data-filter]").on("click", function () {
		state.filter = $(this).attr("data-filter");
		render_checklist(frm);
	});
	$w.find(".dok-kategori-head").on("click", function (e) {
		if ($(e.target).closest("a").length) return;
		const kategori = $(this).closest(".dok-kategori").attr("data-kategori");
		state.tutup.has(kategori) ? state.tutup.delete(kategori) : state.tutup.add(kategori);
		$(this).closest(".dok-kategori").toggleClass("tertutup");
	});
	$w.find(".dok-unggah").on("click", function () {
		unggah(frm, $(this).attr("data-item"));
	});
	$w.find(".dok-hapus-file").on("click", function () {
		const row = $(this).attr("data-row");
		const f = (frm.doc.files || []).find((d) => d.name === row);
		frappe.confirm(__("Hapus file <b>{0}</b>?", [frappe.utils.escape_html(f?.nama_file || "")]), () =>
			panggil(frm, "hapus_file", { row })
		);
	});
	$w.find(".dok-tambah-dokumen").on("click", function () {
		dialog_dokumen(frm, { kategori: $(this).attr("data-kategori") });
	});
	$w.find(".dropdown-item[data-aksi]").on("click", function () {
		const item_id = $(this).attr("data-item");
		const item = (frm.doc.items || []).find((d) => d.name === item_id);
		({
			unggah: () => unggah(frm, item_id),
			perlu: () => panggil(frm, "set_tidak_diperlukan", { item: item_id, nilai: 0 }),
			"tidak-perlu": () => panggil(frm, "set_tidak_diperlukan", { item: item_id, nilai: 1 }),
			ubah: () => dialog_dokumen(frm, item),
			hapus: () =>
				frappe.confirm(__("Hapus <b>{0}</b> dari daftar dokumen?", [frappe.utils.escape_html(item.nama_dokumen)]), () =>
					panggil(frm, "hapus_dokumen", { item: item_id })
				),
		})[$(this).attr("data-aksi")]();
	});

	// Seret & lepas file langsung ke baris dokumen.
	$w.find(".dok-item.dok-bisa-drop")
		.on("dragover", function (e) {
			if (!Array.from(e.originalEvent.dataTransfer?.types || []).includes("Files")) return;
			e.preventDefault();
			$(this).addClass("dok-drop-aktif");
		})
		.on("dragleave", function (e) {
			if (!this.contains(e.originalEvent.relatedTarget)) $(this).removeClass("dok-drop-aktif");
		})
		.on("drop", function (e) {
			e.preventDefault();
			$(this).removeClass("dok-drop-aktif");
			const files = e.originalEvent.dataTransfer?.files;
			if (files?.length) unggah(frm, $(this).attr("data-item"), files);
		});
}

// ---------------------------------------------------------------------------
// Aksi

function unggah(frm, item_id, files) {
	const item = (frm.doc.items || []).find((d) => d.name === item_id);
	let antre = Promise.resolve();
	let sisa = 0;

	new frappe.ui.FileUploader({
		doctype: frm.doctype,
		docname: frm.doc.name,
		files,
		allow_multiple: true,
		disable_file_browser: true,
		dialog_title: __("Unggah: {0}", [item?.nama_dokumen || ""]),
		on_success(file_doc) {
			if (!file_doc?.file_url) return;
			sisa++;
			// Satu per satu agar baris file tidak saling menimpa; muat ulang setelah yang terakhir.
			antre = antre
				.then(() =>
					frappe.call(`${DOK_METHOD}.tambah_file`, {
						name: frm.doc.name,
						item: item_id,
						file_url: file_doc.file_url,
					})
				)
				.finally(() => {
					if (--sisa === 0) frm.reload_doc();
				});
		},
	});
}

function dialog_dokumen(frm, item) {
	const ubah = Boolean(item?.name);
	const dialog = new frappe.ui.Dialog({
		title: ubah ? __("Ubah Dokumen") : __("Tambah Dokumen"),
		fields: [
			{
				fieldname: "kategori",
				fieldtype: "Select",
				label: __("Section"),
				options: daftar_kategori(frm)
					.filter((k) => !terkunci(frm, k.nama))
					.map((k) => k.nama)
					.join("\n"),
				default: item?.kategori,
				reqd: 1,
			},
			{
				fieldname: "nama_dokumen",
				fieldtype: "Data",
				label: __("Nama Dokumen"),
				default: item?.nama_dokumen,
				reqd: 1,
			},
			{ fieldname: "keterangan", fieldtype: "Small Text", label: __("Keterangan"), default: item?.keterangan },
			{
				fieldname: "wajib",
				fieldtype: "Check",
				label: __("Wajib (dihitung di kelengkapan)"),
				default: item?.wajib || 0,
			},
		],
		primary_action_label: ubah ? __("Simpan") : __("Tambah"),
		primary_action(values) {
			dialog.hide();
			panggil(frm, "simpan_dokumen", { ...values, item: item?.name });
		},
	});
	dialog.show();
}

function muat_template(frm) {
	frappe
		.call({ method: `${DOK_METHOD}.muat_template`, args: { name: frm.doc.name }, freeze: true })
		.then((r) => {
			frappe.show_alert({
				message: r.message
					? __("{0} dokumen ditambahkan dari template.", [r.message])
					: __("Semua dokumen di template sudah ada di checklist."),
				indicator: r.message ? "green" : "blue",
			});
			if (r.message) frm.reload_doc();
		});
}

function ajukan_penawaran(frm) {
	const kurang = (frm.doc.items || []).filter(
		(item) => item.wajib && !(frm.doc.files || []).some((f) => f.item === item.name)
	);
	const dikunci = daftar_kategori(frm)
		.filter((k) => !k.bebas_kunci)
		.map((k) => frappe.utils.escape_html(__(k.nama)))
		.join(", ");
	let pesan = __(
		"Dokumen {0} akan dikunci, dan status tender berubah menjadi <b>Penawaran Dikirim</b>.",
		[dikunci]
	);
	if (kurang.length) {
		pesan =
			`<p class="text-danger">${__("{0} dokumen wajib belum ada file:", [kurang.length])}</p>
			<ul>${kurang.map((item) => `<li>${frappe.utils.escape_html(item.nama_dokumen)}</li>`).join("")}</ul>
			<p>${pesan}</p><p>${__("Tetap ajukan?")}</p>`;
	}
	frappe.confirm(pesan, () => panggil(frm, "ajukan_penawaran"));
}

function batalkan_pengajuan(frm) {
	frappe.confirm(
		__("Batalkan pengajuan? Dokumen penawaran bisa diubah lagi, dan status tender kembali ke <b>Persiapan</b>."),
		() => panggil(frm, "batalkan_pengajuan")
	);
}
