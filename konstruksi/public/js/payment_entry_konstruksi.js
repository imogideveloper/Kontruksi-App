// Payment Entry penerimaan tagihan proyek (mereferensikan Sales Invoice dari halaman Penagihan, jenis_tagihan terisi):
// konteks proyek di atas form, sidebar & breadcrumb Konstruksi, rekening penerima & bukti transfer ditampilkan di
// atas, elemen bawaan yang tidak relevan disembunyikan, label tanpa akhiran mata uang. Payment Entry lain tetap
// tampil seperti bawaan.
const KELAS_PE_KONSTRUKSI = "kppe";
const FIELD_PE_TIDAK_RELEVAN = [
	"naming_series", "book_advance_payments_in_separate_party_account", "get_outstanding_invoices",
	"get_outstanding_orders", "taxes_and_charges_section", "section_break_60", "paid_from_account_currency",
	"paid_to_account_currency",
];

// Info invoice proyek yang dirujuk (dicache per invoice).
function info_invoice_proyek(frm) {
	const ref = (frm.doc.references || []).find((r) => r.reference_doctype === "Sales Invoice" && r.reference_name);
	if (!ref) return Promise.resolve(null);
	frm.__kppe_cache = frm.__kppe_cache || {};
	if (ref.reference_name in frm.__kppe_cache) return Promise.resolve(frm.__kppe_cache[ref.reference_name]);
	return frappe.db
		.get_value("Sales Invoice", ref.reference_name, ["name", "jenis_tagihan", "project", "milestone_termin"])
		.then(async (r) => {
			let info = r.message?.jenis_tagihan ? r.message : null;
			if (info) {
				const [p, m] = await Promise.all([
					frappe.db.get_value("Project", info.project, "project_name"),
					info.milestone_termin
						? frappe.db.get_value("Milestone Termin", info.milestone_termin, ["urutan", "nama_milestone"])
						: Promise.resolve(null),
				]);
				info.project_name = p.message?.project_name;
				info.milestone = m?.message;
			}
			frm.__kppe_cache[ref.reference_name] = info;
			return info;
		});
}

function rapikan_pembayaran_konstruksi(frm) {
	return info_invoice_proyek(frm).then((info) => {
		const aktif = Boolean(info);
		frm.__kppe_aktif = aktif;
		frm.page.wrapper.toggleClass(KELAS_PE_KONSTRUKSI, aktif);
		pindahkan_bukti_transfer(frm, aktif);
		atur_referensi_cek(frm, aktif);
		frm.events.set_dynamic_labels?.(frm);
		if (!aktif) {
			if (frm.__kppe_headline) frm.dashboard.clear_headline();
			frm.__kppe_headline = false;
			return;
		}
		frm.toggle_display(FIELD_PE_TIDAK_RELEVAN, false);
		// Semua section yang bisa dilipat (Accounts, Deductions, Accounting Dimensions, More Information, …) terbuka.
		(frm.layout?.sections || []).forEach((s) => s.df?.collapsible && s.collapse?.(false));
		tampilkan_konteks(frm, info);
		pakai_sidebar_konstruksi();
	});
}

function tampilkan_konteks(frm, info) {
	const retensi = /retensi/i.test(frm.doc.remarks || "");
	let jenis = info.jenis_tagihan === "Uang Muka" ? __("Penerimaan Uang Muka") : __("Penerimaan Termin");
	if (info.jenis_tagihan === "Termin" && info.milestone) {
		jenis = __("Penerimaan Termin {0} — {1}", [info.milestone.urutan, info.milestone.nama_milestone]);
	}
	if (retensi) jenis = __("Pencairan Retensi");
	const esc = frappe.utils.escape_html;
	frm.dashboard.set_headline_alert(
		`<b>${esc(jenis)}</b> · ${esc(info.project)}${info.project_name ? " — " + esc(info.project_name) : ""}
		· ${__("Invoice")} <a href="/app/sales-invoice/${encodeURIComponent(info.name)}">${esc(info.name)}</a>`,
		"blue"
	);
	frm.__kppe_headline = true;
}

// Sidebar & breadcrumb Konstruksi (seperti Sales Invoice tagihan proyek), bukan Payments.
function pakai_sidebar_konstruksi() {
	const sidebar = frappe.app?.sidebar;
	if (!sidebar || String(sidebar.sidebar_title || "").toLowerCase() === "konstruksi") return;
	if (!frappe.boot.workspace_sidebar_item?.konstruksi) return;
	sidebar.setup("Konstruksi");
	sidebar.set_active_workspace_item?.();
	frappe.breadcrumbs.update();
}

// Section "Transaction ID" (No. & Tanggal bukti transfer, wajib untuk rekening bank) dipindah tepat di bawah Amount.
function pindahkan_bukti_transfer(frm, aktif) {
	const bukti = frm.fields_dict.transaction_references?.wrapper;
	const jumlah = frm.fields_dict.payment_amounts_section?.wrapper;
	if (!bukti?.length || !jumlah?.length) return;
	if (!frm.__kppe_posisi_bukti) frm.__kppe_posisi_bukti = { induk: bukti.parent(), sebelum: bukti.prev() };
	if (aktif) {
		bukti.insertAfter(jumlah);
	} else {
		const { induk, sebelum } = frm.__kppe_posisi_bukti;
		sebelum.length ? bukti.insertAfter(sebelum) : bukti.prependTo(induk);
	}
}

// Cheque/Reference No & Date hanya untuk pembayaran cek / giro. Cara lain (transfer, dsb.) field disembunyikan & tidak wajib;
// server mengisinya otomatis dengan nomor Payment Entry (penagihan.isi_referensi_pembayaran).
const WAJIB_REFERENSI_ASLI = "eval:(doc.paid_from_account_type == 'Bank' || doc.paid_to_account_type == 'Bank')";
function atur_referensi_cek(frm, aktif) {
	const cek = !aktif || /cheque|cek|giro/i.test(frm.doc.mode_of_payment || "");
	["reference_no", "reference_date"].forEach((field) => {
		frm.set_df_property(field, "mandatory_depends_on", cek ? WAJIB_REFERENSI_ASLI : "");
		if (!cek) frm.set_df_property(field, "reqd", 0);
		frm.toggle_display(field, cek);
	});
}

// Label tanpa akhiran mata uang ("Paid Amount", bukan "Paid Amount (IDR)") untuk penerimaan tagihan proyek.
function pasang_label_tanpa_mata_uang(frm) {
	if (frm.__kppe_label) return;
	const asli = frm.set_currency_labels.bind(frm);
	frm.set_currency_labels = function (fields, currency, parentfield) {
		if (!this.__kppe_aktif) return asli(fields, currency, parentfield);
		if (!currency) return;
		const ada = (fields || []).filter((f) => (parentfield ? true : this.fields_dict[f]));
		return this.reset_currency_labels(ada, parentfield);
	};
	frm.__kppe_label = true;
}

frappe.ui.form.on("Payment Entry", {
	setup: pasang_label_tanpa_mata_uang,
	refresh(frm) {
		pasang_label_tanpa_mata_uang(frm);
		rapikan_pembayaran_konstruksi(frm);
	},
	mode_of_payment(frm) {
		atur_referensi_cek(frm, Boolean(frm.__kppe_aktif));
	},
});
