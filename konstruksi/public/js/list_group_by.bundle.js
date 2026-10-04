// Fitur "Group" di semua List View: tombol di sebelah Filter untuk mengelompokkan baris, sampai 3 level
// (mis. Tanggal (Tahun) › Pemberi Kerja). Baris diurutkan per field group di server, lalu judul kelompok
// disisipkan saat render. Jumlah per kelompok diambil dari server (seluruh data sesuai filter).

const GROUP_FIELDTYPES = ["Select", "Link", "Date", "Datetime", "Check", "Data"];
const DATE_FIELDTYPES = ["Date", "Datetime"];
const SETTING_KEY = "konstruksi_group_by";
const SUM_SETTING_KEY = "konstruksi_group_sum";
const SUM_FIELDTYPES = ["Currency", "Float", "Int"];
const MAX_LEVEL = 3;
// Pemisah kunci antar level; harus sama dengan PATH_SEP di konstruksi/api.py.
const PATH_SEP = "\x1f";
const GRANULARITY = { year: __("Tahun"), month: __("Bulan"), day: __("Hari") };
const NAMA_BULAN = [
	"Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

frappe.provide("frappe.views");

$(document).on("app_ready", () => patch_list_view());
// list.bundle.js dimuat sebelum bundle ini, jadi biasanya ListView sudah ada; patch sekali saja.
if (frappe.views.ListView) patch_list_view();

function patch_list_view() {
	const proto = frappe.views.ListView?.prototype;
	if (!proto || proto.__konstruksi_group_by) return;
	proto.__konstruksi_group_by = true;

	const setup_view = proto.setup_view;
	proto.setup_view = function () {
		setup_view.call(this);
		if (!is_list_view(this)) return;
		this.konstruksi_group_by = load_setting(this.doctype);
		this.konstruksi_toggled = new Set();
		render_group_button(this);
	};

	const get_args = proto.get_args;
	proto.get_args = function () {
		const args = get_args.call(this);
		const groups = is_list_view(this) ? get_groups(this) : [];
		if (!groups.length) return args;

		const orders = groups.map(({ df, granularity }) => {
			const column = `\`tab${this.doctype}\`.\`${df.fieldname}\``;
			if (!args.fields.includes(column)) args.fields.push(column);
			// Tanggal: terbaru dulu; lainnya A-Z.
			return `${column} ${granularity ? "desc" : "asc"}`;
		});
		const sum_df = get_sum_df(this);
		if (sum_df) {
			const column = `\`tab${this.doctype}\`.\`${sum_df.fieldname}\``;
			if (!args.fields.includes(column)) args.fields.push(column);
		}
		args.order_by = orders.join(", ") + (args.order_by ? `, ${args.order_by}` : "");
		return args;
	};

	const render_list = proto.render_list;
	proto.render_list = function () {
		render_list.call(this);
		if (is_list_view(this)) render_groups(this);
	};
}

function is_list_view(listview) {
	return listview.view_name === "List" && listview.page?.page_form;
}

// Setting: array berisi "fieldname" atau "fieldname:year|month|day". Setting lama (string) tetap terbaca.
function load_setting(doctype) {
	const value = frappe.get_user_settings(doctype)?.[SETTING_KEY];
	if (!value) return [];
	return (Array.isArray(value) ? value : [value]).slice(0, MAX_LEVEL);
}

const STANDARD_DATE_FIELDS = {
	creation: { fieldname: "creation", fieldtype: "Datetime", label: __("Created On") },
};

function get_df(doctype, fieldname) {
	if (fieldname === "owner") return { fieldname: "owner", fieldtype: "Link", options: "User", label: __("Created By") };
	return STANDARD_DATE_FIELDS[fieldname] || frappe.meta.get_docfield(doctype, fieldname) || null;
}

function parse_group(doctype, value) {
	const [fieldname, granularity] = value.split(":");
	const df = get_df(doctype, fieldname);
	return df ? { value, df, granularity: granularity || null } : null;
}

function get_groups(listview) {
	return (listview.konstruksi_group_by || []).map((v) => parse_group(listview.doctype, v)).filter(Boolean);
}

function group_label(group) {
	const label = __(group.df.label || group.df.fieldname);
	return group.granularity ? `${label} (${GRANULARITY[group.granularity]})` : label;
}

// Hanya field yang tampil di list / filter cepat (plus Status) agar menu tidak terlalu panjang.
function get_group_options(listview) {
	const fields = listview.meta.fields.filter(
		(df) =>
			GROUP_FIELDTYPES.includes(df.fieldtype) &&
			!df.hidden &&
			(df.in_list_view || df.in_standard_filter || df.fieldname === "status")
	);
	fields.push(get_df(listview.doctype, "owner"), STANDARD_DATE_FIELDS.creation);

	const options = [];
	fields.forEach((df) => {
		if (DATE_FIELDTYPES.includes(df.fieldtype)) {
			Object.keys(GRANULARITY).forEach((granularity) =>
				options.push({ value: `${df.fieldname}:${granularity}`, df, granularity })
			);
		} else {
			options.push({ value: df.fieldname, df, granularity: null });
		}
	});
	return options;
}

function get_sum_options(listview) {
	const visible = listview.meta.fields.filter((df) => SUM_FIELDTYPES.includes(df.fieldtype) && !df.hidden);
	const di_list = visible.filter((df) => df.in_list_view);
	return di_list.length ? di_list : visible.filter((df) => df.fieldtype === "Currency");
}

// Kolom yang dijumlahkan per kelompok: pilihan user, default kolom Rupiah pertama di list. "" = tanpa total.
function get_sum_df(listview) {
	const saved = frappe.get_user_settings(listview.doctype)?.[SUM_SETTING_KEY];
	const options = get_sum_options(listview);
	if (saved === "") return null;
	return options.find((df) => df.fieldname === saved) ||
		options.find((df) => df.fieldtype === "Currency") || null;
}

function set_sum_field(listview, fieldname) {
	frappe.model.user_settings.save(listview.doctype, SUM_SETTING_KEY, fieldname);
	save_groups(listview, listview.konstruksi_group_by, { buka_menu: true });
}

function save_groups(listview, values, { buka_menu = false } = {}) {
	listview.konstruksi_group_by = values;
	listview.konstruksi_toggled = new Set();
	frappe.model.user_settings.save(listview.doctype, SETTING_KEY, values.length ? values : null);
	render_group_button(listview);
	// Menu tetap terbuka agar bisa langsung memilih level berikutnya.
	if (buka_menu) {
		setTimeout(() => listview.page.page_form.find(".konstruksi-group-by .dropdown-toggle").dropdown("toggle"));
	}
	listview.refresh();
}

// Klik field: tambah sebagai level berikutnya, atau lepas bila sudah dipilih.
// Field tanggal yang sama boleh beda tingkat, mis. Tanggal (Tahun) › Tanggal (Bulan) › Tanggal (Hari).
function toggle_group(listview, value) {
	let values = [...listview.konstruksi_group_by];
	if (values.includes(value)) {
		values = values.filter((v) => v !== value);
	} else {
		if (values.length >= MAX_LEVEL) {
			frappe.show_alert({ message: __("Maksimal {0} level grouping.", [MAX_LEVEL]), indicator: "orange" });
			return;
		}
		values.push(value);
	}
	save_groups(listview, values, { buka_menu: true });
}

function render_group_button(listview) {
	const $section = listview.page.page_form.find(".filter-section");
	if (!$section.length) return;
	$section.find(".konstruksi-group-by").remove();

	const groups = get_groups(listview);
	const esc = frappe.utils.escape_html;
	const items = get_group_options(listview)
		.map((o) => {
			const level = listview.konstruksi_group_by.indexOf(o.value) + 1;
			return `<li><a class="dropdown-item ${level ? "active" : ""}" data-value="${o.value}">
				<span class="konstruksi-group-level">${level || ""}</span>${esc(group_label(o))}</a></li>`;
		})
		.join("");
	const sum_df = get_sum_df(listview);
	const sum_items = [{ fieldname: "", label: __("Tanpa total") }, ...get_sum_options(listview)]
		.map((df) => {
			const aktif = (sum_df?.fieldname || "") === df.fieldname;
			return `<li><a class="dropdown-item konstruksi-sum-item ${aktif ? "active" : ""}" data-sum="${df.fieldname}">
				<span class="konstruksi-group-level">${aktif ? "✓" : ""}</span>${esc(__(df.label))}</a></li>`;
		})
		.join("");
	const title = groups.map(group_label).join(" › ");

	const $group = $(`
		<div class="konstruksi-group-by btn-group">
			<button class="btn btn-default btn-sm dropdown-toggle ${groups.length ? "btn-active" : ""}"
				data-toggle="dropdown" title="${esc(title)}">
				${frappe.utils.icon("list", "sm")}
				<span class="button-label hidden-xs">${groups.length ? __("Group: {0}", [esc(title)]) : __("Group")}</span>
			</button>
			${groups.length ? `<button class="btn btn-default btn-sm konstruksi-group-clear" title="${__("Hapus grouping")}">
				${frappe.utils.icon("close", "sm")}</button>` : ""}
			<ul class="dropdown-menu dropdown-menu-right konstruksi-group-menu">
				<li class="konstruksi-group-hint">${__("Klik untuk menambah level (maks. {0}), klik lagi untuk melepas.", [MAX_LEVEL])}</li>
				${items}
				<li class="konstruksi-group-hint konstruksi-group-subhead">${__("Jumlahkan")}</li>
				${sum_items}
			</ul>
		</div>`);

	$section.find(".filter-selector").after($group);
	$group.find(".dropdown-item").on("click", (e) => {
		// Jangan biarkan Bootstrap menutup menu; menu dibuka ulang setelah tombol dirender ulang.
		e.preventDefault();
		e.stopPropagation();
		const $item = $(e.currentTarget);
		$item.hasClass("konstruksi-sum-item")
			? set_sum_field(listview, $item.attr("data-sum"))
			: toggle_group(listview, $item.attr("data-value"));
	});
	$group.find(".konstruksi-group-clear").on("click", () => save_groups(listview, []));
}

// Harus sama dengan konstruksi.api.group_key.
function group_key(value, granularity) {
	if (value === null || value === undefined || value === "") return "";
	if (granularity) return String(value).slice(0, { year: 4, month: 7, day: 10 }[granularity]);
	return String(value);
}

function format_group_value(key, group) {
	const { df, granularity } = group;
	if (key === "") return __("(Kosong)");
	if (granularity === "year") return key;
	if (granularity === "month") return `${NAMA_BULAN[cint(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
	if (granularity === "day") return frappe.datetime.str_to_user(key);
	if (df.fieldtype === "Check") return cint(key) ? __("Ya") : __("Tidak");
	if (df.fieldtype === "Link") return label_link(df.options, key);
	return __(key);
}

// Link: tampilkan judul dokumen (mis. nama proyek) beserta ID-nya; judul yang belum dimuat diambil lalu labelnya diperbarui.
function label_link(doctype, key) {
	const title = frappe.utils.get_link_title(doctype, key);
	return title && title !== key ? `${title} · ${key}` : key;
}

function muat_judul_link($label, doctype, key) {
	if (frappe.utils.get_link_title(doctype, key)) return;
	frappe.utils.fetch_link_title(doctype, key).then((title) => {
		if (title && title !== key) $label.text(`${title} · ${key}`);
	});
}

function level_badge(group) {
	return group.granularity ? GRANULARITY[group.granularity] : __(group.df.label || group.df.fieldname);
}

// Kelompok Tahun & Bulan dimulai tertutup agar langsung terlihat ringkas; lainnya terbuka.
function is_collapsed(listview, group, path) {
	const default_collapsed = ["year", "month"].includes(group.granularity);
	return default_collapsed !== listview.konstruksi_toggled.has(path);
}

// Baris/judul terlihat bila tidak ada kelompok induknya yang tertutup.
function update_visibility(listview) {
	const groups = get_groups(listview);
	const tertutup = new Set();
	listview.$result.find("[data-konstruksi-path]").each((_, el) => {
		const $el = $(el);
		const path = $el.attr("data-konstruksi-path");
		const parts = path.split(PATH_SEP);
		const is_head = $el.hasClass("konstruksi-group-row");
		const induk = is_head ? parts.length - 1 : parts.length;

		let terlihat = true;
		for (let i = 1; i <= induk; i++) {
			if (tertutup.has(parts.slice(0, i).join(PATH_SEP))) terlihat = false;
		}
		$el.toggle(terlihat);

		if (is_head) {
			const collapsed = is_collapsed(listview, groups[parts.length - 1], path);
			$el.toggleClass("terbuka", !collapsed);
			if (collapsed) tertutup.add(path);
		}
	});
}

function render_groups(listview) {
	const groups = get_groups(listview);
	if (!groups.length || !listview.data.length) return;
	const sum_df = get_sum_df(listview);

	const $rows = listview.$result.find(".list-row-container").filter((_, el) => $(el).children(".list-row").length);
	const counts = {};
	const sums = {};
	let sebelumnya = [];

	$rows.each((i, el) => {
		const doc = listview.data[i];
		if (!doc) return;
		const keys = groups.map((g) => group_key(doc[g.df.fieldname], g.granularity));
		const $row = $(el).attr("data-konstruksi-path", keys.join(PATH_SEP));

		keys.forEach((_, level) => {
			const path = keys.slice(0, level + 1).join(PATH_SEP);
			counts[path] = (counts[path] || 0) + 1;
			if (sum_df) sums[path] = (sums[path] || 0) + flt(doc[sum_df.fieldname]);
		});

		// Judul baru untuk level pertama yang berubah dan semua level di bawahnya.
		const berubah = keys.findIndex((key, level) => key !== sebelumnya[level]);
		if (berubah === -1) return;
		for (let level = berubah; level < groups.length; level++) {
			const path = keys.slice(0, level + 1).join(PATH_SEP);
			const judul_induk = keys.slice(0, level).map((key, l) => format_group_value(key, groups[l]));
			const $head = $(`
				<div class="list-row-container konstruksi-group-row" style="--konstruksi-level: ${level}">
					<div class="konstruksi-group-head">
						<span class="konstruksi-group-chevron">${frappe.utils.icon("right", "sm")}</span>
						<div class="konstruksi-group-title">
							<div class="konstruksi-group-label"></div>
							<div class="konstruksi-group-sub"></div>
						</div>
						<span class="konstruksi-group-sum"></span>
						<span class="konstruksi-group-count"></span>
						<span class="konstruksi-group-badge"></span>
					</div>
				</div>`);
			$head.attr("data-konstruksi-path", path);
			const $label = $head.find(".konstruksi-group-label").text(format_group_value(keys[level], groups[level]));
			if (groups[level].df.fieldtype === "Link" && keys[level] !== "") {
				muat_judul_link($label, groups[level].df.options, keys[level]);
			}
			$head.find(".konstruksi-group-sub").text(
				level ? judul_induk.join(" / ") : __("Group per {0}", [level_badge(groups[level])])
			);
			$head.find(".konstruksi-group-badge").text(level_badge(groups[level]));
			$head.on("click", () => {
				listview.konstruksi_toggled.has(path)
					? listview.konstruksi_toggled.delete(path)
					: listview.konstruksi_toggled.add(path);
				update_visibility(listview);
			});
			$row.before($head);
		}
		sebelumnya = keys;
	});

	const set_totals = (counts_src, sums_src) =>
		listview.$result.find(".konstruksi-group-row").each((_, el) => {
			const path = $(el).attr("data-konstruksi-path");
			if (counts_src[path] !== undefined) {
				$(el).find(".konstruksi-group-count").text(__("{0} data", [counts_src[path]]));
			}
			if (sum_df && sums_src[path] !== undefined) {
				$(el)
					.find(".konstruksi-group-sum")
					.text(sum_df.fieldtype === "Currency" ? format_currency(sums_src[path]) : format_number(sums_src[path]));
			}
		});
	set_totals(counts, sums);
	update_visibility(listview);

	// Jumlah & total sebenarnya untuk seluruh data (bukan hanya halaman ini).
	frappe
		.xcall("konstruksi.api.get_group_counts", {
			doctype: listview.doctype,
			groups: groups.map((g) => [g.df.fieldname, g.granularity]),
			filters: listview.get_filters_for_args(),
			sum_field: sum_df?.fieldname || null,
		})
		.then((r) => set_totals(r.counts, r.sums));
}
