MR VAPE SHOP SYSTEM - CLEAN BUILD

MAIN FILES
- index.html = customer shop page
- admin-login.html = admin login
- admin.html = admin dashboard / inventory / POS / reports
- staff-login.html = cashier login
- staff-pos.html = cashier-only barcode POS
- app-v4.js = main customer/admin/POS system script
- app-v3.js = legacy login/support script used by admin-login
- firebase-config.js = Firebase project configuration
- firestore.rules = Firestore security rules
- styles-v3.css / styles.css / promo.css = design files
- promo.html / promo.js = promo page support
- logo.png = shop logo
- netlify.toml = Netlify deploy config

THIS CLEAN BUILD FIXES
- Image URL fields now sync properly when pasted/edited.
- Extra Product Images now update the hidden main image field before saving.
- File inputs are no longer accidentally treated as image URLs.
- Removed messy multiple note files; this README is the only guide file.

HOW TO UPDATE PRODUCT IMAGES
1. Open Admin > Products.
2. Click Edit on a product.
3. Paste image URL in Extra Product Images or Variant image URL.
4. Click Save Product.
5. Hard refresh customer page with Ctrl + F5.

STAFF SETUP
1. Firebase Authentication > Add User.
2. Copy the user's UID.
3. Firestore collection: users
4. Document ID = UID
5. Add field: role = staff

ADMIN SETUP
Use your admin account UID in Firestore collection users with:
role = admin

FIREBASE IMPORTANT
If you use a custom domain, add it to:
Firebase Authentication > Settings > Authorized domains.

DEPLOYMENT
Upload these files to GitHub Pages, Netlify, or your hosting provider.
After deployment, hard refresh with Ctrl + F5.
