MR VAPE SHOP - MASTER README

LOGIN PAGES
- index.html = Customer shop
- admin-login.html = Admin login
- staff-login.html = Staff/Cashier login
- staff-pos.html = Barcode POS only

STAFF LOGIN SETUP
1. Firebase Console > Authentication > Sign-in method
2. Enable Email/Password.
3. Firebase Console > Authentication > Users > Add user.
4. Create staff email/password.
5. Copy the staff User UID.
6. Firestore > create/use collection: users (lowercase)
7. Create document with Document ID = staff UID.
8. Add field:
   role: "staff"

OPTIONAL STAFF FIELDS
- name: "Cashier Name"
- commissionRate: 50

ADMIN ROLE SETUP
Firestore collection: users
Document ID = admin UID
Fields:
- role: "admin"

IMPORTANT
- The collection name must be exactly: users
- The field name must be exactly: role
- The staff value must be lowercase: staff
- Open the deployed website URL, not local file:// HTML.
- After uploading to GitHub Pages, press Ctrl + F5.

AUTHORIZED DOMAIN
If login gives unauthorized-domain, go to Firebase > Authentication > Settings > Authorized domains and add:
johnythegreat.github.io

WHAT WAS FIXED IN THIS BUILD
- Rebuilt staff-login.html with standalone browser Firebase Auth.
- Removed the broken module auth flow that caused ServerAppCurrentUserOperationNotSupportedError.
- Staff login now gives clearer error messages.
- Staff with role staff redirects to staff-pos.html.

END
