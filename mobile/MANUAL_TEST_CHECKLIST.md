# Mezan Mobile — Manual test checklist

Run against a dev/staging API with seeded employee accounts.

## Auth

- [ ] Login with valid employee credentials
- [ ] Login error message for wrong password
- [ ] Logout returns to login and clears session

## Localization & theme

- [ ] Arabic: RTL layout, Tajawal text
- [ ] English: LTR layout
- [ ] Language switch on profile persists after restart
- [ ] Light / dark / system theme on profile

## Dashboard

- [ ] Employee with profile: attendance card, schedule stats, leave balance
- [ ] Account without employee profile: empty state
- [ ] QR scan clock-in / clock-out (device with camera)

## Payroll

- [ ] Payslip list loads
- [ ] Expand month tile shows salary breakdown
- [ ] Empty state when no payslips

## Requests

- [ ] Leave tab: submit without dates shows validation
- [ ] Leave request submit (happy path)
- [ ] Feedback submit and history

## Notifications

- [ ] Bell badge unread count
- [ ] Notification center list, mark read, mark all read

## Profile

- [ ] Identity card and digital badge QR
- [ ] Badge visible offline after first load
- [ ] Logout clears profile cache

## Stock Finder (`FLOOR_STAFF` only)

- [ ] Stock tab visible for floor staff
- [ ] Stock tab hidden for other roles
- [ ] Text search and barcode scan
- [ ] Current branch first, other branches listed

## Network

- [ ] Airplane mode: friendly error on screens that need API
- [ ] Recovery after reconnect (retry buttons)
