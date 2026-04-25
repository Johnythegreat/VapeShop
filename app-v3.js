import { db, auth, firebaseReady, ADMIN_EMAILS } from "./firebase-config.js";
import { collection, addDoc, doc, updateDoc, deleteDoc, getDocs, onSnapshot, serverTimestamp, query, orderBy, runTransaction, writeBatch, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const page = document.body.dataset.page;
const PRODUCTS_KEY = "vape_shop_products";
const CART_KEY = "vape_shop_cart";
const ACCOUNT_KEY = "vape_shop_account";
const CUSTOMERS_KEY = "vape_shop_customers";
const ORDERS_KEY = "vape_shop_orders";
const HISTORY_KEY = "vape_shop_order_history";
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
const totalAmount = (items) => items.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0) + (items.length ? 60 : 0);
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
async function createOrder(cart, account){
  if(getMode()==="firebase" && firebaseReady){
    await runTransaction(db, async (transaction) => {
      const liveItems = [];
      for(const item of cart){
        const ref = doc(db, "products", item.id); const snap = await transaction.get(ref);
        if(!snap.exists()) throw new Error(item.name + " not found");
        const data = snap.data(); const stock = Number(data.stock || 0);
        if(stock < Number(item.qty)) throw new Error("Not enough stock for " + item.name);
        transaction.update(ref, { stock: stock - Number(item.qty) });
        liveItems.push({ name:data.name, qty:Number(item.qty), price:Number(data.price), productId:item.id, size:item.size || "M" });
      }
      const orderRef = doc(collection(db, "orders"));
      transaction.set(orderRef, { customer:account, items:liveItems, total:totalAmount(liveItems), status:"Pending", createdAt:serverTimestamp() });
    });
    return;
  }
  const products = getLocalProducts();
  for(const item of cart){ const p = products.find(x => x.id === item.id); if(!p || Number(p.stock) < Number(item.qty)) throw new Error("Not enough stock for " + item.name); }
  for(const item of cart){ const p = products.find(x => x.id === item.id); p.stock = Number(p.stock) - Number(item.qty); }
  setLocalProducts(products);
  const orders = getLocalOrders();
  orders.unshift({ id:"ORD-" + Date.now(), customer:account, items:cart.map(i => ({ name:i.name, qty:Number(i.qty), price:Number(i.price), size:i.size || "M" })), total:totalAmount(cart), status:"Pending", createdAt:new Date().toISOString() });
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

  function renderProducts(){
    const q = (searchInput.value || "").trim().toLowerCase();
    const filtered = products.filter(p => {
      const categoryOk = currentCategory === "All" || p.category === currentCategory;
      const text = `${p.brand} ${p.name} ${p.category}`.toLowerCase();
      return categoryOk && (!q || text.includes(q));
    });

    if(!filtered.length){
      gridEl.innerHTML = '<div style="grid-column:1/-1" class="empty">No products found.</div>';
      return;
    }

    gridEl.innerHTML = filtered.map(p => `
      <article class="card" data-view="${p.id}">
        <div class="thumb" style="background-image:url('${p.image}')">
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
    `).join("");

    bindNoticeButtons();

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
  }

  function quickAdd(id){
    const p = products.find(x => x.id === id);
    if(!p || Number(p.stock || 0) <= 0){
      showNotice("Product out of stock");
      return;
    }
    const existing = cart.find(x => x.id === id && x.size === "M");
    const currentQty = existing ? Number(existing.qty) : 0;
    if(currentQty >= Number(p.stock || 0)){
      showNotice("No more stock available");
      return;
    }
    if(existing) existing.qty += 1;
    else cart.push({ id:p.id, name:p.name, brand:p.brand, category:p.category, price:p.price, image:p.image, qty:1, size:"M" });
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
        $("selectedSizeLabel").textContent = "Selected: " + selectedSize;
      };
    });
  }

  function openProductPage(id){
    const p = products.find(x => x.id === id);
    if(!p) return;

    selectedProduct = p;
    selectedSize = null;
    detailQty = 1;

    const galleryImages = Array.isArray(p.images) && p.images.length ? p.images : [p.image, p.image, p.image];
    $("productPageMainImage").src = galleryImages[0] || p.image;
    $("productPageBadge").textContent = p.badge || "New";
    $("thumbImg1").src = galleryImages[0] || p.image;
    $("thumbImg2").src = galleryImages[1] || galleryImages[0] || p.image;
    $("thumbImg3").src = galleryImages[2] || galleryImages[0] || p.image;
    $("productPageBrand").textContent = p.brand || "MR VAPE SHOP";
    $("productPageName").textContent = p.name || "";
    $("productPagePrice").textContent = money(p.price);
    $("productPageOldPrice").textContent = money(p.oldPrice);
    $("productPageCategory").textContent = p.category || "Category";
    $("productPageSold").textContent = p.sold || "0 sold";
    $("productPageStock").textContent = "Stock: " + Number(p.stock || 0);
    $("productPageDescription").textContent =
      `${p.name} is available in our vape catalog. Check the price, stock, available flavor or device color, then add to cart for checkout or shop inquiry.`;

    [$("thumbBtn1"), $("thumbBtn2"), $("thumbBtn3")].forEach((thumb, i) => {
      if(!thumb) return;
      thumb.classList.toggle("active", i === 0);
      thumb.onclick = () => {
        [$("thumbBtn1"), $("thumbBtn2"), $("thumbBtn3")].forEach(t => t && t.classList.remove("active"));
        thumb.classList.add("active");
        $("productPageMainImage").src = galleryImages[i] || galleryImages[0] || p.image;
      };
    });

    const defaultVariants = p.category === "Devices" || p.category === "Battery" ? ["Black","Gold","Purple","Blue"] : ["Classic","Mint","Fruit","Ice"];
    const variants = Array.isArray(p.variants) && p.variants.length ? p.variants : defaultVariants;
    const sizeGrid = $("sizeGrid");
    if(sizeGrid){
      sizeGrid.innerHTML = variants.map(v => `<button class="size-option" type="button" data-size="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join("");
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
    const stock = Number(selectedProduct.stock || 0);
    if(stock <= 0){
      showNotice("Product out of stock");
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
      image:selectedProduct.image,
      qty:detailQty,
      size:selectedSize
    });

    writeJSON(CART_KEY, cart);
    renderCart();
    closeProductPage();
    showNotice(`Added ${detailQty} item(s) - Variant ${selectedSize}`);
  }

  function changeCartQtyByKey(id, size, delta){
    const live = products.find(x => x.id === id);
    const cartItem = cart.find(x => x.id === id && x.size === size);
    if(!cartItem || !live) return;

    const next = Number(cartItem.qty) + Number(delta);
    if(next <= 0){
      cart = cart.filter(x => !(x.id === id && x.size === size));
    } else if(next > Number(live.stock || 0)){
      showNotice("No more stock available");
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

  function renderCart(){
    const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0);
    const shipping = cart.length ? 60 : 0;
    const total = subtotal + shipping;

    if(!cart.length){
      cartView.innerHTML = '<div class="empty">Your cart is empty.</div>';
      return;
    }

    cartView.innerHTML = `
      ${cart.map(item => `
        <div class="cart-item">
          <div class="cart-thumb" style="background-image:url('${item.image}')"></div>
          <div>
            <div style="font-weight:800">${escapeHtml(item.name)}</div>
            <div class="small">${escapeHtml(item.brand)} • ${escapeHtml(item.category)} • Variant: ${escapeHtml(item.size || "M")}</div>
            <div class="qty">
              <button data-minus="${item.id}" data-size="${escapeHtml(item.size || "M")}">−</button>
              <strong>${item.qty}</strong>
              <button data-plus="${item.id}" data-size="${escapeHtml(item.size || "M")}">+</button>
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:900">${money(item.price * item.qty)}</div>
            <button class="icon-btn" style="margin-top:8px" data-remove="${item.id}" data-size="${escapeHtml(item.size || "M")}">🗑️</button>
          </div>
        </div>
      `).join("")}
      <div style="height:14px"></div>
      <div class="summary">
        <div class="summary-row"><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
        <div class="summary-row"><span>Delivery Fee</span><strong>${money(shipping)}</strong></div>
        <div class="summary-row" style="font-size:18px"><span>Total</span><strong>${money(total)}</strong></div>
        <button class="btn dark" style="width:100%;margin-top:10px" id="checkoutBtn">Checkout</button>
      </div>
    `;

    cartView.querySelectorAll("[data-minus]").forEach(btn => btn.onclick = () => changeCartQtyByKey(btn.dataset.minus, btn.dataset.size, -1));
    cartView.querySelectorAll("[data-plus]").forEach(btn => btn.onclick = () => changeCartQtyByKey(btn.dataset.plus, btn.dataset.size, 1));
    cartView.querySelectorAll("[data-remove]").forEach(btn => btn.onclick = () => removeItem(btn.dataset.remove, btn.dataset.size));
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
        </div>
      </div>
    `;
    $("saveAccountBtn").onclick = saveAccount;
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
      await createOrder(cart, account);
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
    if(selectedProduct && detailQty < Number(selectedProduct.stock || 0)){
      detailQty += 1;
      $("detailQtyValue").textContent = String(detailQty);
      updateDetailTotal();
    } else {
      showNotice("No more stock available");
    }
  };
  if($("productPageAddToCartBtn")) $("productPageAddToCartBtn").onclick = addDetailToCart;
  if($("closeInquiryBtn")) $("closeInquiryBtn").onclick = closeInquiry;
  if($("sendInquiryBtn")) {
    $("sendInquiryBtn").onclick = sendInquiry;
  }
  if($("inquiryModal")) $("inquiryModal").onclick = (e) => { if(e.target.id === "inquiryModal") closeInquiry(); };
}


function initAdmin(){
  bindNoticeButtons(); const form = $("productForm"), table = $("adminProductTable"); let activeOrdersCache = [];
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
  function clearForm(){ form.reset(); $("docId").value = ""; if($("image2")) $("image2").value=""; if($("image3")) $("image3").value=""; if($("image4")) $("image4").value=""; }
  function fillForm(item){ $("docId").value=item.id; $("name").value=item.name||""; $("brand").value=item.brand||""; $("category").value=item.category||"Pods"; $("price").value=item.price||0; $("oldPrice").value=item.oldPrice||0; $("stock").value=item.stock||0; $("sold").value=item.sold||""; $("badge").value=item.badge||""; if($("variants")) $("variants").value = Array.isArray(item.variants) ? item.variants.join("\n") : ""; $("image").value=item.image||""; $("image2").value=(item.images&&item.images[1])||""; $("image3").value=(item.images&&item.images[2])||""; $("image4").value=(item.images&&item.images[3])||""; window.scrollTo({top:0, behavior:"smooth"}); }
  function renderProductsAdmin(items, source){ $("adminSourceLabel").textContent = source==="firebase" ? "Live from Firebase" : "Using local fallback"; updateStats(items); if(!items.length){ table.innerHTML = '<tr><td colspan="5" class="empty">No products found.</td></tr>'; return; } table.innerHTML = items.map(item => `<tr><td><div style="font-weight:800">${escapeHtml(item.name)}</div><div class="small">${escapeHtml(item.brand)}</div></td><td>${escapeHtml(item.category)}</td><td>${money(item.price)}</td><td>${Number(item.stock||0)}</td><td><div class="row-actions"><button class="btn ghost" data-edit="${item.id}">Edit</button><button class="btn dark" data-delete="${item.id}">Delete</button></div></td></tr>`).join(""); table.querySelectorAll("[data-edit]").forEach(btn => btn.onclick = () => { const item = items.find(x => x.id===btn.dataset.edit); if(item) fillForm(item); }); table.querySelectorAll("[data-delete]").forEach(btn => btn.onclick = async () => { try { await deleteProductItem(btn.dataset.delete); showNotice("Product deleted"); } catch { showNotice("Delete failed"); } }); }
  function renderOrders(activeOrders, historyOrders){ activeOrdersCache = activeOrders.slice(); const tbody = $("ordersTable"), historyBody = $("historyTable"); if(!tbody || !historyBody) return; if(!activeOrders.length) tbody.innerHTML = '<tr><td colspan="6" class="empty">No active orders yet.</td></tr>'; else { tbody.innerHTML = activeOrders.map(order => `<tr><td>${escapeHtml(order.id||"-")}</td><td><div style="font-weight:800">${escapeHtml(order.customer?.name||"-")}</div><div class="small">${escapeHtml(order.customer?.phone||"")}</div></td><td>${money(order.total||0)}</td><td><select class="order-status-select" data-order-status="${escapeHtml(order.id||"")}"><option value="Pending" ${order.status==="Pending"?"selected":""}>Pending</option><option value="Preparing" ${order.status==="Preparing"?"selected":""}>Preparing</option><option value="Ready" ${order.status==="Ready"?"selected":""}>Ready</option><option value="Completed" ${order.status==="Completed"?"selected":""}>Completed</option></select></td><td>${(order.items||[]).map(i => `${escapeHtml(i.name)} x${Number(i.qty)}`).join("<br>")}</td><td><button class="btn ghost" data-archive-order="${escapeHtml(order.id||"")}">Move to History</button></td></tr>`).join(""); tbody.querySelectorAll("[data-order-status]").forEach(select => select.onchange = async function(){ try { await updateOrderStatus(this.dataset.orderStatus, this.value, activeOrdersCache); showNotice(this.value==="Completed" ? "Order moved to history" : "Order status updated"); } catch { showNotice("Status update failed"); } }); tbody.querySelectorAll("[data-archive-order]").forEach(btn => btn.onclick = async () => { try { await moveOrderToHistory(btn.dataset.archiveOrder, activeOrdersCache); showNotice("Order moved to history"); } catch { showNotice("Move failed"); } }); } if(!historyOrders.length) historyBody.innerHTML = '<tr><td colspan="5" class="empty">No order history yet.</td></tr>'; else historyBody.innerHTML = historyOrders.map(order => `<tr><td>${escapeHtml(order.id||"-")}</td><td><div style="font-weight:800">${escapeHtml(order.customer?.name||"-")}</div><div class="small">${escapeHtml(order.customer?.phone||"")}</div></td><td>${money(order.total||0)}</td><td>${escapeHtml(order.status||"Completed")}</td><td>${(order.items||[]).map(i => `${escapeHtml(i.name)} x${Number(i.qty)}`).join("<br>")}</td></tr>`).join(""); }

  function renderMessages(messages){
    const list = $("messagesList");
    const header = $("adminConversationHeader");
    const chat = $("adminChatWindow");
    const replyText = $("adminReplyText");
    const statusSel = $("adminMessageStatus");
    const sendBtn = $("sendAdminReplyBtn");
    if(!list || !header || !chat || !replyText || !statusSel || !sendBtn) return;

    let selectedId = window.__adminSelectedMessageId;
    if(!selectedId && messages.length) selectedId = messages[0].id;
    const current = messages.find(m => m.id === selectedId) || messages[0] || null;
    window.__adminSelectedMessageId = current?.id || null;

    list.innerHTML = messages.length ? messages.map(item => {
      const preview = item.latestMessage || item.message || "";
      const isActive = item.id === window.__adminSelectedMessageId;
      return `
        <div class="admin-conversation-item ${isActive ? "active" : ""} ${item.status === "New" ? "unread" : ""}" data-open-message="${escapeHtml(item.id)}">
          <div class="admin-conversation-name">${escapeHtml(item.name || "-")}${item.status === "New" ? '<span class="unread-badge">NEW</span>' : ''}</div>
          <div class="small">${escapeHtml(item.phone || "-")}</div>
          <div class="admin-conversation-preview">${escapeHtml(preview)}</div>
        </div>
      `;
    }).join("") : '<div class="chat-empty">No conversations yet.</div>';

    list.querySelectorAll("[data-open-message]").forEach(btn => {
      btn.onclick = () => {
        window.__adminSelectedMessageId = btn.dataset.openMessage;
        renderMessages(messages);
      };
    });

    if(!current){
      header.textContent = "Select a conversation";
      chat.innerHTML = '<div class="chat-empty">No conversation selected.</div>';
      replyText.value = "";
      return;
    }

    header.textContent = `${current.name || "-"} • ${current.phone || "-"}`;
    statusSel.value = current.status || "New";
    const thread = Array.isArray(current.thread) ? current.thread : [];
    chat.innerHTML = thread.length ? thread.map(item => `
      <div class="chat-bubble ${item.sender === "admin" ? "admin" : "customer"}">
        ${renderChatMessageBody(item)}
        <span class="chat-meta">${item.sender === "admin" ? "Admin" : current.name || "Customer"} • ${formatChatTime(item.at)}</span>
      </div>
    `).join("") : '<div class="chat-empty">No messages yet.</div>';
    chat.scrollTop = chat.scrollHeight;

    sendBtn.onclick = async () => {
      const text = (replyText.value || "").trim();
      const imageFile = $("adminReplyImage")?.files?.[0] || null;
      const newStatus = statusSel.value || "Replied";
      if(!text && !imageFile){
        showNotice("Type a reply or add an image");
        return;
      }
      try{
        const now = new Date().toISOString();
        const image = imageFile ? await compressImageFile(imageFile) : "";
        const newThread = thread.concat([{ sender:"admin", text, image, at: now }]);
        await updateMessage(current.id, {
          thread: newThread,
          reply: text || (image ? "Image attachment" : ""),
          latestMessage: text || (image ? "Image attachment" : "New reply"),
          status: newStatus === "New" ? "Replied" : newStatus,
          updatedAt: now
        });
        replyText.value = "";
        clearFileInput("adminReplyImage", "adminReplyImagePreviewWrap", "adminReplyImagePreview", "adminReplyImageName");
        showNotice("Reply sent");
      }catch(error){
        console.error(error);
        showNotice("Reply failed");
      }
    };

    statusSel.onchange = async () => {
      try{
        await updateMessage(current.id, { status: statusSel.value });
        showNotice("Status updated");
      }catch{
        showNotice("Status update failed");
      }
    };
  }


  function renderCustomers(customers){ const tbody = $("customersTable"); if(!tbody) return; if(!customers.length){ tbody.innerHTML = '<tr><td colspan="4" class="empty">No customers yet.</td></tr>'; return; } tbody.innerHTML = customers.map(customer => `<tr><td>${escapeHtml(customer.name||"-")}</td><td>${escapeHtml(customer.phone||"-")}</td><td>${escapeHtml(customer.email||"-")}</td><td>${escapeHtml(customer.address||"-")}</td></tr>`).join(""); }
  function switchTab(tabName){ document.querySelectorAll(".admin-tab-panel").forEach(panel => panel.classList.add("hidden")); const target = $("tab-"+tabName); if(target) target.classList.remove("hidden"); document.querySelectorAll(".admin-tab-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.tab===tabName)); }

  if($("adminReplyImage")) $("adminReplyImage").onchange = () => setImagePreview("adminReplyImage", "adminReplyImagePreviewWrap", "adminReplyImagePreview", "adminReplyImageName");
  if($("removeAdminReplyImageBtn")) $("removeAdminReplyImageBtn").onclick = () => clearFileInput("adminReplyImage", "adminReplyImagePreviewWrap", "adminReplyImagePreview", "adminReplyImageName");

  subscribeProducts((items, source) => renderProductsAdmin(items, source));
  subscribeOrders((activeOrders, historyOrders) => renderOrders(activeOrders, historyOrders));
  subscribeCustomers((customers) => renderCustomers(customers));
  let __lastAdminMessageCount = 0;
  subscribeMessages((messages) => {
    if(messages.length > __lastAdminMessageCount && __lastAdminMessageCount !== 0) playNotificationBeep();
    __lastAdminMessageCount = messages.length;
    renderMessages(messages);
  });
  document.querySelectorAll(".admin-tab-btn").forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
  switchTab("products");
  form.onsubmit = async (e) => { e.preventDefault(); const docId = $("docId").value.trim(); const payload = {
      name:$("name").value.trim(),
      brand:$("brand").value.trim(),
      category:$("category").value,
      price:Number($("price").value),
      oldPrice:Number($("oldPrice").value),
      stock:Number($("stock").value),
      sold:$("sold").value.trim() || "0 sold",
      badge:$("badge").value.trim() || "New",
      variants:($("variants") ? $("variants").value.split(/\n|,/) : []).map(v => v.trim()).filter(Boolean),
      image:$("image").value.trim(),
      images:[
        $("image").value.trim(),
        $("image2") ? $("image2").value.trim() : "",
        $("image3") ? $("image3").value.trim() : "",
        $("image4") ? $("image4").value.trim() : ""
      ].filter(Boolean)
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
