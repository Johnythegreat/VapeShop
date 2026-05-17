VAPESHOP SYSTEM - COMMISSION PAYOUT UPDATE

NEW FEATURE
- Staff Commission Payout System
- Commission report now shows UNPAID commissions only
- Button: Mark Paid per staff
- Button: Mark All as Paid
- Paid commissions are saved to commission_payouts history
- Sales marked paid are no longer included in new unpaid commission report
- Voided sales are still ignored
- Product inventory is not affected by commission payout

HOW TO USE
1. Go to Admin > Reports
2. Generate the month report
3. Check Staff Commission Report
4. After you pay the cashier commission, click Mark Paid or Mark All as Paid
5. The record will appear under Commission Payout History

FIRESTORE COLLECTION ADDED
- commission_payouts

IMPORTANT
If your Firestore rules are strict, allow admin read/write to commission_payouts.
Staff should not edit commission payouts.

Suggested rules pattern:
match /commission_payouts/{doc} {
  allow read, write: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
}

LOGIN/ROLE REMINDER
- users / UID / role: "admin" for owner
- users / UID / role: "staff" for cashier

