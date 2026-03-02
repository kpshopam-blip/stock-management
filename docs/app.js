// docs/app.js
// ====================================================================
// JavaScript หลักของแอป KP Shop
// แทนที่ JS.html เดิม — ใช้ API layer (api.js) แทน google.script.run
// ====================================================================

// ====== ตัวแปรและสถานะรวม ======
let currentUser = null;
let allProducts = [];
let fileQueue = [];
let existingImages = [];
let editingProductId = null;
let sellReceiptDataURI = null;
let _dashboardData = null;

// รูปภาพสำรอง
const NO_IMAGE = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22400%22%20height%3D%22400%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23eee%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-family%3D%22sans-serif%22%20font-size%3D%2224%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%20fill%3D%22%23999%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E';

// ====== Loading ======
function showLoading(show) {
    const loader = document.getElementById('loadingOverlay');
    if (show) loader.classList.remove('hidden');
    else loader.classList.add('hidden');
}

// ====== Toast Notification ======
function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) { alert(message); return; }
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' };
    const colors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-brand-600', warning: 'bg-amber-500' };
    const toast = document.createElement('div');
    toast.className = `pointer-events-auto ${colors[type] || colors.info} text-white px-4 py-3 rounded-xl shadow-2xl flex items-start gap-3 text-sm transform translate-x-full transition-transform duration-300`;
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info} text-lg mt-0.5 shrink-0"></i><div class="flex-grow">${message}</div><button onclick="this.parentElement.remove()" class="shrink-0 opacity-70 hover:opacity-100 ml-1"><i class="fa-solid fa-xmark"></i></button>`;
    container.appendChild(toast);
    requestAnimationFrame(() => { toast.classList.remove('translate-x-full'); toast.classList.add('translate-x-0'); });
    setTimeout(() => {
        toast.classList.remove('translate-x-0');
        toast.classList.add('translate-x-full');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ====== Router ======
function renderPage(templateId) {
    const container = document.getElementById('appContainer');
    const template = document.getElementById(templateId);
    container.innerHTML = template.innerHTML;
    window.scrollTo(0, 0);
}

// ====== App Startup ======
window.onload = function () {
    // ตรวจสอบว่า config.js โหลดมาถูกต้องไหม
    if (typeof CONFIG === 'undefined' || !CONFIG.GAS_URL || CONFIG.GAS_URL.includes('YOUR_SCRIPT')) {
        document.getElementById('appContainer').innerHTML = `
      <div class="min-h-screen flex items-center justify-center p-6">
        <div class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <i class="fa-solid fa-gear text-5xl text-amber-400 mb-4"></i>
          <h2 class="text-xl font-bold text-gray-800 mb-2">ยังไม่ได้ตั้งค่าระบบ</h2>
          <p class="text-gray-500 text-sm mb-4">กรุณาสร้างไฟล์ <code class="bg-gray-100 px-1 rounded">config.js</code> จาก <code class="bg-gray-100 px-1 rounded">config.example.js</code> แล้วกรอก GAS_URL และ API_KEY ของคุณ</p>
          <pre class="bg-gray-800 text-green-400 text-xs text-left rounded-lg p-4 overflow-auto">// config.js\nconst CONFIG = {\n  GAS_URL: 'https://script.google.com/...',\n  API_KEY: 'YOUR_KEY'\n};</pre>
        </div>
      </div>`;
        return;
    }

    const session = getSession();
    if (session && session.user && session.token) {
        currentUser = session.user;
        loadStore();
    } else {
        renderPage('tpl-login');
    }
};

// ====== Login ======
async function handleLogin(event) {
    event.preventDefault();
    showLoading(true);

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    const errorMsg = document.getElementById('loginErrorMsg');
    errorDiv.classList.add('hidden');

    try {
        const res = await API_login(username, password);
        showLoading(false);
        if (res.success) {
            currentUser = res.user;
            saveSession(res.token, res.user);
            loadStore();
        } else {
            errorMsg.innerText = res.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
            errorDiv.classList.remove('hidden');
        }
    } catch (err) {
        showLoading(false);
        errorMsg.innerText = 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาตรวจสอบ GAS_URL ใน config.js';
        errorDiv.classList.remove('hidden');
        console.error(err);
    }
}

// ====== Logout ======
async function logout() {
    showLoading(true);
    try { await API_logout(); } catch (e) { /* ไม่เป็นไร */ }
    await clearSession();
    currentUser = null;
    showLoading(false);
    renderPage('tpl-login');
}

// ====== Store ======
function loadStore() {
    renderPage('tpl-store');
    document.getElementById('storeUserName').innerText = currentUser.name;
    if (currentUser.role === 'Manager') {
        document.getElementById('btnOpenInventory').classList.remove('hidden');
        const dashBtn = document.getElementById('btnOpenDashboard');
        if (dashBtn) dashBtn.classList.remove('hidden');
    }
    fetchProducts();
}

async function fetchProducts() {
    try {
        const products = await API_getProducts();
        allProducts = products;
        document.getElementById('totalProductCount').innerText = products.length;
        renderProductGrid(products);
    } catch (err) {
        console.error(err);
        showToast('ดูข้อมูลสินค้าไม่สำเร็จ กรุณารีเฟรช', 'error');
    }
}

function formatNumber(num) {
    return parseFloat(num).toLocaleString('th-TH');
}

function renderProductGrid(products) {
    const grid = document.getElementById('productGrid');
    const noData = document.getElementById('noProductFound');
    grid.innerHTML = '';

    const isManager = currentUser && currentUser.role === 'Manager';
    const filtered = isManager ? products : products.filter(p => (p.status || 'Available').toLowerCase() !== 'sold');
    document.getElementById('totalProductCount').innerText = filtered.length;

    if (filtered.length === 0) { noData.classList.remove('hidden'); return; }
    noData.classList.add('hidden');

    filtered.forEach(p => {
        const coverImage = p.images && p.images.length > 0 && p.images[0].trim() !== '' ? p.images[0] : NO_IMAGE;
        const isSold = p.status.toLowerCase() !== 'available';
        const tagHtml = isSold
            ? `<div class="absolute top-2 right-2 bg-gray-800 text-white text-xs font-bold px-2 py-1 rounded">ขายแล้ว</div>`
            : `<div class="absolute top-2 right-2 bg-brand-500 text-white text-xs font-bold px-2 py-1 rounded">มีของ</div>`;
        const specSnippet = `${p.ram ? p.ram + '/' : ''}${p.storage || ''}`;

        grid.innerHTML += `
      <div class="bg-white rounded border overflow-hidden product-card flex flex-col cursor-pointer" onclick="viewProduct('${p.id}')">
        <div class="relative pt-[100%] bg-gray-100">
          <img src="${coverImage}" class="absolute inset-0 w-full h-full object-cover" alt="${p.model}" loading="lazy" onerror="this.onerror=null;this.src=NO_IMAGE;">
          ${tagHtml}
        </div>
        <div class="p-3 flex flex-col flex-grow">
          <div class="text-xs text-gray-500 mb-1">${p.brand} ${specSnippet}</div>
          <h3 class="font-medium text-sm text-gray-800 leading-tight mb-2 line-clamp-2">${p.model} <span class="text-xs text-gray-500">(${p.color || 'ไม่ระบุสี'})</span></h3>
          <div class="mt-auto"><span class="text-brand-600 font-bold">฿${formatNumber(p.price)}</span></div>
        </div>
      </div>`;
    });
}

function searchProducts(inputId) {
    const query = document.getElementById(inputId).value.toLowerCase();
    const filterBrand = document.getElementById('filterBrand').value.toLowerCase();
    executeSearch(query, filterBrand);
}

function filterProducts() {
    const query1 = document.getElementById('storeSearchDesktop') ? document.getElementById('storeSearchDesktop').value.toLowerCase() : '';
    const filterBrand = document.getElementById('filterBrand').value.toLowerCase();
    executeSearch(query1, filterBrand);
}

function executeSearch(query, brand) {
    let filtered = allProducts;
    if (brand) filtered = filtered.filter(p => p.brand.toLowerCase() === brand);
    if (query) filtered = filtered.filter(p =>
        p.model.toLowerCase().includes(query) || p.brand.toLowerCase().includes(query) ||
        (p.color && p.color.toLowerCase().includes(query)) || (p.storage && p.storage.toLowerCase().includes(query))
    );
    renderProductGrid(filtered);
}

function resetFilters() {
    if (document.getElementById('storeSearchDesktop')) document.getElementById('storeSearchDesktop').value = '';
    if (document.getElementById('storeSearchMobile')) document.getElementById('storeSearchMobile').value = '';
    document.getElementById('filterBrand').value = '';
    filterProducts();
}

// ====== Product Detail ======
function viewProduct(id) {
    const product = allProducts.find(p => p.id === id);
    if (!product) return;

    const modal = document.getElementById('productDetailModal');
    const contentBody = document.getElementById('productDetailBody');

    const images = product.images && product.images.length > 0 && product.images[0].trim() !== '' ? product.images : [NO_IMAGE];
    let galleryHtml = `<div class="w-full flex overflow-x-auto snap-x snap-mandatory hide-scrollbar">`;
    images.forEach(imgUrl => {
        galleryHtml += `<div class="min-w-full snap-center flex justify-center bg-gray-100 relative items-center cursor-pointer" style="height:350px;" onclick="viewFullImage('${imgUrl}')"><img src="${imgUrl}" class="max-h-full max-w-full object-contain" alt="Product Image" onerror="this.onerror=null;this.src=NO_IMAGE;"></div>`;
    });
    galleryHtml += `</div><div class="flex justify-center gap-1 my-2">${images.map((_, i) => `<div class="w-2 h-2 rounded-full ${i === 0 ? 'bg-brand-500' : 'bg-gray-300'}"></div>`).join('')}</div>`;

    const statusLabel = product.status.toLowerCase() !== 'available'
        ? `<div class="inline-block bg-gray-700 text-white px-3 py-1 rounded text-sm font-bold mb-2">ขายแล้ว</div>`
        : `<div class="inline-block bg-green-500 text-white px-3 py-1 rounded text-sm font-bold mb-2">พร้อมขาย</div>`;

    contentBody.innerHTML = `
    <div class="flex flex-col md:flex-row h-full">
      <div class="w-full md:w-1/2 border-r bg-white">${galleryHtml}</div>
      <div class="w-full md:w-1/2 p-5 bg-white space-y-4">
        <div>${statusLabel}<h2 class="text-2xl font-bold text-gray-800">${product.model}</h2><div class="text-sm text-gray-500 mt-1">ยี่ห้อ: ${product.brand} | รหัส: ${product.id}</div></div>
        <div class="text-3xl font-bold text-brand-600 border-b pb-4">฿${formatNumber(product.price)}</div>
        <div class="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
          <div class="text-gray-500">RAM/ความจุ:</div><div class="font-medium">${product.ram || '-'} / ${product.storage || '-'}</div>
          <div class="text-gray-500">สี:</div><div class="font-medium">${product.color || '-'}</div>
          <div class="text-gray-500">สภาพเครื่อง:</div><div class="font-medium">${product.condition || 'ไม่ได้ระบุ'}</div>
          <div class="text-gray-500">ตำหนิ:</div><div class="font-medium text-red-500">${product.defect || 'ไม่มี / ไม่ได้ระบุ'}</div>
          <div class="text-gray-500">แบตเตอรี่:</div><div class="font-medium">${product.battery || '-'}</div>
          <div class="text-gray-500">อุปกรณ์:</div><div class="font-medium">${product.accessories || '-'}</div>
          <div class="text-gray-500">สาขา/ที่อยู่:</div><div class="font-medium">${product.location || '-'}</div>
          <div class="text-gray-500">หมายเหตุ:</div><div class="font-medium text-amber-600">${product.notes || '-'}</div>
          <div class="text-gray-500">แหล่งที่มา:</div><div class="font-medium">${product.source || '-'}</div>
          <div class="text-gray-500">เลข IMEI:</div><div class="font-medium">${product.imei || '-'}</div>
          <div class="text-gray-500">ผู้รับเข้าสต็อก:</div><div class="font-medium">${product.receiver || '-'}</div>
          <div class="text-gray-500">วันที่รับเข้า:</div><div class="font-medium">${product.dateAdded || '-'}</div>
        </div>
        ${(product.status || 'Available').toLowerCase() !== 'sold' ? `
        <div class="border-t pt-4 mt-2">
          <button onclick="closeProductView(); openSellModal('${product.id}')" class="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition shadow-lg flex items-center justify-center gap-2 text-base">
            <i class="fa-solid fa-cart-shopping"></i> ขายสินค้านี้
          </button>
        </div>` : `
        <div class="border-t pt-4 mt-2">
          <div class="w-full py-3 bg-gray-300 text-gray-600 font-bold rounded-lg text-center text-base"><i class="fa-solid fa-ban"></i> สินค้านี้ขายไปแล้ว</div>
        </div>`}
      </div>
    </div>`;

    modal.classList.remove('hidden');
}

function closeProductView() { document.getElementById('productDetailModal').classList.add('hidden'); }

function viewFullImage(url) {
    if (url === NO_IMAGE) return;
    document.getElementById('imageViewerImg').src = url;
    document.getElementById('imageViewerModal').classList.remove('hidden');
}

function closeImageViewer() { document.getElementById('imageViewerModal').classList.add('hidden'); }

// ====== Inventory ======
function filterInventory() {
    const text = document.getElementById('inventorySearch').value.toLowerCase();
    document.querySelectorAll('.inv-row').forEach(row => {
        row.style.display = (row.getAttribute('data-search') || row.innerText.toLowerCase()).indexOf(text) > -1 ? '' : 'none';
    });
    document.querySelectorAll('.inv-card').forEach(card => {
        card.style.display = (card.getAttribute('data-search') || card.innerText.toLowerCase()).indexOf(text) > -1 ? '' : 'none';
    });
}

function loadInventory() {
    if (!currentUser || currentUser.role !== 'Manager') { showToast('เฉพาะผู้จัดการเท่านั้นที่สามารถเข้าถึงได้', 'warning'); return; }
    renderPage('tpl-inventory');
    loadSettings();
    fetchInventoryData();
}

async function fetchInventoryData() {
    const tbody = document.getElementById('inventoryTableBody');
    const cardList = document.getElementById('inventoryCardList');
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-8 text-center text-gray-500"><i class="fa-solid fa-circle-notch fa-spin mr-2"></i> กำลังโหลดข้อมูล...</td></tr>`;
    if (cardList) cardList.innerHTML = `<div class="text-center text-gray-500 py-8"><i class="fa-solid fa-circle-notch fa-spin mr-2"></i> กำลังโหลดข้อมูล...</div>`;

    try {
        const products = await API_getProducts();
        allProducts = products;
        renderInventoryTable(products);
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-8 text-center text-red-500">โหลดข้อมูลล้มเหลว</td></tr>`;
        if (cardList) cardList.innerHTML = `<div class="text-center text-red-500 py-8">โหลดข้อมูลล้มเหลว</div>`;
    }
}

function renderInventoryTable(products) {
    const tbody = document.getElementById('inventoryTableBody');
    const cardList = document.getElementById('inventoryCardList');
    if (tbody) tbody.innerHTML = '';
    if (cardList) cardList.innerHTML = '';

    if (products.length === 0) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-8 text-center text-gray-500">ไม่มีข้อมูลสินค้าในสต็อก</td></tr>`;
        if (cardList) cardList.innerHTML = '<div class="text-center text-gray-400 py-8">ไม่มีข้อมูลสินค้า</div>';
        return;
    }

    products.forEach(p => {
        const st = (p.status || 'Available').toLowerCase();
        let statusClass = 'bg-green-100 text-green-800', statusText = 'พร้อมขาย';
        if (st === 'reserved') { statusClass = 'bg-yellow-100 text-yellow-800'; statusText = 'ติดจอง'; }
        else if (st === 'repair') { statusClass = 'bg-blue-100 text-blue-800'; statusText = 'ส่งซ่อม'; }
        else if (st === 'sold') { statusClass = 'bg-gray-200 text-gray-600'; statusText = 'ขายแล้ว'; }

        const spec = `${p.ram || '-'}/${p.storage || '-'} ${p.color || ''}`;
        const statusVal = p.status || 'Available';
        const statusOptions = `
      <option value="Available" ${statusVal === 'Available' ? 'selected' : ''}>🟢 พร้อมขาย</option>
      <option value="Reserved"  ${statusVal === 'Reserved' ? 'selected' : ''}>🟡 ติดจอง</option>
      <option value="Repair"    ${statusVal === 'Repair' ? 'selected' : ''}>🟤 ส่งซ่อม/เคลม</option>
      <option value="Sold"      ${statusVal === 'Sold' ? 'selected' : ''}>⚫ ขายแล้ว</option>`;

        // ตาราง (จอใหญ่)
        if (tbody) {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50 transition border-b inv-row';
            tr.setAttribute('data-search', `${p.model} ${p.brand} ${p.id} ${p.imei || ''} ${p.color || ''}`.toLowerCase());
            tr.innerHTML = `
        <td class="px-4 py-3"><div class="font-medium text-gray-800">${p.model}</div><div class="text-xs text-gray-500">${p.brand} | ${p.id}</div></td>
        <td class="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">${p.dateAdded || '-'}</td>
        <td class="px-4 py-3 text-gray-600">${spec}</td>
        <td class="px-4 py-3 text-xs text-gray-500">${p.imei || '-'}</td>
        <td class="px-4 py-3 text-right text-gray-600">฿${formatNumber(p.cost)}</td>
        <td class="px-4 py-3 text-right text-brand-600 font-bold">฿${formatNumber(p.price)}</td>
        <td class="px-4 py-3 text-center"><select onchange="onStatusChange('${p.id}', this.value)" class="text-xs border rounded px-1 py-0.5 ${statusClass} font-medium cursor-pointer">${statusOptions}</select></td>
        <td class="px-4 py-3 text-center whitespace-nowrap">
          <button onclick="editProduct('${p.id}')"   class="text-indigo-600 hover:text-indigo-900 mx-1" title="แก้ไข"><i class="fa-solid fa-pen-to-square"></i></button>
          <button onclick="openSellModal('${p.id}')" class="text-green-600  hover:text-green-900 mx-1"  title="ขาย"><i class="fa-solid fa-cart-shopping"></i></button>
          <button onclick="deleteProduct('${p.id}')" class="text-red-500    hover:text-red-700 mx-1"    title="ลบ"><i class="fa-solid fa-trash"></i></button>
        </td>`;
            tbody.appendChild(tr);
        }

        // การ์ด (มือถือ)
        if (cardList) {
            const card = document.createElement('div');
            card.className = 'bg-white border rounded-lg p-3 shadow-sm inv-card';
            card.setAttribute('data-search', `${p.model} ${p.brand} ${p.id} ${p.imei || ''} ${p.color || ''}`.toLowerCase());
            card.innerHTML = `
        <div class="flex justify-between items-start mb-2">
          <div><div class="font-semibold text-gray-800 text-sm">${p.model}</div><div class="text-xs text-gray-500">${p.brand} | ${p.id}</div></div>
          <span class="px-2 py-0.5 rounded text-xs font-medium shrink-0 ${statusClass}">${statusText}</span>
        </div>
        <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mb-2">
          <div class="text-gray-500">สเปค: <span class="text-gray-700 font-medium">${spec}</span></div>
          <div class="text-gray-500">รับเข้า: <span class="text-gray-700">${p.dateAdded || '-'}</span></div>
          <div class="text-gray-500">ต้นทุน: <span class="text-gray-700">฿${formatNumber(p.cost)}</span></div>
          <div class="text-gray-500">ราคาขาย: <span class="text-brand-600 font-bold">฿${formatNumber(p.price)}</span></div>
          <div class="text-gray-500 col-span-2">IMEI: <span class="text-gray-700 font-medium">${p.imei || '-'}</span></div>
        </div>
        <div class="flex items-center justify-between border-t pt-2 gap-2">
          <select onchange="onStatusChange('${p.id}', this.value)" class="text-xs border rounded px-1 py-0.5 ${statusClass} font-medium cursor-pointer">${statusOptions}</select>
          <div class="flex gap-2">
            <button onclick="editProduct('${p.id}')"   class="text-indigo-600 hover:text-indigo-900 text-xs font-medium flex items-center gap-1"><i class="fa-solid fa-pen-to-square"></i> แก้ไข</button>
            <button onclick="openSellModal('${p.id}')" class="text-green-600  hover:text-green-900 text-xs font-medium flex items-center gap-1"><i class="fa-solid fa-cart-shopping"></i> ขาย</button>
            <button onclick="deleteProduct('${p.id}')" class="text-red-500    hover:text-red-700 text-xs font-medium flex items-center gap-1"><i class="fa-solid fa-trash"></i> ลบ</button>
          </div>
        </div>`;
            cardList.appendChild(card);
        }
    });
}

// ====== เปลี่ยนสถานะ ======
async function onStatusChange(productId, newStatus) {
    if (!confirm('ต้องการเปลี่ยนสถานะเป็น "' + newStatus + '" ใช่หรือไม่?')) { fetchInventoryData(); return; }
    showLoading(true);
    try {
        const res = await API_changeStatus(productId, newStatus);
        showLoading(false);
        showToast(res.message, res.success ? 'success' : 'error');
        if (res.success) fetchInventoryData();
    } catch (err) {
        showLoading(false);
        showToast('เปลี่ยนสถานะไม่สำเร็จ: ' + err, 'error');
        fetchInventoryData();
    }
}

// ====== ลบสินค้า ======
async function deleteProduct(productId) {
    if (!currentUser || currentUser.role !== 'Manager') { showToast('เฉพาะผู้จัดการเท่านั้นที่สามารถลบสินค้าได้', 'warning'); return; }
    const p = allProducts.find(x => x.id === productId);
    const pName = p ? (p.brand + ' ' + p.model) : productId;
    if (!confirm('⚠️ ต้องการลบ "' + pName + '" ออกจากสต็อกใช่หรือไม่?\n\nการลบจะไม่สามารถย้อนกลับได้!')) return;
    showLoading(true);
    try {
        const res = await API_deleteProduct(productId);
        showLoading(false);
        showToast(res.message, res.success ? 'success' : 'error');
        if (res.success) fetchInventoryData();
    } catch (err) {
        showLoading(false);
        showToast('ลบสินค้าไม่สำเร็จ: ' + err, 'error');
    }
}

// ====== Dashboard ======
async function loadDashboard() {
    if (!currentUser || currentUser.role !== 'Manager') { showToast('เฉพาะผู้จัดการเท่านั้นที่สามารถเข้าถึงได้', 'warning'); return; }
    renderPage('tpl-dashboard');
    try {
        const data = await API_getSalesSummary();
        renderDashboard(data);
    } catch (e) {
        showToast('โหลด Dashboard ไม่สำเร็จ', 'error');
    }
}

function renderDashboard(d) {
    _dashboardData = d;
    document.getElementById('dash_todaySales').textContent = (d.today.sales || 0) + ' เครื่อง';
    document.getElementById('dash_todayRevenue').textContent = '฿' + formatNumber(d.today.revenue || 0);
    document.getElementById('dash_todayProfit').textContent = '฿' + formatNumber(d.today.profit || 0);
    document.getElementById('dash_monthSales').textContent = (d.month.sales || 0) + ' เครื่อง';
    document.getElementById('dash_monthRevenue').textContent = '฿' + formatNumber(d.month.revenue || 0);
    document.getElementById('dash_monthProfit').textContent = 'กำไร: ฿' + formatNumber(d.month.profit || 0);
    document.getElementById('dash_stockCount').textContent = (d.stock.count || 0) + ' เครื่อง';
    document.getElementById('dash_stockValue').textContent = 'มูลค่า: ฿' + formatNumber(d.stock.value || 0);

    const chart = document.getElementById('dash_chart');
    chart.innerHTML = '';
    const maxRev = Math.max(...d.last7Days.map(x => x.revenue), 1);
    d.last7Days.forEach(day => {
        const pct = Math.max((day.revenue / maxRev) * 100, 2);
        const bar = document.createElement('div');
        bar.className = 'flex-1 flex flex-col items-center justify-end gap-1';
        bar.innerHTML = `<div class="text-xs font-bold text-brand-600">${day.count > 0 ? day.count : ''}</div><div class="w-full bg-gradient-to-t from-brand-500 to-brand-300 rounded-t transition-all" style="height:${pct}%"></div><div class="text-[10px] text-gray-500">${day.date}</div>`;
        chart.appendChild(bar);
    });

    const spSel = document.getElementById('dash_salesperson');
    if (spSel) {
        spSel.innerHTML = '<option value="">ทั้งหมด</option>';
        (d.salespersons || []).forEach(sp => { spSel.innerHTML += `<option value="${sp}">${sp}</option>`; });
    }
    renderSalesList(d.salesList || []);
}

function parseDateDMY(str) {
    const parts = (str || '').split(' ')[0].split('/');
    if (parts.length < 3) return null;
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
}

function filterSalesList() {
    if (!_dashboardData) return;
    const fromStr = document.getElementById('dash_dateFrom').value;
    const toStr = document.getElementById('dash_dateTo').value;
    const sp = document.getElementById('dash_salesperson').value;
    const fromDate = fromStr ? new Date(fromStr) : null;
    const toDate = toStr ? new Date(toStr + 'T23:59:59') : null;

    let filtered = (_dashboardData.salesList || []).filter(s => {
        const sDate = parseDateDMY(s.saleDate);
        if (fromDate && sDate && sDate < fromDate) return false;
        if (toDate && sDate && sDate > toDate) return false;
        if (sp && s.salesperson !== sp) return false;
        return true;
    });

    let totalRev = 0, totalProfit = 0;
    filtered.forEach(s => { totalRev += s.soldPrice; totalProfit += s.profit; });
    document.getElementById('dash_filterSummary').innerHTML = `พบ <b>${filtered.length}</b> รายการ | รวม <b class="text-brand-600">฿${formatNumber(totalRev)}</b> | กำไร <b class="text-green-600">฿${formatNumber(totalProfit)}</b>`;
    renderSalesList(filtered);
}

function clearDashFilter() {
    document.getElementById('dash_dateFrom').value = '';
    document.getElementById('dash_dateTo').value = '';
    document.getElementById('dash_salesperson').value = '';
    document.getElementById('dash_filterSummary').innerHTML = '';
    if (_dashboardData) renderSalesList(_dashboardData.salesList || []);
}

function renderSalesList(list) {
    const container = document.getElementById('dash_salesList');
    if (!container) return;
    if (list.length === 0) { container.innerHTML = '<div class="text-center text-gray-400 text-sm py-8"><i class="fa-solid fa-receipt mr-1"></i> ไม่มีรายการขาย</div>'; return; }

    let html = '';
    list.forEach(s => {
        const profitClass = s.profit >= 0 ? 'text-green-600' : 'text-red-600';
        html += `
      <div class="bg-gray-50 border rounded-lg p-3 hover:bg-gray-100 transition">
        <div class="flex justify-between items-start mb-1">
          <div><div class="font-bold text-gray-800 text-sm">${s.brand} ${s.model}</div><div class="text-xs text-gray-500">IMEI: ${s.imei || '-'} | ${s.spec}</div></div>
          <div class="text-right shrink-0"><div class="font-bold text-brand-600">฿${formatNumber(s.soldPrice)}</div><div class="text-xs ${profitClass}">กำไร: ฿${formatNumber(s.profit)}</div></div>
        </div>
        <div class="grid grid-cols-2 gap-1 text-xs text-gray-500 mt-1">
          <div><i class="fa-regular fa-calendar mr-1"></i>${s.saleDate}</div>
          <div><i class="fa-regular fa-user mr-1"></i>${s.salesperson || '-'}</div>
          <div><i class="fa-solid fa-tag mr-1"></i>${s.saleType || '-'}</div>
          <div>${s.customerName ? '<i class="fa-regular fa-address-card mr-1"></i>' + s.customerName : ''}</div>
        </div>
        <div class="flex gap-2 mt-2 border-t pt-2">
          <button onclick='viewSaleReceipt(${JSON.stringify(s).replace(/'/g, "&#39;")})' class="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"><i class="fa-solid fa-receipt"></i> ดูใบเสร็จ</button>
          ${s.receiptImage ? `<button onclick="viewFullImage('${s.receiptImage}')" class="text-xs text-amber-600 hover:text-amber-800 flex items-center gap-1"><i class="fa-solid fa-image"></i> ใบเสร็จ POS</button>` : ''}
        </div>
      </div>`;
    });
    container.innerHTML = html;
}

function viewSaleReceipt(s) { showReceipt(s); }

// ====== Settings Dropdown ======
async function loadSettings() {
    try {
        const settings = await API_getSettings();
        const brandSel = document.getElementById('p_brand');
        if (brandSel) {
            const oldVal = brandSel.value;
            brandSel.innerHTML = '<option value="">เลือกยี่ห้อ</option>';
            settings.brands.forEach(b => { brandSel.innerHTML += `<option value="${b}">${b}</option>`; });
            if (oldVal) brandSel.value = oldVal;
        }
        const locSel = document.getElementById('p_location');
        if (locSel) {
            const oldVal = locSel.value;
            locSel.innerHTML = '<option value="">เลือกสาขา</option>';
            settings.locations.forEach(l => { locSel.innerHTML += `<option value="${l}">${l}</option>`; });
            if (oldVal) locSel.value = oldVal;
        }
        window._appSettings = settings;
    } catch (err) {
        console.error('โหลด Settings ไม่สำเร็จ:', err);
    }
}

function toggleForm(formId) {
    const form = document.getElementById(formId);
    const icon = document.getElementById('addProductFormIcon');
    if (form.classList.contains('hidden')) { form.classList.remove('hidden'); icon.classList.replace('fa-chevron-right', 'fa-chevron-down'); }
    else { form.classList.add('hidden'); icon.classList.replace('fa-chevron-down', 'fa-chevron-right'); }
}

// ====== อัปโหลดรูปภาพ ======
function previewImages(input) {
    if (!input.files || input.files.length === 0) return;
    let filesRead = 0;
    const totalFiles = input.files.length;
    for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        const reader = new FileReader();
        reader.onload = function (e) {
            fileQueue.push({ id: 'new_' + Date.now() + '_' + Math.floor(Math.random() * 1000), filename: Date.now() + '_' + file.name, dataURI: e.target.result });
            filesRead++;
            if (filesRead === totalFiles) { renderImagePreviews(); input.value = ''; }
        };
        reader.readAsDataURL(file);
    }
}

function removeExistingImage(index) { existingImages.splice(index, 1); renderImagePreviews(); }
function removeQueueImage(tempId) { fileQueue = fileQueue.filter(f => f.id !== tempId); renderImagePreviews(); }

function renderImagePreviews() {
    const container = document.getElementById('imagePreviewContainer');
    container.innerHTML = '';
    existingImages.forEach((imgUrl, idx) => {
        if (!imgUrl || imgUrl.trim() === '') return;
        const div = document.createElement('div');
        div.className = 'w-20 h-20 bg-gray-200 rounded overflow-hidden relative border shadow-sm group';
        div.innerHTML = `<img src="${imgUrl}" class="w-full h-full object-cover" onerror="this.onerror=null;this.src=NO_IMAGE;"><div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex justify-center items-center transition"><button type="button" onclick="removeExistingImage(${idx})" class="text-white bg-red-500 rounded-full w-7 h-7 flex justify-center items-center hover:bg-red-700 shadow"><i class="fa-solid fa-trash-can text-xs"></i></button></div>`;
        container.appendChild(div);
    });
    fileQueue.forEach(f => {
        const div = document.createElement('div');
        div.className = 'w-20 h-20 bg-gray-200 rounded overflow-hidden relative border shadow-sm border-brand-300 group';
        div.innerHTML = `<img src="${f.dataURI}" class="w-full h-full object-cover opacity-90"><div class="absolute top-0 right-0 bg-brand-500 text-white text-[10px] px-1 rounded-bl">ใหม่</div><div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex justify-center items-center transition"><button type="button" onclick="removeQueueImage('${f.id}')" class="text-white bg-red-500 rounded-full w-7 h-7 flex justify-center items-center hover:bg-red-700 shadow"><i class="fa-solid fa-xmark text-xs"></i></button></div>`;
        container.appendChild(div);
    });
}

// ====== บันทึก / แก้ไขสินค้า ======
async function submitProduct(event) {
    event.preventDefault();
    showLoading(true);

    const productData = {
        brand: document.getElementById('p_brand').value,
        model: document.getElementById('p_model').value,
        ram: document.getElementById('p_ram').value,
        storage: document.getElementById('p_storage').value,
        color: document.getElementById('p_color').value,
        source: document.getElementById('p_source').value,
        cost: document.getElementById('p_cost').value,
        price: document.getElementById('p_price').value,
        imei: document.getElementById('p_imei').value,
        condition: document.getElementById('p_condition').value,
        defect: document.getElementById('p_defect').value,
        battery: document.getElementById('p_battery').value,
        accessories: document.getElementById('p_accessories').value,
        location: document.getElementById('p_location').value,
        notes: document.getElementById('p_notes').value,
        receiver: currentUser ? currentUser.name : 'Unknown',
    };

    try {
        // อัปโหลดรูปใหม่ก่อน
        const uploadedUrls = await uploadImagesToDrive(fileQueue);
        productData.images = existingImages.concat(uploadedUrls);

        let res;
        if (editingProductId) {
            productData.id = editingProductId;
            res = await API_updateProduct(productData);
        } else {
            res = await API_addProduct(productData);
        }

        showLoading(false);
        if (res.success) {
            showToast(res.message, 'success');
            resetProductForm();
            fetchInventoryData();
        } else {
            showToast(res.message, 'error');
        }
    } catch (err) {
        showLoading(false);
        showToast('ไม่สามารถบันทึกข้อมูลได้: ' + err, 'error');
    }
}

function resetProductForm() {
    document.getElementById('addProductForm').reset();
    document.getElementById('imagePreviewContainer').innerHTML = '';
    fileQueue = []; existingImages = []; editingProductId = null;
    const btnSubmit = document.querySelector('#addProductForm button[type="submit"]');
    if (btnSubmit) btnSubmit.innerHTML = '<i class="fa-solid fa-save"></i> บันทึกเข้าระบบ';
}

function editProduct(id) {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;
    editingProductId = id;

    document.getElementById('p_brand').value = p.brand;
    document.getElementById('p_model').value = p.model;
    document.getElementById('p_ram').value = p.ram || '';
    document.getElementById('p_storage').value = p.storage || '';
    document.getElementById('p_color').value = p.color || '';
    document.getElementById('p_source').value = p.source || '';
    document.getElementById('p_cost').value = p.cost;
    document.getElementById('p_price').value = p.price;
    document.getElementById('p_imei').value = p.imei || '';
    document.getElementById('p_condition').value = p.condition || '';
    document.getElementById('p_defect').value = p.defect || '';
    document.getElementById('p_battery').value = p.battery || '';
    document.getElementById('p_accessories').value = p.accessories || '';
    document.getElementById('p_location').value = p.location || '';
    document.getElementById('p_notes').value = p.notes || '';

    existingImages = p.images && p.images.length > 0 && p.images[0] !== '' ? [...p.images] : [];
    fileQueue = [];
    renderImagePreviews();

    const formDiv = document.getElementById('addProductForm');
    formDiv.classList.remove('hidden');
    document.getElementById('addProductFormIcon').classList.replace('fa-chevron-right', 'fa-chevron-down');

    const btnSubmit = document.querySelector('#addProductForm button[type="submit"]');
    if (btnSubmit) btnSubmit.innerHTML = '<i class="fa-solid fa-pen"></i> บันทึกอัปเดตข้อมูล';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ====== ระบบขาย POS ======
function openSellModal(productId) {
    const p = allProducts.find(x => x.id === productId);
    if (!p) { showToast('ไม่พบข้อมูลสินค้า', 'error'); return; }

    document.getElementById('sell_productId').value = p.id;
    document.getElementById('sell_price').value = p.price || '';
    document.getElementById('sell_customerName').value = '';
    document.getElementById('sell_customerPhone').value = '';
    document.getElementById('receiptPreview').classList.add('hidden');
    sellReceiptDataURI = null;

    document.getElementById('sellProductInfo').innerHTML = `
    <div class="font-bold text-gray-800">${p.brand} ${p.model}</div>
    <div class="text-xs text-gray-500">สเปค: ${p.ram || '-'}/${p.storage || '-'} ${p.color || ''} | IMEI: ${p.imei || '-'}</div>
    <div class="text-xs text-gray-500 mt-1">ต้นทุน: ฿${formatNumber(p.cost)} | ราคาตั้ง: ฿${formatNumber(p.price)}</div>`;

    const typeSel = document.getElementById('sell_type');
    typeSel.innerHTML = '<option value="">เลือกรูปแบบ</option>';
    if (window._appSettings && window._appSettings.saleTypes) {
        window._appSettings.saleTypes.forEach(t => { typeSel.innerHTML += `<option value="${t}">${t}</option>`; });
    } else {
        API_getSettings().then(s => { window._appSettings = s; s.saleTypes.forEach(t => typeSel.innerHTML += `<option value="${t}">${t}</option>`); }).catch(() => { });
    }

    document.getElementById('sellModal').classList.remove('hidden');
}

function closeSellModal() { document.getElementById('sellModal').classList.add('hidden'); sellReceiptDataURI = null; }

function previewReceiptImage(input) {
    if (!input.files || input.files.length === 0) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        sellReceiptDataURI = e.target.result;
        document.getElementById('receiptPreviewImg').src = e.target.result;
        document.getElementById('receiptPreview').classList.remove('hidden');
        input.value = '';
    };
    reader.readAsDataURL(input.files[0]);
}

async function confirmSell() {
    const productId = document.getElementById('sell_productId').value;
    const soldPrice = document.getElementById('sell_price').value;
    const saleType = document.getElementById('sell_type').value;
    const customerName = document.getElementById('sell_customerName').value;
    const customerPhone = document.getElementById('sell_customerPhone').value;

    if (!soldPrice || !saleType) { showToast('กรุณากรอกราคาขายจริง และเลือกรูปแบบการขาย', 'warning'); return; }
    if (!sellReceiptDataURI) { showToast('กรุณาอัปโหลดรูปใบเสร็จจากเครื่อง POS ก่อนกดยืนยัน', 'warning'); return; }
    if (!confirm('ยืนยันการขายสินค้าในราคา ฿' + formatNumber(soldPrice) + ' ใช่หรือไม่?')) return;

    showLoading(true);
    try {
        const saleData = {
            productId, soldPrice, saleType, customerName, customerPhone,
            salesperson: currentUser ? (currentUser.saleName || currentUser.name) : '',
            recordedBy: currentUser ? currentUser.name : '',
            receiptImage: sellReceiptDataURI ? { filename: 'receipt_' + Date.now() + '.jpg', dataURI: sellReceiptDataURI } : null
        };
        const res = await API_sellProduct(saleData);
        showLoading(false);
        if (res.success) {
            closeSellModal();
            showReceipt(res.receipt);
            fetchInventoryData();
        } else {
            showToast(res.message, 'error');
        }
    } catch (err) {
        showLoading(false);
        showToast('บันทึกการขายไม่สำเร็จ: ' + err, 'error');
    }
}

function showReceipt(r) {
    document.getElementById('receiptBody').innerHTML = `
    <div class="text-center border-b pb-3 mb-3">
      <h2 class="text-lg font-bold text-gray-800">KP Shop</h2>
      <p class="text-xs text-gray-500">ใบเสร็จดิจิทัล</p>
      <p class="text-xs text-gray-400 mt-1">เลขที่: ${r.saleId}</p>
    </div>
    <div class="space-y-2 text-xs">
      <div class="flex justify-between"><span class="text-gray-500">วันที่ขาย:</span><span class="font-medium">${r.saleDate}</span></div>
      <div class="flex justify-between"><span class="text-gray-500">พนักงานขาย:</span><span class="font-medium">${r.salesperson}</span></div>
      ${r.location ? `<div class="flex justify-between"><span class="text-gray-500">สาขา:</span><span class="font-medium">${r.location}</span></div>` : ''}
      <hr>
      <div class="bg-gray-50 p-2 rounded">
        <div class="font-bold text-gray-800">${r.brand} ${r.model}</div>
        <div class="text-gray-500">สเปค: ${r.spec}</div>
        <div class="text-gray-500">IMEI: ${r.imei || '-'}</div>
      </div>
      <div class="flex justify-between"><span class="text-gray-500">รูปแบบการขาย:</span><span class="font-medium">${r.saleType}</span></div>
      <hr>
      <div class="flex justify-between text-base"><span class="font-bold text-gray-800">ราคาขาย:</span><span class="font-bold text-brand-600">฿${formatNumber(r.soldPrice)}</span></div>
      <hr>
      ${r.customerName ? `<div class="flex justify-between"><span class="text-gray-500">ลูกค้า:</span><span class="font-medium">${r.customerName}</span></div>` : ''}
      ${r.customerPhone ? `<div class="flex justify-between"><span class="text-gray-500">เบอร์โทร:</span><span class="font-medium">${r.customerPhone}</span></div>` : ''}
    </div>
    <div class="text-center mt-4 text-xs text-gray-400"><p>ขอบคุณที่ใช้บริการ KP Shop</p></div>`;
    document.getElementById('receiptModal').classList.remove('hidden');
}

// ====== กล้อง QuaggaJS ======
let allVideoDevices = [], currentDeviceIndex = 0, lastUsedDeviceId = null;

function playBeepSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        gain.gain.value = 0.1; osc.frequency.value = 900; osc.type = 'square';
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.1);
    } catch (e) { }
}

function _stopQuaggaOnly() {
    try { Quagga.offDetected(onBarcodeDetected); Quagga.stop(); } catch (e) { }
}

function startScanner(specificDeviceId = null) {
    document.getElementById('scanner-ui-overlay').style.display = 'block';
    const constraints = { width: { min: 640, ideal: 1920 }, height: { min: 480, ideal: 1080 }, advanced: [{ focusMode: 'continuous' }] };
    let targetDeviceId = specificDeviceId || lastUsedDeviceId;
    if (targetDeviceId) constraints.deviceId = { exact: targetDeviceId };
    else constraints.facingMode = 'environment';

    Quagga.init({
        inputStream: { name: 'Live', type: 'LiveStream', target: document.querySelector('#scanner-container'), constraints, area: { top: '30%', right: '10%', left: '10%', bottom: '30%' } },
        decoder: { readers: ['code_128_reader', 'ean_reader', 'upc_reader', 'code_39_reader'] },
        locate: true
    }, function (err) {
        if (err) { showToast('ไม่สามารถเปิดกล้องได้: ' + err.message, 'error'); stopScanner(); return; }
        Quagga.start();
        if (allVideoDevices.length === 0) {
            navigator.mediaDevices.enumerateDevices().then(devices => {
                const videoInputs = devices.filter(d => d.kind === 'videoinput');
                const backCameras = videoInputs.filter(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
                allVideoDevices = backCameras.length > 0 ? backCameras : videoInputs;
                if (allVideoDevices.length > 1) document.getElementById('switch-camera-btn').style.display = 'block';
            });
        }
        setTimeout(() => {
            const track = Quagga.CameraAccess.getActiveTrack();
            if (track && typeof track.applyConstraints === 'function') track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => { });
        }, 500);
    });
    Quagga.onDetected(onBarcodeDetected);
}

function switchCamera() {
    if (allVideoDevices.length < 2) return;
    _stopQuaggaOnly();
    currentDeviceIndex = (currentDeviceIndex + 1) % allVideoDevices.length;
    lastUsedDeviceId = allVideoDevices[currentDeviceIndex].deviceId;
    startScanner(lastUsedDeviceId);
}

function stopScanner() {
    _stopQuaggaOnly();
    document.getElementById('scanner-ui-overlay').style.display = 'none';
}

function onBarcodeDetected(result) {
    playBeepSound();
    stopScanner();
    const code = result.codeResult.code;
    const numbersOnly = code.replace(/\D/g, '');
    const finalResult = numbersOnly || code;
    const imeiInput = document.getElementById('p_imei');
    if (imeiInput) { imeiInput.value = finalResult; showToast('สแกนสำเร็จ: ' + finalResult, 'success'); }
}
