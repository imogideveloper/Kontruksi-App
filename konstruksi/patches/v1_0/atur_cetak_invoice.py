import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter


def execute():
	"""Print format default Sales Invoice: SiKon Invoice."""
	frappe.reload_doc("konstruksi", "print_format", "sikon_invoice")
	make_property_setter("Sales Invoice", None, "default_print_format", "SiKon Invoice", "Data", for_doctype=True)
