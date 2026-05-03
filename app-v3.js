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
const CHAT_ID_KEY = "vape_shop_chat_id";
const CUSTOMER_LAST_SEEN_KEY = "vape_shop_customer_last_seen";
const MODE_KEY = "vape_shop_mode";
const categories = ["All","Pods","Devices","E-Juice","Battery","Accessories","Promo"];
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
    return onSnapshot(query(collection(db, "products"), orderBy("createdAt", "desc")), (snapshot) => callback(snapshot.docs.map(d => ({ id:d.id, ...d.data() })), "firebase"), () => { seedLocalIfEmpty(); callback(getLocalProducts(), "local"); });
  }
  seedLocalIfEmpty(); callback(getLocalProducts(), "local"); return storageSync(() => callback(getLocalProducts(), "local"));
}
function subscribeOrders(callback){
  if(getMode()==="firebase" && firebaseReady){
    return onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), async (snapshot) => {
      let history = []; try { history = await fetchFirebaseDocs("order_history", "movedAt"); } catch {}
      callback(snapshot.docs.map(d => ({ id:d.id, ...d.data() })), history, "firebase");
    }, () => callback(getLocalOrders(), getLocalHistory(), "local"));
  }
  callback(getLocalOrders(), getLocalHistory(), "local"); return storageSync(() => callback(getLocalOrders(), getLocalHistory(), "local"));
}
function subscribeCustomers(callback){
  if(getMode()==="firebase" && firebaseReady){
    return onSnapshot(query(collection(db, "customers_public"), orderBy("updatedAt", "desc")), (snapshot) => callback(snapshot.docs.map(d => ({ id:d.id, ...d.data() })), "firebase"), () => callback(getLocalCustomers(), "local"));
  }
  callback(getLocalCustomers(), "local"); return storageSync(() => callback(getLocalCustomers(), "local"));
}
function isAdminEmail(email){
  return ADMIN_EMAILS.map(x => x.toLowerCase()).includes(String(email || "").toLowerCase());
}

function requireAdminGuard(){
  if(!firebaseReady || !auth){
    showNotice("Firebase Auth is not ready");
    return;
  }
  onAuthStateChanged(auth, (user) => {
    if(!user || !isAdminEmail(user.email)){
      window.location.href = "./admin-login.html";
      return;
    }
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
      if(!isAdminEmail(cred.user.email)){
        await signOut(auth);
        showNotice("This account is not allowed as admin");
        return;
      }
      window.location.href = "./admin.html";
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


  function findBundleProducts(){
    const pod = products.find(p => /v2/i.test(p.name || "") && /pod|pods/i.test((p.category || "") + " " + (p.name || ""))) || products.find(p => /pod|pods/i.test((p.category || "") + " " + (p.name || "")));
    const device = products.find(p => /v3/i.test(p.name || "") && /device|battery/i.test((p.category || "") + " " + (p.name || ""))) || products.find(p => /device|battery/i.test((p.category || "") + " " + (p.name || "")));
    return { pod, device };
  }

  function bundleVariantOptions(product, fallback){
    return getProductVariants(product, fallback).map(v => {
      const stock = getVariantStock(product, v);
      return `<option value="${escapeHtml(v)}" ${stock <= 0 ? "disabled" : ""}>${escapeHtml(v)} ${stock <= 0 ? "(Out of stock)" : "(" + stock + " left)"}</option>`;
    }).join("");
  }

  function renderBundlePromoSection(q=""){
    if(currentCategory !== "All" && currentCategory !== "Promo") return "";
    if(q && !"v2 v3 pod device bundle promo combo 750".includes(q)) return "";
    const { pod, device } = findBundleProducts();
    if(!pod || !device) return "";
    const podImg = firstProductImage(pod);
    const deviceImg = firstProductImage(device);
    return `
      <section class="bundle-section">
        <div class="bundle-copy">
          <span class="bundle-kicker">🔥 Bundle Deal</span>
          <h3>V2 Pod + V3 Device</h3>
          <p>Customer can pick 1 V2 flavor and 1 V3 battery color. Stock deducts from both selected variants.</p>
          <div class="bundle-price"><strong>₱750</strong><span>Regular: ${money(Number(pod.price || 0) + Number(device.price || 0))}</span></div>
        </div>
        <div class="bundle-picker-card" data-bundle-promo>
          <div class="bundle-images">
            <div style="background-image:url('${escapeHtml(podImg)}')"></div>
            <b>+</b>
            <div style="background-image:url('${escapeHtml(deviceImg)}')"></div>
          </div>
          <label>Choose V2 Pod Flavor<select id="bundlePodVariant">${bundleVariantOptions(pod, ["Black Wave","Beer Sparkle","Trouble Purple","Very More","Very Baguio","Red Cannon","Bacteria Monster","Blue Freeze"])}</select></label>
          <label>Choose V3 Battery Color<select id="bundleDeviceVariant">${bundleVariantOptions(device, ["Black","Gold","Purple","Blue"])}</select></label>
          <button class="btn dark bundle-add-btn" id="addBundleBtn" type="button">Add Bundle ₱750</button>
          <div class="small bundle-note">No fake promo stock. It checks and deducts the real V2 + V3 stocks.</div>
        </div>
      </section>`;
  }

  function bindBundlePromo(){
    const btn = $("addBundleBtn");
    if(!btn) return;
    btn.onclick = () => {
      const { pod, device } = findBundleProducts();
      const podVariant = $("bundlePodVariant")?.value || "Default";
      const deviceVariant = $("bundleDeviceVariant")?.value || "Default";
      if(!pod || !device){ showNotice("Bundle products not found"); return; }
      const podStock = getVariantStock(pod, podVariant);
      const deviceStock = getVariantStock(device, deviceVariant);
      if(podStock <= 0 || deviceStock <= 0){ showNotice("Selected bundle item is out of stock"); return; }
      const item = {
        type:"bundle",
        bundleId:"v2-v3-750",
        id:"bundle-v2-v3-750",
        name:"V2 Pod + V3 Device Bundle",
        brand:"MR VAPE SHOP",
        category:"Promo",
        price:750,
        image:firstProductImage(pod) || firstProductImage(device),
        qty:1,
        size:podVariant + " + " + deviceVariant,
        bundleItems:[
          { productId:pod.id, name:pod.name, brand:pod.brand, category:pod.category, size:podVariant, qty:1, image:(pod.variantImages && pod.variantImages[podVariant]) ? pod.variantImages[podVariant] : firstProductImage(pod) },
          { productId:device.id, name:device.name, brand:device.brand, category:device.category, size:deviceVariant, qty:1, image:(device.variantImages && device.variantImages[deviceVariant]) ? device.variantImages[deviceVariant] : firstProductImage(device) }
        ]
      };
      const existing = findExistingCartItem(cart, item);
      const nextQty = (existing ? Number(existing.qty || 0) : 0) + 1;
      if(nextQty > podStock || nextQty > deviceStock){ showNotice("No more stock available for this bundle selection"); return; }
      if(existing) existing.qty = nextQty; else cart.push(item);
      writeJSON(CART_KEY, cart);
      renderCart();
      showNotice("Bundle added: " + podVariant + " + " + deviceVariant);
    };
  }

  function renderProducts(){
    const q = (searchInput.value || "").trim().toLowerCase();
    const filtered = products.filter(p => {
      const categoryOk = currentCategory === "All" || p.category === currentCategory;
      const text = `${p.brand} ${p.name} ${p.category}`.toLowerCase();
      return categoryOk && (!q || text.includes(q));
    });

    const bundleSection = renderBundlePromoSection(q);
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
    bindBundlePromo();

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

  function closeDrawer(){ drawer.classList.remove("show"); }


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
  $("openCartBtn").onclick = () => openDrawer("cart");
  $("navCart").onclick = () => openDrawer("cart");
  $("navAccount").onclick = () => openDrawer("account");
  if($("navTrack")) $("navTrack").onclick = () => openTrackingModal(account.phone || "");
  if($("openTrackTopBtn")) $("openTrackTopBtn").onclick = () => openTrackingModal(account.phone || "");
  if($("closeTrackingBtn")) $("closeTrackingBtn").onclick = closeTrackingModal;
  if($("trackingSearchBtn")) $("trackingSearchBtn").onclick = trackOrder;
  if($("trackingInput")) $("trackingInput").addEventListener("keydown", (e) => { if(e.key === "Enter") trackOrder(); });
  if($("trackingModal")) $("trackingModal").onclick = (e) => { if(e.target.id === "trackingModal") closeTrackingModal(); };
  $("navCategory").onclick = () => $("productsSection").scrollIntoView({behavior:"smooth"});
  $("navHome").onclick = () => window.scrollTo({top:0, behavior:"smooth"});
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
  const cleanItems = cart.map(item => ({
    name:item.name,
    qty:Number(item.qty || 1),
    price:Number(item.price || 0),
    productId:item.id,
    size:item.size || item.variant || "Default",
    image:item.image || ""
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
      // Firestore transactions require all reads before any writes.
      const productReads = [];
      for(const item of cart){
        const ref = doc(db, "products", item.id);
        const snap = await transaction.get(ref);
        productReads.push({ item, ref, snap });
      }

      const productUpdates = [];
      for(const row of productReads){
        const { item, ref, snap } = row;
        if(!snap.exists()) throw new Error(item.name + " not found");
        const data = snap.data();
        const qty = Number(item.qty || 1);
        const selectedVariant = item.size || item.variant || "Default";
        const variantStocks = (data.variantStocks && typeof data.variantStocks === "object") ? { ...data.variantStocks } : {};
        if(Object.keys(variantStocks).length && Object.prototype.hasOwnProperty.call(variantStocks, selectedVariant)){
          const current = Number(variantStocks[selectedVariant] || 0);
          if(current < qty) throw new Error("Not enough stock for " + item.name + " - " + selectedVariant);
          variantStocks[selectedVariant] = current - qty;
          productUpdates.push({ ref, payload:{ variantStocks, stock: sumVariantStocks(variantStocks) } });
        } else {
          const stock = Number(data.stock || 0);
          if(stock < qty) throw new Error("Not enough stock for " + item.name);
          productUpdates.push({ ref, payload:{ stock: stock - qty } });
        }
      }

      productUpdates.forEach(u => transaction.update(u.ref, u.payload));
      const orderRef = doc(collection(db, "order_history"));
      orderId = orderRef.id;
      transaction.set(orderRef, { ...orderPayload, createdAt:serverTimestamp(), paidAt:serverTimestamp(), movedAt:serverTimestamp() });
    });
    return { id:orderId, ...orderPayload, paidAt:new Date().toISOString() };
  }
  const products = getLocalProducts();
  for(const item of cart){
    const p = products.find(x => x.id === item.id);
    if(!p || getVariantStock(p, item.size) < Number(item.qty || 1)) throw new Error("Not enough stock for " + item.name + (item.size ? " - " + item.size : ""));
  }
  for(const item of cart){
    const p = products.find(x => x.id === item.id);
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
  bindNoticeButtons(); const form = $("productForm"), table = $("adminProductTable"); let activeOrdersCache = []; let adminProductsCache = []; let posCart = []; let selectedPosProduct = null; let adminShippingSettings = getLocalShippingSettings();
  const topActions = document.querySelector(".top-actions-wrap");
  if(topActions && !document.getElementById("logoutAdminBtn")){
    const logoutBtn = document.createElement("button");
    logoutBtn.id = "logoutAdminBtn";
    logoutBtn.className = "btn dark";
    logoutBtn.textContent = "Logout";
    logoutBtn.onclick = async () => { try { await signOut(auth); } catch {} window.location.href = "./admin-login.html"; };
    topActions.appendChild(logoutBtn);
  }
  function updateStats(items){ $("statProducts").textContent = items.length; $("statStock").textContent = items.reduce((a,b)=>a+Number(b.stock||0),0); $("statLow").textContent = items.filter(x=>Number(x.stock||0)<=10).length; $("statCategories").textContent = new Set(items.map(x=>x.category)).size; }
  function clearForm(){ form.reset(); $("docId").value = ""; if($("variants")) $("variants").value = ""; if($("variantImages")) $("variantImages").value = "{}"; if($("image")) $("image").value = ""; window.__pendingProductImages = [""]; setTimeout(() => { window.hydrateVariantRows && window.hydrateVariantRows(null); window.hydrateProductImageRows && window.hydrateProductImageRows([""]); }, 0); }
  function fillForm(item){ $("docId").value=item.id; $("name").value=item.name||""; $("brand").value=item.brand||""; $("category").value=item.category||"Pods"; $("price").value=item.price||0; $("oldPrice").value=item.oldPrice||0; $("stock").value=item.stock||0; $("sold").value=item.sold||""; $("badge").value=item.badge||""; if($("variants")) $("variants").value = Array.isArray(item.variants) ? item.variants.join("\n") : ""; if($("variantImages")) $("variantImages").value = JSON.stringify(item.variantImages || {}); const variantImgs = item.variantImages && typeof item.variantImages === "object" ? Object.values(item.variantImages).filter(Boolean) : []; const allImgs = (Array.isArray(item.images) && item.images.length ? item.images : [item.image]).filter(Boolean); const extraImgs = allImgs.filter(img => !variantImgs.includes(img)); if($("image")) $("image").value = allImgs[0] || ""; window.__pendingProductImages = extraImgs.length ? extraImgs : [""]; setTimeout(() => { window.hydrateVariantRows && window.hydrateVariantRows(item); window.hydrateProductImageRows && window.hydrateProductImageRows(window.__pendingProductImages); }, 0); window.scrollTo({top:0, behavior:"smooth"}); }
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
    const dateText = order.paidAt && typeof order.paidAt === "string" ? new Date(order.paidAt).toLocaleString() : new Date().toLocaleString();
    const receiptNo = receiptNumber(order);
    const rowsHtml = items.map((item, index) => `
      <tr>
        <td class="num">${index + 1}</td>
        <td class="item-name">${escapeHtml(item.name || "Item")}<br><span>${escapeHtml(item.size || item.variant || "Default")}</span></td>
        <td class="qty">${Number(item.qty || 0)}</td>
        <td class="money-cell">${money(item.price || 0)}</td>
        <td class="money-cell">${money(Number(item.price || 0) * Number(item.qty || 0))}</td>
      </tr>
    `).join("");
    const html = `<!doctype html><html><head><title>Receipt ${escapeHtml(receiptNo)}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      :root{--paper:80mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#111;background:#f3f4f6}.toolbar{position:sticky;top:0;background:#0b1220;color:white;padding:10px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap}.toolbar button{border:0;border-radius:10px;padding:10px 12px;font-weight:800;cursor:pointer}.toolbar .primary{background:#111827;color:#fff;border:1px solid #374151}.toolbar .light{background:#fff;color:#111}.receipt{width:var(--paper);max-width:100%;margin:14px auto;background:#fff;padding:12px 10px;box-shadow:0 10px 30px rgba(0,0,0,.18)}.center{text-align:center}.shop{font-size:18px;font-weight:900;letter-spacing:.5px}.tag{font-size:11px;text-transform:uppercase;letter-spacing:1.2px}.muted{font-size:11px;color:#444;line-height:1.45}.paid{font-size:13px;font-weight:900;border:2px solid #111;display:inline-block;padding:5px 16px;margin:8px 0 2px;border-radius:999px}hr{border:0;border-top:1px dashed #777;margin:10px 0}table{width:100%;border-collapse:collapse;font-size:11px}th{font-size:10px;text-transform:uppercase;text-align:left;border-bottom:1px solid #111;padding:4px 0}td{padding:5px 0;border-bottom:1px dashed #ddd;vertical-align:top}.num{width:14px}.qty{text-align:center;width:22px}.money-cell{text-align:right;white-space:nowrap}.item-name span{font-size:10px;color:#555}.summary td{border:0;padding:3px 0}.summary .grand td{font-size:15px;font-weight:900;border-top:1px dashed #777;padding-top:7px}.barcode{font-family:"Courier New",monospace;font-size:12px;letter-spacing:2px;border:1px solid #111;padding:6px;margin:8px 0 2px;word-break:break-all}.footer{font-size:11px;line-height:1.5}.copy{font-size:10px;color:#666}@page{size:80mm auto;margin:4mm}@media print{body{background:#fff}.toolbar{display:none}.receipt{width:80mm;margin:0;box-shadow:none;padding:0 2mm}body.print-58 .receipt{width:58mm}@page{margin:2mm}}
    </style></head><body><div class="toolbar no-print"><button class="primary" onclick="window.print()">🧾 Print Receipt</button><button class="light" onclick="document.body.classList.toggle('print-58');document.documentElement.style.setProperty('--paper',document.body.classList.contains('print-58')?'58mm':'80mm')">58mm / 80mm</button><button class="light" onclick="window.close()">Close</button></div><div class="receipt">
      <div class="center"><div class="shop">MR VAPE SHOP</div><div class="tag">Official POS Receipt</div><div class="paid">PAID</div></div><hr>
      <div class="muted"><strong>Receipt No:</strong> ${escapeHtml(receiptNo)}<br><strong>Order ID:</strong> ${escapeHtml(order.id || "-")}<br><strong>Date:</strong> ${escapeHtml(dateText)}<br><strong>Cashier:</strong> ${escapeHtml(order.cashier || "Admin POS")}<br><strong>Customer:</strong> ${escapeHtml(order.customer?.name || "Walk-in Customer")}<br><strong>Phone:</strong> ${escapeHtml(order.customer?.phone || "-")}<br><strong>Delivery:</strong> ${escapeHtml(order.shippingZone || (shipping ? "Delivery" : "Walk-in / Pickup"))}</div><hr>
      <table><thead><tr><th>#</th><th>Item</th><th>Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead><tbody>${rowsHtml}</tbody></table><hr>
      <table class="summary"><tr><td>Subtotal</td><td class="money-cell">${money(subtotal)}</td></tr><tr><td>Shipping/Fee</td><td class="money-cell">${money(shipping)}</td></tr><tr><td>Payment</td><td class="money-cell">${escapeHtml(order.paymentMethod || "Cash")}</td></tr>${cashReceived ? `<tr><td>Cash Received</td><td class="money-cell">${money(cashReceived)}</td></tr><tr><td>Change</td><td class="money-cell">${money(change)}</td></tr>` : ""}<tr class="grand"><td>TOTAL</td><td class="money-cell">${money(total)}</td></tr></table>
      <hr><div class="center"><div class="barcode">*${escapeHtml(receiptNo)}*</div><div class="footer">Thank you for shopping with us!<br>Please keep this receipt for reference.</div><div class="copy">Powered by MR VAPE SHOP POS</div></div>
    </div><script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script></body></html>`;
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
      historyBody.innerHTML = historyOrders.map(order => `<tr><td><div style="font-weight:800">${escapeHtml(order.receiptNo || order.id || "-")}</div><div class="small">${escapeHtml(order.id||"")}</div></td><td><div style="font-weight:800">${escapeHtml(order.customer?.name||"-")}</div><div class="small">${escapeHtml(order.customer?.phone||"")}</div></td><td>${money(order.total||0)}</td><td>${escapeHtml(order.status||"Completed")}</td><td>${(order.items||[]).map(i => `${escapeHtml(i.name)} x${Number(i.qty)}<br><span class="small">${escapeHtml(i.size || "")}</span>`).join("<br>")}</td><td><button class="btn ghost" data-history-print="${escapeHtml(order.id||"")}">Reprint</button></td></tr>`).join("");
      historyBody.querySelectorAll("[data-history-print]").forEach(btn => btn.onclick = () => printReceipt(allOrdersForPrint.find(x => x.id === btn.dataset.historyPrint)));
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

  function switchTab(tabName){ document.querySelectorAll(".admin-tab-panel").forEach(panel => panel.classList.add("hidden")); const target = $("tab-"+tabName); if(target) target.classList.remove("hidden"); document.querySelectorAll(".admin-tab-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.tab===tabName)); }

  function posProductCode(product){ return String(product.barcode || product.sku || product.id || ""); }
  function selectPosProduct(product){
    selectedPosProduct = product || null;
    const box = $("posSelectedBox"), variantSelect = $("posVariantSelect");
    if(!box || !variantSelect) return;
    if(!product){ box.textContent = "No product selected."; variantSelect.innerHTML = ""; return; }
    const variants = Array.isArray(product.variants) && product.variants.length ? product.variants : ["Default"];
    variantSelect.innerHTML = variants.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)} - Stock: ${getVariantStock(product, v)}</option>`).join("");
    box.innerHTML = `<strong>${escapeHtml(product.name)}</strong><span>${money(product.price)} • Code: ${escapeHtml(posProductCode(product))}</span>`;
  }
  function renderPosSearch(term=""){
    const results = $("posSearchResults"); if(!results) return;
    const q = String(term || "").trim().toLowerCase();
    const list = (q ? adminProductsCache.filter(p => [p.id,p.name,p.brand,p.category,p.barcode,p.sku].some(v => String(v || "").toLowerCase().includes(q))) : adminProductsCache.slice(0,8)).slice(0,8);
    if(!list.length){ results.innerHTML = '<div class="empty mini">No product found.</div>'; return; }
    results.innerHTML = list.map(p => `<button type="button" class="pos-result" data-pos-pick="${escapeHtml(p.id)}"><span><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.brand || p.category || "")} • Stock ${Number(p.stock||0)}</small></span><b>${money(p.price)}</b></button>`).join("");
    results.querySelectorAll('[data-pos-pick]').forEach(btn => btn.onclick = () => selectPosProduct(adminProductsCache.find(p => p.id === btn.dataset.posPick)));
    const exact = q && adminProductsCache.find(p => String(p.id).toLowerCase() === q || String(p.barcode || "").toLowerCase() === q || String(p.sku || "").toLowerCase() === q);
    if(exact) selectPosProduct(exact);
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
  function setupBarcodePos(){
    const scan = $("posScanInput"), addBtn = $("posAddBtn"), payBtn = $("posPayBtn"), clearBtn = $("posClearBtn"), cash = $("posCash");
    if(!scan || !addBtn || !payBtn) return;
    scan.addEventListener('input', () => renderPosSearch(scan.value));
    scan.addEventListener('keydown', (e) => { if(e.key === 'Enter'){ e.preventDefault(); renderPosSearch(scan.value); $("posQty")?.focus(); } });
    addBtn.onclick = () => {
      if(!selectedPosProduct){ showNotice("Select a product first"); return; }
      const variant = $("posVariantSelect")?.value || "Default";
      const qty = Math.max(1, Number($("posQty")?.value || 1));
      const available = getVariantStock(selectedPosProduct, variant);
      const existingQty = posCart.filter(i => i.id === selectedPosProduct.id && i.size === variant).reduce((a,b)=>a+Number(b.qty||0),0);
      if(available < existingQty + qty){ showNotice("Not enough stock for " + variant); return; }
      const existing = posCart.find(i => i.id === selectedPosProduct.id && i.size === variant);
      if(existing) existing.qty = Number(existing.qty) + qty;
      else posCart.push({ id:selectedPosProduct.id, name:selectedPosProduct.name, price:Number(selectedPosProduct.price || 0), qty, size:variant, image:(selectedPosProduct.variantImages && selectedPosProduct.variantImages[variant]) || firstProductImage(selectedPosProduct) });
      $("posQty").value = 1; scan.value = ""; renderPosSearch(""); renderPosCart(); showNotice("Added to POS cart"); scan.focus();
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

  subscribeProducts((items, source) => { adminProductsCache = items; renderProductsAdmin(items, source); renderPosSearch($("posScanInput")?.value || ""); });
  subscribeOrders((activeOrders, historyOrders) => renderOrders(activeOrders, historyOrders));
  subscribeCustomers((customers) => renderCustomers(customers));
  let __lastAdminMessageCount = 0;
  subscribeMessages((messages) => {
    adminMessagesCache = messages || [];
    if(messages.length > __lastAdminMessageCount && __lastAdminMessageCount !== 0) playNotificationBeep();
    __lastAdminMessageCount = messages.length;
    renderMessages(messages);
  });
  document.querySelectorAll(".admin-tab-btn").forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
  setupBarcodePos();
  setupShippingAdmin();
  switchTab("products");
  form.onsubmit = async (e) => { e.preventDefault(); const docId = $("docId").value.trim(); const payload = {
      name:$("name").value.trim(),
      brand:$("brand").value.trim(),
      category:$("category").value,
      price:Number($("price").value),
      oldPrice:Number($("oldPrice").value),
      stock:(function(){ const vd = window.getVariantData ? window.getVariantData() : {variantStocks:{}}; const total = sumVariantStocks(vd.variantStocks); return total > 0 ? total : Number($("stock").value); })(),
      sold:$("sold").value.trim() || "0 sold",
      badge:$("badge").value.trim() || "New",
      variants:(window.getVariantData ? window.getVariantData().variants : ($("variants") ? $("variants").value.split(/\n|,/) : []).map(v => v.trim()).filter(Boolean)),
      variantImages:(window.getVariantData ? window.getVariantData().variantImages : {}),
      variantStocks:(window.getVariantData ? window.getVariantData().variantStocks : {}),
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
      return { name, image, stock };
    }).filter(v => v.name || v.image);
    const names = data.map(v => v.name).filter(Boolean);
    const imageMap = {};
    const stockMap = {};
    data.forEach(v => { if(v.name && v.image) imageMap[v.name] = v.image; if(v.name) stockMap[v.name] = Number(v.stock || 0); });
    if($('variants')) $('variants').value = names.join('\n');
    if($('variantImages')) $('variantImages').value = JSON.stringify(imageMap);
    const totalStock = sumVariantStocks(stockMap);
    if($('stock') && names.length) $('stock').value = totalStock;
    return { variants:names, variantImages:imageMap, variantStocks:stockMap, variantPhotoList:data.filter(v => v.image || v.stock) };
  }
  window.getVariantData = syncVariantData;

  function addVariantRow(name, image, stock){
    const wrap = $('variantRows');
    if(!wrap) return;
    const row = document.createElement('div');
    row.className = 'variant-row variant-photo-row';
    row.innerHTML = '<input class="variant-name" type="text" placeholder="Flavor / color name e.g. Black Wave" value=""><input class="variant-stock" type="number" min="0" placeholder="Stock"><input class="variant-image" type="text" placeholder="Image URL for this flavor/color"><label class="image-upload-btn">Upload<input class="variant-file" type="file" accept="image/*" hidden></label><button type="button" aria-label="Remove variant">Remove</button>';
    const nameInput = row.querySelector('.variant-name');
    const stockInput = row.querySelector('.variant-stock');
    const imageInput = row.querySelector('.variant-image');
    const fileInput = row.querySelector('.variant-file');
    nameInput.value = name || '';
    stockInput.value = Number(stock || 0);
    imageInput.value = image || '';
    nameInput.addEventListener('input', syncVariantData);
    stockInput.addEventListener('input', syncVariantData);
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
    if(!names.length && Array.isArray(item?.variantPhotoList)) names = item.variantPhotoList.map(v => v.name).filter(Boolean);
    wrap.innerHTML = '';
    (names.length ? names : ['']).forEach(name => addVariantRow(name, map[name] || '', stockMap[name] || 0));
    if(Array.isArray(item?.variantPhotoList)){
      item.variantPhotoList.forEach(v => {
        if(v && (v.image || v.stock) && !rows().some(row => (row.querySelector('.variant-image')?.value || '') === v.image && (row.querySelector('.variant-name')?.value || '') === v.name)) addVariantRow(v.name || '', v.image || '', v.stock || stockMap[v.name] || 0);
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
