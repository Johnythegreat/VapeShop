VapeShop POS Barcode + Promo Bundle Fix

What was fixed:
1. Barcode scanner no longer adds the same scanned product twice.
   - Added scan debounce protection.
   - Camera scan now locks while processing one barcode.

2. Promo / Bundle can now be added inside Barcode POS.
   - Admin POS and Staff POS both show active promo bundles.
   - Example: V2 + V3 bundle can be added directly to POS cart.
   - Bundle stock deducts from the real selected product variants.

3. POS stock deduction supports bundle components.
   - A bundle sale deducts V2 selected flavor and V3 selected color.
   - Report keeps the bundle as one sale item while stock stays accurate.

After upload:
- Hard refresh admin/staff POS with Ctrl + F5.
- Test with 1 barcode scan only once.
- Test adding a promo bundle from Barcode POS.
