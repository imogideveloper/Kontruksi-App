// Fitur "Group" di semua List View: tombol di sebelah Filter untuk mengelompokkan baris per nilai field.
// Baris diurutkan dulu per field group (di server), lalu judul kelompok disisipkan saat render.
// Jumlah per kelompok diambil dari server (seluruh data sesuai filter), bukan hanya halaman yang dimuat.

const GROUP_FIELDTYPES = ["Select", "Link", "Date", "Datetime", "Check", "Data"];
const DATE_FIELDTYPES = ["Date", "Datetime"];
const SETTING_KEY = "konstruksi_group_by";
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
		this.konstruksi_group_by = frappe.get_user_settings(this.doctype)?.[SETTING_KEY] || null;
		this.konstruksi_toggled = new Set();
		render_group_button(this);
	};

	const get_args = proto.get_args;
	proto.get_args = function () {
		const args = get_args.call(this);
		const group = is_list_view(this) && get_group(this);
		if (!group) return args;

		const column = `\`tab${this.doctype}\`.\`${group.df.fieldname}\``;
		if (!args.fields.includes(column)) args.fields.push(column);
		// Tanggal: terbaru dulu; lainnya A-Z.
		const order = group.granularity ? "desc" : "asc";
		args.order_by = `${column} ${order}` + (args.order_by ? `, ${args.order_by}` : "");
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

const STANDARD_DATE_FIELDS = {
	creation: { fieldname: "creation", fieldtype: "Datetime", label: __("Created On") },
};

function get_df(doctype, fieldname) {
	if (fieldname === "owner") return { fieldname: "owner", fieldtype: "Link", options: "User", label: __("Created By") };
	return STANDARD_DATE_FIELDS[fieldname] || frappe.meta.get_docfield(doctype, fieldname) || null;
}

// Setting disimpan sebagai "fieldname" atau "fieldname:year|month|day".
function get_group(listview) {
	if (!listview.konstruksi_group_by) return null;
	const [fieldname, granularity] = listview.konstruksi_group_by.split(":");
	const df = get_df(listview.doctype, fieldname);
	return df ? { df, granularity: granularity || null } : null;
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
				options.push({ value: `${df.fieldname}:${granularity}`, label: group_label({ df, granularity }) })
			);
		} else {
			options.push({ value: df.fieldname, label: group_label({ df }) });
		}
	});
	return options;
}

function set_group_by(listview, value) {
	listview.konstruksi_group_by = value;
	listview.konstruksi_toggled = new Set();
	frappe.model.user_settings.save(listview.doctype, SETTING_KEY, value);
	render_group_button(listview);
	listview.refresh();
}

function render_group_button(listview) {
	const $section = listview.page.page_form.find(".filter-section");
	if (!$section.length) return;
	$section.find(".konstruksi-group-by").remove();

	const group = get_group(listview);
	const esc = frappe.utils.escape_html;
	const items = get_group_options(listview)
		.map(
			(o) =>
				`<li><a class="dropdown-item ${listview.konstruksi_group_by === o.value ? "active" : ""}"
					data-value="${o.value}">${esc(o.label)}</a></li>`
		)
		.join("");

	const $group = $(`
		<div class="konstruksi-group-by btn-group">
			<button class="btn btn-default btn-sm dropdown-toggle ${group ? "btn-active" : ""}" data-toggle="dropdown">
				${frappe.utils.icon("list", "sm")}
				<span class="button-label hidden-xs">${group ? __("Group: {0}", [esc(group_label(group))]) : __("Group")}</span>
			</button>
			${group ? `<button class="btn btn-default btn-sm konstruksi-group-clear" title="${__("Hapus grouping")}">
				${frappe.utils.icon("close", "sm")}</button>` : ""}
			<ul class="dropdown-menu dropdown-menu-right konstruksi-group-menu">${items}</ul>
		</div>`);

	$section.find(".filter-selector").after($group);
	$group.find(".dropdown-item").on("click", (e) => set_group_by(listview, $(e.currentTarget).attr("data-value")));
	$group.find(".konstruksi-group-clear").on("click", () => set_group_by(listview, null));
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
	if (df.fieldtype === "Link") return frappe.utils.get_link_title(df.options, key) || key;
	return __(key);
}

// Tahun & bulan dimulai tertutup agar langsung terlihat ringkas; kelompok lain terbuka.
function is_collapsed(listview, group, key) {
	const default_collapsed = ["year", "month"].includes(group.granularity);
	return default_collapsed !== listview.konstruksi_toggled.has(key);
}

function render_groups(listview) {
	const group = get_group(listview);
	if (!group || !listview.data.length) return;
	const { df, granularity } = group;

	const $rows = listview.$result.find(".list-row-container").filter((_, el) => $(el).children(".list-row").length);
	const counts = {};
	listview.data.forEach((doc) => {
		const key = group_key(doc[df.fieldname], granularity);
		counts[key] = (counts[key] || 0) + 1;
	});

	let current = null;
	$rows.each((i, el) => {
		const doc = listview.data[i];
		if (!doc) return;
		const key = group_key(doc[df.fieldname], granularity);
		const $row = $(el).attr("data-konstruksi-group", key);
		const collapsed = is_collapsed(listview, group, key);
		$row.toggle(!collapsed);

		if (key === current) return;
		current = key;
		const $head = $(`
			<div class="list-row-container konstruksi-group-row ${collapsed ? "" : "terbuka"}" data-konstruksi-head="">
				<div class="konstruksi-group-head">
					<span class="konstruksi-group-chevron">${frappe.utils.icon("right", "sm")}</span>
					<span class="konstruksi-group-label"></span>
					<span class="konstruksi-group-count">${__("{0} baris", [counts[key]])}</span>
				</div>
			</div>`);
		$head.attr("data-konstruksi-head", key);
		$head.find(".konstruksi-group-label").text(format_group_value(key, group));
		$head.on("click", () => {
			listview.konstruksi_toggled.has(key)
				? listview.konstruksi_toggled.delete(key)
				: listview.konstruksi_toggled.add(key);
			const now_collapsed = is_collapsed(listview, group, key);
			$head.toggleClass("terbuka", !now_collapsed);
			listview.$result.find(`.list-row-container[data-konstruksi-group="${CSS.escape(key)}"]`).toggle(!now_collapsed);
		});
		$row.before($head);
	});

	// Jumlah sebenarnya untuk seluruh data (bukan hanya halaman ini).
	frappe
		.xcall("konstruksi.api.get_group_counts", {
			doctype: listview.doctype,
			fieldname: df.fieldname,
			granularity,
			filters: listview.get_filters_for_args(),
		})
		.then((server_counts) => {
			listview.$result.find(".konstruksi-group-row").each((_, el) => {
				const key = $(el).attr("data-konstruksi-head");
				if (server_counts[key] !== undefined) {
					$(el).find(".konstruksi-group-count").text(__("{0} baris", [server_counts[key]]));
				}
			});
		});
}
