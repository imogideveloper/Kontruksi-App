// Form modul Konstruksi (dan Project Master): sidebar form di kanan (Assigned To, Attachments, Tags, Share)
// disembunyikan supaya isi form selebar layar. Fiturnya dipindah ke toolbar atas: tombol "Lampiran" dan grup
// "Kolaborasi" (Tugaskan, Tag, Bagikan) — tetap memakai komponen sidebar Frappe yang tersembunyi (frm.attachments,
// frm.assign_to, frm.shared) supaya perilaku & haknya sama dengan bawaan.
frappe.provide("konstruksi");

const KELAS_TANPA_SIDEBAR = "konstruksi-tanpa-sidebar";

konstruksi.form_konstruksi = function (frm) {
	return Boolean(frm?.meta) && (frm.meta.module === "Konstruksi" || (frm.doctype === "Project" && frm.doc?.kontrak_project));
};

$(document).on("form-refresh", (e, frm) => {
	const aktif = konstruksi.form_konstruksi(frm);
	$("body").toggleClass(KELAS_TANPA_SIDEBAR, aktif);
	if (!aktif || frm.is_new() || !frm.attachments) return;

	pasang_tombol_lampiran(frm);
	pasang_tombol_kolaborasi(frm);
	// Upload / hapus lampiran memanggil attachments.refresh(): jumlah di tombol & dialog ikut diperbarui.
	if (!frm.attachments.__konstruksi) {
		const refresh = frm.attachments.refresh.bind(frm.attachments);
		frm.attachments.refresh = function () {
			refresh();
			pasang_tombol_lampiran(frm);
			if (frm.__dialog_lampiran?.display) render_dialog_lampiran(frm);
		};
		frm.attachments.__konstruksi = true;
	}
	// Penugasan berubah (tambah / hapus): dialog Tugaskan yang terbuka ikut diperbarui.
	if (frm.assign_to && !frm.assign_to.__konstruksi) {
		const render = frm.assign_to.render.bind(frm.assign_to);
		frm.assign_to.render = function (assignments) {
			render(assignments);
			if (frm.__dialog_tugas?.display) render_dialog_tugas(frm);
		};
		frm.assign_to.__konstruksi = true;
	}
});

// Keluar dari form: kembalikan tampilan bawaan (form lain tetap punya sidebar).
$(document).on("page-change", () => {
	if (frappe.get_route()?.[0] !== "Form") $("body").removeClass(KELAS_TANPA_SIDEBAR);
});

function pasang_tombol_lampiran(frm) {
	const jumlah = frm.attachments.get_attachments().length;
	if (frm.__label_lampiran) frm.page.remove_inner_button(frm.__label_lampiran);
	frm.__label_lampiran = jumlah ? __("Lampiran ({0})", [jumlah]) : __("Lampiran");
	frm.add_custom_button(frm.__label_lampiran, () => buka_dialog_lampiran(frm)).prepend(
		`${frappe.utils.icon("attachment", "sm")} `
	);
}

function buka_dialog_lampiran(frm) {
	if (!frm.__dialog_lampiran) {
		frm.__dialog_lampiran = new frappe.ui.Dialog({
			title: __("Lampiran"),
			fields: [{ fieldname: "daftar", fieldtype: "HTML" }],
			primary_action_label: __("Upload File"),
			primary_action: () => frm.attachments.new_attachment(),
		});
	}
	render_dialog_lampiran(frm);
	frm.__dialog_lampiran.show();
	// Hanya user dengan hak ubah yang boleh upload.
	frm.__dialog_lampiran.get_primary_btn().toggle(Boolean(frm.perm?.[0]?.write));
}

function render_dialog_lampiran(frm) {
	const esc = frappe.utils.escape_html;
	const lampiran = [...frm.attachments.get_attachments()].reverse();
	const boleh_hapus = Boolean(frm.perm?.[0]?.write);
	const $daftar = frm.__dialog_lampiran.fields_dict.daftar.$wrapper;

	$daftar.html(
		lampiran.length
			? `<div class="konstruksi-lampiran">${lampiran
					.map(
						(f) => `<div class="konstruksi-lampiran-baris">
							${frappe.utils.icon(f.is_private ? "lock" : "file", "sm")}
							<a href="${encodeURI(f.file_url)}" target="_blank" rel="noopener" class="ellipsis" title="${esc(f.file_name)}">${esc(
							f.file_name || f.file_url
						)}</a>
							${
								boleh_hapus
									? `<button class="btn btn-xs btn-default konstruksi-lampiran-hapus" data-name="${f.name}" title="${__("Hapus")}">
										${frappe.utils.icon("delete", "xs")}</button>`
									: ""
							}
						</div>`
					)
					.join("")}</div>`
			: `<div class="text-muted">${__("Belum ada lampiran.")}</div>`
	);
	$daftar.find(".konstruksi-lampiran-hapus").on("click", function () {
		const name = $(this).attr("data-name");
		frappe.confirm(__("Hapus lampiran ini?"), () => frm.attachments.remove_attachment(name));
	});
}

// ---------------------------------------------------------------------------
// Kolaborasi: Tugaskan, Tag, Bagikan.

function pasang_tombol_kolaborasi(frm) {
	const grup = __("Kolaborasi");
	frm.add_custom_button(__("Tugaskan"), () => buka_dialog_tugas(frm), grup);
	if (!frm.meta.issingle) frm.add_custom_button(__("Tag"), () => buka_dialog_tag(frm), grup);
	if (frm.shared) frm.add_custom_button(__("Bagikan"), () => frm.shared.show(), grup);
}

function buka_dialog_tugas(frm) {
	if (!frm.__dialog_tugas) {
		frm.__dialog_tugas = new frappe.ui.Dialog({
			title: __("Ditugaskan ke"),
			fields: [{ fieldname: "daftar", fieldtype: "HTML" }],
			primary_action_label: __("Tugaskan ke User"),
			primary_action: () => frm.assign_to.add(),
		});
	}
	render_dialog_tugas(frm);
	frm.__dialog_tugas.show();
}

function render_dialog_tugas(frm) {
	const esc = frappe.utils.escape_html;
	const tugas = frm.get_docinfo()?.assignments || [];
	const $daftar = frm.__dialog_tugas.fields_dict.daftar.$wrapper;
	$daftar.html(
		tugas.length
			? `<div class="konstruksi-lampiran">${tugas
					.map(
						(t) => `<div class="konstruksi-lampiran-baris">
							${frappe.avatar(t.owner, "avatar-small")}
							<span class="ellipsis">${esc(frappe.user.full_name(t.owner))}</span>
							<button class="btn btn-xs btn-default konstruksi-tugas-hapus" data-owner="${esc(t.owner)}" title="${__("Hapus penugasan")}">
								${frappe.utils.icon("close", "xs")}</button>
						</div>`
					)
					.join("")}</div>`
			: `<div class="text-muted">${__("Belum ditugaskan ke siapa pun.")}</div>`
	);
	$daftar.find(".konstruksi-tugas-hapus").on("click", function () {
		frm.assign_to.remove($(this).attr("data-owner"));
	});
}

function daftar_tag(frm) {
	return (frm.doc._user_tags || "").split(",").map((t) => t.trim()).filter(Boolean);
}

function buka_dialog_tag(frm) {
	if (!frm.__dialog_tag) {
		frm.__dialog_tag = new frappe.ui.Dialog({
			title: __("Tag"),
			fields: [
				{ fieldname: "daftar", fieldtype: "HTML" },
				{ fieldname: "tag_baru", fieldtype: "Data", label: __("Tambah tag"), placeholder: __("mis. Prioritas, Swasta") },
			],
			primary_action_label: __("Tambah"),
			primary_action(values) {
				const tag = (values.tag_baru || "").trim();
				if (!tag) return;
				frappe
					.xcall("frappe.desk.doctype.tag.tag.add_tag", { tag, dt: frm.doctype, dn: frm.docname })
					.then(() => {
						const tags = daftar_tag(frm);
						if (!tags.includes(tag)) tags.push(tag);
						frm.doc._user_tags = tags.join(",");
						frm.__dialog_tag.set_value("tag_baru", "");
						render_dialog_tag(frm);
					});
			},
		});
	}
	render_dialog_tag(frm);
	frm.__dialog_tag.show();
}

function render_dialog_tag(frm) {
	const esc = frappe.utils.escape_html;
	const tags = daftar_tag(frm);
	const $daftar = frm.__dialog_tag.fields_dict.daftar.$wrapper;
	$daftar.html(
		tags.length
			? `<div class="konstruksi-tag-daftar">${tags
					.map(
						(t) => `<span class="konstruksi-tag">${esc(t)}
							<button class="konstruksi-tag-hapus" data-tag="${esc(t)}" title="${__("Hapus tag")}">${frappe.utils.icon("close", "xs")}</button>
						</span>`
					)
					.join("")}</div>`
			: `<div class="text-muted">${__("Belum ada tag.")}</div>`
	);
	$daftar.find(".konstruksi-tag-hapus").on("click", function () {
		const tag = $(this).attr("data-tag");
		frappe.xcall("frappe.desk.doctype.tag.tag.remove_tag", { tag, dt: frm.doctype, dn: frm.docname }).then(() => {
			frm.doc._user_tags = daftar_tag(frm).filter((t) => t !== tag).join(",");
			render_dialog_tag(frm);
		});
	});
}
