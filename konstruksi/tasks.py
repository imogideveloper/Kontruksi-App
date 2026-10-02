import frappe
from frappe import _
from frappe.desk.doctype.notification_log.notification_log import make_notification_logs
from frappe.utils import add_days, get_datetime, getdate, today

# Pengingat batas pemasukan dikirim H-3 dan H-1.
HARI_PENGINGAT = (3, 1)

NAMA_HARI = ("Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu")
NAMA_BULAN = ("Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des")


def format_waktu(value):
	"""Contoh: Senin, 5 Okt 2026 14:00"""
	dt = get_datetime(value)
	return f"{NAMA_HARI[dt.weekday()]}, {dt.day} {NAMA_BULAN[dt.month - 1]} {dt.year} {dt:%H:%M}"


def kirim_pengingat_batas_pemasukan():
	"""Notifikasi ke Penanggung Jawab (atau pembuat) tender yang batas pemasukannya H-3 / H-1."""
	for hari in HARI_PENGINGAT:
		tanggal = getdate(add_days(today(), hari))
		tenders = frappe.get_all(
			"Tender",
			filters={
				"status": "Persiapan",
				"batas_pemasukan": ["between", [f"{tanggal} 00:00:00", f"{tanggal} 23:59:59"]],
			},
			fields=["name", "nama_paket", "batas_pemasukan", "penanggung_jawab", "owner"],
		)
		for tender in tenders:
			# Tanpa from_user: notifikasi sistem tetap terkirim walau penerima = pembuat tender.
			make_notification_logs(
				{
					"type": "Alert",
					"document_type": "Tender",
					"document_name": tender.name,
					"subject": _("Batas pemasukan {0} ({1}) {2} hari lagi: {3}").format(
						tender.name, tender.nama_paket, hari, format_waktu(tender.batas_pemasukan)
					),
				},
				[tender.penanggung_jawab or tender.owner],
			)
