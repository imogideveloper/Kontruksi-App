import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter


def execute():
	"""Print format default Payment Entry: SiKon Bukti Penerimaan."""
	frappe.reload_doc("konstruksi", "print_format", "sikon_bukti_penerimaan")
	make_property_setter("Payment Entry", None, "default_print_format", "SiKon Bukti Penerimaan", "Data", for_doctype=True)
