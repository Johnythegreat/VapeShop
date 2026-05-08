import { db, auth, firebaseReady, ADMIN_EMAILS } from "./firebase-config.js";
import { collection, addDoc, doc, updateDoc, deleteDoc, getDocs, getDoc, onSnapshot, serverTimestamp, query, orderBy, runTransaction, writeBatch, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const page = document.body.dataset.page;
const PRODUCTS_KEY = "vape_shop_products";
const CART_KEY = "vape_shop_cart";
const ACCOUNT_KEY = "vape_shop_account";
const CUSTOMERS_KEY = "vape_shop_customers";
const ORDERS_KEY = "vape_shop_orders";
const HISTORY_KEY = "vape_shop_order_history";
const SHIPPING_SETTINGS_KEY = "vape_shop_shipping_settings";
const MESSAGES_KEY = "vape_shop_messages";
const PROMOS_KEY = "vape_shop_promos";
const CHAT_ID_KEY = "vape_shop_chat_id";
const CUSTOMER_LAST_SEEN_KEY = "vape_shop_customer_last_seen";
const MODE_KEY = "vape_shop_mode";
const categories = ["All","Pods","Devices","E-Juice","Battery","Accessories","Promo"];
function productDocId(product){
  return String(product?.docId || product?.firestoreId || product?._docId || product?.id || "");
}

// GLOBAL promo matcher used by both customer page and admin page.
// This fixes admin errors like: productMatchesPromoItem is not defined.
function productMatchesPromoItem(product, item){
  const wantedId = String(item?.productId || item?.docId || "").trim();
  const productIds = [product?.docId, product?.firestoreId, product?._docId, product?.id, product?.sku, product?.barcode]
    .map(v => String(v || "").trim()).filter(Boolean);
  if(wantedId) return productIds.includes(wantedId);

  const hay = ((product?.name || "") + " " + (product?.category || "") + " " + (product?.brand || "")).toLowerCase();
  const category = String(product?.category || "").toLowerCase();
  if(category === "promo") return false;

  const match = String(item?.productMatch || "").toLowerCase();
  if(match === "v2pod") return category === "pods" && /\bv2\b/.test(hay);
  if(match === "v3device") return (category === "battery" || category === "devices") && /\bv3\b/.test(hay);
  if(match === "pod") return category === "pods" && /\bv2\b/.test(hay);
  if(match === "device") return (category === "battery" || category === "devices") && /\bv3\b/.test(hay);
  if(match === "custom") return !!wantedId && productIds.includes(wantedId);
  return false;
}

const demoProducts = [
  {
    name:"X-Black V2 Pod",
    brand:"X-BLACK",
    category:"Pods",
    price:450,
    oldPrice:500,
    stock:80,
    sold:"120+ sold",
    badge:"8 Flavors",
    variants:["Black Wave","Beer Sparkle","Trouble Purple","Very More","Very Baguio","Red Cannon","Bacteria Monster","Blue Freeze"],
    image:"https://images.unsplash.com/photo-1628175795172-20291f2c9b67?auto=format&fit=crop&w=800&q=80",
    images:[
      "https://images.unsplash.com/photo-1628175795172-20291f2c9b67?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1560162562-b5d95a891659?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1608156639585-b3a032ef9689?auto=format&fit=crop&w=800&q=80"
    ]
  },
  {
    name:"X-Black V3 Device",
    brand:"X-BLACK",
    category:"Devices",
    price:380,
    oldPrice:450,
    stock:45,
    sold:"90+ sold",
    badge:"4 Colors",
    variants:["Black","Gold","Purple","Blue"],
    image:"https://images.unsplash.com/photo-1610651709623-4e8e1c2107dd?auto=format&fit=crop&w=800&q=80",
    images:[
      "https://images.unsplash.com/photo-1610651709623-4e8e1c2107dd?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1603064752734-4c48eff53d05?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1585386959984-a4155224a1ad?auto=format&fit=crop&w=800&q=80"
    ]
  },
  {
    name:"X-Black Pod + Device Bundle",
    brand:"MR VAPE SHOP",
    category:"Promo",
    price:750,
    oldPrice:830,
    stock:30,
    sold:"Best bundle",
    badge:"Save ₱80",
    image:"https://images.unsplash.com/photo-1559599746-8823b38544c6?auto=format&fit=crop&w=800&q=80",
    images:[
      "https://images.unsplash.com/photo-1559599746-8823b38544c6?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1608156639585-b3a032ef9689?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1628175795172-20291f2c9b67?auto=format&fit=crop&w=800&q=80"
    ]
  },
  {
    name:"Premium E-Juice Flavor",
    brand:"VAPE ESSENTIALS",
    category:"E-Juice",
    price:250,
    oldPrice:300,
    stock:60,
    sold:"Fresh stock",
    badge:"New Arrival",
    image:"https://images.unsplash.com/photo-1607242792481-37f27e1d74e1?auto=format&fit=crop&w=800&q=80",
    images:[
      "https://images.unsplash.com/photo-1607242792481-37f27e1d74e1?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1607853554439-0069ec0f29b6?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1595433562696-a8b554b5d878?auto=format&fit=crop&w=800&q=80"
    ]
  }
];
const $ = (id) => document.getElementById(id);
const readJSON = (k, f) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : f; } catch { return f; } };
const writeJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const money = (v) => "₱" + Number(v || 0).toLocaleString();
const cartSubtotal = (items) => items.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0);
const totalAmount = (items, shippingFee = 0) => cartSubtotal(items) + Number(shippingFee || 0);
const defaultShippingSettings = { enabled:true, pickupEnabled:true, freeShippingMin:0, zones:[{ name:"Store Pickup", fee:0 }, { name:"Davao City", fee:60 }, { name:"Outside Davao", fee:100 }] };
function normalizeShippingSettings(settings={}){
  const rawZones = Array.isArray(settings.zones) ? settings.zones : defaultShippingSettings.zones;
  const zones = rawZones.map(z => ({ name:String(z?.name || "").trim(), fee:Number(z?.fee || 0) })).filter(z => z.name);
  return { enabled:settings.enabled !== false, pickupEnabled:settings.pickupEnabled !== false, freeShippingMin:Math.max(0, Number(settings.freeShippingMin || 0)), zones:zones.length ? zones : defaultShippingSettings.zones.slice() };
}
function getLocalShippingSettings(){ return normalizeShippingSettings(readJSON(SHIPPING_SETTINGS_KEY, defaultShippingSettings)); }
function setLocalShippingSettings(settings){ writeJSON(SHIPPING_SETTINGS_KEY, normalizeShippingSettings(settings)); }
async function loadShippingSettings(){
  const local = getLocalShippingSettings();
  if(getMode()==="firebase" && firebaseReady){
    try{ const snap = await getDoc(doc(db, "settings", "shipping")); if(snap.exists()) return normalizeShippingSettings(snap.data()); await setDoc(doc(db, "settings", "shipping"), { ...local, updatedAt:serverTimestamp() }); }catch{}
  }
  return local;
}
async function saveShippingSettings(settings){
  const clean = normalizeShippingSettings(settings);
  setLocalShippingSettings(clean);
  if(getMode()==="firebase" && firebaseReady) await setDoc(doc(db, "settings", "shipping"), { ...clean, updatedAt:serverTimestamp() });
  return clean;
}
const variantStockMap = (p) => (p && p.variantStocks && typeof p.variantStocks === "object") ? p.variantStocks : {};
const getVariantStock = (p, variant) => {
  const map = variantStockMap(p);
  if(variant && Object.prototype.hasOwnProperty.call(map, variant)) return Number(map[variant] || 0);
  return Number(p?.stock || 0);
};
const variantBarcodeMap = (p) => (p && p.variantBarcodes && typeof p.variantBarcodes === "object") ? p.variantBarcodes : {};
const getVariantBarcode = (p, variant) => String(variantBarcodeMap(p)[variant] || "").trim();
function findProductByVariantBarcode(list, barcode){
  const code = String(barcode || "").trim().toLowerCase();
  if(!code) return null;
  for(const product of (list || [])){
    const productCodes = [product?.barcode, product?.sku, product?.id, product?.docId, product?.firestoreId, product?._docId]
      .map(v => String(v || "").trim().toLowerCase()).filter(Boolean);
    if(productCodes.includes(code)) return { product, variant:null, barcodeType:"product" };
    const map = variantBarcodeMap(product);
    for(const [variant, value] of Object.entries(map)){
      if(String(value || "").trim().toLowerCase() === code) return { product, variant, barcodeType:"variant" };
    }
    if(Array.isArray(product?.variantPhotoList)){
      for(const row of product.variantPhotoList){
        if(String(row?.barcode || "").trim().toLowerCase() === code) return { product, variant:row.name || row.variant || null, barcodeType:"variant" };
      }
    }
  }
  return null;
}

const sumVariantStocks = (map) => Object.values(map || {}).reduce((sum, value) => sum + Number(value || 0), 0);

const isBundleCartItem = (item) => item && item.type === "bundle" && Array.isArray(item.bundleItems);
const bundleKey = (item) => isBundleCartItem(item) ? (item.bundleId || item.id || "bundle") + "::" + item.bundleItems.map(x => (x.productId || x.id) + "=" + (x.size || x.variant || "Default")).join("|") : "";
const findExistingCartItem = (items, target) => isBundleCartItem(target)
  ? items.find(x => isBundleCartItem(x) && bundleKey(x) === bundleKey(target))
  : items.find(x => !isBundleCartItem(x) && x.id === target.id && x.size === target.size);
const forEachStockComponent = (item, callback) => {
  if(isBundleCartItem(item)){
    item.bundleItems.forEach(component => callback({
      productId: component.productId || component.id,
      size: component.size || component.variant || "Default",
      qty: Number(item.qty || 1) * Number(component.qty || 1),
      label: component.name || item.name || "Bundle item"
    }));
  } else {
    callback({ productId:item.id || item.productId, size:item.size || item.variant || "Default", qty:Number(item.qty || 1), label:item.name || "Product" });
  }
};
const getProductVariants = (p, fallback=[]) => Array.isArray(p?.variants) && p.variants.length ? p.variants.filter(Boolean) : fallback;
const escapeHtml = (v) => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
function showNotice(text){ const el = $("notice"); if(!el) return; el.textContent = text; el.style.display = "block"; clearTimeout(window.__vapeNoticeTimer); window.__vapeNoticeTimer = setTimeout(() => el.style.display = "none", 2000); }
function formatChatTime(value){ return escapeHtml(String(value || "").replace("T"," ").slice(0,16)); }
function renderChatMessageBody(item){
  const parts = [];
  if(item?.text) parts.push(`<div class="chat-text">${escapeHtml(item.text)}</div>`);
  if(item?.image) parts.push(`<img class="chat-image" src="${escapeHtml(item.image)}" alt="Chat attachment" />`);
  return parts.join("") || '<div class="chat-text">Attachment</div>';
}
function readFileAsDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
async function compressImageFile(file, maxWidth=1280, quality=0.82){
  if(!file) return "";
  const dataUrl = await readFileAsDataUrl(file);
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
  const ratio = Math.min(1, maxWidth / (image.width || maxWidth));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((image.width || maxWidth) * ratio));
  canvas.height = Math.max(1, Math.round((image.height || maxWidth) * ratio));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}
function setImagePreview(inputId, previewWrapId, previewImgId, fileNameId){
  const input = $(inputId);
  const wrap = $(previewWrapId);
  const img = $(previewImgId);
  const name = $(fileNameId);
  const file = input?.files?.[0];
  if(!input || !wrap || !img || !name) return;
  if(!file){
    wrap.classList.add("hidden");
    img.removeAttribute("src");
    name.textContent = "No image selected";
    return;
  }
  name.textContent = file.name;
  const url = URL.createObjectURL(file);
  img.src = url;
  img.onload = () => URL.revokeObjectURL(url);
  wrap.classList.remove("hidden");
}
function clearFileInput(inputId, previewWrapId, previewImgId, fileNameId){
  const input = $(inputId);
  const wrap = $(previewWrapId);
  const img = $(previewImgId);
  const name = $(fileNameId);
  if(input) input.value = "";
  if(img) img.removeAttribute("src");
  if(wrap) wrap.classList.add("hidden");
  if(name) name.textContent = "No image selected";
}
function getLastSeenMap(){ return readJSON(CUSTOMER_LAST_SEEN_KEY, {}); }
function setConversationSeen(chatId){
  if(!chatId) return;
  const map = getLastSeenMap();
  map[chatId] = new Date().toISOString();
  writeJSON(CUSTOMER_LAST_SEEN_KEY, map);
}
function updateInboxBadge(conversation){
  const badge = $("inboxBadge");
  if(!badge) return;
  if(!conversation){
    badge.classList.add("hidden");
    badge.textContent = "0";
    return;
  }
  const lastSeen = getLastSeenMap()[conversation.id] || "";
  const unread = (Array.isArray(conversation.thread) ? conversation.thread : []).filter(item => item.sender === "admin" && String(item.at || "") > String(lastSeen)).length;
  badge.textContent = String(unread);
  badge.classList.toggle("hidden", unread <= 0);
}
function playNotificationBeep(){
  try{
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.03;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  }catch{}
}
function getMode(){ const saved = readJSON(MODE_KEY, null); if(saved==="local"||saved==="firebase") return saved; return firebaseReady ? "firebase" : "local"; }
function setMode(mode){ writeJSON(MODE_KEY, mode); }
const getLocalProducts = () => readJSON(PRODUCTS_KEY, []);
const setLocalProducts = (items) => writeJSON(PRODUCTS_KEY, items);
const getLocalOrders = () => readJSON(ORDERS_KEY, []);
const setLocalOrders = (items) => writeJSON(ORDERS_KEY, items);
const getLocalHistory = () => readJSON(HISTORY_KEY, []);
const setLocalHistory = (items) => writeJSON(HISTORY_KEY, items);
const getLocalCustomers = () => readJSON(CUSTOMERS_KEY, []);
const setLocalCustomers = (items) => writeJSON(CUSTOMERS_KEY, items);
const getLocalMessages = () => readJSON(MESSAGES_KEY, []);
const setLocalMessages = (items) => writeJSON(MESSAGES_KEY, items);
function seedLocalIfEmpty(){ if(!getLocalProducts().length){ setLocalProducts(demoProducts.map((item, index) => ({ ...item, id: "p" + (index + 1) }))); } }
let selectedAdminMessageId = null;
let adminMessagesCache = [];
function messageTime(value){
  try{
    if(value && typeof value.toDate === "function") return value.toDate().toLocaleString();
    if(value) return new Date(value).toLocaleString();
  }catch{}
  return "";
}
function renderMessages(messages=[]){
  const list = $("messagesList"), header = $("adminConversationHeader"), chat = $("adminChatWindow"), status = $("adminMessageStatus");
  if(!list || !header || !chat) return;
  if(!selectedAdminMessageId && messages.length) selectedAdminMessageId = messages[0].id;
  if(!messages.length){
    list.innerHTML = '<div class="empty mini">No customer messages yet.</div>';
    header.textContent = 'Select a conversation';
    chat.innerHTML = '<div class="empty mini">Messages from customers will appear here.</div>';
    return;
  }
  list.innerHTML = messages.map(m => `<button type="button" class="admin-conversation-item ${m.id===selectedAdminMessageId?'active':''}" data-message-pick="${escapeHtml(m.id)}"><strong>${escapeHtml(m.name || 'Customer')}</strong><span>${escapeHtml(m.phone || '')}</span><small>${escapeHtml(m.latestMessage || m.message || 'New message')}</small><em>${escapeHtml(m.status || 'New')}</em></button>`).join('');
  list.querySelectorAll('[data-message-pick]').forEach(btn => btn.onclick = () => { selectedAdminMessageId = btn.dataset.messagePick; renderMessages(messages); });
  const current = messages.find(m => m.id === selectedAdminMessageId) || messages[0];
  selectedAdminMessageId = current.id;
  if(status) status.value = current.status || 'New';
  header.innerHTML = `<strong>${escapeHtml(current.name || 'Customer')}</strong><span>${escapeHtml(current.phone || '')}</span>`;
  const thread = Array.isArray(current.thread) && current.thread.length ? current.thread : [{ sender:'customer', text:current.message || current.latestMessage || '', image:current.image || '', at:current.createdAt || current.updatedAt }];
  chat.innerHTML = thread.map(item => {
    const isAdmin = item.sender === 'admin';
    return `
      <div class="admin-chat-row ${isAdmin ? 'admin' : 'customer'}">
        <div class="admin-chat-bubble ${isAdmin ? 'admin' : 'customer'}">
          <div class="bubble-label">${isAdmin ? 'You / Admin' : escapeHtml(current.name || 'Customer')}</div>
          ${renderChatMessageBody(item)}
          <small>${escapeHtml(messageTime(item.at))}</small>
        </div>
      </div>
    `;
  }).join('');
  chat.scrollTop = chat.scrollHeight;
}
async function sendAdminReply(){
  const textEl = $("adminReplyText"), statusEl = $("adminMessageStatus");
  const sendBtn = $("sendAdminReplyBtn");

  if(!selectedAdminMessageId && adminMessagesCache.length){
    selectedAdminMessageId = adminMessagesCache[0].id;
  }
  if(!selectedAdminMessageId){ showNotice('Select a customer message first'); return; }

  const text = (textEl?.value || '').trim();
  const image = await compressImageFile($("adminReplyImage")?.files?.[0]);
  if(!text && !image){ showNotice('Type a reply or add image'); return; }

  try{
    if(sendBtn){ sendBtn.disabled = true; sendBtn.textContent = 'Sending...'; }
    let current = null;

    if(getMode()==="firebase" && firebaseReady){
      const snap = await getDoc(doc(db, "messages", selectedAdminMessageId));
      if(snap.exists()) current = { id:snap.id, ...snap.data() };
    } else {
      current = getLocalMessages().find(x => x.id === selectedAdminMessageId);
    }

    if(!current){ showNotice('Conversation not found'); return; }

    const now = new Date().toISOString();
    const thread = Array.isArray(current.thread) ? current.thread.slice() : [];
    thread.push({ sender:'admin', text, image, at: now });

    const payload = {
      thread,
      reply: text,
      latestMessage: text || 'Image attachment',
      status: statusEl?.value || 'Replied',
      updatedAt: (getMode()==="firebase" && firebaseReady) ? serverTimestamp() : now
    };

    await updateMessage(selectedAdminMessageId, payload);

    if(textEl) textEl.value = '';
    clearFileInput("adminReplyImage", "adminReplyImagePreviewWrap", "adminReplyImagePreview", "adminReplyImageName");
    showNotice('Reply sent');
  }catch(error){
    console.error('Admin reply failed:', error);
    showNotice(error?.message || 'Reply failed. Check Firestore rules for messages update.');
  }finally{
    if(sendBtn){ sendBtn.disabled = false; sendBtn.textContent = 'Send Reply'; }
  }
}
function bindNoticeButtons(){ document.querySelectorAll(".js-notice").forEach(btn => btn.onclick = () => showNotice(btn.dataset.text || "Done")); }
async function fetchFirebaseDocs(col, field=null){ const ref = collection(db, col); const q = field ? query(ref, orderBy(field, "desc")) : ref; const snap = await getDocs(q); return snap.docs.map(d => ({ id:d.id, ...d.data() })); }


function getLocalPromos(){
  return readJSON(PROMOS_KEY, []);
}
function setLocalPromos(items){
  writeJSON(PROMOS_KEY, Array.isArray(items) ? items : []);
}
function upsertLocalPromo(clean, promoId){
  const items = getLocalPromos();
  const now = Date.now();
  if(!promoId) promoId = "promo_" + now;
  const idx = items.findIndex(x => x.id === promoId);
  const row = { ...clean, id:promoId, updatedAt:now, localBackup:true };
  if(idx >= 0) items[idx] = { ...items[idx], ...row };
  else items.unshift({ ...row, createdAt:now });
  setLocalPromos(items);
  return promoId;
}
function normalizePromoDoc(promo){
  return {
    id:String(promo.id || "promo_" + Date.now()),
    name:String(promo.name || "V2 Pod + V3 Battery Bundle"),
    price:Number(promo.price || 750),
    oldPrice:Number(promo.oldPrice || 830),
    badge:String(promo.badge || "BEST DEAL"),
    active:promo.active !== false,
    items:Array.isArray(promo.items) && promo.items.length ? promo.items.map((item, idx) => ({
      productId:String(item.productId || "").trim(),
      productMatch:String(item.productMatch || (idx === 0 ? "v2pod" : "v3device")).trim(),
      qty:Math.max(1, Number(item.qty || 1))
    })) : [
      { productId:"", productMatch:"v2pod", qty:1 },
      { productId:"", productMatch:"v3device", qty:1 }
    ]
  };
}
async function fetchPromos(){
  const localPromos = getLocalPromos().map(normalizePromoDoc);
  let firebasePromos = [];
  try{
    if(getMode()==="firebase" && firebaseReady){
      const snap = await getDocs(collection(db, "promos"));
      firebasePromos = snap.docs.map(d => normalizePromoDoc({ id:d.id, ...d.data() }));
    }
  }catch(error){
    console.warn("Promo load failed, using local promos:", error);
  }
  // Merge Firebase + local backup so admin and customer pages never show blank after a save fallback.
  const merged = new Map();
  [...firebasePromos, ...localPromos].forEach(p => merged.set(p.id, p));
  return Array.from(merged.values());
}
async function savePromoItem(payload, promoId){
  const clean = normalizePromoDoc({ ...payload, id:promoId || "" });
  delete clean.id;
  let savedId = promoId || "";
  try{
    if(getMode()==="firebase" && firebaseReady){
      if(savedId && !savedId.startsWith("promo_")){
        await updateDoc(doc(db, "promos", savedId), { ...clean, updatedAt:serverTimestamp() });
      }else{
        const ref = await addDoc(collection(db, "promos"), { ...clean, createdAt:serverTimestamp(), updatedAt:serverTimestamp() });
        savedId = ref.id;
      }
      // also keep a local mirror so customer/admin stay visible immediately on GitHub Pages.
      upsertLocalPromo(clean, savedId);
      return savedId;
    }
  }catch(error){
    console.warn("Firebase promo save failed. Saving promo locally instead:", error);
  }
  return upsertLocalPromo(clean, savedId);
}
async function deletePromoItem(promoId){
  if(!promoId) return;
  try{
    if(getMode()==="firebase" && firebaseReady && !String(promoId).startsWith("promo_")){
      await deleteDoc(doc(db, "promos", promoId));
    }
  }catch(error){
    console.warn("Firebase promo delete failed. Removing local copy only:", error);
  }
  setLocalPromos(getLocalPromos().filter(x => x.id !== promoId));
}
function storageSync(callback){ const h = () => callback(); window.addEventListener("storage", h); return () => window.removeEventListener("storage", h); }
async function saveProduct(payload, docId){
  if(getMode()==="firebase" && firebaseReady){
    if(docId){ await updateDoc(doc(db, "products", docId), payload); return docId; }
    const ref = await addDoc(collection(db, "products"), { ...payload, createdAt: serverTimestamp() }); return ref.id;
  }
  const items = getLocalProducts();
  if(docId){ const idx = items.findIndex(x => x.id === docId); if(idx >= 0) items[idx] = { ...items[idx], ...payload, id: docId }; }
  else items.unshift({ ...payload, id: String(Date.now()) });
  setLocalProducts(items); return docId || items[0].id;
}
async function deleteProductItem(docId){
  if(getMode()==="firebase" && firebaseReady){ await deleteDoc(doc(db, "products", docId)); return; }
  setLocalProducts(getLocalProducts().filter(x => x.id !== docId));
}
async function seedProducts(){
  if(getMode()==="firebase" && firebaseReady){
    const current = await fetchFirebaseDocs("products", "createdAt");
    if(current.length) throw new Error("Products already exist");
    const batch = writeBatch(db);
    demoProducts.forEach(item => { const ref = doc(collection(db, "products")); batch.set(ref, { ...item, createdAt: serverTimestamp() }); });
    await batch.commit(); return;
  }
  if(getLocalProducts().length) throw new Error("Products already exist");
  seedLocalIfEmpty();
}
async function saveCustomerProfile(account){
  if(getMode()==="firebase" && firebaseReady && account.phone){ await setDoc(doc(db, "customers_public", account.phone), { ...account, updatedAt: serverTimestamp() }, { merge:true }); }
  const customers = getLocalCustomers(); const idx = customers.findIndex(c => c.phone === account.phone && account.phone); if(idx >= 0) customers[idx] = account; else customers.unshift(account); setLocalCustomers(customers);
}
async function createOrder(cart, account, shippingInfo={}){
  if(getMode()==="firebase" && firebaseReady){
    await runTransaction(db, async (transaction) => {
      // Firestore transactions require all reads before writes.
      const componentRows = [];
      for(const item of cart){
        forEachStockComponent(item, component => {
          if(!component.productId) throw new Error("Missing bundle product ID");
          componentRows.push({ item, component, ref:doc(db, "products", component.productId) });
        });
      }

      const snapshots = [];
      for(const row of componentRows){
        const snap = await transaction.get(row.ref);
        snapshots.push({ ...row, snap });
      }

      const updateMap = new Map();
      for(const row of snapshots){
        const { item, component, ref, snap } = row;
        if(!snap.exists()) throw new Error(component.label + " not found");
        const data = snap.data();
        const selectedVariant = component.size || "Default";
        const qty = Number(component.qty || 0);
        const key = ref.path;
        let state = updateMap.get(key);
        if(!state){
          state = { ref, data, variantStocks:(data.variantStocks && typeof data.variantStocks === "object") ? { ...data.variantStocks } : null, stock:Number(data.stock || 0) };
          updateMap.set(key, state);
        }
        if(state.variantStocks && Object.prototype.hasOwnProperty.call(state.variantStocks, selectedVariant)){
          const vStock = Number(state.variantStocks[selectedVariant] || 0);
          if(vStock < qty) throw new Error("Not enough stock for " + (item.name || component.label) + " - " + selectedVariant);
          state.variantStocks[selectedVariant] = vStock - qty;
        } else {
          if(state.stock < qty) throw new Error("Not enough stock for " + (item.name || component.label));
          state.stock -= qty;
        }
      }

      updateMap.forEach(state => {
        if(state.variantStocks) transaction.update(state.ref, { variantStocks:state.variantStocks, stock:sumVariantStocks(state.variantStocks) });
        else transaction.update(state.ref, { stock:state.stock });
      });

      const liveItems = cart.map(item => {
        if(isBundleCartItem(item)) return {
          type:"bundle", bundleId:item.bundleId || item.id || "v2-v3-bundle", name:item.name, qty:Number(item.qty || 1), price:Number(item.price || 0), image:item.image || "",
          bundleItems:(item.bundleItems || []).map(c => ({ productId:c.productId || c.id, name:c.name, brand:c.brand || "", category:c.category || "", size:c.size || c.variant || "Default", qty:Number(c.qty || 1), image:c.image || "" })),
          size:(item.bundleItems || []).map(c => c.size || c.variant || "Default").join(" + ")
        };
        return { name:item.name, qty:Number(item.qty || 1), price:Number(item.price), productId:item.id, size:item.size || item.variant || "Default", image:item.image || "" };
      });

      const orderRef = doc(collection(db, "orders"));
      transaction.set(orderRef, { customer:account, items:liveItems, subtotal:cartSubtotal(liveItems), shippingFee:Number(shippingInfo.fee || 0), shippingZone:shippingInfo.zone || "", total:totalAmount(liveItems, shippingInfo.fee), status:"Pending", createdAt:serverTimestamp() });
    });
    return;
  }

  const products = getLocalProducts();
  for(const item of cart){
    forEachStockComponent(item, component => {
      const p = products.find(x => x.id === component.productId);
      if(!p || getVariantStock(p, component.size) < Number(component.qty)) throw new Error("Not enough stock for " + (item.name || component.label) + (component.size ? " - " + component.size : ""));
    });
  }
  for(const item of cart){
    forEachStockComponent(item, component => {
      const p = products.find(x => x.id === component.productId);
      const map = variantStockMap(p);
      if(component.size && Object.prototype.hasOwnProperty.call(map, component.size)){
        p.variantStocks = { ...map, [component.size]: Number(map[component.size] || 0) - Number(component.qty) };
        p.stock = sumVariantStocks(p.variantStocks);
      } else {
        p.stock = Number(p.stock) - Number(component.qty);
      }
    });
  }
  setLocalProducts(products);
  const liveItems = cart.map(i => isBundleCartItem(i) ? ({ ...i, qty:Number(i.qty || 1), size:(i.bundleItems || []).map(c => c.size || c.variant || "Default").join(" + ") }) : ({ name:i.name, qty:Number(i.qty), price:Number(i.price), productId:i.id, size:i.size || "Default", image:i.image || "" }));
  const orders = getLocalOrders();
  orders.unshift({ id:"ORD-" + Date.now(), customer:account, items:liveItems, subtotal:cartSubtotal(liveItems), shippingFee:Number(shippingInfo.fee || 0), shippingZone:shippingInfo.zone || "", total:totalAmount(liveItems, shippingInfo.fee), status:"Pending", createdAt:new Date().toISOString() });
  setLocalOrders(orders);
}
async function updateOrderStatus(orderId, newStatus, activeOrdersCache=[]){
  if(getMode()==="firebase" && firebaseReady){
    const order = activeOrdersCache.find(x => x.id === orderId); if(!order) return;
    if(newStatus === "Completed"){ await setDoc(doc(db, "order_history", orderId), { ...order, status:"Completed", movedAt:serverTimestamp() }); await deleteDoc(doc(db, "orders", orderId)); return; }
    await updateDoc(doc(db, "orders", orderId), { status:newStatus }); return;
  }
  const orders = getLocalOrders(); const idx = orders.findIndex(o => o.id === orderId); if(idx < 0) return;
  if(newStatus === "Completed"){ const history = getLocalHistory(); history.unshift({ ...orders[idx], status:"Completed", movedAt:new Date().toISOString() }); setLocalHistory(history); orders.splice(idx,1); setLocalOrders(orders); return; }
  orders[idx].status = newStatus; setLocalOrders(orders);
}
async function moveOrderToHistory(orderId, activeOrdersCache=[]){
  if(getMode()==="firebase" && firebaseReady){
    const order = activeOrdersCache.find(x => x.id === orderId); if(!order) return;
    await setDoc(doc(db, "order_history", orderId), { ...order, status:order.status || "Removed", movedAt:serverTimestamp() }); await deleteDoc(doc(db, "orders", orderId)); return;
  }
  const orders = getLocalOrders(); const idx = orders.findIndex(o => o.id === orderId); if(idx < 0) return;
  const history = getLocalHistory(); history.unshift({ ...orders[idx], status:orders[idx].status || "Removed", movedAt:new Date().toISOString() }); setLocalHistory(history); orders.splice(idx,1); setLocalOrders(orders);
}
async function cancelAndRestoreOrder(orderId, activeOrdersCache=[]){
  const order = activeOrdersCache.find(x => x.id === orderId);
  if(!order) return;
  if(!confirm("Cancel this order and restore stock?")) return;
  if(getMode()==="firebase" && firebaseReady){
    await runTransaction(db, async (transaction) => {
      const reads = [];
      for(const item of (order.items || [])){
        forEachStockComponent(item, component => {
          if(!component.productId) return;
          const ref = doc(db, "products", component.productId);
          reads.push({ item, component, ref });
        });
      }
      for(const row of reads){ row.snap = await transaction.get(row.ref); }
      const orderRef = doc(db, "orders", orderId);
      const histRef = doc(db, "order_history", orderId);
      for(const row of reads){
        if(!row.snap.exists()) continue;
        const data = row.snap.data();
        const qty = Number(row.component?.qty || row.item.qty || 0);
        const variant = row.component?.size || row.item.size || row.item.variant || "Default";
        const variantStocks = (data.variantStocks && typeof data.variantStocks === "object") ? { ...data.variantStocks } : {};
        if(variant && (Object.keys(variantStocks).length || Array.isArray(data.variants))){
          variantStocks[variant] = Number(variantStocks[variant] || 0) + qty;
          transaction.update(row.ref, { variantStocks, stock: sumVariantStocks(variantStocks) });
        } else transaction.update(row.ref, { stock: Number(data.stock || 0) + qty });
      }
      transaction.set(histRef, { ...order, status:"Cancelled", cancelReason:"Cancelled by admin", stockRestored:true, movedAt:serverTimestamp() });
      transaction.delete(orderRef);
    });
    return;
  }
  const products = getLocalProducts();
  (order.items || []).forEach(item => {
    forEachStockComponent(item, component => {
      const p = products.find(x => x.id === component.productId);
      if(!p) return;
      const qty = Number(component.qty || 0);
      const variant = component.size || "Default";
      const map = variantStockMap(p);
      if(variant && (Object.keys(map).length || Array.isArray(p.variants))){ p.variantStocks = { ...map, [variant]: Number(map[variant] || 0) + qty }; p.stock = sumVariantStocks(p.variantStocks); }
      else p.stock = Number(p.stock || 0) + qty;
    });
  });
  setLocalProducts(products);
  const orders = getLocalOrders();
  const idx = orders.findIndex(o => o.id === orderId);
  if(idx >= 0){ const history = getLocalHistory(); history.unshift({ ...orders[idx], status:"Cancelled", stockRestored:true, movedAt:new Date().toISOString() }); orders.splice(idx,1); setLocalOrders(orders); setLocalHistory(history); }
}
function subscribeProducts(callback){
  if(getMode()==="firebase" && firebaseReady){
    return onSnapshot(query(collection(db, "products"), orderBy("createdAt", "desc")), (snapshot) => callback(snapshot.docs.map(d => { const data = d.data(); return { ...data, id:(data.id || d.id), docId:d.id, firestoreId:d.id }; }), "firebase"), () => { seedLocalIfEmpty(); callback(getLocalProducts(), "local"); });
  }
  seedLocalIfEmpty(); callback(getLocalProducts(), "local"); return storageSync(() => callback(getLocalProducts(), "local"));
}
function subscribeOrders(callback){
  if(getMode()==="firebase" && firebaseReady){
    return onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), async (snapshot) => {
      let history = []; try { history = await fetchFirebaseDocs("order_history", "movedAt"); } catch {}
      callback(snapshot.docs.map(d => { const data = d.data(); return { ...data, id:(data.id || d.id), docId:d.id, firestoreId:d.id }; }), history, "firebase");
    }, () => callback(getLocalOrders(), getLocalHistory(), "local"));
  }
  callback(getLocalOrders(), getLocalHistory(), "local"); return storageSync(() => callback(getLocalOrders(), getLocalHistory(), "local"));
}
function subscribeCustomers(callback){
  if(getMode()==="firebase" && firebaseReady){
    return onSnapshot(query(collection(db, "customers_public"), orderBy("updatedAt", "desc")), (snapshot) => callback(snapshot.docs.map(d => { const data = d.data(); return { ...data, id:(data.id || d.id), docId:d.id, firestoreId:d.id }; }), "firebase"), () => callback(getLocalCustomers(), "local"));
  }
  callback(getLocalCustomers(), "local"); return storageSync(() => callback(getLocalCustomers(), "local"));
}
function isAdminEmail(email){
  return ADMIN_EMAILS.map(x => x.toLowerCase()).includes(String(email || "").toLowerCase());
}

async function getUserRole(user){
  if(!user) return "none";
  if(isAdminEmail(user.email)) return "admin";
  try{
    const roleSnap = await getDoc(doc(db, "users", user.uid));
    const role = String(roleSnap.exists() ? (roleSnap.data().role || "") : "").toLowerCase();
    if(role === "staff" || role === "cashier") return "staff";
    if(role === "admin") return "admin";
  }catch(error){ console.warn("Role check failed", error); }
  return "none";
}

function requireAdminGuard(){
  if(!firebaseReady || !auth){
    showNotice("Firebase Auth is not ready");
    return;
  }
  onAuthStateChanged(auth, async (user) => {
    const role = await getUserRole(user);
    if(role !== "admin"){
      if(role === "staff") window.location.href = "./staff-pos.html";
      else window.location.href = "./admin-login.html";
      return;
    }
    document.body.dataset.role = "admin";
    initAdmin();
  });
}

function requireStaffGuard(){
  if(!firebaseReady || !auth){
    showNotice("Firebase Auth is not ready");
    return;
  }
  onAuthStateChanged(auth, async (user) => {
    const role = await getUserRole(user);
    if(role !== "admin" && role !== "staff"){
      window.location.href = "./admin-login.html";
      return;
    }
    document.body.dataset.role = role === "admin" ? "admin" : "staff";
    initAdmin();
  });
}

function initAdminLogin(){
  const form = $("adminLoginForm");
  form.onsubmit = async (e) => {
    e.preventDefault();
    if(!firebaseReady || !auth){
      showNotice("Firebase Auth is not ready");
      return;
    }
    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const role = await getUserRole(cred.user);
      if(role === "admin"){
        window.location.href = "./admin.html";
        return;
      }
      if(role === "staff"){
        window.location.href = "./staff-pos.html";
        return;
      }
      await signOut(auth);
      showNotice("This account has no admin/staff role yet.");
    } catch (error) {
      showNotice("Login failed. Check email/password.");
    }
  };
}


async function saveInquiryMessage(payload){
  const now = new Date().toISOString();
  const starter = { sender:"customer", text: payload.message || "", image: payload.image || "", at: now };
  const latestMessage = payload.message || (payload.image ? "Image attachment" : "New message");

  if(getMode()==="firebase" && firebaseReady){
    await addDoc(collection(db, "messages"), {
      name: payload.name,
      phone: payload.phone,
      message: payload.message || "",
      latestMessage,
      status:"New",
      reply:"",
      thread:[starter],
      createdAt: now,
      updatedAt: now
    });
    return;
  }

  const items = getLocalMessages();
  items.unshift({
    id:"MSG-" + Date.now(),
    name: payload.name,
    phone: payload.phone,
    message: payload.message || "",
    latestMessage,
    status:"New",
    reply:"",
    thread:[starter],
    createdAt: now,
    updatedAt: now
  });
  setLocalMessages(items);
}

async function updateMessage(messageId, updates){
  if(getMode()==="firebase" && firebaseReady){
    await updateDoc(doc(db, "messages", messageId), updates);
    return;
  }
  const items = getLocalMessages();
  const idx = items.findIndex(x => x.id === messageId);
  if(idx >= 0){
    items[idx] = { ...items[idx], ...updates };
    setLocalMessages(items);
  }
}

function subscribeMessages(callback){
  const sortMessages = (arr) => arr.slice().sort((a,b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  if(getMode()==="firebase" && firebaseReady){
    return onSnapshot(collection(db, "messages"), (snapshot) => {
      callback(sortMessages(snapshot.docs.map(d => ({ id:d.id, ...d.data() }))), "firebase");
    }, () => callback(sortMessages(getLocalMessages()), "local"));
  }
  callback(sortMessages(getLocalMessages()), "local");
  return storageSync(() => callback(sortMessages(getLocalMessages()), "local"));
}


if(document.getElementById("adminLoginForm")) initAdminLogin();
else if(page === "shop") initShop();
else if(page === "admin") requireAdminGuard();
else if(page === "staff") requireStaffGuard();

document.addEventListener("DOMContentLoaded", () => {
  const inboxBtn = document.getElementById("openInboxBtn");
  const inquiryModal = document.getElementById("inquiryModal");
  if(inboxBtn && inquiryModal){
    inboxBtn.addEventListener("click", () => inquiryModal.classList.remove("hidden"));
  }
});


function initShop(){
  bindNoticeButtons();

  let currentCategory = "All";
  let products = [];
  let cart = readJSON(CART_KEY, []);
  let account = readJSON(ACCOUNT_KEY, {name:"", phone:"", email:"", address:""});
  let selectedProduct = null;
  let selectedSize = null;
  let detailQty = 1;
  let shippingSettings = getLocalShippingSettings();
  let selectedShippingZone = readJSON("vape_shop_selected_shipping_zone", "");

  const chipsEl = $("chips");
  const gridEl = $("productGrid");
  const sourceLabel = $("sourceLabel");
  const searchInput = $("searchInput");
  const drawer = $("drawer");
  const drawerTitle = $("drawerTitle");
  const cartView = $("cartView");
  const accountView = $("accountView");
  const productPageModal = $("productPageModal");
  let liveConversations = [];

  function renderChips(){
    chipsEl.innerHTML = categories.map(cat => `<button class="chip ${cat===currentCategory?"active":""}" data-cat="${cat}">${cat}</button>`).join("");
    chipsEl.querySelectorAll(".chip").forEach(btn => {
      btn.onclick = () => {
        currentCategory = btn.dataset.cat;
        renderChips();
        renderProducts();
      };
    });
  }

  function productOnlyImages(p){
    const imgs = Array.isArray(p?.images) ? p.images.map(x => String(x || "").trim()).filter(Boolean) : [];
    const variantImgs = [];
    if(p?.variantImages && typeof p.variantImages === "object"){
      Object.values(p.variantImages).forEach(img => { if(img) variantImgs.push(String(img).trim()); });
    }
    if(Array.isArray(p?.variantPhotoList)){
      p.variantPhotoList.forEach(v => { if(v?.image) variantImgs.push(String(v.image).trim()); });
    }
    const variantSet = new Set(variantImgs.filter(Boolean));
    return imgs.filter(img => !variantSet.has(img));
  }

  function firstProductImage(p){
    const extraImgs = productOnlyImages(p);
    const imgs = Array.isArray(p?.images) ? p.images.map(x => String(x || "").trim()).filter(Boolean) : [];
    return extraImgs[0] || String(p?.image || "").trim() || imgs[0] || "";
  }

  let cardSliderTimer = null;
  let galleryState = { images: [], index: 0 };

  function productGalleryImages(p){
    const extraImgs = productOnlyImages(p);
    const allImgs = Array.isArray(p?.images) ? p.images.map(x => String(x || "").trim()).filter(Boolean) : [];
    const variantImgs = [];
    if(p?.variantImages && typeof p.variantImages === "object"){
      Object.values(p.variantImages).forEach(img => { if(img) variantImgs.push(String(img).trim()); });
    }
    if(Array.isArray(p?.variantPhotoList)){
      p.variantPhotoList.forEach(v => { if(v?.image) variantImgs.push(String(v.image).trim()); });
    }
    return Array.from(new Set(extraImgs.concat(allImgs).concat(variantImgs).concat([String(p?.image || "").trim()]))).filter(Boolean);
  }

  function startCardImageSystem(){
    if(cardSliderTimer) clearInterval(cardSliderTimer);
    cardSliderTimer = setInterval(() => {
      document.querySelectorAll(".card[data-gallery]").forEach(card => {
        const imgs = (card.dataset.gallery || "").split("|||").filter(Boolean);
        if(imgs.length <= 1 || card.matches(":hover")) return;
        let idx = Number(card.dataset.galleryIndex || 0);
        idx = (idx + 1) % imgs.length;
        card.dataset.galleryIndex = String(idx);
        const img = card.querySelector(".thumb-img");
        if(img){ img.classList.add("is-changing"); setTimeout(() => { img.src = imgs[idx]; img.classList.remove("is-changing"); }, 90); }
        card.querySelectorAll(".image-dot").forEach((d,i) => d.classList.toggle("active", i === idx));
      });
    }, 2800);

    document.querySelectorAll(".card[data-gallery]").forEach(card => {
      card.onpointermove = (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - .5;
        const y = (e.clientY - r.top) / r.height - .5;
        card.style.setProperty("--tilt-x", (-y * 6).toFixed(2) + "deg");
        card.style.setProperty("--tilt-y", (x * 6).toFixed(2) + "deg");
      };
      card.onpointerleave = () => { card.style.setProperty("--tilt-x", "0deg"); card.style.setProperty("--tilt-y", "0deg"); };
    });
  }

  function cycleCardImage(card){
    const imgs = (card.dataset.gallery || "").split("|||").filter(Boolean);
    if(imgs.length <= 1) return;
    let idx = (Number(card.dataset.galleryIndex || 0) + 1) % imgs.length;
    card.dataset.galleryIndex = String(idx);
    const img = card.querySelector(".thumb-img");
    if(img) img.src = imgs[idx];
    card.querySelectorAll(".image-dot").forEach((d,i) => d.classList.toggle("active", i === idx));
  }

  function openUltraGallery(images, startIndex=0){
    const modal = $("ultraGalleryModal");
    const img = $("ultraGalleryImage");
    const count = $("ultraGalleryCount");
    if(!modal || !img || !images.length) return;
    galleryState.images = images;
    galleryState.index = Math.max(0, Math.min(startIndex, images.length - 1));
    img.src = images[galleryState.index];
    count.textContent = (galleryState.index + 1) + " / " + images.length;
    modal.classList.remove("hidden");
  }

  function moveUltraGallery(step){
    if(!galleryState.images.length) return;
    galleryState.index = (galleryState.index + step + galleryState.images.length) % galleryState.images.length;
    $("ultraGalleryImage").src = galleryState.images[galleryState.index];
    $("ultraGalleryCount").textContent = (galleryState.index + 1) + " / " + galleryState.images.length;
  }

  function closeUltraGallery(){
    const modal = $("ultraGalleryModal");
    if(modal) modal.classList.add("hidden");
  }

  function bindUltraGalleryControls(){
    const ultraCloseBtn = $("ultraGalleryClose");
    const ultraPrevBtn = $("ultraGalleryPrev");
    const ultraNextBtn = $("ultraGalleryNext");
    if(ultraCloseBtn) ultraCloseBtn.onclick = closeUltraGallery;
    if(ultraPrevBtn) ultraPrevBtn.onclick = () => moveUltraGallery(-1);
    if(ultraNextBtn) ultraNextBtn.onclick = () => moveUltraGallery(1);
    const ultraModal = $("ultraGalleryModal");
    if(ultraModal) ultraModal.onclick = (e) => { if(e.target === ultraModal) closeUltraGallery(); };
  }


  function productDocId(product){
    return String(product?.docId || product?.firestoreId || product?._docId || product?.id || "");
  }

  function productMatchesPromoItem(product, item){
    const wantedId = String(item?.productId || item?.docId || "").trim();
    const productIds = [product?.docId, product?.firestoreId, product?._docId, product?.id, product?.sku, product?.barcode].map(v => String(v || "").trim()).filter(Boolean);

    // If admin selected a specific product, match ONLY that exact product.
    if(wantedId) return productIds.includes(wantedId);

    const hay = ((product.name || "") + " " + (product.category || "") + " " + (product.brand || "")).toLowerCase();
    const category = String(product.category || "").toLowerCase();
    if(category === "promo") return false;

    // Auto mode is strict to avoid A1 Pod & Battery being used for V2 + V3 bundles.
    const match = String(item?.productMatch || "").toLowerCase();
    if(match === "v2pod") return category === "pods" && /\bv2\b/.test(hay);
    if(match === "v3device") return (category === "battery" || category === "devices") && /\bv3\b/.test(hay);

    // Backward compatibility for old auto promos.
    if(match === "pod") return category === "pods" && /\bv2\b/.test(hay);
    if(match === "device") return (category === "battery" || category === "devices") && /\bv3\b/.test(hay);
    return false;
  }

  function resolvePromoProducts(promo){
    return (promo.items || []).map(item => ({ item, product:products.find(p => productMatchesPromoItem(p, item)) })).filter(x => x.product);
  }

  function promoVariantOptions(product, fallback){
    return getProductVariants(product, fallback).map(v => {
      const stock = getVariantStock(product, v);
      return `<option value="${escapeHtml(v)}" ${stock <= 0 ? "disabled" : ""}>${escapeHtml(v)} ${stock <= 0 ? "(Out of stock)" : "(" + stock + " left)"}</option>`;
    }).join("");
  }

  async function renderBundlePromoSection(q=""){
    if(currentCategory !== "All" && currentCategory !== "Promo") return "";
    const promos = (await fetchPromos()).filter(p => p.active);
    if(!promos.length) return "";
    const needle = String(q || "").toLowerCase();
    const cards = promos.map(promo => {
      if(needle && !(promo.name || "").toLowerCase().includes(needle) && !"bundle promo combo deal v2 v3 pod device".includes(needle)) return "";
      const rows = resolvePromoProducts(promo);
      if(rows.length < 2) return "";
      const imgs = rows.map(r => firstProductImage(r.product)).filter(Boolean);
      const regular = promo.oldPrice || rows.reduce((sum, r) => sum + Number(r.product.price || 0) * Number(r.item.qty || 1), 0);
      const selectors = rows.map((r, idx) => {
        const fall = /device|battery|v3/i.test((r.product.category||"") + " " + (r.product.name||"")) ? ["Black","Gold","Purple","Blue"] : ["Black Wave","Beer Sparkle","Trouble Purple","Very More","Very Baguio","Red Cannon","Bacteria Monster","Blue Freeze"];
        return `<label>Choose ${escapeHtml(r.product.name)}<select data-promo-select="${escapeHtml(promo.id)}" data-index="${idx}">${promoVariantOptions(r.product, fall)}</select></label>`;
      }).join("");
      return `<section class="bundle-section promo-dynamic-card" data-promo-id="${escapeHtml(promo.id)}">
        <div class="bundle-copy"><span class="bundle-kicker">🔥 ${escapeHtml(promo.badge || "Bundle Deal")}</span><h3>${escapeHtml(promo.name)}</h3><p>Customer picks each item. Stock is deducted from the real selected variants.</p><div class="bundle-price"><strong>${money(promo.price)}</strong><span>Regular: ${money(regular)}</span></div></div>
        <div class="bundle-picker-card"><div class="bundle-images">${imgs.map((img,i)=>`${i?"<b>+</b>":""}<div style="background-image:url('${escapeHtml(img)}')"></div>`).join("")}</div>${selectors}<button class="btn dark bundle-add-btn" data-add-promo="${escapeHtml(promo.id)}" type="button">Add Bundle ${money(promo.price)}</button><div class="small bundle-note">Promo editable in admin. No fake promo stock.</div></div>
      </section>`;
    }).join("");
    return cards;
  }

  async function bindBundlePromo(){
    const promos = await fetchPromos();
    document.querySelectorAll("[data-add-promo]").forEach(btn => {
      btn.onclick = () => {
        const promo = promos.find(p => p.id === btn.dataset.addPromo);
        if(!promo){ showNotice("Promo not found"); return; }
        const rows = resolvePromoProducts(promo);
        if(rows.length < 2){ showNotice("Promo products not found"); return; }
        const selected = rows.map((r, idx) => {
          const sel = document.querySelector(`[data-promo-select="${CSS.escape(promo.id)}"][data-index="${idx}"]`);
          const size = sel?.value || "Default";
          return { ...r, size };
        });
        for(const row of selected){
          const required = Number(row.item.qty || 1);
          if(getVariantStock(row.product, row.size) < required){ showNotice("Selected promo item is out of stock"); return; }
        }
        const item = {
          type:"bundle", bundleId:promo.id, id:promo.id, name:promo.name, brand:"MR VAPE SHOP", category:"Promo", price:Number(promo.price || 0), image:firstProductImage(selected[0].product), qty:1,
          size:selected.map(r => r.size).join(" + "),
          bundleItems:selected.map(r => ({ productId:productDocId(r.product), name:r.product.name, brand:r.product.brand, category:r.product.category, size:r.size, qty:Number(r.item.qty || 1), image:(r.product.variantImages && r.product.variantImages[r.size]) ? r.product.variantImages[r.size] : firstProductImage(r.product) }))
        };
        const existing = findExistingCartItem(cart, item);
        const nextQty = (existing ? Number(existing.qty || 0) : 0) + 1;
        if(!bundleStockAvailable(item, nextQty)){ showNotice("No more stock available for this promo selection"); return; }
        if(existing) existing.qty = nextQty; else cart.push(item);
        writeJSON(CART_KEY, cart); renderCart(); showNotice("Promo added to cart");
      };
    });
  }

  async function renderProducts(){
    const q = (searchInput.value || "").trim().toLowerCase();
    const filtered = products.filter(p => {
      const categoryOk = currentCategory === "All" || p.category === currentCategory;
      const text = `${p.brand} ${p.name} ${p.category}`.toLowerCase();
      return categoryOk && (!q || text.includes(q));
    });

    const bundleSection = await renderBundlePromoSection(q);
    if(!filtered.length && !bundleSection){
      gridEl.innerHTML = '<div style="grid-column:1/-1" class="empty">No products found.</div>';
      return;
    }

    gridEl.innerHTML = bundleSection + filtered.map(p => {
      const gallery = productGalleryImages(p);
      const cardImage = gallery[0] || firstProductImage(p);
      const safeImage = escapeHtml(cardImage);
      const galleryData = escapeHtml(gallery.join("|||"));
      const dots = gallery.length > 1 ? `<div class="image-dots">${gallery.slice(0,5).map((_,i)=>`<span class="image-dot ${i===0?"active":""}"></span>`).join("")}</div>` : "";
      return `
      <article class="card ultra-card" data-view="${p.id}" data-gallery="${galleryData}" data-gallery-index="0">
        <div class="thumb ${cardImage ? "has-image" : "no-image"}" data-card-image>
          ${cardImage ? `<img class="thumb-img" src="${safeImage}" alt="${escapeHtml((p.brand || "") + " " + (p.name || "Product"))}" loading="lazy" decoding="async" onerror="this.closest('.thumb').classList.add('no-image');this.remove();">` : `<div class="thumb-placeholder">MR VAPE SHOP</div>`}
          ${dots}
          <div class="quick-view-pill">Tap image to preview</div>
          <div class="badge">${escapeHtml(p.badge || "New")}</div>
          <button class="fav js-notice" data-text="Wishlist feature can be added next">♡</button>
        </div>
        <div class="card-body">
          <div class="brand">${escapeHtml(p.brand)}</div>
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="meta">
            <span>${escapeHtml(p.category)}</span>
            <span>${escapeHtml(p.sold || "0 sold")}</span>
            <span>Stock: ${Number(p.stock || 0)}</span>
          </div>
          <div class="price-row">
            <div>
              <div class="price">${money(p.price)}</div>
              <div class="old">${money(p.oldPrice)}</div>
            </div>
            <button class="mini-btn" data-quick-add="${p.id}" ${Number(p.stock || 0)<=0 ? "disabled" : ""}>Quick Add</button>
          </div>
        </div>
      </article>
    `;
    }).join("");

    bindNoticeButtons();
    await bindBundlePromo();

    gridEl.querySelectorAll("[data-view]").forEach(card => {
      card.onclick = (e) => {
        if(e.target.closest("[data-quick-add]") || e.target.closest(".fav")) return;
        openProductPage(card.dataset.view);
      };
    });

    gridEl.querySelectorAll("[data-quick-add]").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        quickAdd(btn.dataset.quickAdd);
      };
    });

    gridEl.querySelectorAll("[data-card-image]").forEach(thumb => {
      thumb.onclick = (e) => {
        e.stopPropagation();
        const card = thumb.closest(".card");
        const gallery = (card?.dataset.gallery || "").split("|||").filter(Boolean);
        if(gallery.length > 1) openUltraGallery(gallery, Number(card.dataset.galleryIndex || 0));
        else if(card) openProductPage(card.dataset.view);
      };
      thumb.oncontextmenu = (e) => { e.preventDefault(); const card = thumb.closest(".card"); if(card) cycleCardImage(card); };
    });
    startCardImageSystem();
  }

  function quickAdd(id){
    const p = products.find(x => x.id === id);
    if(!p || Number(p.stock || 0) <= 0){
      showNotice("Product out of stock");
      return;
    }
    const variants = Array.isArray(p.variants) ? p.variants.filter(Boolean) : [];
    if(variants.length){
      openProductPage(id);
      showNotice("Please choose a flavor/color");
      return;
    }
    const existing = cart.find(x => x.id === id && x.size === "Default");
    const currentQty = existing ? Number(existing.qty) : 0;
    if(currentQty >= Number(p.stock || 0)){
      showNotice("No more stock available");
      return;
    }
    if(existing) existing.qty += 1;
    else cart.push({ id:p.id, name:p.name, brand:p.brand, category:p.category, price:p.price, image:firstProductImage(p), qty:1, size:"Default" });
    writeJSON(CART_KEY, cart);
    renderCart();
    showNotice("Added to cart");
  }

  function wireSizeButtons(){
    document.querySelectorAll(".size-option").forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll(".size-option").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        selectedSize = btn.dataset.size;
        const selectedStock = getVariantStock(selectedProduct, selectedSize);
        $("selectedSizeLabel").textContent = "Selected: " + selectedSize + " • Stock: " + selectedStock;
        $("productPageStock").textContent = "Stock: " + selectedStock;
        if(detailQty > selectedStock){ detailQty = Math.max(1, selectedStock); $("detailQtyValue").textContent = String(detailQty); updateDetailTotal(); }
        const variantImage = btn.dataset.image || "";
        if(variantImage){
          const main = $("productPageMainImage");
          if(main){
            main.src = variantImage;
            main.classList.add("variant-image-changed");
            setTimeout(() => main.classList.remove("variant-image-changed"), 220);
          }
          document.querySelectorAll(".product-thumb").forEach(t => t.classList.remove("active"));
          const matchingThumb = Array.from(document.querySelectorAll(".product-thumb")).find(t => t.dataset.image === variantImage);
          if(matchingThumb){
            matchingThumb.classList.add("active");
            matchingThumb.scrollIntoView({behavior:"smooth", inline:"center", block:"nearest"});
          }
        }
      };
    });
  }

  function openProductPage(id){
    const p = products.find(x => x.id === id);
    if(!p) return;

    selectedProduct = p;
    selectedSize = null;
    detailQty = 1;

    const variantImageMap = (p.variantImages && typeof p.variantImages === "object") ? { ...p.variantImages } : {};
    if(Array.isArray(p.variantPhotoList)){
      p.variantPhotoList.forEach(v => {
        if(v && v.name && v.image && !variantImageMap[v.name]) variantImageMap[v.name] = v.image;
      });
    }
    const variantGalleryImages = Object.values(variantImageMap).map(x => String(x || "").trim()).filter(Boolean);
    const productImages = (productOnlyImages(p).length ? productOnlyImages(p) : [firstProductImage(p)]).map(x => String(x || "").trim()).filter(Boolean);
    const galleryImages = Array.from(new Set(productImages.concat(variantGalleryImages))).filter(Boolean);
    $("productPageMainImage").src = galleryImages[0] || firstProductImage(p);
    $("productPageMainImage").onclick = () => openUltraGallery(galleryImages, 0);
    $("productPageBadge").textContent = p.badge || "New";
    const productThumbs = $("productThumbs");
    if(productThumbs){
      productThumbs.innerHTML = galleryImages.map((img, i) => '<button class="product-thumb ' + (i === 0 ? 'active' : '') + '" type="button" data-gallery-index="' + i + '" data-image="' + escapeHtml(img) + '"><img src="' + escapeHtml(img) + '" alt="Product photo ' + (i+1) + '"></button>').join("");
    }
    $("productPageBrand").textContent = p.brand || "MR VAPE SHOP";
    $("productPageName").textContent = p.name || "";
    $("productPagePrice").textContent = money(p.price);
    $("productPageOldPrice").textContent = money(p.oldPrice);
    $("productPageCategory").textContent = p.category || "Category";
    $("productPageSold").textContent = p.sold || "0 sold";
    $("productPageStock").textContent = "Stock: " + Number(p.stock || 0);
    $("productPageDescription").textContent =
      `${p.name} is available in our vape catalog. Check the price, stock, available flavor or device color, then add to cart for checkout or shop inquiry.`;

    if(productThumbs){
      productThumbs.querySelectorAll("[data-gallery-index]").forEach(thumb => {
        thumb.onclick = () => {
          productThumbs.querySelectorAll(".product-thumb").forEach(t => t.classList.remove("active"));
          thumb.classList.add("active");
          const i = Number(thumb.dataset.galleryIndex || 0);
          $("productPageMainImage").src = galleryImages[i] || galleryImages[0] || firstProductImage(p);
        };
      });
    }

    const defaultVariants = p.category === "Devices" || p.category === "Battery" ? ["Black","Gold","Purple","Blue"] : ["Classic","Mint","Fruit","Ice"];
    const variants = Array.isArray(p.variants) && p.variants.length ? p.variants : defaultVariants;
    const variantDetail = document.getElementById("productDetailVariants");
    if(variantDetail) variantDetail.textContent = variants.join(", ");
    const sizeGrid = $("sizeGrid");
    if(sizeGrid){
      sizeGrid.innerHTML = variants.map(v => {
        const vStock = getVariantStock(p, v);
        return `<button class="size-option" type="button" data-size="${escapeHtml(v)}" data-image="${escapeHtml(variantImageMap[v] || "")}" ${vStock <= 0 ? "disabled" : ""}>${escapeHtml(v)}<span class="variant-stock-pill">${vStock > 0 ? vStock + " in stock" : "Out of stock"}</span></button>`;
      }).join("");
    }
    document.querySelectorAll(".size-option").forEach(btn => btn.classList.remove("active"));
    $("selectedSizeLabel").textContent = "No variant selected";
    $("detailQtyValue").textContent = String(detailQty);
    updateDetailTotal();
    wireSizeButtons();

    productPageModal.classList.remove("hidden");
    const productScroll = document.querySelector(".product-page-scroll");
    if(productScroll) productScroll.scrollTop = 0;
    bindNoticeButtons();
  }

  function updateDetailTotal(){
    if(!selectedProduct){
      $("detailTotalPrice").textContent = "₱0";
      return;
    }
    $("detailTotalPrice").textContent = money(Number(selectedProduct.price || 0) * detailQty);
  }

  function closeProductPage(){
    if(productPageModal) productPageModal.classList.add("hidden");
  }

  function addDetailToCart(){
    if(!selectedProduct){
      showNotice("No product selected");
      return;
    }
    if(!selectedSize){
      showNotice("Please select variant");
      return;
    }
    const stock = getVariantStock(selectedProduct, selectedSize);
    if(stock <= 0){
      showNotice("Selected variant is out of stock");
      return;
    }

    const existing = cart.find(x => x.id === selectedProduct.id && x.size === selectedSize);
    const currentQty = existing ? Number(existing.qty) : 0;
    if(currentQty + detailQty > stock){
      showNotice("Not enough stock available");
      return;
    }

    if(existing) existing.qty += detailQty;
    else cart.push({
      id:selectedProduct.id,
      name:selectedProduct.name,
      brand:selectedProduct.brand,
      category:selectedProduct.category,
      price:selectedProduct.price,
      image:(selectedProduct.variantImages && selectedProduct.variantImages[selectedSize]) ? selectedProduct.variantImages[selectedSize] : firstProductImage(selectedProduct),
      qty:detailQty,
      size:selectedSize
    });

    writeJSON(CART_KEY, cart);
    renderCart();
    closeProductPage();
    showNotice(`Added ${detailQty} item(s) - Variant ${selectedSize}`);
  }

  function bundleStockAvailable(item, nextQty){
    if(!isBundleCartItem(item)){
      const live = products.find(x => x.id === item.id);
      return live ? getVariantStock(live, item.size) >= nextQty : false;
    }
    return (item.bundleItems || []).every(component => {
      const live = products.find(x => x.id === (component.productId || component.id));
      return live && getVariantStock(live, component.size || component.variant || "Default") >= nextQty * Number(component.qty || 1);
    });
  }

  function changeCartQtyByIndex(index, delta){
    const item = cart[Number(index)];
    if(!item) return;
    const next = Number(item.qty || 1) + Number(delta);
    if(next <= 0){ cart.splice(Number(index), 1); }
    else if(!bundleStockAvailable(item, next)){ showNotice(isBundleCartItem(item) ? "No more stock available for this bundle" : "No more stock available for this variant"); return; }
    else item.qty = next;
    writeJSON(CART_KEY, cart);
    renderCart();
  }

  function removeItemByIndex(index){
    cart.splice(Number(index), 1);
    writeJSON(CART_KEY, cart);
    renderCart();
    showNotice("Item removed");
  }

  function changeCartQtyByKey(id, size, delta){
    const live = products.find(x => x.id === id);
    const cartItem = cart.find(x => x.id === id && x.size === size);
    if(!cartItem || !live) return;

    const next = Number(cartItem.qty) + Number(delta);
    if(next <= 0){
      cart = cart.filter(x => !(x.id === id && x.size === size));
    } else if(next > getVariantStock(live, size)){
      showNotice("No more stock available for this variant");
      return;
    } else {
      cartItem.qty = next;
    }
    writeJSON(CART_KEY, cart);
    renderCart();
  }

  function removeItem(id, size){
    cart = cart.filter(x => !(x.id === id && x.size === size));
    writeJSON(CART_KEY, cart);
    renderCart();
    showNotice("Item removed");
  }

  function getSelectedShipping(){
    if(!cart.length || shippingSettings.enabled === false) return { zone:"", fee:0 };
    const zones = Array.isArray(shippingSettings.zones) && shippingSettings.zones.length ? shippingSettings.zones : defaultShippingSettings.zones;
    if(!selectedShippingZone || !zones.some(z => z.name === selectedShippingZone)) selectedShippingZone = zones[0]?.name || "";
    const zone = zones.find(z => z.name === selectedShippingZone) || zones[0] || { name:"Delivery", fee:0 };
    const subtotal = cartSubtotal(cart);
    const freeMin = Number(shippingSettings.freeShippingMin || 0);
    const fee = freeMin > 0 && subtotal >= freeMin ? 0 : Number(zone.fee || 0);
    return { zone:zone.name, fee };
  }

  function renderCart(){
    const subtotal = cartSubtotal(cart);
    const shippingInfo = getSelectedShipping();
    const shipping = shippingInfo.fee;
    const total = totalAmount(cart, shipping);

    if(!cart.length){
      cartView.innerHTML = '<div class="empty">Your cart is empty.</div>';
      return;
    }

    cartView.innerHTML = `
      ${cart.map((item, idx) => `
        <div class="cart-item ${isBundleCartItem(item) ? "cart-bundle-item" : ""}">
          <div class="cart-thumb" style="background-image:url('${escapeHtml(item.image || "")}')"></div>
          <div>
            <div style="font-weight:800">${escapeHtml(item.name)}</div>
            <div class="small">${escapeHtml(item.brand || "MR VAPE SHOP")} • ${escapeHtml(item.category || "Promo")} • Variant: ${escapeHtml(item.size || "Default")}</div>
            ${isBundleCartItem(item) ? `<div class="bundle-cart-breakdown">${(item.bundleItems || []).map(c => `<span>${escapeHtml(c.name || "Item")}: ${escapeHtml(c.size || c.variant || "Default")}</span>`).join("")}</div>` : ""}
            <div class="qty">
              <button data-minus-index="${idx}">−</button>
              <strong>${item.qty}</strong>
              <button data-plus-index="${idx}">+</button>
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:900">${money(Number(item.price || 0) * Number(item.qty || 1))}</div>
            <button class="icon-btn" style="margin-top:8px" data-remove-index="${idx}">🗑️</button>
          </div>
        </div>
      `).join("")}
      <div style="height:14px"></div>
      <div class="summary">
        ${shippingSettings.enabled !== false ? `<label class="shipping-select-label">Delivery Zone<select id="shippingZoneSelect">${(shippingSettings.zones || []).map(z => `<option value="${escapeHtml(z.name)}" ${z.name === shippingInfo.zone ? "selected" : ""}>${escapeHtml(z.name)} - ${money(z.fee)}</option>`).join("")}</select></label>` : ""}
        ${Number(shippingSettings.freeShippingMin || 0) > 0 ? `<div class="small">Free delivery from ${money(shippingSettings.freeShippingMin)}</div>` : ""}
        <div class="summary-row"><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
        <div class="summary-row"><span>${shippingInfo.zone ? "Delivery Fee (" + escapeHtml(shippingInfo.zone) + ")" : "Delivery Fee"}</span><strong>${money(shipping)}</strong></div>
        <div class="summary-row" style="font-size:18px"><span>Total</span><strong>${money(total)}</strong></div>
        <button class="btn dark" style="width:100%;margin-top:10px" id="checkoutBtn">Checkout</button>
      </div>
    `;

    cartView.querySelectorAll("[data-minus-index]").forEach(btn => btn.onclick = () => changeCartQtyByIndex(btn.dataset.minusIndex, -1));
    cartView.querySelectorAll("[data-plus-index]").forEach(btn => btn.onclick = () => changeCartQtyByIndex(btn.dataset.plusIndex, 1));
    cartView.querySelectorAll("[data-remove-index]").forEach(btn => btn.onclick = () => removeItemByIndex(btn.dataset.removeIndex));
    const zoneSelect = $("shippingZoneSelect");
    if(zoneSelect) zoneSelect.onchange = () => { selectedShippingZone = zoneSelect.value; writeJSON("vape_shop_selected_shipping_zone", selectedShippingZone); renderCart(); };
    $("checkoutBtn").onclick = checkout;
  }

  function renderAccount(){
    accountView.innerHTML = `
      <div class="account-box">
        <div class="small">This profile is saved in your browser now, and also syncs online in Firebase mode.</div>
        <div class="two">
          <div class="field">
            <label>Name</label>
            <input id="acc_name" value="${escapeHtml(account.name)}" placeholder="Your full name">
          </div>
          <div class="field">
            <label>Phone</label>
            <input id="acc_phone" value="${escapeHtml(account.phone)}" placeholder="09xxxxxxxxxx">
          </div>
        </div>
        <div class="field">
          <label>Email</label>
          <input id="acc_email" value="${escapeHtml(account.email)}" placeholder="you@example.com">
        </div>
        <div class="field">
          <label>Address</label>
          <input id="acc_address" value="${escapeHtml(account.address)}" placeholder="Complete address">
        </div>
        <div class="account-actions">
          <button class="btn dark full-btn" id="saveAccountBtn">Save Profile</button>
          <button class="btn ghost full-btn track-account-btn" id="openTrackFromAccountBtn" type="button">📦 Track My Orders</button>
        </div>
      </div>
    `;
    $("saveAccountBtn").onclick = saveAccount;
    if($("openTrackFromAccountBtn")) $("openTrackFromAccountBtn").onclick = () => openTrackingModal(account.phone || "");
  }

  function openTrackingModal(prefill=""){
    const modal = $("trackingModal");
    const input = $("trackingInput");
    const result = $("trackingResult");
    if(!modal) return;
    modal.classList.remove("hidden");
    if(input){ input.value = prefill || account.phone || ""; setTimeout(() => input.focus(), 50); }
    if(result && !result.dataset.loaded){
      result.innerHTML = '<div class="tracking-empty">Enter your Order ID or phone number, then tap Track.</div>';
    }
  }

  function closeTrackingModal(){
    const modal = $("trackingModal");
    if(modal) modal.classList.add("hidden");
  }

  function normalizeStatus(status){
    const s = String(status || "Pending").toLowerCase();
    if(s.includes("complete") || s.includes("delivered") || s.includes("paid")) return "Completed";
    if(s.includes("cancel")) return "Cancelled";
    if(s.includes("pack") || s.includes("prepar") || s.includes("process")) return "Preparing";
    return "Pending";
  }

  function statusClass(status){
    const s = normalizeStatus(status).toLowerCase();
    return "tracking-status-" + s;
  }

  function orderDateText(order){
    const raw = order.createdAt;
    if(raw && typeof raw.toDate === "function") return raw.toDate().toLocaleString();
    if(raw && raw.seconds) return new Date(raw.seconds * 1000).toLocaleString();
    if(raw) return new Date(raw).toLocaleString();
    return "—";
  }

  function trackingTimeline(status){
    const current = normalizeStatus(status);
    const steps = [
      {key:"Pending", title:"Order Placed", desc:"We received your order and it is waiting for confirmation."},
      {key:"Preparing", title:"Preparing", desc:"Your items are being checked, packed, or prepared."},
      {key:"Completed", title:"Completed", desc:"Your order is completed / released."}
    ];
    if(current === "Cancelled"){
      return `<div class="tracking-timeline">
        <div class="tracking-step active"><div class="tracking-dot">✓</div><div><div class="tracking-step-title">Order Placed</div><div class="tracking-step-desc">We received your order.</div></div></div>
        <div class="tracking-step active"><div class="tracking-dot">!</div><div><div class="tracking-step-title">Cancelled</div><div class="tracking-step-desc">This order was cancelled. Please message the shop for help.</div></div></div>
      </div>`;
    }
    const level = {Pending:0, Preparing:1, Completed:2}[current] ?? 0;
    return `<div class="tracking-timeline">${steps.map((step,i)=>`
      <div class="tracking-step ${i<=level ? "active" : ""}">
        <div class="tracking-dot">${i<=level ? "✓" : i+1}</div>
        <div><div class="tracking-step-title">${step.title}</div><div class="tracking-step-desc">${step.desc}</div></div>
      </div>`).join("")}</div>`;
  }

  function trackingCard(order){
    const status = normalizeStatus(order.status || order.finalStatus);
    const items = Array.isArray(order.items) ? order.items : [];
    return `<div class="tracking-card">
      <div class="tracking-card-head">
        <div>
          <div style="font-weight:900">${escapeHtml(order.customer?.name || "Customer")}</div>
          <div class="tracking-order-id">Order ID: ${escapeHtml(order.id || order.receiptNo || "")}</div>
        </div>
        <div class="tracking-status-pill ${statusClass(status)}">${status}</div>
      </div>
      ${trackingTimeline(status)}
      <div class="tracking-meta">
        <div class="tracking-meta-row"><span>Date</span><strong>${escapeHtml(orderDateText(order))}</strong></div>
        <div class="tracking-meta-row"><span>Delivery</span><strong>${escapeHtml(order.shippingZone || "Store Pickup")}</strong></div>
        <div class="tracking-meta-row"><span>Total</span><strong>${money(Number(order.total || 0))}</strong></div>
      </div>
      <div class="tracking-items">
        ${items.map(i=>`<div class="tracking-item"><span>${escapeHtml(i.name || "Item")} ${i.size ? "• " + escapeHtml(i.size) : ""}</span><strong>x${Number(i.qty || 1)}</strong></div>`).join("") || '<div class="small">No item details found.</div>'}
      </div>
    </div>`;
  }

  async function findOrdersForTracking(term){
    const clean = String(term || "").trim();
    if(!clean) return [];
    if(getMode()==="firebase" && firebaseReady){
      const results = [];
      // Direct ID lookup first.
      for(const colName of ["orders","order_history"]){
        try{
          const snap = await getDoc(doc(db, colName, clean));
          if(snap.exists()) results.push({ id:snap.id, source:colName, ...snap.data() });
        }catch(e){}
      }
      // Simple full read fallback so it works with the current rules and nested customer.phone.
      for(const colName of ["orders","order_history"]){
        try{
          const snap = await getDocs(collection(db, colName));
          snap.forEach(d => {
            const data = d.data();
            const phone = String(data.customer?.phone || "");
            const receipt = String(data.receiptNo || "");
            const id = String(d.id || "");
            if(phone === clean || id === clean || receipt === clean || phone.endsWith(clean)){
              if(!results.some(x => x.id === d.id)) results.push({ id:d.id, source:colName, ...data });
            }
          });
        }catch(e){}
      }
      return results;
    }
    const all = [...getLocalOrders().map(o=>({...o, source:"orders"})), ...getLocalHistory().map(o=>({...o, source:"order_history"}))];
    return all.filter(o => String(o.id||"") === clean || String(o.receiptNo||"") === clean || String(o.customer?.phone || "") === clean || String(o.customer?.phone || "").endsWith(clean));
  }

  async function trackOrder(){
    const input = $("trackingInput");
    const result = $("trackingResult");
    if(!input || !result) return;
    const term = input.value.trim();
    if(!term){ showNotice("Enter Order ID or phone"); return; }
    result.dataset.loaded = "1";
    result.innerHTML = '<div class="tracking-empty">Checking order status...</div>';
    try{
      const orders = await findOrdersForTracking(term);
      if(!orders.length){
        result.innerHTML = '<div class="tracking-empty">No order found. Check your Order ID or phone number.</div>';
        return;
      }
      result.innerHTML = orders.sort((a,b)=>String(b.createdAt?.seconds||b.createdAt||"").localeCompare(String(a.createdAt?.seconds||a.createdAt||""))).map(trackingCard).join('<div style="height:10px"></div>');
    }catch(error){
      result.innerHTML = '<div class="tracking-empty">Unable to track order right now. Please try again.</div>';
    }
  }

  async function saveAccount(){
    account = {
      name:$("acc_name").value.trim(),
      phone:$("acc_phone").value.trim(),
      email:$("acc_email").value.trim(),
      address:$("acc_address").value.trim()
    };
    writeJSON(ACCOUNT_KEY, account);
    try {
      await saveCustomerProfile(account);
      closeDrawer();
      showNotice("Profile saved");
    } catch {
      closeDrawer();
      showNotice("Saved locally");
    }
  }

  async function checkout(){
    if(!account.name || !account.phone){
      openDrawer("account");
      showNotice("Please fill your account details first");
      return;
    }
    if(!cart.length){
      showNotice("Your cart is empty");
      return;
    }
    try {
      await saveCustomerProfile(account);
      await createOrder(cart, account, getSelectedShipping());
      cart = [];
      writeJSON(CART_KEY, cart);
      renderCart();
      closeDrawer();
      showNotice("Order placed");
    } catch (error) {
      showNotice(error.message || "Checkout failed");
    }
  }

  function openDrawer(type){
    drawer.classList.add("show");
    document.body.classList.add("drawer-open");
    cartView.classList.add("hidden");
    accountView.classList.add("hidden");
    if(type==="cart"){
      drawerTitle.textContent="My Cart";
      cartView.classList.remove("hidden");
      renderCart();
    } else {
      drawerTitle.textContent="My Account";
      accountView.classList.remove("hidden");
      renderAccount();
    }
  }

  function closeDrawer(){
    drawer.classList.remove("show");
    document.body.classList.remove("drawer-open");
  }


  function findCustomerConversation(messages = liveConversations){
    const phone = account.phone || ($("inq_phone")?.value || "").trim();
    const chatId = localStorage.getItem(CHAT_ID_KEY);
    let conversation = null;
    if(chatId) conversation = messages.find(m => m.id === chatId) || null;
    if(!conversation && phone) conversation = messages.filter(m => m.phone === phone).sort((a,b)=>String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||"")))[0] || null;
    if(conversation) localStorage.setItem(CHAT_ID_KEY, conversation.id);
    updateInboxBadge(conversation);
    return conversation;
  }

  function renderCustomerChat(conversation){
    const box = $("customerChatWindow");
    if(!box) return;
    const thread = conversation?.thread || [];
    if(!thread.length){
      box.innerHTML = '<div class="chat-empty">Start your custom bulk order chat here.</div>';
      updateInboxBadge(conversation);
      return;
    }
    box.innerHTML = thread.map(item => `
      <div class="chat-bubble ${item.sender === "admin" ? "admin" : "customer"}">
        ${renderChatMessageBody(item)}
        <span class="chat-meta">${item.sender === "admin" ? "Admin" : "You"} • ${formatChatTime(item.at)}</span>
      </div>
    `).join("");
    box.scrollTop = box.scrollHeight;
    updateInboxBadge(conversation);
  }

  async function loadCustomerConversation(messages = null){
    const sourceMessages = Array.isArray(messages) ? messages : liveConversations;
    const conversation = findCustomerConversation(sourceMessages);
    renderCustomerChat(conversation);
    return conversation;
  }

  function openInquiry(){
    const modal = $("inquiryModal");
    if(!modal) return;
    $("inq_name").value = account.name || "";
    $("inq_phone").value = account.phone || "";
    $("inq_message").value = "";
    clearFileInput("inq_image", "inqImagePreviewWrap", "inqImagePreview", "inqImageName");
    modal.classList.remove("hidden");
    const conversation = findCustomerConversation();
    if(conversation){
      setConversationSeen(conversation.id);
    }
    loadCustomerConversation();
  }

  function closeInquiry(){
    const modal = $("inquiryModal");
    if(modal) modal.classList.add("hidden");
  }

  async function sendInquiry(){
    const name = ($("inq_name")?.value || "").trim();
    const phone = ($("inq_phone")?.value || "").trim();
    const message = ($("inq_message")?.value || "").trim();
    const imageFile = $("inq_image")?.files?.[0] || null;

    if(!name || !phone || (!message && !imageFile)){
      showNotice("Please type a message or add an image");
      return;
    }

    try{
      account = { ...account, name, phone };
      writeJSON(ACCOUNT_KEY, account);

      const image = imageFile ? await compressImageFile(imageFile) : "";
      let current = await loadCustomerConversation();

      if(current){
        const now = new Date().toISOString();
        const thread = Array.isArray(current.thread) ? current.thread.slice() : [];
        thread.push({ sender:"customer", text: message, image, at: now });
        await updateMessage(current.id, {
          thread,
          latestMessage: message || (image ? "Image attachment" : "New message"),
          message: message || "",
          status:"New",
          updatedAt: now
        });
        setConversationSeen(current.id);
      }else{
        await saveInquiryMessage({ name, phone, message, image });
      }

      $("inq_message").value = "";
      clearFileInput("inq_image", "inqImagePreviewWrap", "inqImagePreview", "inqImageName");
      await loadCustomerConversation();
      const conversation = findCustomerConversation();
      if(conversation) setConversationSeen(conversation.id);
      showNotice("Message sent to admin");
    }catch(error){
      console.error(error);
      showNotice("Failed to send message");
    }
  }


  subscribeProducts((items, source) => {
    products = items;
    sourceLabel.textContent = source==="firebase" ? "Live from Firebase" : "Using local fallback";
    renderProducts();
    renderCart();
  });

  subscribeMessages((messages) => {
    liveConversations = messages;
    const conversation = findCustomerConversation(messages);
    const modal = $("inquiryModal");
    if(modal && !modal.classList.contains("hidden")){
      if(conversation) setConversationSeen(conversation.id);
      renderCustomerChat(conversation);
    } else {
      updateInboxBadge(conversation);
    }
  });

  loadShippingSettings().then(settings => { shippingSettings = settings; renderCart(); }).catch(() => renderCart());

  bindUltraGalleryControls();
  document.addEventListener("keydown", (e) => {
    const modal = $("ultraGalleryModal");
    if(!modal || modal.classList.contains("hidden")) return;
    if(e.key === "Escape") closeUltraGallery();
    if(e.key === "ArrowLeft") moveUltraGallery(-1);
    if(e.key === "ArrowRight") moveUltraGallery(1);
  });

  renderChips();
  renderCart();
  bindNoticeButtons();
  updateInboxBadge(findCustomerConversation());

  if($("inq_image")) $("inq_image").onchange = () => setImagePreview("inq_image", "inqImagePreviewWrap", "inqImagePreview", "inqImageName");
  if($("removeInquiryImageBtn")) $("removeInquiryImageBtn").onclick = () => clearFileInput("inq_image", "inqImagePreviewWrap", "inqImagePreview", "inqImageName");

  $("searchBtn").onclick = renderProducts;
  searchInput.oninput = renderProducts;
  $("shopNowBtn").onclick = () => $("productsSection").scrollIntoView({behavior:"smooth"});
  $("openAccountBtn").onclick = () => openInquiry();
  if($("openInboxBtn")) {
    $("openInboxBtn").onclick = () => openInquiry();
    $("openInboxBtn").addEventListener("click", () => openInquiry());
  }
  function setBottomNavActive(activeId){
    document.querySelectorAll(".bottom-nav .nav-btn").forEach(btn => btn.classList.toggle("active", btn.id === activeId));
  }

  window.goCustomerTab = async function(tab){
    closeDrawer();
    if(tab === "shop" || tab === "home"){
      currentCategory = "All";
      if(searchInput) searchInput.value = "";
      renderCategories();
      await renderProducts();
      setBottomNavActive("navHome");
      window.scrollTo({top:0, behavior:"smooth"});
      return;
    }
    if(tab === "category"){
      currentCategory = "All";
      renderCategories();
      await renderProducts();
      setBottomNavActive("navCategory");
      const section = $("productsSection");
      if(section) section.scrollIntoView({behavior:"smooth", block:"start"});
      return;
    }
    if(tab === "promos" || tab === "promo"){
      currentCategory = "Promo";
      if(searchInput) searchInput.value = "";
      renderCategories();
      await renderProducts();
      setBottomNavActive("navPromos");
      const section = $("productsSection");
      if(section) section.scrollIntoView({behavior:"smooth", block:"start"});
      showNotice("Showing promo deals");
      return;
    }
    if(tab === "cart"){ setBottomNavActive("navCart"); openDrawer("cart"); return; }
    if(tab === "account" || tab === "me"){ setBottomNavActive("navAccount"); openDrawer("account"); }
  }

  if($("openCartBtn")) $("openCartBtn").onclick = () => window.goCustomerTab("cart");
  if($("navCart")) $("navCart").onclick = () => window.goCustomerTab("cart");
  if($("navAccount")) $("navAccount").onclick = () => window.goCustomerTab("account");
  if($("navCategory")) $("navCategory").onclick = () => window.goCustomerTab("category");
  if($("navPromos")) $("navPromos").onclick = () => window.goCustomerTab("promos");
  if($("navHome")) $("navHome").onclick = () => window.goCustomerTab("shop");
  if($("navTrack")) $("navTrack").onclick = () => openTrackingModal(account.phone || "");
  if($("openTrackTopBtn")) $("openTrackTopBtn").onclick = () => openTrackingModal(account.phone || "");
  if($("closeTrackingBtn")) $("closeTrackingBtn").onclick = closeTrackingModal;
  if($("trackingSearchBtn")) $("trackingSearchBtn").onclick = trackOrder;
  if($("trackingInput")) $("trackingInput").addEventListener("keydown", (e) => { if(e.key === "Enter") trackOrder(); });
  if($("trackingModal")) $("trackingModal").onclick = (e) => { if(e.target.id === "trackingModal") closeTrackingModal(); };
  $("closeDrawerBtn").onclick = closeDrawer;
  drawer.onclick = (e) => { if(e.target.id==="drawer") closeDrawer(); };

  if($("closeProductPageBtn")) $("closeProductPageBtn").onclick = closeProductPage;
  if(productPageModal) productPageModal.onclick = (e) => { if(e.target.id==="productPageModal") closeProductPage(); };
  if($("detailQtyMinus")) $("detailQtyMinus").onclick = () => {
    detailQty = Math.max(1, detailQty - 1);
    $("detailQtyValue").textContent = String(detailQty);
    updateDetailTotal();
  };
  if($("detailQtyPlus")) $("detailQtyPlus").onclick = () => {
    const maxStock = selectedProduct ? getVariantStock(selectedProduct, selectedSize) : 0;
    if(selectedProduct && selectedSize && detailQty < maxStock){
      detailQty += 1;
      $("detailQtyValue").textContent = String(detailQty);
      updateDetailTotal();
    } else if(!selectedSize) {
      showNotice("Please select variant first");
    } else {
      showNotice("No more stock available for this variant");
    }
  };
  if($("productPageAddToCartBtn")) $("productPageAddToCartBtn").onclick = addDetailToCart;
  if($("closeInquiryBtn")) $("closeInquiryBtn").onclick = closeInquiry;
  if($("sendInquiryBtn")) {
    $("sendInquiryBtn").onclick = sendInquiry;
  }
  if($("inquiryModal")) $("inquiryModal").onclick = (e) => { if(e.target.id === "inquiryModal") closeInquiry(); };
}

async function createPosSale(cart, account={}, payment={}){
  const receiptNo = payment.receiptNo || ("MRV-" + new Date().toISOString().slice(2,10).replace(/-/g,"") + "-" + Date.now().toString().slice(-6));
  const resolveLocalProduct = (item, list) => {
    const keys = [item.productDocId, item.docId, item.firestoreId, item.productId, item.id, item.sku, item.barcode].map(x => String(x || "")).filter(Boolean);
    return list.find(p => [p.id,p.docId,p.firestoreId,p._docId,p.sku,p.barcode].map(x=>String(x||"")).some(v => keys.includes(v)));
  };
  const cleanItems = cart.map(item => ({
    name:item.name,
    qty:Number(item.qty || 1),
    price:Number(item.price || 0),
    cost:Number(item.cost || item.costPrice || 0),
    productId:item.productId || item.id,
    productDocId:item.productDocId || item.docId || item.firestoreId || item.id,
    size:item.size || item.variant || "Default",
    image:item.image || "",
    barcode:item.barcode || ""
  }));
  const total = totalAmount(cleanItems, 0);
  const orderPayload = {
    customer:{ name:account.name || "Walk-in Customer", phone:account.phone || "", address:account.address || "" },
    items:cleanItems,
    subtotal:cartSubtotal(cleanItems),
    shippingFee:0,
    shippingZone:"Walk-in / POS",
    total,
    status:"Completed",
    paymentStatus:"Paid",
    paymentMethod:payment.paymentMethod || "Cash",
    cashReceived:Number(payment.cashReceived || total),
    change:Math.max(0, Number(payment.cashReceived || total) - total),
    receiptNo,
    cashier:"Admin POS"
  };
  if(getMode()==="firebase" && firebaseReady){
    let orderId = receiptNo;
    await runTransaction(db, async (transaction) => {
      // IMPORTANT: aggregate all cart lines by product document.
      // This prevents V2 flavor A + V2 flavor B in the same POS sale from overwriting each other.
      const rows = [];
      for(const item of cart){
        const docId = item.productDocId || item.docId || item.firestoreId || item.id;
        const ref = doc(db, "products", docId);
        const snap = await transaction.get(ref);
        rows.push({ item, ref, snap });
      }

      const updateMap = new Map();
      for(const row of rows){
        const { item, ref, snap } = row;
        if(!snap.exists()) throw new Error((item.name || "Product") + " not found. Please reselect the item in POS.");
        const data = snap.data();
        const qty = Number(item.qty || 1);
        const selectedVariant = item.size || item.variant || "Default";
        const key = ref.path;
        let state = updateMap.get(key);
        if(!state){
          state = {
            ref,
            variantStocks:(data.variantStocks && typeof data.variantStocks === "object") ? { ...data.variantStocks } : null,
            stock:Number(data.stock || 0)
          };
          updateMap.set(key, state);
        }
        if(state.variantStocks && Object.prototype.hasOwnProperty.call(state.variantStocks, selectedVariant)){
          const current = Number(state.variantStocks[selectedVariant] || 0);
          if(current < qty) throw new Error("Not enough stock for " + (item.name || "Product") + " - " + selectedVariant);
          state.variantStocks[selectedVariant] = current - qty;
        } else {
          if(state.stock < qty) throw new Error("Not enough stock for " + (item.name || "Product"));
          state.stock -= qty;
        }
      }

      updateMap.forEach(state => {
        if(state.variantStocks) transaction.update(state.ref, { variantStocks:state.variantStocks, stock:sumVariantStocks(state.variantStocks) });
        else transaction.update(state.ref, { stock:state.stock });
      });
      const orderRef = doc(collection(db, "order_history"));
      orderId = orderRef.id;
      transaction.set(orderRef, { ...orderPayload, createdAt:serverTimestamp(), paidAt:serverTimestamp(), movedAt:serverTimestamp() });
    });
    return { id:orderId, ...orderPayload, paidAt:new Date().toISOString() };
  }
  const products = getLocalProducts();
  for(const item of cart){
    const p = resolveLocalProduct(item, products);
    if(!p || getVariantStock(p, item.size) < Number(item.qty || 1)) throw new Error("Not enough stock for " + item.name + (item.size ? " - " + item.size : ""));
  }
  for(const item of cart){
    const p = resolveLocalProduct(item, products);
    const map = variantStockMap(p);
    if(item.size && Object.prototype.hasOwnProperty.call(map, item.size)){
      p.variantStocks = { ...map, [item.size]: Number(map[item.size] || 0) - Number(item.qty || 1) };
      p.stock = sumVariantStocks(p.variantStocks);
    } else {
      p.stock = Number(p.stock || 0) - Number(item.qty || 1);
    }
  }
  setLocalProducts(products);
  const history = getLocalHistory();
  const order = { id:"POS-" + Date.now(), ...orderPayload, createdAt:new Date().toISOString(), paidAt:new Date().toISOString(), movedAt:new Date().toISOString() };
  history.unshift(order); setLocalHistory(history);
  return order;
}

function initAdmin(){
  bindNoticeButtons(); const form = $("productForm"), table = $("adminProductTable"); let activeOrdersCache = []; let historyOrdersCache = []; let adminProductsCache = []; let lastReportRows = []; let posCart = []; let selectedPosProduct = null; let adminShippingSettings = getLocalShippingSettings();
  const topActions = document.querySelector(".top-actions-wrap");
  if(topActions && !document.getElementById("logoutAdminBtn")){
    const logoutBtn = document.createElement("button");
    logoutBtn.id = "logoutAdminBtn";
    logoutBtn.className = "btn dark";
    logoutBtn.textContent = "Logout";
    logoutBtn.onclick = async () => { try { await signOut(auth); } catch {} window.location.href = "./admin-login.html"; };
    topActions.appendChild(logoutBtn);
  }
  const isStaffMode = document.body.dataset.role === "staff" || page === "staff";
  if(isStaffMode){
    document.querySelectorAll(".admin-tab-btn").forEach(btn => {
      const allowed = btn.dataset.tab === "pos";
      btn.classList.toggle("hidden", !allowed);
      btn.style.display = allowed ? "block" : "none";
    });
    const top = document.querySelector(".top-actions-wrap");
    if(top) Array.from(top.children).forEach(el => { if(el.id !== "logoutAdminBtn") el.style.display = "none"; });
    const title = document.querySelector(".admin-top h1");
    if(title) title.textContent = "Cashier Barcode POS";
    const subtitle = document.querySelector(".admin-top p");
    if(subtitle) subtitle.textContent = "Staff mode: barcode POS, checkout, and receipt printing only.";
    setTimeout(() => switchTab("pos"), 0);
  }
  function updateStats(items){ $("statProducts").textContent = items.length; $("statStock").textContent = items.reduce((a,b)=>a+Number(b.stock||0),0); $("statLow").textContent = items.filter(x=>Number(x.stock||0)<=10).length; $("statCategories").textContent = new Set(items.map(x=>x.category)).size; }
  function clearForm(){ form.reset(); $("docId").value = ""; if($("variants")) $("variants").value = ""; if($("variantImages")) $("variantImages").value = "{}"; if($("image")) $("image").value = ""; window.__pendingProductImages = [""]; setTimeout(() => { window.hydrateVariantRows && window.hydrateVariantRows(null); window.hydrateProductImageRows && window.hydrateProductImageRows([""]); }, 0); }
  function fillForm(item){ $("docId").value=item.id; $("name").value=item.name||""; $("brand").value=item.brand||""; $("category").value=item.category||"Pods"; $("price").value=item.price||0; if($("costPrice")) $("costPrice").value=item.costPrice||item.cost||0; $("oldPrice").value=item.oldPrice||0; $("stock").value=item.stock||0; $("sold").value=item.sold||""; $("badge").value=item.badge||""; if($("variants")) $("variants").value = Array.isArray(item.variants) ? item.variants.join("\n") : ""; if($("variantImages")) $("variantImages").value = JSON.stringify(item.variantImages || {}); const variantImgs = item.variantImages && typeof item.variantImages === "object" ? Object.values(item.variantImages).filter(Boolean) : []; const allImgs = (Array.isArray(item.images) && item.images.length ? item.images : [item.image]).filter(Boolean); const extraImgs = allImgs.filter(img => !variantImgs.includes(img)); if($("image")) $("image").value = allImgs[0] || ""; window.__pendingProductImages = extraImgs.length ? extraImgs : [""]; setTimeout(() => { window.hydrateVariantRows && window.hydrateVariantRows(item); window.hydrateProductImageRows && window.hydrateProductImageRows(window.__pendingProductImages); }, 0); window.scrollTo({top:0, behavior:"smooth"}); }
  function renderProductsAdmin(items, source){ $("adminSourceLabel").textContent = source==="firebase" ? "Live from Firebase" : "Using local fallback"; updateStats(items); if(!items.length){ table.innerHTML = '<tr><td colspan="5" class="empty">No products found.</td></tr>'; return; } table.innerHTML = items.map(item => `<tr><td><div style="font-weight:800">${escapeHtml(item.name)}</div><div class="small">${escapeHtml(item.brand)}</div></td><td>${escapeHtml(item.category)}</td><td>${money(item.price)}</td><td>${Number(item.stock||0)}</td><td><div class="row-actions"><button class="btn ghost" data-edit="${item.id}">Edit</button><button class="btn dark" data-delete="${item.id}">Delete</button></div></td></tr>`).join(""); table.querySelectorAll("[data-edit]").forEach(btn => btn.onclick = () => { const item = items.find(x => x.id===btn.dataset.edit); if(item) fillForm(item); }); table.querySelectorAll("[data-delete]").forEach(btn => btn.onclick = async () => { try { await deleteProductItem(btn.dataset.delete); showNotice("Product deleted"); } catch { showNotice("Delete failed"); } }); }
  function receiptNumber(order){
    if(order && order.receiptNo) return String(order.receiptNo);
    const base = String((order && order.id) || Date.now()).replace(/[^a-zA-Z0-9]/g, "").slice(-7).toUpperCase();
    const d = new Date();
    const y = String(d.getFullYear()).slice(-2);
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `MRV-${y}${m}${day}-${base}`;
  }

  function printReceipt(order){
    if(!order){ showNotice("Order not found"); return; }
    const items = Array.isArray(order.items) ? order.items : [];
    const subtotal = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
    const shipping = Number(order.shippingFee ?? Math.max(0, Number(order.total || 0) - subtotal));
    const total = Number(order.total || subtotal + shipping || 0);
    const cashReceived = Number(order.cashReceived || 0);
    const change = Math.max(0, Number(order.change || (cashReceived ? cashReceived - total : 0)));
    const dateSource = order.paidAt || order.completedAt || order.createdAt || new Date().toISOString();
    const dateText = toDateSafe(dateSource)?.toLocaleString() || new Date().toLocaleString();
    const receiptNo = receiptNumber(order);
    const safeMoney = (v) => money(Number(v || 0));
    const rowsHtml = items.map((item, index) => {
      const qty = Number(item.qty || 0);
      const price = Number(item.price || 0);
      const variant = item.size || item.variant || item.flavor || "Default";
      const bundleNote = isBundleCartItem(item) && Array.isArray(item.bundleItems)
        ? `<div class="bundle-lines">${item.bundleItems.map(b => `${escapeHtml(b.name || "Bundle item")} - ${escapeHtml(b.size || b.variant || "Default")}`).join("<br>")}</div>`
        : "";
      return `<tr>
        <td class="num">${index + 1}</td>
        <td class="item-name"><strong>${escapeHtml(item.name || "Item")}</strong><br><span>${escapeHtml(variant)}</span>${bundleNote}</td>
        <td class="qty">${qty}</td>
        <td class="money-cell">${safeMoney(price)}</td>
        <td class="money-cell"><strong>${safeMoney(price * qty)}</strong></td>
      </tr>`;
    }).join("");
    const html = `<!doctype html><html><head><title>Receipt ${escapeHtml(receiptNo)}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      :root{--paper:80mm;--ink:#111;--muted:#555;--line:#222}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;margin:0;color:var(--ink);background:#edf0f5}.toolbar{position:sticky;top:0;background:#0b1220;color:white;padding:10px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap}.toolbar button{border:0;border-radius:10px;padding:10px 12px;font-weight:900;cursor:pointer}.toolbar .primary{background:#11c5f5;color:#06121f}.toolbar .light{background:#fff;color:#111}.receipt{width:var(--paper);max-width:100%;margin:14px auto;background:#fff;padding:12px 10px;box-shadow:0 18px 45px rgba(0,0,0,.20)}.center{text-align:center}.brand-row{display:flex;align-items:center;justify-content:center;gap:7px}.logo-dot{width:24px;height:24px;border:2px solid #111;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:900}.shop{font-size:19px;font-weight:1000;letter-spacing:.7px}.tag{font-size:10px;text-transform:uppercase;letter-spacing:1.4px;color:#333}.paid{font-size:12px;font-weight:1000;border:2px solid #111;display:inline-block;padding:5px 18px;margin:7px 0 2px;border-radius:999px}.meta{font-size:11px;line-height:1.55}.meta-grid{display:grid;grid-template-columns:1fr;gap:1px}.meta b{font-weight:900}.muted{font-size:11px;color:var(--muted);line-height:1.45}hr{border:0;border-top:1px dashed #777;margin:9px 0}table{width:100%;border-collapse:collapse;font-size:11px}th{font-size:9px;text-transform:uppercase;text-align:left;border-bottom:1px solid #111;padding:4px 0}td{padding:5px 0;border-bottom:1px dashed #ddd;vertical-align:top}.num{width:14px}.qty{text-align:center;width:24px}.money-cell{text-align:right;white-space:nowrap}.item-name strong{font-size:11px}.item-name span{font-size:10px;color:#555}.bundle-lines{font-size:9px;color:#555;margin-top:2px;line-height:1.35}.summary td{border:0;padding:3px 0}.summary .grand td{font-size:16px;font-weight:1000;border-top:1px dashed #777;padding-top:7px}.summary .label{font-weight:800}.barcode{font-family:"Courier New",monospace;font-size:12px;letter-spacing:2px;border:1px solid #111;padding:6px;margin:8px 0 2px;word-break:break-all}.policy{border:1px dashed #999;border-radius:8px;padding:6px;margin-top:8px;font-size:10px;line-height:1.35}.footer{font-size:11px;line-height:1.5;font-weight:800}.copy{font-size:10px;color:#666}.cut{font-size:10px;color:#888;letter-spacing:3px;margin-top:6px}@page{size:80mm auto;margin:3mm}@media print{body{background:#fff}.toolbar{display:none}.receipt{width:80mm;margin:0;box-shadow:none;padding:0 1.5mm}body.print-58 .receipt{width:58mm;font-size:10px}body.print-58 .shop{font-size:15px}body.print-58 table{font-size:9px}body.print-58 th{font-size:8px}body.print-58 .meta,body.print-58 .muted{font-size:9px}@page{margin:2mm}}
    </style></head><body><div class="toolbar no-print"><button class="primary" onclick="window.print()">🧾 Print Receipt</button><button class="light" onclick="document.body.classList.toggle('print-58');document.documentElement.style.setProperty('--paper',document.body.classList.contains('print-58')?'58mm':'80mm')">58mm / 80mm</button><button class="light" onclick="window.close()">Close</button></div><div class="receipt">
      <div class="center"><div class="brand-row"><span class="logo-dot">MV</span><div class="shop">MR VAPE SHOP</div></div><div class="tag">POS Official Receipt</div><div class="paid">PAID</div></div><hr>
      <div class="meta"><div class="meta-grid"><div><b>Receipt:</b> ${escapeHtml(receiptNo)}</div><div><b>Date:</b> ${escapeHtml(dateText)}</div><div><b>Cashier:</b> ${escapeHtml(order.cashier || "Admin POS")}</div><div><b>Customer:</b> ${escapeHtml(order.customer?.name || "Walk-in Customer")}</div><div><b>Phone:</b> ${escapeHtml(order.customer?.phone || "-")}</div><div><b>Order:</b> ${escapeHtml(order.id || receiptNo)}</div><div><b>Type:</b> ${escapeHtml(order.shippingZone || (shipping ? "Delivery" : "Store Pickup / POS"))}</div></div></div><hr>
      <table><thead><tr><th>#</th><th>Item</th><th>Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead><tbody>${rowsHtml || '<tr><td colspan="5" class="center muted">No items</td></tr>'}</tbody></table><hr>
      <table class="summary"><tr><td class="label">Subtotal</td><td class="money-cell">${safeMoney(subtotal)}</td></tr><tr><td class="label">Delivery/Fee</td><td class="money-cell">${safeMoney(shipping)}</td></tr><tr><td class="label">Payment</td><td class="money-cell">${escapeHtml(order.paymentMethod || "Cash")}</td></tr>${cashReceived ? `<tr><td class="label">Cash Received</td><td class="money-cell">${safeMoney(cashReceived)}</td></tr><tr><td class="label">Change</td><td class="money-cell">${safeMoney(change)}</td></tr>` : ""}<tr class="grand"><td>TOTAL</td><td class="money-cell">${safeMoney(total)}</td></tr></table>
      <hr><div class="center"><div class="barcode">*${escapeHtml(receiptNo)}*</div><div class="policy">Keep this receipt for order reference. For warranty or return concerns, present this receipt with the item.</div><div class="footer">Thank you for shopping with us!</div><div class="copy">Powered by MR VAPE SHOP POS</div><div class="cut">✂ - - - - - - - - - - - - - - -</div></div>
    </div><script>window.onload=function(){setTimeout(function(){window.print()},450)}<\/script></body></html>`;
    const win = window.open("", "_blank", "width=430,height=760");
    if(!win){ showNotice("Popup blocked. Allow popups to print receipt."); return; }
    win.document.open(); win.document.write(html); win.document.close();
  }

  async function payAndPrintOrder(orderId){
    const order = activeOrdersCache.find(x => x.id === orderId);
    if(!order){ showNotice("Order not found"); return; }
    const total = Number(order.total || 0);
    const paymentMethod = prompt("Payment method (Cash / GCash / Card):", order.paymentMethod || "Cash") || "Cash";
    let cashReceived = "";
    if(paymentMethod.toLowerCase().includes("cash")) cashReceived = prompt("Cash received:", String(total)) || String(total);
    const paidData = {
      status:"Paid",
      receiptNo: receiptNumber(order),
      paymentMethod,
      cashReceived: Number(cashReceived || total),
      change: Math.max(0, Number(cashReceived || total) - total),
      cashier:"Admin POS"
    };
    try{
      if(getMode()==="firebase" && firebaseReady) await updateDoc(doc(db, "orders", orderId), { ...paidData, paidAt:serverTimestamp() });
      else { const orders = getLocalOrders(); const idx = orders.findIndex(o => o.id === orderId); if(idx >= 0){ orders[idx] = { ...orders[idx], ...paidData, paidAt:new Date().toISOString() }; setLocalOrders(orders); } }
      printReceipt({ ...order, ...paidData, paidAt:new Date().toISOString() });
      showNotice("Paid. Professional receipt opened");
    }catch(error){ showNotice("Payment update failed"); }
  }

  async function voidHistorySale(orderId){
    const order = (historyOrdersCache || []).find(x => String(x.id || x.docId || x.firestoreId) === String(orderId));
    if(!order) { showNotice("Sale not found"); return; }
    const currentStatus = String(order.status || "").toLowerCase();
    if(currentStatus.includes("void") || currentStatus.includes("cancel")) { showNotice("This sale is already voided/cancelled"); return; }
    const reason = prompt("Void reason (required):", "Accidental POS checkout");
    if(reason === null) return;
    if(!String(reason).trim()) { showNotice("Void cancelled. Reason is required."); return; }
    if(!confirm("Void this POS sale and restore stock? Reports will ignore this sale.")) return;

    if(getMode()==="firebase" && firebaseReady){
      await runTransaction(db, async (transaction) => {
        const reads = [];
        for(const item of (order.items || [])){
          forEachStockComponent(item, component => {
            const pid = component.productDocId || component.docId || component.firestoreId || component.productId || component.id || item.productDocId || item.productId || item.id;
            if(!pid) return;
            const ref = doc(db, "products", pid);
            reads.push({ item, component, ref });
          });
        }
        for(const row of reads){ row.snap = await transaction.get(row.ref); }
        const updateMap = new Map();
        for(const row of reads){
          if(!row.snap.exists()) continue;
          const data = row.snap.data();
          const qty = Number(row.component?.qty || row.item.qty || 1);
          const variant = row.component?.size || row.component?.variant || row.item.size || row.item.variant || "Default";
          const key = row.ref.path;
          let state = updateMap.get(key);
          if(!state){
            state = {
              ref:row.ref,
              variantStocks:(data.variantStocks && typeof data.variantStocks === "object") ? { ...data.variantStocks } : null,
              stock:Number(data.stock || 0),
              hasVariants:Array.isArray(data.variants)
            };
            updateMap.set(key, state);
          }
          if(variant && (state.variantStocks || state.hasVariants)){
            const map = state.variantStocks || {};
            map[variant] = Number(map[variant] || 0) + qty;
            state.variantStocks = map;
          } else {
            state.stock += qty;
          }
        }
        updateMap.forEach(state => {
          if(state.variantStocks) transaction.update(state.ref, { variantStocks:state.variantStocks, stock:sumVariantStocks(state.variantStocks), updatedAt:serverTimestamp() });
          else transaction.update(state.ref, { stock:state.stock, updatedAt:serverTimestamp() });
        });
        const histId = order.firestoreId || order.docId || order.id || orderId;
        const histRef = doc(db, "order_history", histId);
        transaction.update(histRef, { status:"Voided", paymentStatus:"Voided", voided:true, voidReason:String(reason).trim(), stockRestored:true, voidedAt:serverTimestamp() });
      });
      return;
    }

    const products = getLocalProducts();
    (order.items || []).forEach(item => {
      forEachStockComponent(item, component => {
        const pid = component.productDocId || component.docId || component.firestoreId || component.productId || component.id || item.productDocId || item.productId || item.id;
        const p = products.find(x => [x.id,x.docId,x.firestoreId,x._docId,x.sku,x.barcode].map(v=>String(v||"")).includes(String(pid||"")));
        if(!p) return;
        const qty = Number(component.qty || item.qty || 1);
        const variant = component.size || component.variant || item.size || item.variant || "Default";
        const map = variantStockMap(p);
        if(variant && (Object.keys(map).length || Array.isArray(p.variants))){ p.variantStocks = { ...map, [variant]: Number(map[variant] || 0) + qty }; p.stock = sumVariantStocks(p.variantStocks); }
        else p.stock = Number(p.stock || 0) + qty;
      });
    });
    setLocalProducts(products);
    const history = getLocalHistory();
    const idx = history.findIndex(o => String(o.id) === String(orderId));
    if(idx >= 0){ history[idx] = { ...history[idx], status:"Voided", paymentStatus:"Voided", voided:true, voidReason:String(reason).trim(), stockRestored:true, voidedAt:new Date().toISOString() }; setLocalHistory(history); }
  }

  function renderOrders(activeOrders, historyOrders){
    activeOrdersCache = activeOrders.slice();
    const allOrdersForPrint = activeOrders.concat(historyOrders || []);
    const tbody = $("ordersTable"), historyBody = $("historyTable");
    if(!tbody || !historyBody) return;
    if(!activeOrders.length) tbody.innerHTML = '<tr><td colspan="6" class="empty">No active orders yet.</td></tr>';
    else {
      tbody.innerHTML = activeOrders.map(order => `<tr><td><div style="font-weight:800">${escapeHtml(order.receiptNo || order.id || "-")}</div><div class="small">${escapeHtml(order.id||"")}</div></td><td><div style="font-weight:800">${escapeHtml(order.customer?.name||"-")}</div><div class="small">${escapeHtml(order.customer?.phone||"")}</div></td><td>${money(order.total||0)}</td><td><select class="order-status-select" data-order-status="${escapeHtml(order.id||"")}"><option value="Pending" ${order.status==="Pending"?"selected":""}>Pending</option><option value="Preparing" ${order.status==="Preparing"?"selected":""}>Preparing</option><option value="Ready" ${order.status==="Ready"?"selected":""}>Ready</option><option value="Paid" ${order.status==="Paid"?"selected":""}>Paid</option><option value="Completed" ${order.status==="Completed"?"selected":""}>Completed</option></select></td><td>${(order.items||[]).map(i => `${escapeHtml(i.name)} x${Number(i.qty)}<br><span class="small">${escapeHtml(i.size || "")}</span>`).join("<br>")}</td><td><div class="row-actions"><button class="btn dark" data-pay-print="${escapeHtml(order.id||"")}">Paid + Print</button><button class="btn ghost" data-print-order="${escapeHtml(order.id||"")}">Reprint</button><button class="btn danger" data-cancel-restore="${escapeHtml(order.id||"")}">Cancel + Restore Stock</button><button class="btn ghost" data-archive-order="${escapeHtml(order.id||"")}">Move to History</button></div></td></tr>`).join("");
      tbody.querySelectorAll("[data-order-status]").forEach(select => select.onchange = async function(){ try { await updateOrderStatus(this.dataset.orderStatus, this.value, activeOrdersCache); showNotice(this.value==="Completed" ? "Order moved to history" : "Order status updated"); } catch { showNotice("Status update failed"); } });
      tbody.querySelectorAll("[data-pay-print]").forEach(btn => btn.onclick = async () => payAndPrintOrder(btn.dataset.payPrint));
      tbody.querySelectorAll("[data-print-order]").forEach(btn => btn.onclick = () => printReceipt(allOrdersForPrint.find(x => x.id === btn.dataset.printOrder)));
      tbody.querySelectorAll("[data-cancel-restore]").forEach(btn => btn.onclick = async () => { try { await cancelAndRestoreOrder(btn.dataset.cancelRestore, activeOrdersCache); showNotice("Order cancelled and stock restored"); } catch(error) { showNotice(error.message || "Cancel failed"); } });
      tbody.querySelectorAll("[data-archive-order]").forEach(btn => btn.onclick = async () => { try { await moveOrderToHistory(btn.dataset.archiveOrder, activeOrdersCache); showNotice("Order moved to history"); } catch { showNotice("Move failed"); } });
    }
    if(!historyOrders.length) historyBody.innerHTML = '<tr><td colspan="6" class="empty">No order history yet.</td></tr>';
    else {
      historyBody.innerHTML = historyOrders.map(order => { const isVoided = String(order.status || "").toLowerCase().includes("void") || order.voided; return `<tr><td><div style="font-weight:800">${escapeHtml(order.receiptNo || order.id || "-")}</div><div class="small">${escapeHtml(order.id||"")}</div>${isVoided ? `<div class="small" style="color:#ff9aa8;font-weight:900">VOIDED${order.voidReason ? ": "+escapeHtml(order.voidReason) : ""}</div>` : ""}</td><td><div style="font-weight:800">${escapeHtml(order.customer?.name||"-")}</div><div class="small">${escapeHtml(order.customer?.phone||"")}</div></td><td>${money(order.total||0)}</td><td>${escapeHtml(order.status||"Completed")}</td><td>${(order.items||[]).map(i => `${escapeHtml(i.name)} x${Number(i.qty)}<br><span class="small">${escapeHtml(i.size || "")}</span>`).join("<br>")}</td><td><div class="row-actions"><button class="btn ghost" data-history-print="${escapeHtml(order.id||"")}">Reprint</button>${isVoided ? "" : `<button class="btn danger" data-void-sale="${escapeHtml(order.id||"")}">Void Sale</button>`}</div></td></tr>`; }).join("");
      historyBody.querySelectorAll("[data-history-print]").forEach(btn => btn.onclick = () => printReceipt(allOrdersForPrint.find(x => x.id === btn.dataset.historyPrint)));
      historyBody.querySelectorAll("[data-void-sale]").forEach(btn => btn.onclick = async () => { try { await voidHistorySale(btn.dataset.voidSale); showNotice("Sale voided, stock restored, reports updated"); } catch(error) { console.error(error); showNotice(error.message || "Void sale failed"); } });
    }
  }

  function renderCustomers(customers){ const tbody = $("customersTable"); if(!tbody) return; if(!customers.length){ tbody.innerHTML = '<tr><td colspan="4" class="empty">No customers yet.</td></tr>'; return; } tbody.innerHTML = customers.map(customer => `<tr><td>${escapeHtml(customer.name||"-")}</td><td>${escapeHtml(customer.phone||"-")}</td><td>${escapeHtml(customer.email||"-")}</td><td>${escapeHtml(customer.address||"-")}</td></tr>`).join(""); }

  function addShippingZoneRow(name="", fee=0){
    const wrap = $("shippingZoneRows");
    if(!wrap) return;
    const row = document.createElement("div");
    row.className = "shipping-zone-row";
    row.innerHTML = `<input class="shipping-zone-name" placeholder="Zone name e.g. Davao City" value="${escapeHtml(name)}"><input class="shipping-zone-fee" type="number" min="0" placeholder="Fee" value="${Number(fee || 0)}"><button class="btn ghost" type="button">Remove</button>`;
    row.querySelector("button").onclick = () => { row.remove(); if(!document.querySelectorAll("#shippingZoneRows .shipping-zone-row").length) addShippingZoneRow("", 0); };
    wrap.appendChild(row);
  }
  function renderShippingAdmin(settings=adminShippingSettings){
    adminShippingSettings = normalizeShippingSettings(settings);
    if(!$("shippingEnabled")) return;
    $("shippingEnabled").checked = adminShippingSettings.enabled !== false;
    $("shippingPickupEnabled").checked = adminShippingSettings.pickupEnabled !== false;
    $("freeShippingMin").value = Number(adminShippingSettings.freeShippingMin || 0);
    const wrap = $("shippingZoneRows");
    if(wrap){ wrap.innerHTML = ""; adminShippingSettings.zones.forEach(z => addShippingZoneRow(z.name, z.fee)); }
  }
  function collectShippingAdmin(){
    const zones = Array.from(document.querySelectorAll("#shippingZoneRows .shipping-zone-row")).map(row => ({
      name:(row.querySelector(".shipping-zone-name")?.value || "").trim(),
      fee:Number(row.querySelector(".shipping-zone-fee")?.value || 0)
    })).filter(z => z.name);
    if($("shippingPickupEnabled")?.checked && !zones.some(z => z.name.toLowerCase().includes("pickup"))) zones.unshift({ name:"Store Pickup", fee:0 });
    return normalizeShippingSettings({
      enabled:$("shippingEnabled")?.checked !== false,
      pickupEnabled:$("shippingPickupEnabled")?.checked !== false,
      freeShippingMin:Number($("freeShippingMin")?.value || 0),
      zones
    });
  }

  function toDateSafe(value){
    if(!value) return null;
    if(value instanceof Date) return value;
    if(value.seconds) return new Date(Number(value.seconds) * 1000);
    if(value.toDate && typeof value.toDate === "function") return value.toDate();
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  function currentMonthValue(){
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0");
  }
  function productByAnyId(id){
    const target = String(id || "");
    return adminProductsCache.find(p => [p.id,p.docId,p.firestoreId,p._docId,p.sku,p.barcode].map(x=>String(x||"")).includes(target));
  }
  function productUnitCost(product){
    if(!product) return 0;
    return Number(product.costPrice || product.cost || product.capital || product.buyPrice || product.supplierPrice || 0);
  }
  function reportOrderDate(order){
    return toDateSafe(order.paidAt) || toDateSafe(order.movedAt) || toDateSafe(order.createdAt) || toDateSafe(order.date);
  }
  function orderAllowedByReportStatus(order, filter){
    const status = String(order.status || "").toLowerCase();
    const pay = String(order.paymentStatus || "").toLowerCase();
    if(status.includes("cancel") || status.includes("void") || order.voided) return false;
    if(filter === "completed") return status.includes("completed");
    if(filter === "paid-completed") return status.includes("completed") || status.includes("paid") || pay.includes("paid");
    return true;
  }
  function buildMonthlyReport(monthValue, statusFilter){
    const [yearStr, monthStr] = String(monthValue || currentMonthValue()).split("-");
    const year = Number(yearStr), month = Number(monthStr) - 1;
    const allOrders = [...(activeOrdersCache || []), ...(historyOrdersCache || [])];
    const rowsMap = new Map();
    let revenue = 0, cost = 0, itemsSold = 0, ordersCount = 0;

    allOrders.forEach(order => {
      const d = reportOrderDate(order);
      if(!d || d.getFullYear() !== year || d.getMonth() !== month) return;
      if(!orderAllowedByReportStatus(order, statusFilter)) return;
      ordersCount += 1;
      const orderItems = Array.isArray(order.items) ? order.items : [];
      const orderRevenue = Number(order.total || order.subtotal || orderItems.reduce((sum,i)=>sum + Number(i.price||0)*Number(i.qty||1), 0));
      revenue += orderRevenue;

      orderItems.forEach(item => {
        const itemQty = Number(item.qty || 1);
        if(isBundleCartItem(item)){
          (item.bundleItems || []).forEach(component => {
            const componentQty = itemQty * Number(component.qty || 1);
            const prod = productByAnyId(component.productId || component.id);
            const unitCost = Number(component.cost || component.costPrice || productUnitCost(prod));
            const componentCost = unitCost * componentQty;
            cost += componentCost;
            itemsSold += componentQty;
            const key = (component.productId || component.id || component.name || "Bundle item") + "::" + (component.size || component.variant || "Default");
            const existing = rowsMap.get(key) || { name:prod?.name || component.name || "Bundle item", variant:component.size || component.variant || "Default", qty:0, revenue:0, cost:0, profit:0 };
            existing.qty += componentQty;
            existing.cost += componentCost;
            rowsMap.set(key, existing);
          });
        }else{
          const prod = productByAnyId(item.productDocId || item.productId || item.id);
          const qty = itemQty;
          const lineRevenue = Number(item.price || 0) * qty;
          const unitCost = Number(item.cost || item.costPrice || productUnitCost(prod));
          const lineCost = unitCost * qty;
          cost += lineCost;
          itemsSold += qty;
          const key = (item.productId || item.id || item.name || "Item") + "::" + (item.size || item.variant || "Default");
          const existing = rowsMap.get(key) || { name:prod?.name || item.name || "Item", variant:item.size || item.variant || "Default", qty:0, revenue:0, cost:0, profit:0 };
          existing.qty += qty;
          existing.revenue += lineRevenue;
          existing.cost += lineCost;
          rowsMap.set(key, existing);
        }
      });
    });

    const rows = Array.from(rowsMap.values()).map(r => ({ ...r, profit:Number(r.revenue || 0) - Number(r.cost || 0) })).sort((a,b)=>b.qty-a.qty);
    // Bundle rows do not have allocated revenue per component. Keep total revenue/profit accurate at summary level.
    return { monthValue:String(monthValue || currentMonthValue()), ordersCount, itemsSold, revenue, cost, profit:revenue - cost, rows };
  }

  function resizeCanvasForChart(canvas){
    if(!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(320, Math.floor(rect.width || canvas.clientWidth || canvas.width || 520));
    const height = Math.max(220, Math.floor(rect.height || 260));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return {ctx,width,height};
  }
  function drawEmptyChart(canvas, text){
    const setup = resizeCanvasForChart(canvas); if(!setup) return;
    const {ctx,width,height} = setup;
    ctx.clearRect(0,0,width,height);
    ctx.fillStyle = "rgba(255,255,255,.78)";
    ctx.font = "800 15px Arial";
    ctx.textAlign = "center";
    ctx.fillText(text || "No data yet", width/2, height/2);
  }
  function drawMoneyChart(report){
    const canvas = $("reportMoneyChart"); if(!canvas) return;
    const setup = resizeCanvasForChart(canvas); if(!setup) return;
    const {ctx,width,height} = setup;
    ctx.clearRect(0,0,width,height);
    const pad = 38, bottom = 44, top = 20;
    const values = [Number(report.revenue||0), Number(report.cost||0), Number(report.profit||0)];
    const labels = ["Revenue", "Cost", "Profit"];
    const max = Math.max(...values, 1);
    ctx.strokeStyle = "rgba(255,255,255,.10)";
    ctx.lineWidth = 1;
    for(let i=0;i<4;i++){
      const y = top + (height-top-bottom) * i/3;
      ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(width-18,y); ctx.stroke();
    }
    const chartW = width - pad - 22;
    const barW = Math.min(90, chartW / 5);
    values.forEach((v,i)=>{
      const x = pad + chartW * (i + .5) / 3 - barW/2;
      const h = (height-top-bottom) * (v / max);
      const y = height - bottom - h;
      const grad = ctx.createLinearGradient(0,y,0,height-bottom);
      grad.addColorStop(0, i===0 ? "#20d7ff" : i===1 ? "#a78bfa" : "#46f7a5");
      grad.addColorStop(1, i===0 ? "#7c5cff" : i===1 ? "#5b3df5" : "#0ea86f");
      ctx.fillStyle = grad;
      ctx.beginPath();
      const r=12;
      ctx.moveTo(x+r,y); ctx.lineTo(x+barW-r,y); ctx.quadraticCurveTo(x+barW,y,x+barW,y+r);
      ctx.lineTo(x+barW,height-bottom); ctx.lineTo(x,height-bottom); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.font = "900 12px Arial";
      ctx.textAlign = "center";
      ctx.fillText(money(v), x+barW/2, Math.max(14, y-7));
      ctx.fillStyle = "rgba(255,255,255,.72)";
      ctx.font = "800 12px Arial";
      ctx.fillText(labels[i], x+barW/2, height-18);
    });
  }
  function drawTopItemsChart(report){
    const canvas = $("reportTopItemsChart"); if(!canvas) return;
    const rows = (report.rows || []).slice(0,6);
    if(!rows.length){ drawEmptyChart(canvas, "No sold items this month"); return; }
    const setup = resizeCanvasForChart(canvas); if(!setup) return;
    const {ctx,width,height} = setup;
    ctx.clearRect(0,0,width,height);
    const padL = 116, padR = 24, top = 20, rowH = Math.max(28, (height - top - 20) / rows.length);
    const max = Math.max(...rows.map(r=>Number(r.qty||0)),1);
    ctx.font = "800 11px Arial";
    rows.forEach((r,i)=>{
      const y = top + i*rowH + 5;
      const barH = Math.min(20, rowH-8);
      const w = (width - padL - padR) * Number(r.qty||0) / max;
      ctx.fillStyle = "rgba(255,255,255,.82)";
      ctx.textAlign = "right";
      const label = String(r.name || "Item").slice(0,14);
      ctx.fillText(label, padL-10, y+barH-5);
      const grad = ctx.createLinearGradient(padL,y,padL+w,y);
      grad.addColorStop(0,"#20d7ff"); grad.addColorStop(1,"#8b5cf6");
      ctx.fillStyle = grad;
      ctx.beginPath();
      const rr=10;
      ctx.moveTo(padL+rr,y); ctx.lineTo(padL+w-rr,y); ctx.quadraticCurveTo(padL+w,y,padL+w,y+rr);
      ctx.lineTo(padL+w,y+barH-rr); ctx.quadraticCurveTo(padL+w,y+barH,padL+w-rr,y+barH);
      ctx.lineTo(padL+rr,y+barH); ctx.quadraticCurveTo(padL,y+barH,padL,y+barH-rr);
      ctx.lineTo(padL,y+rr); ctx.quadraticCurveTo(padL,y,padL+rr,y);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.95)";
      ctx.textAlign = "left";
      ctx.font = "900 12px Arial";
      ctx.fillText(String(Number(r.qty||0)), padL + w + 8, y+barH-5);
      ctx.font = "800 10px Arial";
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.fillText(String(r.variant || "Default").slice(0,22), padL, y+barH+12);
    });
  }
  function renderSalesCharts(report){
    if(!report || !report.ordersCount){
      drawEmptyChart($("reportMoneyChart"), "No sales found");
      drawEmptyChart($("reportTopItemsChart"), "No sold items found");
      return;
    }
    drawMoneyChart(report);
    drawTopItemsChart(report);
  }

  function renderMonthlyReport(){
    const monthEl = $("reportMonth");
    const filterEl = $("reportStatusFilter");
    if(monthEl && !monthEl.value) monthEl.value = currentMonthValue();
    const report = buildMonthlyReport(monthEl?.value || currentMonthValue(), filterEl?.value || "all");
    lastReportRows = report.rows;
    if($("reportItemsSold")) $("reportItemsSold").textContent = String(report.itemsSold);
    if($("reportRevenue")) $("reportRevenue").textContent = money(report.revenue);
    if($("reportCost")) $("reportCost").textContent = money(report.cost);
    if($("reportProfit")) $("reportProfit").textContent = money(report.profit);
    renderSalesCharts(report);
    if($("reportSubtitle")) $("reportSubtitle").textContent = `${report.ordersCount} order(s) found for ${report.monthValue}. Profit uses product Cost Price / Capital.`;
    const tbody = $("reportItemsTable");
    if(!tbody) return;
    if(!report.rows.length){ tbody.innerHTML = '<tr><td colspan="6" class="empty">No sales found for this month.</td></tr>'; return; }
    tbody.innerHTML = report.rows.map(r => `<tr><td><strong>${escapeHtml(r.name)}</strong></td><td>${escapeHtml(r.variant || "Default")}</td><td>${Number(r.qty || 0)}</td><td>${money(r.revenue || 0)}</td><td>${money(r.cost || 0)}</td><td>${money(r.profit || 0)}</td></tr>`).join("");
  }
  function exportMonthlyReportCSV(){
    const month = $("reportMonth")?.value || currentMonthValue();
    const report = buildMonthlyReport(month, $("reportStatusFilter")?.value || "all");
    const lines = [
      ["Month", month],
      ["Items Sold", report.itemsSold],
      ["Revenue", report.revenue],
      ["Cost", report.cost],
      ["Profit", report.profit],
      [],
      ["Item","Variant","Qty Sold","Revenue","Cost","Profit"]
    ];
    report.rows.forEach(r => lines.push([r.name, r.variant, r.qty, r.revenue, r.cost, r.profit]));
    const csv = lines.map(row => row.map(cell => `"${String(cell ?? "").replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `mr-vape-sales-report-${month}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function resetSalesData({ archive=true } = {}){
    const ok = confirm(archive
      ? "Archive all orders/history, then reset reports to 0? Inventory will NOT change."
      : "PERMANENTLY delete all orders/history? Reports will reset to 0. Inventory will NOT change.");
    if(!ok) return;
    const stamp = new Date().toISOString();
    try{
      if(getMode()==="firebase" && firebaseReady){
        for(const colName of ["orders", "order_history"]){
          const snap = await getDocs(collection(db, colName));
          const docs = snap.docs;
          for(let i=0; i<docs.length; i+=450){
            const batch = writeBatch(db);
            docs.slice(i, i+450).forEach(d => {
              if(archive){
                const archiveRef = doc(collection(db, "archive_orders"));
                batch.set(archiveRef, { ...d.data(), originalId:d.id, originalCollection:colName, archivedAt:stamp });
              }
              batch.delete(d.ref);
            });
            await batch.commit();
          }
        }
      } else {
        if(archive){
          const previousArchive = readJSON("vape_shop_archive_orders", []);
          const archived = [
            ...getLocalOrders().map(o => ({ ...o, originalCollection:"orders", archivedAt:stamp })),
            ...getLocalHistory().map(o => ({ ...o, originalCollection:"order_history", archivedAt:stamp }))
          ];
          writeJSON("vape_shop_archive_orders", [...archived, ...previousArchive]);
        }
        setLocalOrders([]);
        setLocalHistory([]);
      }
      activeOrdersCache = [];
      historyOrdersCache = [];
      renderOrders(activeOrdersCache, historyOrdersCache);
      renderMonthlyReport();
      showNotice(archive ? "Sales archived and reset to 0" : "Sales history deleted and reset to 0");
    }catch(error){
      console.error("Reset sales failed", error);
      showNotice(error.message || "Reset failed");
    }
  }
  function setupReportsAdmin(){
    if($("reportMonth") && !$("reportMonth").value) $("reportMonth").value = currentMonthValue();
    if($("generateReportBtn")) $("generateReportBtn").onclick = renderMonthlyReport;
    if($("exportReportBtn")) $("exportReportBtn").onclick = exportMonthlyReportCSV;
    if($("archiveResetSalesBtn")) $("archiveResetSalesBtn").onclick = () => resetSalesData({ archive:true });
    if($("hardResetSalesBtn")) $("hardResetSalesBtn").onclick = () => resetSalesData({ archive:false });
    if($("reportStatusFilter")) $("reportStatusFilter").onchange = renderMonthlyReport;
  }

  async function setupShippingAdmin(){
    if(!$("shippingZoneRows")) return;
    try{ adminShippingSettings = await loadShippingSettings(); }catch{}
    renderShippingAdmin(adminShippingSettings);
    $("addShippingZoneBtn") && ($("addShippingZoneBtn").onclick = () => addShippingZoneRow("", 0));
    $("saveShippingSettingsBtn") && ($("saveShippingSettingsBtn").onclick = async () => {
      try{ adminShippingSettings = await saveShippingSettings(collectShippingAdmin()); renderShippingAdmin(adminShippingSettings); showNotice("Shipping zones saved"); }
      catch(error){ showNotice(error.message || "Shipping save failed"); }
    });
    $("resetShippingSettingsBtn") && ($("resetShippingSettingsBtn").onclick = () => { adminShippingSettings = defaultShippingSettings; renderShippingAdmin(adminShippingSettings); showNotice("Default shipping loaded"); });
  }


  let adminPromosCache = [];
  let editingPromoId = "";
  function fillPromoProductSelects(){
    ["promoProduct1","promoProduct2"].forEach((id, idx) => {
      const el = $(id); if(!el) return;
      const autoValue = idx === 0 ? "__auto_v2pod" : "__auto_v3device";
      const autoLabel = idx === 0 ? "Auto detect V2 Pod" : "Auto detect V3 Battery / Device";
      el.innerHTML = `<option value="${autoValue}">${autoLabel}</option>` + adminProductsCache.map(p => `<option value="${escapeHtml(productDocId(p))}">${escapeHtml(p.name)} (${escapeHtml(p.category || '')})</option>`).join("");
    });
  }
  function setPromoDefaultValues(){
    if($("promoName") && !$("promoName").value) $("promoName").value = "V2 Pod + V3 Device Bundle";
    if($("promoPrice") && !$("promoPrice").value) $("promoPrice").value = "750";
    if($("promoOldPrice") && !$("promoOldPrice").value) $("promoOldPrice").value = "830";
    if($("promoBadge") && !$("promoBadge").value) $("promoBadge").value = "BEST DEAL";
    if($("promoActive")) $("promoActive").checked = true;
  }
  function clearPromoForm(){ editingPromoId=""; if($("promoForm")) $("promoForm").reset(); setPromoDefaultValues(); fillPromoProductSelects(); }
  async function loadAdminPromos(){
    fillPromoProductSelects();
    const tbody = $("adminPromoTable"); if(!tbody) return;
    try{
      adminPromosCache = await fetchPromos();
    }catch(error){
      console.error("Admin promo load failed:", error);
      tbody.innerHTML = '<tr><td colspan="5" class="empty">Promo load failed. Check Firestore rules or refresh.</td></tr>';
      return;
    }
    if(!adminPromosCache.length){ tbody.innerHTML = '<tr><td colspan="5" class="empty">No promos yet. Choose V2 and V3 above, then click Save Promo.</td></tr>'; return; }
    const promoItemLabel = (i) => {
      const prod = adminProductsCache.find(x => productMatchesPromoItem(x, i));
      if(prod) return prod.name + ' (' + (prod.category || '') + ')';
      const m = String(i.productMatch || '').toLowerCase();
      if(m === 'v2pod' || m === 'pod') return 'Auto V2 Pod';
      if(m === 'v3device' || m === 'device') return 'Auto V3 Battery / Device';
      return i.productId || 'Auto item';
    };
    tbody.innerHTML = adminPromosCache.map(p => `<tr><td><strong>${escapeHtml(p.name)}</strong><div class="small">${escapeHtml(p.badge || '')}</div></td><td>${money(p.price)}</td><td>${p.active ? 'ON' : 'OFF'}</td><td>${(p.items||[]).map(i => escapeHtml(promoItemLabel(i))).join(' + ')}</td><td><div class="row-actions"><button class="btn ghost" data-edit-promo="${escapeHtml(p.id)}">Edit</button><button class="btn danger" data-delete-promo="${escapeHtml(p.id)}">Delete</button></div></td></tr>`).join("");
    tbody.querySelectorAll("[data-edit-promo]").forEach(btn => btn.onclick = () => {
      const p = adminPromosCache.find(x => x.id === btn.dataset.editPromo); if(!p) return; editingPromoId = p.id;
      $("promoName").value = p.name || ""; $("promoPrice").value = p.price || 0; $("promoOldPrice").value = p.oldPrice || 0; $("promoBadge").value = p.badge || ""; $("promoActive").checked = p.active !== false; fillPromoProductSelects();
      const items = p.items || [];
      const promoSelectValue = (item, fallback) => item?.productId || (String(item?.productMatch || '').toLowerCase().includes('v3') || fallback === 'v3' ? '__auto_v3device' : '__auto_v2pod');
      if($("promoProduct1")) $("promoProduct1").value = promoSelectValue(items[0], 'v2');
      if($("promoProduct2")) $("promoProduct2").value = promoSelectValue(items[1], 'v3');
      switchTab("promos");
    });
    tbody.querySelectorAll("[data-delete-promo]").forEach(btn => btn.onclick = async () => { if(confirm("Delete this promo?")){ await deletePromoItem(btn.dataset.deletePromo); await loadAdminPromos(); showNotice("Promo deleted"); } });
  }
  function switchTab(tabName){ document.querySelectorAll(".admin-tab-panel").forEach(panel => panel.classList.add("hidden")); const target = $("tab-"+tabName); if(target) target.classList.remove("hidden"); document.querySelectorAll(".admin-tab-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.tab===tabName)); }

  function posProductCode(product){ return String(product.barcode || product.sku || product.id || ""); }
  function selectPosProduct(product, preferredVariant=""){
    selectedPosProduct = product || null;
    const box = $("posSelectedBox"), variantSelect = $("posVariantSelect");
    if(!box || !variantSelect) return;
    if(!product){ box.textContent = "No product selected."; variantSelect.innerHTML = ""; return; }
    const variants = Array.isArray(product.variants) && product.variants.length ? product.variants : ["Default"];
    variantSelect.innerHTML = variants.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)} - Stock: ${getVariantStock(product, v)}${getVariantBarcode(product, v) ? " • " + escapeHtml(getVariantBarcode(product, v)) : ""}</option>`).join("");
    if(preferredVariant && variants.includes(preferredVariant)) variantSelect.value = preferredVariant;
    box.innerHTML = `<strong>${escapeHtml(product.name)}</strong><span>${money(product.price)} • Code: ${escapeHtml(posProductCode(product))}</span>`;
  }
  function renderPosSearch(term=""){
    const results = $("posSearchResults"); if(!results) return;
    const q = String(term || "").trim().toLowerCase();
    const list = (q ? adminProductsCache.filter(p => [p.id,p.name,p.brand,p.category,p.barcode,p.sku, ...Object.values(variantBarcodeMap(p))].some(v => String(v || "").toLowerCase().includes(q))) : adminProductsCache.slice(0,8)).slice(0,8);
    if(!list.length){ results.innerHTML = '<div class="empty mini">No product found.</div>'; return; }
    results.innerHTML = list.map(p => `<button type="button" class="pos-result" data-pos-pick="${escapeHtml(p.id)}"><span><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.brand || p.category || "")} • Stock ${Number(p.stock||0)}</small></span><b>${money(p.price)}</b></button>`).join("");
    results.querySelectorAll('[data-pos-pick]').forEach(btn => btn.onclick = () => selectPosProduct(adminProductsCache.find(p => p.id === btn.dataset.posPick)));
    const exactScan = q ? findProductByVariantBarcode(adminProductsCache, q) : null;
    if(exactScan){
      selectPosProduct(exactScan.product, exactScan.variant || null);
      if(exactScan.variant){
        addSelectedPosToCart(1, true);
        if(window.playBarcodeBeep) window.playBarcodeBeep();
      }
    }
  }
  function renderPosCart(){
    const view = $("posCartView"), count = $("posCartCount"), totalEl = $("posTotal"), changeEl = $("posChange");
    const total = totalAmount(posCart, 0);
    if(count) count.textContent = posCart.length + (posCart.length === 1 ? " item" : " items");
    if(totalEl) totalEl.textContent = money(total);
    const cash = Number($("posCash")?.value || 0);
    if(changeEl) changeEl.textContent = money(Math.max(0, cash - total));
    if(!view) return;
    if(!posCart.length){ view.innerHTML = '<div class="empty mini">POS cart is empty.</div>'; return; }
    view.innerHTML = posCart.map((item, idx) => `<div class="pos-cart-item"><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.size || "Default")} • ${money(item.price)} x ${Number(item.qty)}</small></div><div><b>${money(Number(item.price)*Number(item.qty))}</b><button type="button" data-pos-remove="${idx}">×</button></div></div>`).join("");
    view.querySelectorAll('[data-pos-remove]').forEach(btn => btn.onclick = () => { posCart.splice(Number(btn.dataset.posRemove), 1); renderPosCart(); });
  }
  function addSelectedPosToCart(qtyOverride, silent=false){
    if(!selectedPosProduct){ if(!silent) showNotice("Select a product first"); return false; }
    const variant = $("posVariantSelect")?.value || "Default";
    const qty = Math.max(1, Number(qtyOverride || $("posQty")?.value || 1));
    const available = getVariantStock(selectedPosProduct, variant);
    const existingQty = posCart.filter(i => i.id === selectedPosProduct.id && i.size === variant).reduce((a,b)=>a+Number(b.qty||0),0);
    if(available < existingQty + qty){ showNotice("Not enough stock for " + variant); return false; }
    const existing = posCart.find(i => i.id === selectedPosProduct.id && i.size === variant);
    if(existing) existing.qty = Number(existing.qty) + qty;
    else posCart.push({ id:selectedPosProduct.id, productId:selectedPosProduct.id, productDocId:selectedPosProduct.docId || selectedPosProduct.firestoreId || selectedPosProduct.id, name:selectedPosProduct.name, price:Number(selectedPosProduct.price || 0), cost:Number(selectedPosProduct.costPrice || selectedPosProduct.cost || 0), qty, size:variant, barcode:getVariantBarcode(selectedPosProduct, variant) || selectedPosProduct.barcode || "", image:(selectedPosProduct.variantImages && selectedPosProduct.variantImages[variant]) || firstProductImage(selectedPosProduct) });
    if($("posQty")) $("posQty").value = 1;
    renderPosCart();
    if(!silent) showNotice("Added to POS cart");
    return true;
  }


  async function ensureScannerLibrary(){
    if(window.Html5Qrcode) return true;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/html5-qrcode';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return !!window.Html5Qrcode;
  }
  function setupCameraBarcodeScanner(){
    const btn = $("posCameraScanBtn"), modal = $("barcodeScannerModal"), closeBtn = $("closeBarcodeScannerBtn"), reader = $("barcodeReader"), status = $("barcodeScannerStatus");
    if(!btn || !modal || !reader) return;
    let scanner = null;
    let scanning = false;
    const stop = async () => {
      try{ if(scanner && scanning){ await scanner.stop(); } }catch(e){ console.warn(e); }
      scanning = false;
      modal.classList.add('hidden');
      reader.innerHTML = '';
    };
    window.playBarcodeBeep = function(){
      try{
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.frequency.value = 880; gain.gain.value = 0.07;
        osc.connect(gain); gain.connect(ctx.destination); osc.start(); setTimeout(()=>{osc.stop(); ctx.close();}, 90);
      }catch(e){}
    };
    btn.onclick = async () => {
      modal.classList.remove('hidden');
      if(status) status.textContent = 'Opening camera... allow browser permission.';
      try{
        await ensureScannerLibrary();
        scanner = new Html5Qrcode('barcodeReader');
        scanning = true;
        await scanner.start({ facingMode:'environment' }, { fps:10, qrbox:{ width:240, height:140 }, formatsToSupport: undefined }, async (decodedText) => {
          const code = String(decodedText || '').trim();
          if(!code) return;
          if(status) status.textContent = 'Scanned: ' + code;
          const found = findProductByVariantBarcode(adminProductsCache, code);
          if(found){
            selectPosProduct(found.product, found.variant || null);
            if(found.variant) addSelectedPosToCart(1, true);
            else showNotice('Product found. Choose variant then Add to POS Cart.');
            window.playBarcodeBeep && window.playBarcodeBeep();
            await stop();
          }else{
            showNotice('Barcode not found: ' + code);
            if(status) status.textContent = 'Barcode not found. Add this barcode in Admin product variant first: ' + code;
          }
        });
      }catch(error){
        console.error('Camera scanner failed:', error);
        if(status) status.textContent = 'Camera scanner failed. Use manual barcode input or allow camera permission.';
      }
    };
    closeBtn && (closeBtn.onclick = stop);
    modal.onclick = (e) => { if(e.target === modal) stop(); };
  }

  function setupBarcodePos(){
    const scan = $("posScanInput"), addBtn = $("posAddBtn"), payBtn = $("posPayBtn"), clearBtn = $("posClearBtn"), cash = $("posCash");
    if(!scan || !addBtn || !payBtn) return;
    scan.addEventListener('input', () => renderPosSearch(scan.value));
    scan.addEventListener('keydown', (e) => { if(e.key === 'Enter'){ e.preventDefault(); renderPosSearch(scan.value); $("posQty")?.focus(); } });
    addBtn.onclick = () => {
      if(addSelectedPosToCart()){
        scan.value = "";
        renderPosSearch("");
        scan.focus();
      }
    };
    if(cash) cash.addEventListener('input', renderPosCart);
    clearBtn && (clearBtn.onclick = () => { posCart = []; selectedPosProduct = null; selectPosProduct(null); if(scan) scan.value = ""; renderPosSearch(""); renderPosCart(); });
    payBtn.onclick = async () => {
      if(!posCart.length){ showNotice("POS cart is empty"); return; }
      const total = totalAmount(posCart, 0);
      const cashReceived = Number($("posCash")?.value || total);
      const method = $("posPaymentMethod")?.value || "Cash";
      if(method === "Cash" && cashReceived < total){ showNotice("Cash received is lower than total"); return; }
      try{
        const order = await createPosSale(posCart, { name:$("posCustomerName")?.value || "Walk-in Customer", phone:$("posCustomerPhone")?.value || "" }, { paymentMethod:method, cashReceived });
        posCart = []; renderPosCart(); if($("posCash")) $("posCash").value = ""; showNotice("Paid. Opening receipt..."); printReceipt(order);
      }catch(error){ showNotice(error.message || "POS payment failed"); }
    };
    renderPosSearch(""); renderPosCart();
  }

  if($("adminReplyImage")) $("adminReplyImage").onchange = () => setImagePreview("adminReplyImage", "adminReplyImagePreviewWrap", "adminReplyImagePreview", "adminReplyImageName");
  if($("removeAdminReplyImageBtn")) $("removeAdminReplyImageBtn").onclick = () => clearFileInput("adminReplyImage", "adminReplyImagePreviewWrap", "adminReplyImagePreview", "adminReplyImageName");
  document.addEventListener("click", (event) => {
    if(event.target && event.target.id === "sendAdminReplyBtn"){
      event.preventDefault();
      sendAdminReply();
    }
  });

  subscribeProducts((items, source) => {
    adminProductsCache = items || [];
    renderProductsAdmin(adminProductsCache, source);
    renderPosSearch($("posScanInput")?.value || "");
    fillPromoProductSelects();
    if($("tab-promos") && !$("tab-promos").classList.contains("hidden")) loadAdminPromos();
  });
  subscribeOrders((activeOrders, historyOrders) => { activeOrdersCache = activeOrders || []; historyOrdersCache = historyOrders || []; renderOrders(activeOrdersCache, historyOrdersCache); if($("tab-reports") && !$("tab-reports").classList.contains("hidden")) renderMonthlyReport(); });
  subscribeCustomers((customers) => renderCustomers(customers));
  let __lastAdminMessageCount = 0;
  subscribeMessages((messages) => {
    adminMessagesCache = messages || [];
    if(messages.length > __lastAdminMessageCount && __lastAdminMessageCount !== 0) playNotificationBeep();
    __lastAdminMessageCount = messages.length;
    renderMessages(messages);
  });
  document.querySelectorAll(".admin-tab-btn").forEach(btn => btn.onclick = () => {
    if((document.body.dataset.role === "staff" || page === "staff") && btn.dataset.tab !== "pos") return;
    switchTab(btn.dataset.tab);
    if(btn.dataset.tab === "promos"){ fillPromoProductSelects(); loadAdminPromos(); }
    if(btn.dataset.tab === "reports"){ renderMonthlyReport(); }
  });
  async function handlePromoFormSave(e){
    if(e) e.preventDefault();
    // Force safe default values so the browser never blocks the promo form.
    const promoNameEl = $("promoName"), promoPriceEl = $("promoPrice"), promoOldPriceEl = $("promoOldPrice"), promoBadgeEl = $("promoBadge");
    if(promoNameEl && !promoNameEl.value.trim()) promoNameEl.value = "V2 Pod + V3 Device Bundle";
    if(promoPriceEl && !promoPriceEl.value) promoPriceEl.value = "750";
    if(promoOldPriceEl && !promoOldPriceEl.value) promoOldPriceEl.value = "830";
    if(promoBadgeEl && !promoBadgeEl.value.trim()) promoBadgeEl.value = "BEST DEAL";

    const p1Raw = $("promoProduct1")?.value || "__auto_v2pod";
    const p2Raw = $("promoProduct2")?.value || "__auto_v3device";
    const p1 = String(p1Raw).startsWith("__auto") ? "" : p1Raw;
    const p2 = String(p2Raw).startsWith("__auto") ? "" : p2Raw;
    const payload = {
      name:(promoNameEl?.value || "V2 Pod + V3 Device Bundle").trim(),
      price:Number(promoPriceEl?.value || 750),
      oldPrice:Number(promoOldPriceEl?.value || 830),
      badge:(promoBadgeEl?.value || "BEST DEAL").trim(),
      active:$("promoActive")?.checked !== false,
      items:[
        { productId:p1, productMatch:p1 ? "custom" : "v2pod", qty:1 },
        { productId:p2, productMatch:p2 ? "custom" : "v3device", qty:1 }
      ]
    };
    try{
      // Save local first so the Promo List updates instantly even if Firebase write is slow/blocked.
      const localId = upsertLocalPromo(payload, editingPromoId || "default_v2_v3_bundle");
      try{ await savePromoItem(payload, editingPromoId || localId); }catch(syncError){ console.warn("Firebase promo sync failed, but local promo was saved:", syncError); }
      editingPromoId = "";
      setPromoDefaultValues();
      fillPromoProductSelects();
      await loadAdminPromos();
      showNotice("Promo saved. Check Promo List below.");
    }catch(error){
      console.error("Promo save failed:", error);
      showNotice(error?.message || "Promo save failed. Check console.");
    }
  }
  if($("promoForm")){
    $("promoForm").setAttribute("novalidate", "novalidate");
    $("promoForm").onsubmit = handlePromoFormSave;
  }
  const promoSaveBtn = document.querySelector('#promoForm button[type="submit"]');
  if(promoSaveBtn) promoSaveBtn.addEventListener('click', handlePromoFormSave);
  setPromoDefaultValues();
  if($("clearPromoBtn")) $("clearPromoBtn").onclick = clearPromoForm;
  setupBarcodePos();
  setupCameraBarcodeScanner();
  setupShippingAdmin();
  setupReportsAdmin();
  switchTab("products");
  form.onsubmit = async (e) => { e.preventDefault(); const docId = $("docId").value.trim(); const payload = {
      name:$("name").value.trim(),
      brand:$("brand").value.trim(),
      category:$("category").value,
      price:Number($("price").value),
      costPrice:Number($("costPrice")?.value || 0),
      oldPrice:Number($("oldPrice").value),
      stock:(function(){ const vd = window.getVariantData ? window.getVariantData() : {variantStocks:{}}; const total = sumVariantStocks(vd.variantStocks); return total > 0 ? total : Number($("stock").value); })(),
      sold:$("sold").value.trim() || "0 sold",
      badge:$("badge").value.trim() || "New",
      variants:(window.getVariantData ? window.getVariantData().variants : ($("variants") ? $("variants").value.split(/\n|,/) : []).map(v => v.trim()).filter(Boolean)),
      variantImages:(window.getVariantData ? window.getVariantData().variantImages : {}),
      variantStocks:(window.getVariantData ? window.getVariantData().variantStocks : {}),
      variantBarcodes:(window.getVariantData ? window.getVariantData().variantBarcodes : {}),
      variantPhotoList:(window.getVariantData ? window.getVariantData().variantPhotoList : []),
      image:(function(){ const extra = window.getProductImageUrls ? window.getProductImageUrls() : [$("image").value.trim()]; const cleanExtra = extra.map(x => String(x || "").trim()).filter(Boolean); const vd = window.getVariantData ? window.getVariantData() : {variantPhotoList:[]}; return (cleanExtra[0] || vd.variantPhotoList[0]?.image || ""); })(),
      images:(function(){ const vd = window.getVariantData ? window.getVariantData() : {variantPhotoList:[]}; const variantImgs = (vd.variantPhotoList || []).map(v => v.image).filter(Boolean); const extra = (window.getProductImageUrls ? window.getProductImageUrls() : [$("image").value.trim()]).filter(Boolean); return Array.from(new Set(extra.concat(variantImgs))); })()
    }; try { await saveProduct(payload, docId || null); clearForm(); showNotice("Product saved"); } catch { showNotice("Save failed"); } };
  $("clearFormBtn").onclick = clearForm;
  $("seedBtn").onclick = async () => { try { await seedProducts(); showNotice("Demo products added"); } catch (error) { showNotice(error.message || "Seed failed"); } };
  $("resetBtn").onclick = () => { localStorage.removeItem(PRODUCTS_KEY); localStorage.removeItem(CART_KEY); localStorage.removeItem(ACCOUNT_KEY); localStorage.removeItem(CUSTOMERS_KEY); localStorage.removeItem(ORDERS_KEY); localStorage.removeItem(HISTORY_KEY); seedLocalIfEmpty(); showNotice("Local data reset"); };
  $("switchLocalBtn").onclick = () => { setMode("local"); showNotice("Switched to local mode"); setTimeout(() => location.reload(), 600); };
  $("switchFirebaseBtn").onclick = () => { if(!firebaseReady){ showNotice("Firebase is not available here"); return; } setMode("firebase"); showNotice("Switched to Firebase mode"); setTimeout(() => location.reload(), 600); };
}


/* === PRO CHAT UX HELPERS ===
   - Quick message chips for customer and admin
   - Enter to send, Shift+Enter for new line
   - Keeps chat textareas focused and faster to use
*/
document.addEventListener("click", (event) => {
  const customerQuick = event.target.closest("[data-quick-message]");
  if(customerQuick){
    const box = document.getElementById("inq_message");
    if(box){
      box.value = customerQuick.dataset.quickMessage || "";
      box.focus();
    }
  }
  const adminQuick = event.target.closest("[data-admin-quick-reply]");
  if(adminQuick){
    const box = document.getElementById("adminReplyText");
    if(box){
      box.value = adminQuick.dataset.adminQuickReply || "";
      box.focus();
    }
  }
});

document.addEventListener("keydown", (event) => {
  if(event.key !== "Enter" || event.shiftKey) return;
  const target = event.target;
  if(!target) return;
  if(target.id === "inq_message"){
    event.preventDefault();
    document.getElementById("sendInquiryBtn")?.click();
  }
  if(target.id === "adminReplyText"){
    event.preventDefault();
    document.getElementById("sendAdminReplyBtn")?.click();
  }
});

/* === Custom Variant + Per-Variant Image Builder Upgrade === */
(function(){
  function $(id){ return document.getElementById(id); }
  function rows(){ return Array.from(document.querySelectorAll('#variantRows .variant-row')); }
  function syncVariantData(){
    const data = rows().map(row => {
      const name = (row.querySelector('.variant-name')?.value || '').trim();
      const image = (row.querySelector('.variant-image')?.value || '').trim();
      const stock = Number(row.querySelector('.variant-stock')?.value || 0);
      const barcode = (row.querySelector('.variant-barcode')?.value || '').trim();
      return { name, image, stock, barcode };
    }).filter(v => v.name || v.image);
    const names = data.map(v => v.name).filter(Boolean);
    const imageMap = {};
    const stockMap = {};
    const barcodeMap = {};
    data.forEach(v => { if(v.name && v.image) imageMap[v.name] = v.image; if(v.name) stockMap[v.name] = Number(v.stock || 0); if(v.name && v.barcode) barcodeMap[v.name] = v.barcode; });
    if($('variants')) $('variants').value = names.join('\n');
    if($('variantImages')) $('variantImages').value = JSON.stringify(imageMap);
    const totalStock = sumVariantStocks(stockMap);
    if($('stock') && names.length) $('stock').value = totalStock;
    return { variants:names, variantImages:imageMap, variantStocks:stockMap, variantBarcodes:barcodeMap, variantPhotoList:data.filter(v => v.image || v.stock || v.barcode) };
  }
  window.getVariantData = syncVariantData;

  function addVariantRow(name, image, stock, barcode){
    const wrap = $('variantRows');
    if(!wrap) return;
    const row = document.createElement('div');
    row.className = 'variant-row variant-photo-row';
    row.innerHTML = '<input class="variant-name" type="text" placeholder="Flavor / color name e.g. Black Wave" value=""><input class="variant-stock" type="number" min="0" placeholder="Stock"><input class="variant-barcode" type="text" placeholder="Barcode from vape box"><input class="variant-image" type="text" placeholder="Image URL for this flavor/color"><label class="image-upload-btn">Upload<input class="variant-file" type="file" accept="image/*" hidden></label><button type="button" aria-label="Remove variant">Remove</button>';
    const nameInput = row.querySelector('.variant-name');
    const stockInput = row.querySelector('.variant-stock');
    const barcodeInput = row.querySelector('.variant-barcode');
    const imageInput = row.querySelector('.variant-image');
    const fileInput = row.querySelector('.variant-file');
    nameInput.value = name || '';
    stockInput.value = Number(stock || 0);
    barcodeInput.value = barcode || '';
    imageInput.value = image || '';
    nameInput.addEventListener('input', syncVariantData);
    stockInput.addEventListener('input', syncVariantData);
    barcodeInput.addEventListener('input', syncVariantData);
    imageInput.addEventListener('input', syncVariantData);
    fileInput.addEventListener('change', async function(){
      const picked = fileInput.files && fileInput.files[0];
      if(!picked) return;
      const oldValue = imageInput.value;
      imageInput.value = 'Uploading image...';
      try{
        imageInput.value = await compressImageFile(picked, 900, 0.78);
      }catch(err){
        imageInput.value = oldValue || '';
        showNotice('Image upload failed. Try a smaller photo or paste an image URL.');
      }
      syncVariantData();
    });
    row.querySelector('button').addEventListener('click', function(){
      row.remove();
      if(!rows().length) addVariantRow('', '');
      syncVariantData();
    });
    wrap.appendChild(row);
    syncVariantData();
  }

  function hydrateVariantRows(item){
    const wrap = $('variantRows');
    if(!wrap) return;
    const hidden = $('variants');
    let names = [];
    if(Array.isArray(item?.variants)) names = item.variants;
    else if(hidden && hidden.value) names = hidden.value.split(/\n|,/).map(v => v.trim()).filter(Boolean);
    const map = item?.variantImages && typeof item.variantImages === 'object' ? item.variantImages : {};
    const stockMap = item?.variantStocks && typeof item.variantStocks === 'object' ? item.variantStocks : {};
    const barcodeMap = item?.variantBarcodes && typeof item.variantBarcodes === 'object' ? item.variantBarcodes : {};
    if(!names.length && Array.isArray(item?.variantPhotoList)) names = item.variantPhotoList.map(v => v.name).filter(Boolean);
    wrap.innerHTML = '';
    (names.length ? names : ['']).forEach(name => addVariantRow(name, map[name] || '', stockMap[name] || 0, barcodeMap[name] || ''));
    if(Array.isArray(item?.variantPhotoList)){
      item.variantPhotoList.forEach(v => {
        if(v && (v.image || v.stock || v.barcode) && !rows().some(row => (row.querySelector('.variant-name')?.value || '') === v.name)) addVariantRow(v.name || '', v.image || '', v.stock || stockMap[v.name] || 0, v.barcode || barcodeMap[v.name] || '');
      });
    }
    syncVariantData();
  }
  window.hydrateVariantRows = hydrateVariantRows;

  window.addEventListener('DOMContentLoaded', function(){
    if(!$('variantRows')) return;
    hydrateVariantRows(null);
    const addBtn = $('addVariantRowBtn');
    if(addBtn) addBtn.addEventListener('click', function(){ addVariantRow('', ''); const last=rows().at(-1); last?.querySelector('.variant-name')?.focus(); });
    const form = $('productForm');
    if(form) form.addEventListener('submit', syncVariantData, true);
    const clearBtn = $('clearFormBtn');
    if(clearBtn) clearBtn.addEventListener('click', function(){ setTimeout(() => hydrateVariantRows(null), 0); });
  });
})();

/* === Unlimited Product Image Builder Upgrade === */
(function(){
  function $(id){ return document.getElementById(id); }
  function getImageInputs(){ return Array.from(document.querySelectorAll('#imageRows .image-row input')); }
  function syncProductImages(){
    const urls = getImageInputs().map(input => (input.value || '').trim()).filter(Boolean);
    const main = $('image');
    if(main) main.value = urls[0] || '';
    return urls;
  }
  window.getProductImageUrls = syncProductImages;
  function addImageRow(value){
    const wrap = $('imageRows');
    if(!wrap) return;
    const row = document.createElement('div');
    row.className = 'image-row';
    row.innerHTML = '<input type="text" placeholder="Paste image URL or upload photo for product/flavor" value=""><label class="image-upload-btn">Upload<input type="file" accept="image/*" hidden></label><button type="button" aria-label="Remove image">Remove</button>';
    const input = row.querySelector('input[type="text"]');
    const file = row.querySelector('input[type="file"]');
    input.value = value || '';
    input.addEventListener('input', syncProductImages);
    if(file){
      file.addEventListener('change', async function(){
        const picked = file.files && file.files[0];
        if(!picked) return;
        input.value = 'Uploading image...';
        try{
          input.value = await compressImageFile(picked, 900, 0.78);
        }catch(err){
          input.value = '';
          showNotice('Image upload failed. Try a smaller photo or paste an image URL.');
        }
        syncProductImages();
      });
    }
    row.querySelector('button').addEventListener('click', function(){ row.remove(); if(!getImageInputs().length) addImageRow(''); syncProductImages(); });
    wrap.appendChild(row);
    syncProductImages();
  }
  function hydrateProductImageRows(values){
    const wrap = $('imageRows');
    if(!wrap) return;
    const list = Array.isArray(values) && values.length ? values : (window.__pendingProductImages || ['']);
    wrap.innerHTML = '';
    list.forEach(addImageRow);
    syncProductImages();
  }
  window.hydrateProductImageRows = hydrateProductImageRows;
  window.addEventListener('DOMContentLoaded', function(){
    if(!$('imageRows')) return;
    hydrateProductImageRows(window.__pendingProductImages || ['']);
    const addBtn = $('addImageRowBtn');
    if(addBtn) addBtn.addEventListener('click', function(){ addImageRow(''); const inputs=getImageInputs(); inputs[inputs.length-1]?.focus(); });
    const form = $('productForm');
    if(form) form.addEventListener('submit', syncProductImages, true);
    const clearBtn = $('clearFormBtn');
    if(clearBtn) clearBtn.addEventListener('click', function(){ setTimeout(() => hydrateProductImageRows(['']), 0); });
  });
})();
