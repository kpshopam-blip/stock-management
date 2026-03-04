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
let currentStockTab = 'Products';

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
    currentStockTab = 'Products';
    document.getElementById('storeUserName').innerText = currentUser.name;

    if (currentUser.role === 'Manager' || currentUser.role === 'ผู้จัดการ') {
        document.getElementById('btnOpenInventory').classList.remove('hidden');
        document.getElementById('storeTabs').classList.remove('hidden');
        document.getElementById('tab_Employee').classList.remove('hidden');
        document.getElementById('tab_Spare').classList.remove('hidden');
    } else if (currentUser.role === 'ช่าง' || currentUser.role === 'Technician') {
        document.getElementById('storeTabs').classList.remove('hidden');
        document.getElementById('tab_Spare').classList.remove('hidden');
    }

    // ทุกคนสามารถดู Dashboard/รายการขายได้ แต่เห็นข้อมูลต่างกัน
    const dashBtn = document.getElementById('btnOpenDashboard');
    if (dashBtn) dashBtn.classList.remove('hidden');

    fetchProducts();
}

function setStockTab(tabName) {
    currentStockTab = tabName;
    const isEmployee = currentUser.role !== 'Manager' && currentUser.role !== 'ผู้จัดการ' && currentUser.role !== 'ช่าง' && currentUser.role !== 'Technician';

    ['Products', 'Employee', 'Spare'].forEach(t => {
        const btn = document.getElementById('tab_' + t);
        if (!btn) return;
        if (t === tabName) {
            btn.className = "font-bold text-brand-600 border-b-2 border-brand-600 px-1 pb-1 text-sm transition";
        } else {
            btn.className = "text-gray-500 hover:text-brand-500 border-b-2 border-transparent px-1 pb-1 text-sm transition";
            if (currentUser.role !== 'Manager' && currentUser.role !== 'ผู้จัดการ' && t === 'Employee') btn.classList.add('hidden');
        }
    });

    const titles = { 'Products': 'สินค้าพร้อมขาย', 'Employee': 'เครื่องพนักงาน', 'Spare': 'เครื่องอะไหล่' };
    document.getElementById('storeTitle').innerText = titles[tabName] || 'สินค้าทั้งหมด';

    filterProducts();
}

async function fetchProducts() {
    const grid = document.getElementById('productGrid');
    const noData = document.getElementById('noProductFound');
    if (grid) {
        grid.innerHTML = `
            <div class="col-span-2 md:col-span-4 lg:col-span-5 flex flex-col items-center justify-center py-16 text-gray-400">
                <i class="fa-solid fa-circle-notch fa-spin text-4xl text-brand-400 mb-3"></i>
                <p>กำลังโหลดข้อมูลสินค้า...</p>
            </div>
        `;
    }
    if (noData) noData.classList.add('hidden');

    try {
        const products = await API_getProducts();
        allProducts = products;

        // Populate Location Filter dynamically
        const filterLocation = document.getElementById('filterLocation');
        if (filterLocation) {
            const currentSelected = filterLocation.value;
            const locations = [...new Set(allProducts.map(p => p.location).filter(Boolean))].sort();
            let optionsHtml = '<option value="">ทุกสาขา / ทุกที่อยู่</option>';
            locations.forEach(loc => {
                optionsHtml += `<option value="${loc}">${loc}</option>`;
            });
            filterLocation.innerHTML = optionsHtml;
            if (locations.includes(currentSelected)) {
                filterLocation.value = currentSelected;
            }
        }

        filterProducts();
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

    // กรองสินค้าที่โดนลบตอน search ไปแล้วไม่ให้ซ้อนกัน
    const isManager = currentUser && (currentUser.role === 'Manager' || currentUser.role === 'ผู้จัดการ');
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
    const locFilter = document.getElementById('filterLocation');
    const filterLocation = locFilter ? locFilter.value.toLowerCase() : '';
    executeSearch(query, filterBrand, filterLocation);
}

function filterProducts() {
    const query1 = document.getElementById('storeSearchDesktop') ? document.getElementById('storeSearchDesktop').value.toLowerCase() : '';
    const filterBrand = document.getElementById('filterBrand').value.toLowerCase();
    const locFilter = document.getElementById('filterLocation');
    const filterLocation = locFilter ? locFilter.value.toLowerCase() : '';
    executeSearch(query1, filterBrand, filterLocation);
}

function executeSearch(query, brand, location) {
    let filtered = allProducts.filter(p => (p.stockType || 'Products') === currentStockTab);
    if (brand) filtered = filtered.filter(p => p.brand.toLowerCase() === brand);
    if (location) filtered = filtered.filter(p => p.location && p.location.toLowerCase() === location);
    if (query) filtered = filtered.filter(p =>
        p.model.toLowerCase().includes(query) || p.brand.toLowerCase().includes(query) ||
        (p.color && p.color.toLowerCase().includes(query)) || (p.storage && p.storage.toLowerCase().includes(query)) ||
        (p.imei && p.imei.toLowerCase().includes(query))
    );
    renderProductGrid(filtered);
}

function resetFilters() {
    if (document.getElementById('storeSearchDesktop')) document.getElementById('storeSearchDesktop').value = '';
    if (document.getElementById('storeSearchMobile')) document.getElementById('storeSearchMobile').value = '';
    document.getElementById('filterBrand').value = '';
    if (document.getElementById('filterLocation')) document.getElementById('filterLocation').value = '';
    filterProducts();
}

// ====== Product Detail ======
function viewProduct(id) {
    const product = allProducts.find(p => p.id === id);
    if (!product) return;

    const modal = document.getElementById('productDetailModal');
    const contentBody = document.getElementById('productDetailBody');

    const images = product.images && product.images.length > 0 && product.images[0].trim() !== '' ? product.images : [NO_IMAGE];
    let galleryHtml = `<div class="relative w-full group"><div id="productImageGallery" class="w-full flex overflow-x-auto snap-x snap-mandatory hide-scrollbar scroll-smooth">`;
    images.forEach(imgUrl => {
        galleryHtml += `<div class="min-w-full snap-center flex justify-center bg-gray-100 relative items-center cursor-pointer" style="height:350px;" onclick="viewFullImage('${imgUrl}')"><img src="${imgUrl}" class="max-h-full max-w-full object-contain" alt="Product Image" onerror="this.onerror=null;this.src=NO_IMAGE;"></div>`;
    });
    galleryHtml += `</div>`;
    if (images.length > 1) {
        galleryHtml += `<button type="button" onclick="scrollGallery(-1)" class="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-white/80 rounded-full shadow hover:bg-white text-gray-800 opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none"><i class="fa-solid fa-chevron-left text-sm"></i></button>`;
        galleryHtml += `<button type="button" onclick="scrollGallery(1)" class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-white/80 rounded-full shadow hover:bg-white text-gray-800 opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none"><i class="fa-solid fa-chevron-right text-sm"></i></button>`;
    }
    galleryHtml += `</div><div id="productImageIndicators" class="flex justify-center gap-1 my-2">${images.map((_, i) => `<div class="w-2 h-2 rounded-full transition-colors duration-300 ${i === 0 ? 'bg-brand-500' : 'bg-gray-300'}"></div>`).join('')}</div>`;

    const statusLabel = product.status.toLowerCase() !== 'available'
        ? `<div class="inline-block bg-gray-700 text-white px-3 py-1 rounded text-sm font-bold mb-2">ขายแล้ว</div>`
        : `<div class="inline-block bg-green-500 text-white px-3 py-1 rounded text-sm font-bold mb-2">พร้อมขาย</div>`;

    const isManager = currentUser && (currentUser.role === 'Manager' || currentUser.role === 'ผู้จัดการ');
    const isTech = currentUser && (currentUser.role === 'ช่าง' || currentUser.role === 'Technician');

    let moveStockHtml = '';
    if (isManager) {
        moveStockHtml = `
        <div class="border-t pt-4 mt-4">
          <label class="block text-xs font-bold text-gray-700 mb-1"><i class="fa-solid fa-truck-ramp-box"></i> ย้ายคลังสินค้า (Manager)</label>
          <div class="flex gap-2">
              <select id="move_targetSheet" class="text-sm border border-gray-300 rounded p-1.5 focus:ring-brand-500 flex-grow outline-none">
                  <option value="Products" ${product.stockType === 'Products' ? 'selected disabled' : ''}>ไปคลัง: พร้อมขาย</option>
                  <option value="Stock_Employee" ${product.stockType === 'Employee' ? 'selected disabled' : ''}>ไปคลัง: เครื่องพนักงาน</option>
                  <option value="Stock_Spare" ${product.stockType === 'Spare' ? 'selected disabled' : ''}>ไปคลัง: เครื่องอะไหล่</option>
              </select>
              <button onclick="moveProductAction('${product.id}')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded shadow transition whitespace-nowrap">
                  <i class="fa-solid fa-arrow-right-arrow-left"></i> ย้าย
              </button>
          </div>
        </div>`;
    }

    let spareCommentHtml = '';
    if ((isManager || isTech) && product.stockType === 'Spare') {
        spareCommentHtml = `
        <div class="border-t pt-4 mt-4 bg-orange-50 -mx-5 px-5 py-4 border-b">
          <h4 class="font-bold text-orange-800 text-sm mb-2"><i class="fa-solid fa-screwdriver-wrench text-orange-600"></i> ประวัติการถอด/สลับอะไหล่</h4>
          <div id="commentList_${product.id}" class="space-y-2 max-h-48 overflow-y-auto mb-3 bg-white border border-orange-200 rounded p-2 text-sm">
              <div class="text-center text-gray-400 py-4"><i class="fa-solid fa-circle-notch fa-spin"></i> กำลังโหลด...</div>
          </div>
          <div class="flex gap-2">
              <input type="text" id="newComment_${product.id}" placeholder="ระบุอะไหล่ที่ถอด/เปลี่ยน..." class="text-sm p-2 w-full border border-orange-300 rounded focus:ring-orange-500 outline-none shadow-inner">
              <button onclick="addCommentAction('${product.id}')" class="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded transition shadow whitespace-nowrap"><i class="fa-solid fa-paper-plane"></i></button>
          </div>
        </div>
        `;
    }

    contentBody.innerHTML = `
    <div class="flex flex-col md:flex-row h-full">
      <div class="w-full md:w-1/2 border-r bg-white">${galleryHtml}</div>
      <div class="w-full md:w-1/2 p-5 bg-white space-y-4">
        <div>${statusLabel}<h2 class="text-2xl font-bold text-gray-800">${product.model}</h2><div class="text-sm text-gray-500 mt-1">ยี่ห้อ: ${product.brand} | รหัส: ${product.id}</div></div>
        <div class="text-3xl font-bold text-brand-600 border-b pb-4">฿${formatNumber(product.price)}</div>
        ${isManager ? `<div class="text-sm text-gray-500 mb-2">ราคาทุน: <span class="font-medium">฿${formatNumber(product.cost || 0)}</span></div>` : ''}
        <div class="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
          <div class="text-gray-500">RAM/ความจุ:</div><div class="font-medium">${product.ram || '-'} / ${product.storage || '-'}</div>
          <div class="text-gray-500">สี:</div><div class="font-medium">${product.color || '-'}</div>
          <div class="text-gray-500">สภาพเครื่อง:</div><div class="font-medium">${product.condition || 'ไม่ได้ระบุ'}</div>
          <div class="text-gray-500">ตำหนิ:</div><div class="font-medium text-red-500">${product.defect || 'ไม่มี / ไม่ระบุ'}</div>
          <div class="text-gray-500">แบตเตอรี่:</div><div class="font-medium">${product.battery || '-'}</div>
          <div class="text-gray-500">อุปกรณ์:</div><div class="font-medium">${product.accessories || '-'}</div>
          <div class="text-gray-500">สาขา/ที่อยู่:</div><div class="font-medium">${product.location || '-'}</div>
          <div class="text-gray-500">หมายเหตุ:</div><div class="font-medium text-amber-600">${product.notes || '-'}</div>
          <div class="text-gray-500">แหล่งที่มา:</div><div class="font-medium">${product.source || '-'}</div>
          <div class="text-gray-500">เลข IMEI:</div><div class="font-medium">${product.imei || '-'}</div>
          <div class="text-gray-500">รับเข้าโดย:</div><div class="font-medium">${product.receiver || '-'}</div>
          <div class="text-gray-500">วันที่รับเข้า:</div><div class="font-medium">${product.dateAdded || '-'}</div>
        </div>
        ${spareCommentHtml}
        ${moveStockHtml}
        ${(product.status || 'Available').toLowerCase() !== 'sold' ? `
        <div class="border-t pt-4 mt-2 ${isManager ? 'grid grid-cols-2 gap-2' : ''}">
          ${isManager ? `<button onclick="closeProductView(); editProductFromStore('${product.id}')" class="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition shadow-lg flex items-center justify-center gap-2 text-base"><i class="fa-solid fa-pen-to-square"></i> แก้ไขข้อมูล</button>` : ''}
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

    const gallery = document.getElementById('productImageGallery');
    const dotsContainer = document.getElementById('productImageIndicators');
    if (gallery && dotsContainer) {
        const dots = Array.from(dotsContainer.querySelectorAll('div'));
        if (dots.length > 1) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const index = Array.from(gallery.children).indexOf(entry.target);
                        if (index !== -1 && dots[index]) {
                            dots.forEach(d => { d.classList.remove('bg-brand-500'); d.classList.add('bg-gray-300'); });
                            dots[index].classList.remove('bg-gray-300');
                            dots[index].classList.add('bg-brand-500');
                        }
                    }
                });
            }, { root: gallery, threshold: 0.5 });

            Array.from(gallery.children).forEach(child => observer.observe(child));
            modal.imageObserver = observer;
        }
    }

    if (spareCommentHtml !== '') {
        loadComments(product.id);
    }
}

function closeProductView() {
    const modal = document.getElementById('productDetailModal');
    if (modal.imageObserver) {
        modal.imageObserver.disconnect();
        modal.imageObserver = null;
    }
    modal.classList.add('hidden');
}

function scrollGallery(direction) {
    const gallery = document.getElementById('productImageGallery');
    if (!gallery) return;
    const scrollAmount = gallery.clientWidth * direction;
    gallery.scrollBy({ left: scrollAmount, behavior: 'smooth' });
}

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
    if (!currentUser || (currentUser.role !== 'Manager' && currentUser.role !== 'ผู้จัดการ')) { showToast('เฉพาะผู้จัดการเท่านั้นที่สามารถเข้าถึงได้', 'warning'); return; }
    renderPage('tpl-inventory');
    const targetCon = document.getElementById('targetSheetContainer');
    if (targetCon) targetCon.classList.remove('hidden');
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

        const hasImage = p.images && p.images.length > 0 && p.images[0].trim() !== '';
        const noImageBadge = !hasImage ? `<span class="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[10px] ml-1 border border-red-200" title="ไม่มีรูปภาพ"><i class="fa-solid fa-image-slash"></i> ไม่มีรูป</span>` : '';

        // ตาราง (จอใหญ่)
        if (tbody) {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50 transition border-b inv-row';
            tr.setAttribute('data-search', `${p.model} ${p.brand} ${p.id} ${p.imei || ''} ${p.color || ''}`.toLowerCase());
            tr.innerHTML = `
        <td class="px-4 py-3"><div class="font-medium text-gray-800 flex items-center">${p.model} ${noImageBadge}</div><div class="text-xs text-gray-500">${p.brand} | ${p.id}</div></td>
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
          <div><div class="font-semibold text-gray-800 text-sm flex items-center">${p.model} ${noImageBadge}</div><div class="text-xs text-gray-500">${p.brand} | ${p.id}</div></div>
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
    if (!currentUser || (currentUser.role !== 'Manager' && currentUser.role !== 'ผู้จัดการ')) { showToast('เฉพาะผู้จัดการเท่านั้นที่สามารถลบสินค้าได้', 'warning'); return; }
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
    renderPage('tpl-dashboard');

    // ตั้งค่า UI สำหรับพนักงานทั่วไปทันทีที่โหลดหน้าจอ ป้องกันการค้างกรณีเน็ตช้าหรือโหลดไม่ติด
    const isManager = currentUser && (currentUser.role === 'Manager' || currentUser.role === 'ผู้จัดการ');
    if (!isManager) {
        const smCards = document.getElementById('managerSummaryCards');
        if (smCards) smCards.classList.add('hidden');
        const chartCard = document.getElementById('managerChartCard');
        if (chartCard) chartCard.classList.add('hidden');
        const spFilter = document.getElementById('dashSalespersonFilter');
        if (spFilter) spFilter.classList.add('hidden');

        // เปลี่ยนหัวข้อ
        const dashTitle = document.querySelector('h2');
        if (dashTitle && dashTitle.innerText.includes('Dashboard')) {
            dashTitle.innerHTML = '<i class="fa-solid fa-list text-brand-500"></i> รายการขายของฉัน';
        }
    }

    try {
        const data = await API_getSalesSummary();
        renderDashboard(data);
    } catch (e) {
        showToast('โหลด Dashboard ไม่สำเร็จ', 'error');
    }
}

function renderDashboard(d) {
    const isManager = currentUser.role === 'Manager' || currentUser.role === 'ผู้จัดการ';

    // ตั้งค่าข้อมูลตั้งต้น
    let displayList = d.salesList || [];
    let todaySales = d.today.sales || 0;
    let todayRevenue = d.today.revenue || 0;
    let todayProfit = d.today.profit || 0;

    // ถ้าไม่ใช่ผู้จัดการ ให้แสดงแค่ยอดขายของตัวเอง และซ่อนองค์ประกอบที่ไม่เกี่ยวข้อง
    if (!isManager) {
        document.getElementById('managerSummaryCards').classList.add('hidden');
        document.getElementById('managerChartCard').classList.add('hidden');
        document.getElementById('dashSalespersonFilter').classList.add('hidden');

        displayList = displayList.filter(s => s.salesperson === currentUser.name);

        // ให้แสดงยอดรวม 2 ช่องแทน ของเฉพาะตัวพนักงานเอง
        const dashTitle = document.querySelector('#tpl-dashboard h2');
        if (dashTitle) dashTitle.innerHTML = '<i class="fa-solid fa-list text-brand-500"></i> รายการขายของฉัน';

    } else {
        document.getElementById('managerSummaryCards').classList.remove('hidden');
        document.getElementById('managerChartCard').classList.remove('hidden');
        document.getElementById('dashSalespersonFilter').classList.remove('hidden');

        // Render Dashboard Cards for Manager
        document.getElementById('dash_todaySales').textContent = todaySales + ' เครื่อง';
        document.getElementById('dash_todayRevenue').textContent = '฿' + formatNumber(todayRevenue);
        document.getElementById('dash_todayProfit').textContent = '฿' + formatNumber(todayProfit);
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
    }

    _dashboardData = d;
    renderSalesList(displayList);

    // พนักงานทั่วไป ต้องอัพเดตยอดรวมใน List ให้เห็นด้วยตอนโหลดครั้งแรก
    if (!isManager) {
        filterSalesList();
    }
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

    // อัปเดตกล่อง Dashboard ให้สัมพันธ์กับตัวกรอง
    const isFiltered = fromStr || toStr || sp;
    const lblSales = document.getElementById('lbl_dash_sales');
    const lblProfit = document.getElementById('lbl_dash_profit');

    if (isFiltered) {
        if (lblSales) lblSales.textContent = 'ยอดขาย (ตามตัวกรอง)';
        if (lblProfit) lblProfit.textContent = 'กำไร (ตามตัวกรอง)';

        document.getElementById('dash_todaySales').textContent = filtered.length + ' เครื่อง';
        document.getElementById('dash_todayRevenue').textContent = '฿' + formatNumber(totalRev);
        document.getElementById('dash_todayProfit').textContent = '฿' + formatNumber(totalProfit);
    } else {
        if (lblSales) lblSales.textContent = 'ยอดขายวันนี้';
        if (lblProfit) lblProfit.textContent = 'กำไรวันนี้';

        document.getElementById('dash_todaySales').textContent = (_dashboardData.today.sales || 0) + ' เครื่อง';
        document.getElementById('dash_todayRevenue').textContent = '฿' + formatNumber(_dashboardData.today.revenue || 0);
        document.getElementById('dash_todayProfit').textContent = '฿' + formatNumber(_dashboardData.today.profit || 0);
    }
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

    const isManager = currentUser.role === 'Manager' || currentUser.role === 'ผู้จัดการ';

    let html = '';
    list.forEach(s => {
        const profitClass = s.profit >= 0 ? 'text-green-600' : 'text-red-600';
        html += `
      <div class="bg-gray-50 border rounded-lg p-3 hover:bg-gray-100 transition">
        <div class="flex justify-between items-start mb-1">
          <div><div class="font-bold text-gray-800 text-sm">${s.brand} ${s.model}</div><div class="text-xs text-gray-500">IMEI: ${s.imei || '-'} | ${s.spec}</div></div>
          <div class="text-right shrink-0">
            <div class="font-bold text-brand-600">฿${formatNumber(s.soldPrice)}</div>
            ${isManager ? `<div class="text-xs ${profitClass}">กำไร: ฿${formatNumber(s.profit)}</div>` : ''}
          </div>
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
    showLoading(true); // ป้องกันกดซ้ำตอนกำลังบีบอัดรูปรัวๆ
    let filesProcessed = 0;
    const totalFiles = input.files.length;

    // ตั้งค่าขนาดสูงสุดที่ต้องการให้บีบอัด
    const MAX_WIDTH = 1200;
    const MAX_HEIGHT = 1200;
    const QUALITY = 0.7; // คุณภาพ JPEG (0.0 - 1.0)

    for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        const reader = new FileReader();

        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
                // คำนวณขนาดภาพใหม่ ให้ไม่เกิน MAX_WIDTH x MAX_HEIGHT แต่คงอัตราส่วนเดิม
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                // สร้าง Canvas เพิ่อวาดรูปที่ย่อขนาดแล้ว
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // ดึงภาพย่อเป็น DataURI นามสกุล jpeg 
                const compressedDataURI = canvas.toDataURL('image/jpeg', QUALITY);

                fileQueue.push({
                    id: 'new_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                    filename: Date.now() + '_' + file.name.replace(/\.[^/.]+$/, "") + '.jpg', // เปลี่ยนนามสกุลตาม
                    dataURI: compressedDataURI
                });

                filesProcessed++;
                if (filesProcessed === totalFiles) {
                    renderImagePreviews();
                    input.value = '';
                    showLoading(false);
                }
            };
            img.src = e.target.result;
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

// ====== ตรวจสอบ IMEI ซ้ำ (Frontend) ======
function checkImeiDuplicate(imei, excludeId) {
    if (!imei || imei.trim() === '') return null;
    const norm = imei.trim().toLowerCase();
    return allProducts.find(p => {
        if (excludeId && p.id === excludeId) return false;
        const pImei = (p.imei || '').trim().toLowerCase();
        return pImei !== '' && pImei === norm && (p.status || 'Available').toLowerCase() !== 'sold';
    }) || null;
}

function onImeiInput(value) {
    const warningDiv = document.getElementById('imei_warning');
    const imeiInput = document.getElementById('p_imei');
    if (!warningDiv || !imeiInput) return;

    const dup = checkImeiDuplicate(value, editingProductId);
    if (dup) {
        // แสดงคำเตือนในโหมดแดง
        imeiInput.classList.add('border-red-500', 'bg-red-50');
        imeiInput.classList.remove('border-gray-300');
        warningDiv.className = 'mt-1.5 flex items-start gap-1.5 text-xs font-medium rounded-md px-2.5 py-2 bg-red-50 border border-red-200 text-red-700';
        warningDiv.innerHTML = `<i class="fa-solid fa-circle-exclamation mt-0.5 shrink-0"></i><span><b>⚠️ IMEI/Serial นี้มีในระบบแล้ว!</b><br>พบในสินค้า: <b>${dup.brand} ${dup.model}</b> (ID: ${dup.id})<br>สถานะ: <b>${dup.status}</b></span>`;
    } else if (value.trim() !== '') {
        // IMEI ไม่ซ้ำ แสดงสีเขียว
        imeiInput.classList.remove('border-red-500', 'bg-red-50');
        imeiInput.classList.add('border-green-400', 'bg-green-50');
        imeiInput.classList.remove('border-gray-300');
        warningDiv.className = 'mt-1.5 flex items-start gap-1.5 text-xs font-medium rounded-md px-2.5 py-2 bg-green-50 border border-green-200 text-green-700';
        warningDiv.innerHTML = '<i class="fa-solid fa-circle-check mt-0.5 shrink-0"></i><span>IMEI/Serial นี้ยังไม่เคยบันทึกในระบบ</span>';
    } else {
        // ว่างเปล่า รีเซ็ตคืน
        imeiInput.classList.remove('border-red-500', 'bg-red-50', 'border-green-400', 'bg-green-50');
        imeiInput.classList.add('border-gray-300');
        warningDiv.className = 'hidden';
        warningDiv.innerHTML = '';
    }
}

// ====== บันทึก / แก้ไขสินค้า ======
async function submitProduct(event) {
    event.preventDefault();

    const imeiVal = document.getElementById('p_imei').value.trim();

    // ตรวจสอบ IMEI ซ้ำใน Frontend (ความปลอดภัยชั้นที่ 1)
    if (imeiVal) {
        const dup = checkImeiDuplicate(imeiVal, editingProductId);
        if (dup) {
            showToast('IMEI/Serial "' + imeiVal + '" ซ้ำกับ ' + dup.brand + ' ' + dup.model + ' กรุณาตรวจสอบใหม่', 'error', 5000);
            document.getElementById('p_imei').focus();
            return; // หยุด ไม่ส่งไป Backend
        }
    }

    showLoading(true);

    const productData = {
        targetSheet: document.getElementById('p_targetSheet') ? document.getElementById('p_targetSheet').value : 'Products',
        brand: document.getElementById('p_brand').value,
        model: document.getElementById('p_model').value,
        ram: document.getElementById('p_ram').value,
        storage: document.getElementById('p_storage').value,
        color: document.getElementById('p_color').value,
        source: document.getElementById('p_source').value,
        cost: document.getElementById('p_cost').value,
        price: document.getElementById('p_price').value,
        imei: imeiVal,
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
            showToast(res.message, 'error', 6000);
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
    // reset IMEI warning
    const imeiInput = document.getElementById('p_imei');
    const warningDiv = document.getElementById('imei_warning');
    if (imeiInput) { imeiInput.classList.remove('border-red-500', 'bg-red-50', 'border-green-400', 'bg-green-50'); imeiInput.classList.add('border-gray-300'); }
    if (warningDiv) { warningDiv.className = 'hidden'; warningDiv.innerHTML = ''; }
    const btnSubmit = document.querySelector('#addProductForm button[type="submit"]');
    if (btnSubmit) btnSubmit.innerHTML = '<i class="fa-solid fa-save"></i> บันทึกเข้าระบบ';
}

async function editProduct(id) {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;
    editingProductId = id;

    const brandDropdown = document.getElementById('p_brand');
    // If setting values are not yet formed inside the form DOM, explicitly await settings load
    if (brandDropdown && brandDropdown.options.length <= 1) {
        await loadSettings();
    }

    // Set values
    const newBrandDropdown = document.getElementById('p_brand');
    if (newBrandDropdown) newBrandDropdown.value = p.brand;

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

    const targetCon = document.getElementById('targetSheetContainer');
    if (targetCon) targetCon.classList.add('hidden'); // ซ่อนเวลาแก้ไข เพราะย้ายด้วยปุ่มย้ายแทน

    const btnSubmit = document.querySelector('#addProductForm button[type="submit"]');
    if (btnSubmit) btnSubmit.innerHTML = '<i class="fa-solid fa-pen"></i> บันทึกอัปเดตข้อมูล';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function editProductFromStore(id) {
    // 1. Load Inventory template first to render the #addProductForm correctly
    loadInventory();

    // 2. Wait slightly for template resolving
    setTimeout(() => {
        editProduct(id);
    }, 100);
}

// ====== Action ย้ายคลัง & คอมเมนต์ ======
async function moveProductAction(productId) {
    const targetSheet = document.getElementById('move_targetSheet').value;
    showLoading(true);
    try {
        const res = await API_moveProduct(productId, targetSheet);
        showLoading(false);
        showToast(res.message, res.success ? 'success' : 'error');
        if (res.success) {
            closeProductView();
            fetchProducts();
        }
    } catch (err) {
        showLoading(false);
        showToast('ผิดพลาด: ' + err, 'error');
    }
}

async function addCommentAction(productId) {
    const input = document.getElementById('newComment_' + productId);
    const val = input.value.trim();
    if (!val) return;
    input.value = '';

    showLoading(true);
    try {
        const res = await API_addComment(productId, val);
        showLoading(false);
        if (res.success) {
            loadComments(productId); // โหลดใหม่
        } else {
            showToast(res.message, 'error');
        }
    } catch (err) {
        showLoading(false);
        showToast('ผิดพลาด: ' + err, 'error');
    }
}

async function loadComments(productId) {
    const listDiv = document.getElementById('commentList_' + productId);
    if (!listDiv) return;
    listDiv.innerHTML = '<div class="text-center text-gray-400 py-4"><i class="fa-solid fa-circle-notch fa-spin"></i> กำลังโหลด...</div>';

    try {
        const comments = await API_getComments(productId);
        if (!comments || comments.length === 0) {
            listDiv.innerHTML = '<div class="text-xs text-gray-400 text-center py-2">ยังไม่มีประวัติการถอดอะไหล่</div>';
            return;
        }

        // Show older first or newer first
        let html = '';
        comments.forEach(c => {
            html += `
            <div class="border-b last:border-0 pb-2 mb-2">
                <div class="flex justify-between items-center mb-0.5">
                    <span class="font-bold text-gray-700 text-xs"><i class="fa-solid fa-user-circle text-gray-400"></i> ${c.user}</span>
                    <span class="text-[10px] text-gray-400">${c.timestamp}</span>
                </div>
                <div class="text-gray-600">${c.text}</div>
            </div>`;
        });
        listDiv.innerHTML = html;
        listDiv.scrollTop = listDiv.scrollHeight; // Scroll to bottom
    } catch (err) {
        listDiv.innerHTML = '<div class="text-xs text-red-400 py-2">โหลดข้อมูลล้มเหลว</div>';
    }
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

    const isManager = currentUser && (currentUser.role === 'Manager' || currentUser.role === 'ผู้จัดการ');
    const costHtml = isManager ? `ต้นทุน: ฿${formatNumber(p.cost)} | ` : ``;

    document.getElementById('sellProductInfo').innerHTML = `
                <div class="font-bold text-gray-800">${p.brand} ${p.model}</div>
    <div class="text-xs text-gray-500">สเปค: ${p.ram || '-'}/${p.storage || '-'} ${p.color || ''} | IMEI: ${p.imei || '-'}</div>
    <div class="text-xs text-gray-500 mt-1">${costHtml}ราคาตั้ง: ฿${formatNumber(p.price)}</div>`;

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
    showLoading(true);
    const file = input.files[0];
    const reader = new FileReader();

    // ตั้งค่าขนาดบีบอัดใบเสร็จ POS
    const MAX_WIDTH = 1200;
    const MAX_HEIGHT = 1200;
    const QUALITY = 0.7;

    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
            } else {
                if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressedDataURI = canvas.toDataURL('image/jpeg', QUALITY);

            sellReceiptDataURI = compressedDataURI;
            document.getElementById('receiptPreviewImg').src = compressedDataURI;
            document.getElementById('receiptPreview').classList.remove('hidden');
            input.value = '';
            showLoading(false);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
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
    if (imeiInput) {
        imeiInput.value = finalResult;
        onImeiInput(finalResult); // ตรวจ IMEI ซ้ำหลังสแกน
        showToast('สแกนสำเร็จ: ' + finalResult, 'success');
    }
}
