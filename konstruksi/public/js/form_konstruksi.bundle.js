// Form modul Konstruksi (dan Project Master): sidebar form di kanan (Assigned To, Attachments, Tags, Share)
// disembunyikan supaya isi form selebar layar; lampiran dipindah ke tombol "Lampiran" di toolbar atas.
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
