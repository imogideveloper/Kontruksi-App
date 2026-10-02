// Fitur "Group" di semua List View: tombol di sebelah Filter untuk mengelompokkan baris per nilai field.
// Baris diurutkan dulu per field group (di server), lalu judul kelompok + jumlah baris disisipkan saat render.

const GROUP_FIELDTYPES = ["Select", "Link", "Date", "Check", "Data"];
const SETTING_KEY = "konstruksi_group_by";

frappe.provide("frappe.views");

$(document).on("app_ready", () => patch_list_view());
// Bundle bisa termuat setelah app_ready; patch sekali saja.
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
		this.konstruksi_collapsed = new Set();
		render_group_button(this);
	};

	const get_args = proto.get_args;
	proto.get_args = function () {
		const args = get_args.call(this);
		const fieldname = is_list_view(this) && get_group_df(this)?.fieldname;
		if (!fieldname) return args;

		const column = `\`tab${this.doctype}\`.\`${fieldname}\``;
		if (!args.fields.includes(column)) args.fields.push(column);
		args.order_by = `${column} asc` + (args.order_by ? `, ${args.order_by}` : "");
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

function get_group_df(listview) {
	const fieldname = listview.konstruksi_group_by;
	if (!fieldname) return null;
	if (fieldname === "owner") return { fieldname: "owner", fieldtype: "Link", options: "User", label: __("Created By") };
	return frappe.meta.get_docfield(listview.doctype, fieldname) || null;
}

// Hanya field yang tampil di list / filter cepat (plus Status) agar menu tidak terlalu panjang.
function get_group_fields(listview) {
	const fields = listview.meta.fields.filter(
		(df) =>
			GROUP_FIELDTYPES.includes(df.fieldtype) &&
			!df.hidden &&
			(df.in_list_view || df.in_standard_filter || df.fieldname === "status")
	);
	fields.push({ fieldname: "owner", label: __("Created By") });
	return fields;
}

function set_group_by(listview, fieldname) {
	listview.konstruksi_group_by = fieldname;
	listview.konstruksi_collapsed = new Set();
	frappe.model.user_settings.save(listview.doctype, SETTING_KEY, fieldname);
	render_group_button(listview);
	listview.refresh();
}

function render_group_button(listview) {
	const $section = listview.page.page_form.find(".filter-section");
	if (!$section.length) return;
	$section.find(".konstruksi-group-by").remove();

	const df = get_group_df(listview);
	const esc = frappe.utils.escape_html;
	const items = get_group_fields(listview)
		.map(
			(f) =>
				`<li><a class="dropdown-item ${df?.fieldname === f.fieldname ? "active" : ""}" data-fieldname="${f.fieldname}">
					${esc(__(f.label || f.fieldname))}</a></li>`
		)
		.join("");

	const $group = $(`
		<div class="konstruksi-group-by btn-group">
			<button class="btn btn-default btn-sm dropdown-toggle ${df ? "btn-active" : ""}" data-toggle="dropdown">
				${frappe.utils.icon("list", "sm")}
				<span class="button-label hidden-xs">${df ? __("Group: {0}", [esc(__(df.label))]) : __("Group")}</span>
			</button>
			${df ? `<button class="btn btn-default btn-sm konstruksi-group-clear" title="${__("Hapus grouping")}">
				${frappe.utils.icon("close", "sm")}</button>` : ""}
			<ul class="dropdown-menu dropdown-menu-right konstruksi-group-menu">${items}</ul>
		</div>`);

	$section.find(".filter-selector").after($group);
	$group.find(".dropdown-item").on("click", (e) => set_group_by(listview, $(e.currentTarget).attr("data-fieldname")));
	$group.find(".konstruksi-group-clear").on("click", () => set_group_by(listview, null));
}

function format_group_value(value, df, doc) {
	if (value === null || value === undefined || value === "") return __("(Kosong)");
	if (df.fieldtype === "Check") return cint(value) ? __("Ya") : __("Tidak");
	if (df.fieldtype === "Link") return frappe.utils.get_link_title(df.options, value) || value;
	if (df.fieldtype === "Date") return frappe.datetime.str_to_user(value);
	return __(value);
}

function render_groups(listview) {
	const df = get_group_df(listview);
	if (!df || !listview.data.length) return;

	const $rows = listview.$result.find(".list-row-container").filter((_, el) => $(el).children(".list-row").length);
	const counts = {};
	listview.data.forEach((doc) => {
		const key = String(doc[df.fieldname] ?? "");
		counts[key] = (counts[key] || 0) + 1;
	});

	let current = null;
	$rows.each((i, el) => {
		const doc = listview.data[i];
		if (!doc) return;
		const key = String(doc[df.fieldname] ?? "");
		const $row = $(el).attr("data-konstruksi-group", key);
		const collapsed = listview.konstruksi_collapsed.has(key);
		$row.toggle(!collapsed);

		if (key === current) return;
		current = key;
		const $head = $(`
			<div class="list-row-container konstruksi-group-row ${collapsed ? "" : "terbuka"}">
				<div class="konstruksi-group-head">
					<span class="konstruksi-group-chevron">${frappe.utils.icon("right", "sm")}</span>
					<span class="konstruksi-group-label"></span>
					<span class="konstruksi-group-count">${__("{0} baris", [counts[key]])}</span>
				</div>
			</div>`);
		$head.find(".konstruksi-group-label").text(format_group_value(doc[df.fieldname], df, doc));
		$head.on("click", () => {
			listview.konstruksi_collapsed.has(key)
				? listview.konstruksi_collapsed.delete(key)
				: listview.konstruksi_collapsed.add(key);
			const now_collapsed = listview.konstruksi_collapsed.has(key);
			$head.toggleClass("terbuka", !now_collapsed);
			listview.$result.find(`.list-row-container[data-konstruksi-group="${CSS.escape(key)}"]`).toggle(!now_collapsed);
		});
		$row.before($head);
	});
}
