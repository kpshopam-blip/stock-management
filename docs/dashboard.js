// docs/dashboard.js
// ====================================================================
// หน้าจอด้านเทคนิคแดชบอร์ดรายงานเต็มรูปแบบ (Manager Only)
// จัดการวิเคราะห์สต็อก สถิติแหล่งที่มาสินค้า และระบบบิลเงินเชื่อ
// ฟิลเตอร์หลัก (Global Filter) ควบคุมข้อมูลรายงานทั้งหมด: แหล่งที่มาสินค้า
// ====================================================================

let currentUser = null;
let allProducts = [];
let salesSummary = null;
let dashboardChart = null;
let activeModelFilter = null; // { brand, model, storage } หรือ null = ไม่กรอง (Cross-Filter)

// ตัวแปรเรียงสำหรับตารางรายงานสต็อก
// column: 'model' | 'added' | 'sold' | 'remaining'
let stockSortColumn = 'remaining';
let stockSortDir = 'desc'; // 'asc' | 'desc'

// ตั้งค่าเมื่อเปิดหน้าจอ
window.onload = async function () {
  const session = getSession();
  if (!session || !session.user || !session.token) {
    window.location.href = 'index.html';
    return;
  }
  
  currentUser = session.user;
  const isManager = currentUser.role === 'Manager' || currentUser.role === 'ผู้จัดการ';
  if (!isManager) {
    alert('สิทธิ์ในการเข้าถึงแดชบอร์ดเฉพาะผู้จัดการเท่านั้น');
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('userName').innerText = currentUser.name;
  
  initTheme();
  await refreshDashboard();
};

// ====== จัดการระบบสลับธีม (Light/Dark Mode) ======
function initTheme() {
  const isLight = localStorage.getItem('theme_mode') === 'light';
  if (isLight) {
    document.documentElement.classList.remove('dark');
    document.getElementById('themeIcon').className = 'fa-solid fa-sun text-lg text-amber-500';
  } else {
    document.documentElement.classList.add('dark');
    document.getElementById('themeIcon').className = 'fa-solid fa-moon text-lg text-gray-300';
  }
}

function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  if (isDark) {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme_mode', 'light');
    document.getElementById('themeIcon').className = 'fa-solid fa-sun text-lg text-amber-500';
  } else {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme_mode', 'dark');
    document.getElementById('themeIcon').className = 'fa-solid fa-moon text-lg text-gray-300';
  }
  
  if (salesSummary) {
    renderCharts(salesSummary);
  }
}

// ====== ดึงข้อมูลจากหลังบ้านเพื่อเรนเดอร์แดชบอร์ด ======
async function refreshDashboard() {
  showLoading(true);
  try {
    const rawProducts = await API_getProducts();
    // แดชบอร์ดผู้จัดการใช้เฉพาะข้อมูลจากชีต Products และ SalesData เท่านั้น
    // ไม่รวม Stock_Employee และ Stock_Spare
    allProducts = rawProducts.filter(p => (p.stockType || 'Products') === 'Products');
    salesSummary = await API_getSalesSummary();

    // เริ่มสร้าง Dropdown ตัวกรองหลักก่อน
    initFilterDropdowns();
    
    // เรนเดอร์ข้อมูลทั้งหมด
    renderAllFilteredReports();
    
    showLoading(false);
  } catch (err) {
    showLoading(false);
    console.error('Refresh dashboard error:', err);
    alert('เกิดข้อผิดพลาดในการดึงข้อมูลรายงานสต็อกและการขายส่ง: ' + err.message);
  }
}

// เมื่อเปลี่ยนตัวกรองแหล่งที่มาเครื่องหลัก (Global Filter)
function onGlobalSourceChange() {
  activeModelFilter = null; // รีเซ็ต cross-filter เมื่อเปลี่ยนแหล่งที่มา
  renderAllFilteredReports();
}

// เรียกฟังก์ชันเรนเดอร์ข้อมูลรายงานทั้งหมดที่เชื่อมโยงกับตัวกรอง
function renderAllFilteredReports() {
  renderKpiCards();
  renderStockTableReport();
  renderSourceDetails();
  renderWholesaleReport();
  if (salesSummary) {
    renderCharts(salesSummary);
  }
}

function showLoading(show) {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    if (show) overlay.classList.remove('hidden');
    else overlay.classList.add('hidden');
  }
}

function formatNumber(num) {
  return parseFloat(num || 0).toLocaleString('th-TH');
}

// ฟังก์ชันช่วยหาแหล่งที่มาของเครื่องจากการสืบค้นในรายการสต็อกสินค้า
function getProductSource(productId) {
  const p = allProducts.find(x => x.id === productId);
  return p ? (p.source || 'ไม่ระบุแหล่งที่มา') : 'ไม่ระบุแหล่งที่มา';
}

// ====== 1. เรนเดอร์การ์ดแสดงผลรวม (KPI Cards) ที่คัดกรองตาม Global Filter ======
function renderKpiCards() {
  if (!salesSummary || !allProducts) return;
  const selectedSource = document.getElementById('global_source_filter').value;

  let totalSalesAmt = 0;
  let totalSalesCount = 0;
  let totalProfitAmt = 0;
  
  salesSummary.salesList.forEach(s => {
    const pSource = getProductSource(s.productId);
    if (selectedSource && pSource !== selectedSource) {
      return; // ข้ามถ้ารายการขายไม่ตรงกับแหล่งที่มาที่คัดเลือก
    }
    totalSalesAmt += parseFloat(s.soldPrice || 0);
    totalProfitAmt += parseFloat(s.profit || 0);
    totalSalesCount++;
  });

  document.getElementById('kpi_totalSales').innerText = '฿' + formatNumber(totalSalesAmt);
  document.getElementById('kpi_totalSalesCount').innerText = `รวมเป็นยอดขาย: ${totalSalesCount} เครื่อง`;
  
  document.getElementById('kpi_totalProfit').innerText = '฿' + formatNumber(totalProfitAmt);
  const avgProfit = totalSalesCount > 0 ? (totalProfitAmt / totalSalesCount) : 0;
  document.getElementById('kpi_profitMargin').innerText = `คิดเฉลี่ยกำไรตัวละ: ฿${formatNumber(avgProfit.toFixed(0))}`;

  let remainingCount = 0;
  let remainingValue = 0;
  allProducts.forEach(p => {
    const status = (p.status || '').toLowerCase();
    if (status !== 'sold' && status !== 'unavailable') {
      const pSource = p.source || 'ไม่ระบุแหล่งที่มา';
      if (selectedSource && pSource !== selectedSource) {
        return; // ข้ามถ้าสินค้าในคลังไม่ตรงกับแหล่งที่มาที่คัดเลือก
      }
      remainingCount++;
      remainingValue += parseFloat(p.cost || 0);
    }
  });
  
  document.getElementById('kpi_stockValue').innerText = '฿' + formatNumber(remainingValue);
  document.getElementById('kpi_stockCount').innerText = `สต็อกคงคลังในร้าน: ${remainingCount} เครื่อง`;

  let unpaidCreditAmt = 0;
  let unpaidCreditCount = 0;
  
  salesSummary.salesList.forEach(s => {
    const isCredit = s.saleType && s.saleType.toString().includes('พาร์ทเนอร์') && s.saleType.toString().includes('เชื่อ');
    const isUnpaid = !s.paymentStatus || s.paymentStatus.toString().trim() !== 'จ่ายแล้ว';
    if (isCredit && isUnpaid) {
      const pSource = getProductSource(s.productId);
      if (selectedSource && pSource !== selectedSource) {
        return; // ข้ามถ้าบิลเงินเชื่อไม่ตรงกับแหล่งที่มาที่คัดเลือก
      }
      unpaidCreditAmt += parseFloat(s.soldPrice || 0) - parseFloat(s.downPayment || 0);
      unpaidCreditCount++;
    }
  });

  document.getElementById('kpi_unpaidCredit').innerText = '฿' + formatNumber(unpaidCreditAmt);
  document.getElementById('kpi_unpaidCreditCount').innerText = `บิลค้างชำระ: ${unpaidCreditCount} รายการ`;
}

// ====== 2. เตรียมข้อมูล Dropdown ตัวกรอง (ยี่ห้อ & แหล่งที่มา) ======
function initFilterDropdowns() {
  const brandFilter = document.getElementById('stock_brand_filter');
  const globalSourceFilter = document.getElementById('global_source_filter');
  if (!brandFilter || !allProducts) return;

  // เอาแบรนด์ที่มีในสต็อกจริงมาใส่ใน Dropdown ตัวกรองยี่ห้อ
  const brands = [...new Set(allProducts.map(p => p.brand).filter(Boolean))].sort();
  let brandHtml = '<option value="">ทุกยี่ห้อ</option>';
  brands.forEach(b => {
    brandHtml += `<option value="${b}">${b}</option>`;
  });
  brandFilter.innerHTML = brandHtml;

  // ดึงแหล่งที่มาเครื่องจากข้อมูลสินค้าจริง
  const sources = [...new Set(allProducts.map(p => p.source).filter(Boolean))].sort();
  let sourceHtml = '<option value="">ทุกแหล่งที่มา</option>';
  sources.forEach(src => {
    sourceHtml += `<option value="${src}">${src}</option>`;
  });
  
  if (globalSourceFilter) {
    const oldVal = globalSourceFilter.value;
    globalSourceFilter.innerHTML = sourceHtml;
    // ป้องกันการรีเซ็ตค่าตอนที่ระบบดึงข้อมูลใหม่แบบอัตโนมัติ
    if (oldVal && sources.includes(oldVal)) {
      globalSourceFilter.value = oldVal;
    }
  }
}

// ฟังก์ชันแยกส่วนความจุ (Storage) จากฟิลด์ Spec ในประวัติการขาย (เช่น "/128 เขียว" หรือ "8/128 เขียว" -> "128 GB")
function extractStorageFromSpec(spec) {
  if (!spec) return '';
  let part = spec;
  if (spec.includes('/')) {
    part = spec.split('/')[1] || '';
  }
  const match = part.trim().match(/^(\d+)\s*(GB|TB)?/i);
  if (match) {
    const num = match[1];
    const unit = (match[2] || 'GB').toUpperCase();
    return `${num} ${unit}`;
  }
  return '';
}

// ====== 3. ตารางจำแนกรายงานสต็อก ยี่ห้อ/รุ่น (Column 1) คัดกรองตามแหล่งที่มา ======
function renderStockTableReport() {
  const tbody = document.getElementById('stockReportTableBody');
  if (!tbody || !allProducts) return;

  const filterBrand = document.getElementById('stock_brand_filter').value.toLowerCase();
  const searchInput = document.getElementById('stock_search_input').value.toLowerCase();
  const selectedSource = document.getElementById('global_source_filter').value;

  // ฟังก์ชันย่อยสำหรับตัดรหัสโมเดลภูมิภาค (เช่น ZP/A, TH/A, LL) ท้ายชื่อรุ่นออก (รองรับย้อนหลัง)
  const getCleanModelName = (name) => {
    if (!name) return '';
    let cleaned = name.trim();
    // นอร์มัลไลซ์ ProMax -> Pro Max
    cleaned = cleaned.replace(/ProMax/i, 'Pro Max');
    // ลบรหัสโมเดลภูมิภาคที่มี / (เช่น TH/A, ZP/A, CH/A) ทั้งแบบปกติและมีวงเล็บ
    cleaned = cleaned.replace(/\s*\(?[A-Z]{1,3}\/[A-Z]{1,3}\)?$/i, '');
    // ลบรหัสโมเดลภูมิภาคแบบไม่มี / (เช่น TH, LL, ZP) ที่อยู่ท้ายสุด
    cleaned = cleaned.replace(/\s+\(?(TH|LL|ZP|CH|VN|ZA|KH|JP|US|EU|HK|CN|TW|KR|MY|SG|ID|PH)\)?$/i, '');
    return cleaned.trim();
  };

  let stats = {};

  // 3.1 คำนวณจากผลิตภัณฑ์ปัจจุบันในฐานข้อมูล
  allProducts.forEach(p => {
    const pSource = p.source || 'ไม่ระบุแหล่งที่มา';
    if (selectedSource && pSource !== selectedSource) {
      return; // กรองออกตามแหล่งที่มาหลัก
    }

    const cleanModel = p.rawModel || getCleanModelName(p.model);
    const storage = p.storage || '';
    const key = `${p.brand.toLowerCase()}|${cleanModel.toLowerCase()}|${storage.toLowerCase()}`;
    const status = (p.status || '').toLowerCase();
    
    if (!stats[key]) {
      stats[key] = { brand: p.brand, model: cleanModel, storage: storage, added: 0, sold: 0, remaining: 0 };
    }
    
    stats[key].added++;
    
    if (status === 'sold') {
      stats[key].sold++;
    } else if (status !== 'unavailable') {
      stats[key].remaining++;
    }
  });

  // 3.2 คำนวณจากประวัติการขาย (กรณีสินค้าถูกลบจากคลังไปแล้ว)
  if (salesSummary && salesSummary.salesList) {
    salesSummary.salesList.forEach(s => {
      const pSource = getProductSource(s.productId);
      if (selectedSource && pSource !== selectedSource) {
        return; // กรองออกตามแหล่งที่มาหลัก
      }

      const cleanModel = s.modelCode ? s.model : getCleanModelName(s.model);
      const storage = extractStorageFromSpec(s.spec || '');
      const key = `${s.brand.toLowerCase()}|${cleanModel.toLowerCase()}|${storage.toLowerCase()}`;
      if (!stats[key]) {
        stats[key] = { brand: s.brand, model: cleanModel, storage: storage, added: 1, sold: 1, remaining: 0 };
      }
    });
  }

  // 3.3 กรองตามยี่ห้อและคำค้นหา
  let reportList = Object.values(stats);
  if (filterBrand) {
    reportList = reportList.filter(item => item.brand.toLowerCase() === filterBrand);
  }
  if (searchInput) {
    reportList = reportList.filter(item => item.model.toLowerCase().includes(searchInput) || item.brand.toLowerCase().includes(searchInput));
  }

  // 3.4 เรียงตามคอลัมน์ที่เลือก
  const dir = stockSortDir === 'asc' ? 1 : -1;
  reportList.sort((a, b) => {
    if (stockSortColumn === 'model') {
      const nameA = (a.brand + ' ' + a.model).toLowerCase();
      const nameB = (b.brand + ' ' + b.model).toLowerCase();
      return dir * nameA.localeCompare(nameB, 'th');
    }
    return dir * (a[stockSortColumn] - b[stockSortColumn]);
  });

  if (reportList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-gray-500 dark:text-gray-400">ไม่พบรายงานสินค้าตามตัวกรอง</td></tr>`;
    return;
  }

  let html = '';
  reportList.forEach(item => {
    const storageLabel = item.storage ? `<span class="inline-block ml-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400">${item.storage}</span>` : '';
    
    // เช็คว่าแถวนี้ถูกเลือกอยู่หรือไม่ (cross-filter)
    const isActive = activeModelFilter 
      && activeModelFilter.brand === item.brand 
      && activeModelFilter.model === item.model 
      && activeModelFilter.storage === item.storage;
    const rowBg = isActive 
      ? 'bg-brand-50 dark:bg-brand-500/10 ring-1 ring-brand-300 dark:ring-brand-500/30' 
      : 'hover:bg-gray-50 dark:hover:bg-darkbg-700/50';
    
    // Escape เครื่องหมาย ' ในชื่อ brand/model/storage เพื่อป้องกัน XSS ใน onclick
    const eBrand = (item.brand || '').replace(/'/g, "\\'");
    const eModel = (item.model || '').replace(/'/g, "\\'");
    const eStorage = (item.storage || '').replace(/'/g, "\\'");

    html += `
    <tr class="${rowBg} border-b border-gray-100 dark:border-darkbg-700 font-medium cursor-pointer transition-colors duration-150" onclick="onStockRowClick('${eBrand}','${eModel}','${eStorage}')">
      <td class="px-3 py-2.5">
        <span class="font-bold text-gray-900 dark:text-white">${item.model}</span>${storageLabel}
        <div class="text-[10px] text-gray-400 font-medium">${item.brand}</div>
      </td>
      <td class="px-2 py-2.5 text-center text-gray-500 dark:text-gray-400">${item.added}</td>
      <td class="px-2 py-2.5 text-center text-emerald-600 dark:text-emerald-500">${item.sold}</td>
      <td class="px-3 py-2.5 text-center font-bold bg-brand-50/50 dark:bg-brand-500/5 text-brand-600 dark:text-brand-400 text-sm">${item.remaining}</td>
    </tr>`;
  });
  tbody.innerHTML = html;

  // อัปเดตไอคอนลูกศรหัวคอลัมน์
  const cols = ['model', 'added', 'sold', 'remaining'];
  cols.forEach(col => {
    const el = document.getElementById(`sort_icon_${col}`);
    if (!el) return;
    if (col === stockSortColumn) {
      const iconClass = stockSortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
      const activeColor = col === 'remaining'
        ? 'text-brand-500 dark:text-brand-400'
        : 'text-indigo-500 dark:text-indigo-400';
      el.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
      el.className = `${activeColor} transition`;
    } else {
      const idleColor = col === 'remaining'
        ? 'text-brand-300 dark:text-brand-700'
        : 'text-gray-300 dark:text-gray-600';
      el.innerHTML = `<i class="fa-solid fa-sort"></i>`;
      el.className = `${idleColor} group-hover:text-gray-500 dark:group-hover:text-gray-400 transition`;
    }
  });
}

// ====== 3.5 กดหัวคอลัมน์เพื่อเรียงข้อมูล ======
function setStockSort(column) {
  if (stockSortColumn === column) {
    // คอลัมน์เดิม → สลับ asc/desc
    stockSortDir = stockSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    // คอลัมน์ใหม่ → เริ่ม desc ก่อน (ยกเว้น model เริ่ม asc)
    stockSortColumn = column;
    stockSortDir = column === 'model' ? 'asc' : 'desc';
  }
  renderStockTableReport();
}

// ====== 3.6 Cross-Filter: เมื่อคลิกแถวรุ่นเครื่องในคอลัมน์ซ้าย ======
function onStockRowClick(brand, model, storage) {
  // Toggle: ถ้าคลิกแถวเดิมที่เลือกอยู่ → ยกเลิก filter
  if (activeModelFilter 
    && activeModelFilter.brand === brand 
    && activeModelFilter.model === model 
    && activeModelFilter.storage === storage) {
    activeModelFilter = null;
  } else {
    activeModelFilter = { brand, model, storage };
  }
  // Re-render ทุกส่วนที่เกี่ยวข้อง
  renderStockTableReport();
  renderSourceDetails();
  renderWholesaleReport();
}

function clearModelFilter() {
  activeModelFilter = null;
  renderStockTableReport();
  renderSourceDetails();
  renderWholesaleReport();
}

// สร้าง badge HTML สำหรับแสดงว่ากำลังกรองตามรุ่นอะไร
function getModelFilterBadgeHtml(containerId) {
  if (!activeModelFilter) return '';
  const label = `${activeModelFilter.model}${activeModelFilter.storage ? ' ' + activeModelFilter.storage : ''}`;
  return `
    <div id="${containerId}" class="flex items-center gap-2 px-3 py-1.5 bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/20 rounded-xl text-xs animate-fadeIn">
      <i class="fa-solid fa-filter text-brand-500 text-[10px]"></i>
      <span class="text-brand-700 dark:text-brand-400 font-bold">กำลังกรอง: ${label}</span>
      <button onclick="clearModelFilter()" class="ml-1 w-5 h-5 flex items-center justify-center rounded-full bg-brand-200 dark:bg-brand-500/30 text-brand-700 dark:text-brand-300 hover:bg-brand-300 dark:hover:bg-brand-500/50 transition-colors text-[10px] font-bold" title="ยกเลิกการกรอง">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>`;
}

// ====== 4. วิเคราะห์ตารางแหล่งที่มาเครื่องและรายละเอียด (Column 2) ======
function renderSourceDetails() {
  const selectedSource = document.getElementById('global_source_filter').value;
  const statGrid = document.getElementById('source_stat_grid');
  const tbody = document.getElementById('sourceDetailsTableBody');
  const badgeContainer = document.getElementById('source_model_filter_badge');
  if (!statGrid || !tbody || !allProducts) return;

  // แสดง badge cross-filter ในคอลัมน์กลาง
  if (badgeContainer) {
    badgeContainer.innerHTML = getModelFilterBadgeHtml('source_badge_inner');
  }

  // ฟังก์ชันตรวจว่าสินค้าตรงกับ cross-filter หรือไม่
  const getCleanModelName = (name) => {
    if (!name) return '';
    let cleaned = name.trim().replace(/ProMax/i, 'Pro Max');
    cleaned = cleaned.replace(/\s*\(?[A-Z]{1,3}\/[A-Z]{1,3}\)?$/i, '');
    cleaned = cleaned.replace(/\s+\(?(TH|LL|ZP|CH|VN|ZA|KH|JP|US|EU|HK|CN|TW|KR|MY|SG|ID|PH)\)?$/i, '');
    return cleaned.trim();
  };
  const matchesModelFilter = (p) => {
    if (!activeModelFilter) return true;
    const cleanModel = p.rawModel || getCleanModelName(p.model);
    return p.brand.toLowerCase() === activeModelFilter.brand.toLowerCase() 
      && cleanModel.toLowerCase() === activeModelFilter.model.toLowerCase() 
      && (p.storage || '').toLowerCase() === activeModelFilter.storage.toLowerCase();
  };

  // 4.1 คำนวณยอดสรุป — กรองตาม source + cross-filter
  let totalDevices = 0, availableDevices = 0, totalCosts = 0;
  allProducts.forEach(p => {
    // กรองตามแหล่งที่มา
    if (selectedSource) {
      const src = p.source || 'ไม่ระบุแหล่งที่มา';
      if (src !== selectedSource) return;
    }
    // กรองตาม cross-filter
    if (!matchesModelFilter(p)) return;

    const status = (p.status || '').toLowerCase();
    totalDevices++;
    if (status !== 'sold' && status !== 'unavailable') {
      availableDevices++;
      totalCosts += parseFloat(p.cost || 0);
    }
  });

  const srcLabel = selectedSource || 'ทุกแหล่ง';
  statGrid.innerHTML = `
    <div class="bg-gray-50 dark:bg-darkbg-800 rounded-xl border border-gray-200 dark:border-darkbg-700 p-2.5 text-center shadow-inner">
      <div class="text-[9px] text-gray-400 font-bold uppercase mb-0.5">${selectedSource ? 'รับมาสะสม' : 'ทุกแหล่งรับมา'}</div>
      <div class="text-sm font-extrabold text-gray-900 dark:text-white">${totalDevices} เครื่อง</div>
    </div>
    <div class="bg-brand-50/50 dark:bg-brand-500/10 rounded-xl border border-brand-100 dark:border-brand-500/20 p-2.5 text-center shadow-inner">
      <div class="text-[9px] text-brand-600 dark:text-brand-400 font-bold uppercase mb-0.5">${selectedSource ? 'พร้อมขายจริง' : 'พร้อมขายรวม'}</div>
      <div class="text-sm font-extrabold text-brand-600 dark:text-brand-400">${availableDevices} เครื่อง</div>
    </div>
    <div class="bg-indigo-50/50 dark:bg-indigo-500/10 rounded-xl border border-indigo-100 dark:border-indigo-500/20 p-2.5 text-center shadow-inner">
      <div class="text-[9px] text-indigo-600 dark:text-indigo-400 font-bold uppercase mb-0.5">${selectedSource ? 'มูลค่าคงคลัง' : 'มูลค่ารวมคลัง'}</div>
      <div class="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5">฿${formatNumber(totalCosts)}</div>
    </div>`;

  // 4.2 กรองลงตารางแสดงรายการสินค้า
  let filtered = allProducts;
  if (selectedSource) {
    filtered = filtered.filter(p => (p.source || 'ไม่ระบุแหล่งที่มา') === selectedSource);
  }
  // กรองตาม cross-filter
  if (activeModelFilter) {
    filtered = filtered.filter(p => matchesModelFilter(p));
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="px-4 py-8 text-center text-gray-500 dark:text-gray-400">${activeModelFilter ? 'ไม่พบสินค้ารุ่นนี้ในแหล่งที่มาที่เลือก' : 'ไม่มีรายชื่อสินค้าในแหล่งที่มานี้'}</td></tr>`;
    return;
  }

  let html = '';
  filtered.forEach(p => {
    const st = (p.status || 'Available').toLowerCase();
    let stBadge = '';
    if (st === 'available') stBadge = '<span class="px-2 py-0.5 bg-green-500/10 text-green-500 rounded text-[10px] font-bold">พร้อมขาย</span>';
    else if (st === 'reserved') stBadge = '<span class="px-2 py-0.5 bg-yellow-500/10 text-yellow-500 rounded text-[10px] font-bold">ติดจอง</span>';
    else if (st === 'repair') stBadge = '<span class="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded text-[10px] font-bold">ส่งซ่อม</span>';
    else if (st === 'sold') stBadge = '<span class="px-2 py-0.5 bg-gray-500/10 text-gray-500 rounded text-[10px] font-bold">ขายแล้ว</span>';
    else if (st === 'unavailable') stBadge = '<span class="px-2 py-0.5 bg-red-500/10 text-red-500 rounded text-[10px] font-bold">ไม่พร้อมขาย</span>';

    // คำนวณรายละเอียดราคาต่างๆ
    const costVal = parseFloat(p.cost || 0);
    const retailVal = parseFloat(p.price || 0);
    const wholesaleVal = parseFloat(p.wholesalePrice || 0);

    let priceDetailsHtml = `<div class="text-[10px] text-gray-500 dark:text-gray-400">ทุน: <span class="font-bold text-gray-700 dark:text-gray-200">฿${formatNumber(costVal)}</span></div>`;
    priceDetailsHtml += `<div class="text-[10px] text-gray-500 dark:text-gray-400">ปลีก: <span class="font-bold text-blue-600 dark:text-blue-400">฿${formatNumber(retailVal)}</span></div>`;
    
    if (wholesaleVal > 0) {
      priceDetailsHtml += `<div class="text-[10px] text-gray-500 dark:text-gray-400">ส่ง: <span class="font-bold text-indigo-600 dark:text-indigo-400">฿${formatNumber(wholesaleVal)}</span></div>`;
    }

    // หากขายไปแล้ว ให้ค้นหาราคาขายจริงจากประวัติการขาย
    if (st === 'sold' && salesSummary && salesSummary.salesList) {
      const saleItem = salesSummary.salesList.find(s => s.productId === p.id);
      if (saleItem) {
        priceDetailsHtml += `<div class="text-[10px] text-emerald-600 dark:text-emerald-400 font-extrabold mt-0.5 pt-0.5 border-t border-dashed border-gray-200 dark:border-darkbg-700">ขายจริง: ฿${formatNumber(saleItem.soldPrice)}</div>`;
      }
    }

    html += `
    <tr class="hover:bg-gray-50 dark:hover:bg-darkbg-700/50 border-b border-gray-100 dark:border-darkbg-700 font-medium">
      <td class="px-2.5 py-2.5">
        <div class="font-bold text-gray-800 dark:text-white">${p.brand} ${p.model}</div>
        <div class="text-[9px] text-gray-400 font-mono">IMEI: ${p.imei || '-'} ${p.color ? '| ' + p.color : ''}</div>
      </td>
      <td class="px-2 py-2.5 text-right whitespace-nowrap">${priceDetailsHtml}</td>
      <td class="px-2.5 py-2.5 text-center">${stBadge}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

// ====== 5. รายงานบิลขายส่งและเงินเชื่อ (Column 3) คัดกรองตามแหล่งที่มา ======
function parseDueDate(dateStr) {
  if (!dateStr) return null;
  const s = dateStr.toString().trim();
  
  // รูปแบบ dd/mm/yyyy (เก็บใน Sheets ปกติ)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const parts = s.split('/');
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  
  // รูปแบบ Date string เต็ม (Sun Jul 19 2026...) หรือ ISO format
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  
  return null;
}

// แปลงวันที่เป็นรูปแบบภาษาไทยที่อ่านง่าย: เช่น "19 ก.ค. 69"
function formatDueDateDisplay(dateStr) {
  const d = parseDueDate(dateStr);
  if (!d) return dateStr || '-';
  
  const thMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const day = d.getDate();
  const month = thMonths[d.getMonth()];
  const yearBE = d.getFullYear() + 543;
  const yearShort = String(yearBE).slice(-2);
  return `${day} ${month} ${yearShort}`;
}

function renderWholesaleReport() {
  const container = document.getElementById('wholesaleListContainer');
  const badgeContainer = document.getElementById('wholesale_model_filter_badge');
  if (!container || !salesSummary) return;

  const paymentFilter = document.getElementById('wholesale_payment_filter').value;
  const searchText = document.getElementById('wholesale_search_input').value.toLowerCase();
  const selectedSource = document.getElementById('global_source_filter').value;

  // แสดง badge cross-filter ในคอลัมน์ขวา
  if (badgeContainer) {
    badgeContainer.innerHTML = getModelFilterBadgeHtml('wholesale_badge_inner');
  }

  // ฟังก์ชันตรวจว่ารายการขายตรงกับ cross-filter หรือไม่
  const getCleanModelName = (name) => {
    if (!name) return '';
    let cleaned = name.trim().replace(/ProMax/i, 'Pro Max');
    cleaned = cleaned.replace(/\s*\(?[A-Z]{1,3}\/[A-Z]{1,3}\)?$/i, '');
    cleaned = cleaned.replace(/\s+\(?(TH|LL|ZP|CH|VN|ZA|KH|JP|US|EU|HK|CN|TW|KR|MY|SG|ID|PH)\)?$/i, '');
    return cleaned.trim();
  };
  const matchesSaleModelFilter = (s) => {
    if (!activeModelFilter) return true;
    const cleanModel = s.modelCode ? s.model : getCleanModelName(s.model);
    return s.brand.toLowerCase() === activeModelFilter.brand.toLowerCase() 
      && cleanModel.toLowerCase() === activeModelFilter.model.toLowerCase() 
      && extractStorageFromSpec(s.spec || '').toLowerCase() === activeModelFilter.storage.toLowerCase();
  };

  // เมื่อ cross-filter เปิดอยู่ → แสดงทุกประเภทขาย / ไม่มี cross-filter → เฉพาะขายส่ง/เชื่อ
  let list = salesSummary.salesList.filter(s => {
    if (activeModelFilter) return true; // แสดงทุกประเภทเมื่อ cross-filter เปิดอยู่
    const isWholesale = s.saleType && (s.saleType.toString().includes('ส่ง') || s.saleType.toString().includes('เชื่อ'));
    return isWholesale;
  });

  // กรองตามแหล่งที่มาหลัก (Global Filter)
  if (selectedSource) {
    list = list.filter(s => {
      const pSource = getProductSource(s.productId);
      return pSource === selectedSource;
    });
  }

  // กรองตาม cross-filter (brand/model/storage)
  if (activeModelFilter) {
    list = list.filter(s => matchesSaleModelFilter(s));
  }

  // กรองตามสถานะการชำระเงิน
  if (paymentFilter === 'unpaid') {
    list = list.filter(s => s.saleType && s.saleType.includes('พาร์ทเนอร์') && s.saleType.includes('เชื่อ') && s.paymentStatus !== 'จ่ายแล้ว');
  } else if (paymentFilter === 'paid') {
    list = list.filter(s => s.paymentStatus === 'จ่ายแล้ว');
  } else if (paymentFilter === 'cash') {
    list = list.filter(s => s.saleType && s.saleType.includes('สด'));
  }

  // กรองตามคำค้นหา
  if (searchText) {
    list = list.filter(s => 
      String(s.customerName || '').toLowerCase().includes(searchText) ||
      String(s.customerPhone || '').toLowerCase().includes(searchText) ||
      String(s.saleId || '').toLowerCase().includes(searchText) ||
      String(s.model || '').toLowerCase().includes(searchText)
    );
  }

  if (list.length === 0) {
    container.innerHTML = '<div class="text-center text-gray-500 py-16 dark:text-gray-400">ไม่พบรายการบิลตามเงื่อนไขคัดกรอง</div>';
    return;
  }

  // ====== จัดกลุ่มตามหมายเลขบิล (saleId) ======
  const billGroups = {};
  list.forEach(s => {
    const billId = s.saleId || 'UNKNOWN';
    if (!billGroups[billId]) {
      billGroups[billId] = {
        saleId: billId,
        saleDate: s.saleDate,
        saleType: s.saleType,
        customerName: s.customerName,
        customerPhone: s.customerPhone,
        salesperson: s.salesperson || '',
        paymentStatus: s.paymentStatus,
        dueDate: s.dueDate,
        receiptImage: s.receiptImage || '',
        downPayment: parseFloat(s.downPayment || 0),
        items: [],
        totalPrice: 0,
        totalProfit: 0
      };
    }
    billGroups[billId].items.push(s);
    billGroups[billId].totalPrice += parseFloat(s.soldPrice || 0);
    billGroups[billId].totalProfit += parseFloat(s.profit || 0);
    // ใช้ข้อมูลเงินเชื่อล่าสุด
    if (s.saleType && s.saleType.toString().includes('พาร์ทเนอร์') && s.saleType.toString().includes('เชื่อ')) {
      billGroups[billId].saleType = s.saleType;
      billGroups[billId].paymentStatus = s.paymentStatus;
      billGroups[billId].dueDate = s.dueDate;
      billGroups[billId].downPayment = parseFloat(s.downPayment || 0);
    }
    // อัปเดตรูปใบเสร็จ POS และพนักงานขายจากแถวล่าสุดที่มีข้อมูล
    if (s.receiptImage) billGroups[billId].receiptImage = s.receiptImage;
    if (s.salesperson) billGroups[billId].salesperson = s.salesperson;
  });

  let html = '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const billList = Object.values(billGroups);

  billList.forEach((bill, idx) => {
    const isCredit = bill.saleType && bill.saleType.toString().includes('พาร์ทเนอร์') && bill.saleType.toString().includes('เชื่อ');
    const itemCount = bill.items.length;

    // สถานะการชำระ badge
    let payBadge = '';
    if (isCredit) {
      payBadge = bill.paymentStatus === 'จ่ายแล้ว'
        ? '<span class="bg-green-500 text-white px-2 py-0.5 rounded text-[10px] font-bold">🟢 ชำระแล้ว</span>'
        : '<span class="bg-red-500 text-white px-2 py-0.5 rounded text-[10px] font-bold">🔴 ค้างจ่าย</span>';
    } else {
      payBadge = '<span class="bg-emerald-500 text-white px-2 py-0.5 rounded text-[10px] font-bold">💵 จ่ายสด</span>';
    }

    // เงินเชื่อ countdown
    let debtPanel = '';
    if (isCredit) {
      const isUnpaid = bill.paymentStatus !== 'จ่ายแล้ว';
      const dDate = parseDueDate(bill.dueDate);
      let countdownHtml = '';
      if (isUnpaid && dDate) {
        const diffTime = dDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 0) {
          countdownHtml = `<span class="bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400 px-2 py-0.5 rounded text-[10px] font-bold neon-border-green"><i class="fa-solid fa-hourglass-half animate-pulse mr-1"></i>เหลืออีก ${diffDays} วัน</span>`;
        } else if (diffDays === 0) {
          countdownHtml = `<span class="bg-orange-500 text-white px-2 py-0.5 rounded text-[10px] font-bold animate-bounce"><i class="fa-solid fa-triangle-exclamation mr-1"></i>ครบกำหนดชำระวันนี้!</span>`;
        } else {
          countdownHtml = `<span class="bg-red-600 text-white px-2 py-0.5 rounded text-[10px] font-bold animate-pulse neon-border-red"><i class="fa-solid fa-circle-exclamation mr-1"></i>เลยกำหนดแล้ว ${Math.abs(diffDays)} วัน!</span>`;
        }
      } else if (!isUnpaid) {
        countdownHtml = '<span class="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-circle-check mr-1"></i>ชำระเงินตรงเวลา</span>';
      }

      const balance = bill.totalPrice - bill.downPayment;
      const actionBtn = isUnpaid ? `
        <button onclick="event.stopPropagation(); markAsPaid('${bill.saleId}')" class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg shadow shadow-emerald-700/20 hover:shadow-lg transition-all flex items-center gap-1.5 whitespace-nowrap">
          <i class="fa-solid fa-check"></i> เปลี่ยนเป็นจ่ายแล้ว
        </button>` : '';

      // คำนวณสีของวันครบกำหนดจ่าย
      let dueDateColor = 'text-gray-600 dark:text-gray-300';
      if (isUnpaid && dDate) {
        const diffMs = dDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffMs / 86400000);
        if (diffDays < 0) dueDateColor = 'text-red-500 dark:text-red-400 font-bold';
        else if (diffDays <= 3) dueDateColor = 'text-orange-500 dark:text-orange-400 font-bold';
      } else if (!isUnpaid) {
        dueDateColor = 'text-emerald-600 dark:text-emerald-400';
      }

      debtPanel = `
      <div class="mt-2 pt-2 border-t border-dashed border-gray-200 dark:border-darkbg-700 flex flex-wrap items-center justify-between gap-2 bg-gray-50/50 dark:bg-darkbg-900/30 p-2 rounded-lg">
        <div class="text-[11px]">
          <span class="text-gray-400">เงินเชื่อค้างชำระ:</span> <b class="text-red-500 dark:text-red-400 text-sm">฿${formatNumber(balance)}</b>
          <div class="text-[10px] text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-1.5">
            <i class="fa-regular fa-calendar-days text-indigo-400"></i>
            <span>กำหนดจ่าย:</span>
            <b class="${dueDateColor}">${formatDueDateDisplay(bill.dueDate)}</b>
          </div>
        </div>
        <div class="flex items-center gap-2">
          ${countdownHtml}
          ${actionBtn}
        </div>
      </div>`;
    }

    // สร้าง HTML สำหรับรายการสินค้าภายในบิล (ซ่อนไว้)
    let itemsHtml = '';
    bill.items.forEach(s => {
      itemsHtml += `
        <div class="flex justify-between items-center py-1.5 px-2 border-b border-gray-100 dark:border-darkbg-700/50 last:border-b-0">
          <div>
            <div class="font-bold text-[11px] text-gray-800 dark:text-white">${s.brand} ${s.model}</div>
            <div class="text-[9px] text-gray-400 font-mono">IMEI: ${s.imei || '-'} | ${s.spec || '-'}</div>
          </div>
          <div class="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">฿${formatNumber(s.soldPrice)}</div>
        </div>`;
    });

    // เตรียม object ใบเสร็จดิจิทัลสำหรับส่งไปแสดงผล
    const receiptObj = {
      saleId: bill.saleId,
      saleDate: bill.saleDate,
      salesperson: bill.salesperson || '',
      customerName: bill.customerName || '',
      customerPhone: bill.customerPhone || '',
      saleType: bill.saleType || '',
      downPayment: bill.downPayment || 0,
      dueDate: bill.dueDate || '',
      receiptImage: bill.receiptImage || '',
      isBulk: bill.items.length > 1,
      items: bill.items.map(item => ({
        brand: item.brand,
        model: item.model,
        spec: item.spec,
        imei: item.imei,
        soldPrice: item.soldPrice
      })),
      brand: bill.items[0].brand,
      model: bill.items[0].model,
      spec: bill.items[0].spec,
      imei: bill.items[0].imei,
      soldPrice: bill.items[0].soldPrice
    };

    const actionPanelHtml = `
    <div class="mt-2.5 pt-2 border-t border-gray-100 dark:border-darkbg-700/50 flex flex-wrap gap-1.5 justify-end">
      <button onclick='event.stopPropagation(); viewSaleReceipt(${JSON.stringify(receiptObj).replace(/'/g, "&#39;")})' class="text-[10px] bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 px-2.5 py-1 rounded font-bold transition flex items-center gap-1 shadow-sm hover:bg-indigo-100">
        <i class="fa-solid fa-receipt"></i> ดูใบเสร็จ
      </button>
      ${bill.receiptImage ? `
      <button onclick="event.stopPropagation(); viewFullImage('${bill.receiptImage}')" class="text-[10px] bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded font-bold transition flex items-center gap-1 shadow-sm hover:bg-amber-100">
        <i class="fa-solid fa-image"></i> ใบเสร็จ POS
      </button>` : ''}
      <button onclick='event.stopPropagation(); openEditBillModal(${JSON.stringify(receiptObj).replace(/'/g, "&#39;")})' class="text-[10px] bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 px-2.5 py-1 rounded font-bold transition flex items-center gap-1 shadow-sm hover:bg-blue-100">
        <i class="fa-solid fa-pen"></i> แก้ไขบิล
      </button>
      <button onclick="event.stopPropagation(); deleteSaleBill('${bill.saleId}')" class="text-[10px] bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 px-2.5 py-1 rounded font-bold transition flex items-center gap-1 shadow-sm hover:bg-rose-100">
        <i class="fa-solid fa-trash"></i> ลบบิล
      </button>
    </div>`;

    html += `
    <div class="bg-white dark:bg-darkbg-800 border border-gray-200 dark:border-darkbg-700 rounded-2xl shadow-sm hover:border-indigo-400 dark:hover:border-indigo-500/50 transition duration-300 overflow-hidden">
      <!-- หัวบิล (คลิกเพื่อเปิด/ปิด) -->
      <div class="p-3 cursor-pointer select-none" onclick="toggleBillAccordion('bill_${idx}')">
        <div class="flex justify-between items-start mb-1.5">
          <div class="flex items-center gap-2">
            <span class="text-[9px] bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-full font-bold uppercase font-mono">${bill.saleId}</span>
            <span class="text-[9px] bg-gray-100 dark:bg-darkbg-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded font-bold">${itemCount} เครื่อง</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-500/10">${bill.saleType}</span>
            ${payBadge}
          </div>
        </div>
        <div class="flex justify-between items-center">
          <div class="text-xs text-gray-400 font-medium"><i class="fa-solid fa-calendar mr-1 text-[10px]"></i>${bill.saleDate}</div>
          <div class="text-xs font-extrabold text-gray-900 dark:text-white">รวม ฿${formatNumber(bill.totalPrice)}</div>
        </div>
        <div class="mt-1.5 text-xs flex justify-between items-center text-gray-500 dark:text-gray-400">
          <div><i class="fa-regular fa-address-card mr-1 text-indigo-400"></i>ลูกค้า: <b class="text-gray-800 dark:text-gray-200">${bill.customerName || 'ไม่ระบุ'}</b></div>
          <div class="flex items-center gap-1.5">
            <i class="fa-solid fa-phone mr-0.5 text-indigo-400 text-[10px]"></i><b class="text-[11px]">${bill.customerPhone || '-'}</b>
            <i id="bill_${idx}_icon" class="fa-solid fa-chevron-down text-gray-400 text-[10px] ml-1 transition-transform duration-200"></i>
          </div>
        </div>
        ${debtPanel}
      </div>

      <!-- รายละเอียดสินค้าในบิล (Accordion ซ่อน/แสดง) -->
      <div id="bill_${idx}" class="bill-accordion-body" style="max-height:0; overflow:hidden; transition: max-height 0.3s ease;">
        <div class="border-t border-gray-200 dark:border-darkbg-700 bg-gray-50/50 dark:bg-darkbg-900/30 px-3 py-2">
          <div class="text-[9px] text-gray-400 font-bold uppercase mb-1"><i class="fa-solid fa-box-open mr-1"></i>รายการสินค้าในบิล</div>
          ${itemsHtml}
          ${actionPanelHtml}
        </div>
      </div>
    </div>`;
  });
  
  container.innerHTML = html;
}

// ====== ฟังก์ชัน Accordion สำหรับเปิด/ปิดรายละเอียดบิล ======
function toggleBillAccordion(id) {
  const el = document.getElementById(id);
  const icon = document.getElementById(id + '_icon');
  if (!el) return;
  
  if (el.style.maxHeight && el.style.maxHeight !== '0px') {
    // ปิด
    el.style.maxHeight = '0px';
    if (icon) icon.style.transform = 'rotate(0deg)';
  } else {
    // เปิด
    el.style.maxHeight = el.scrollHeight + 'px';
    if (icon) icon.style.transform = 'rotate(180deg)';
  }
}

// ====== 6. สั่งอัปเดตบิลเงินเชื่อเป็นจ่ายแล้ว ======
async function markAsPaid(saleId) {
  if (!confirm(`ยืนยันเปลี่ยนสถานะบิลรหัส "${saleId}" เป็น "จ่ายแล้ว" ใช่หรือไม่?\n(ระบบจะแก้ไขข้อมูลในชีตประวัติการขายทันที)`)) {
    return;
  }
  
  showLoading(true);
  try {
    const res = await API_updatePaymentStatus(saleId, 'จ่ายแล้ว');
    showLoading(false);
    alert(res.message || 'บันทึกสถานะการชำระเงินเรียบร้อยแล้ว!');
    await refreshDashboard();
  } catch (err) {
    showLoading(false);
    console.error('Update payment status error:', err);
    alert('อัปเดตสถานะชำระเงินไม่สำเร็จ: ' + err.message);
  }
}

// ====== 7. จัดเรนเดอร์กราฟวิเคราะห์ยอดขาย 7 วันย้อนหลัง กรองตามแหล่งที่มาเครื่อง ======
function renderCharts(d) {
  const ctx = document.getElementById('dashboardChart');
  if (!ctx) return;

  if (dashboardChart) {
    dashboardChart.destroy();
  }

  const selectedSource = document.getElementById('global_source_filter').value;
  const isDark = document.documentElement.classList.contains('dark');
  const labelColor = isDark ? '#9ca3af' : '#4b5563';
  const gridColor = isDark ? 'rgba(55, 65, 81, 0.3)' : 'rgba(229, 231, 235, 0.5)';

  // คำนวณยอดสรุปตามวันแบบ Dynamic โดยใช้ข้อมูลประวัติการขายเพื่อกรองตามแหล่งที่มา
  const dynamicDays = getDynamicLast7DaysData(selectedSource);

  const labels = dynamicDays.map(day => day.label);
  const revenues = dynamicDays.map(day => day.revenue);
  const profits = dynamicDays.map(day => day.profit);

  dashboardChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'ยอดขาย (บาท)',
          data: revenues,
          backgroundColor: 'rgba(244, 63, 94, 0.85)',
          borderColor: '#f43f5e',
          borderWidth: 1.5,
          borderRadius: 6,
          yAxisID: 'y'
        },
        {
          label: 'กำไร (บาท)',
          data: profits,
          backgroundColor: 'rgba(16, 185, 129, 0.85)',
          borderColor: '#10b981',
          borderWidth: 1.5,
          borderRadius: 6,
          yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: labelColor,
            font: { family: 'Kanit', size: 10 }
          }
        },
        tooltip: {
          titleFont: { family: 'Kanit' },
          bodyFont: { family: 'Kanit' }
        }
      },
      scales: {
        x: {
          ticks: { color: labelColor, font: { family: 'Kanit', size: 9 } },
          grid: { display: false }
        },
        y: {
          ticks: { 
            color: labelColor, 
            font: { family: 'Kanit', size: 9 },
            callback: function(value) {
              return '฿' + Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
            }
          },
          grid: { color: gridColor },
          position: 'left'
        }
      }
    }
  });
}

// ฟังก์ชันจำลองประมวลผลประวัติการขายย้อนหลัง 7 วันแบบกรองแหล่งที่มา
function getDynamicLast7DaysData(selectedSource) {
  const daysData = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // สร้างอาเรย์ย้อนหลัง 7 วัน [ D-6, D-5, ..., D-0 ]
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const pad = (n) => n.toString().padStart(2, '0');
    const dateKey = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
    const fullDateStr = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    daysData.push({ label: dateKey, fullDateStr: fullDateStr, revenue: 0, profit: 0 });
  }
  
  // ประมวลผลจากรายการขายที่มีอยู่ทั้งหมด
  if (salesSummary && salesSummary.salesList) {
    salesSummary.salesList.forEach(s => {
      // กรองแหล่งที่มา
      if (selectedSource) {
        const pSource = getProductSource(s.productId);
        if (pSource !== selectedSource) return;
      }
      
      // ดึงส่วนวันที่จากฟอร์แมต "DD/MM/YYYY HH:MM" หรือ "DD/MM/YYYY"
      const datePart = (s.saleDate || '').split(' ')[0];
      const matchDay = daysData.find(day => day.fullDateStr === datePart);
      if (matchDay) {
        matchDay.revenue += parseFloat(s.soldPrice || 0);
        matchDay.profit += parseFloat(s.profit || 0);
      }
    });
  }
  
  return daysData;
}

// ====== 8. ซิงค์ข้อมูลสินค้าทั้งหมดจาก Google Sheets ขึ้น Firebase ======
async function syncFirebaseFromDashboard() {
  if (!confirm('คุณต้องการซิงค์ข้อมูลสินค้าจาก Google Sheets ไปยัง Firebase ทั้งหมดใหม่หรือไม่?\n(ระบบจะอ่านข้อมูลล่าสุดจากชีตเพื่ออัปเดต Firebase ให้ตรงกัน)')) {
    return;
  }
  
  showLoading(true);
  try {
    const response = await apiPost('syncAllProducts', {});
    showLoading(false);
    if (response.success) {
      alert('ซิงค์ข้อมูลสำเร็จ! จำนวน ' + (response.count || 0) + ' รายการ');
      await refreshDashboard();
    } else {
      alert('ซิงค์ข้อมูลไม่สำเร็จ: ' + (response.error || response.message || 'ไม่ทราบสาเหตุ'));
    }
  } catch (err) {
    showLoading(false);
    console.error('Sync Firebase error:', err);
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + err.message);
  }
}

// ====== ระบบดูใบเสร็จดิจิทัล & รูปภาพหลักฐาน ======
function viewSaleReceipt(s) {
  showReceipt(s);
}

function showReceipt(r) {
  let itemsHtml = '';
  let totalAmount = 0;

  if (r.isBulk && Array.isArray(r.items)) {
    r.items.forEach(item => {
      totalAmount += parseFloat(item.soldPrice) || 0;
      itemsHtml += `
      <div class="bg-gray-50 dark:bg-darkbg-900 p-2.5 rounded mb-1.5 border border-gray-100 dark:border-darkbg-700/50">
        <div class="font-bold text-gray-800 dark:text-white text-sm">${item.brand} ${item.model}</div>
        <div class="text-[11px] text-gray-500 dark:text-gray-400">IMEI: ${item.imei || '-'} | สเปค: ${item.spec || '-'}</div>
        <div class="text-right text-brand-600 dark:text-indigo-400 font-bold text-xs mt-0.5">฿${formatNumber(item.soldPrice)}</div>
      </div>`;
    });
  } else {
    totalAmount = parseFloat(r.soldPrice) || 0;
    itemsHtml = `
    <div class="bg-gray-50 dark:bg-darkbg-900 p-2 rounded border border-gray-100 dark:border-darkbg-700/50">
      <div class="font-bold text-gray-800 dark:text-white text-sm">${r.brand} ${r.model}</div>
      <div class="text-[11px] text-gray-500 dark:text-gray-400">IMEI: ${r.imei || '-'} | สเปค: ${r.spec || '-'}</div>
    </div>`;
  }

  document.getElementById('receiptBody').innerHTML = `
    <div class="text-center border-b dark:border-darkbg-700 pb-3 mb-3">
      <h2 class="text-lg font-bold text-gray-800 dark:text-white">KP Shop</h2>
      <p class="text-xs text-gray-500 dark:text-gray-400">ใบเสร็จดิจิทัล (ผ่านแผงผู้จัดการ)</p>
      <p class="text-xs text-gray-400 mt-1">เลขที่: ${r.saleId}</p>
    </div>
    <div class="space-y-2 text-xs text-gray-700 dark:text-gray-300">
      <div class="flex justify-between"><span class="text-gray-500 dark:text-gray-400">วันที่ขาย:</span><span class="font-medium">${r.saleDate}</span></div>
      <div class="flex justify-between"><span class="text-gray-500 dark:text-gray-400">พนักงานขาย:</span><span class="font-medium">${r.salesperson}</span></div>
      <hr class="dark:border-darkbg-700">
      <div class="space-y-1">
        ${itemsHtml}
      </div>
      <div class="flex justify-between"><span class="text-gray-500 dark:text-gray-400">รูปแบบการขาย:</span><span class="font-medium">${r.saleType}</span></div>
      <hr class="dark:border-darkbg-700">
      <div class="flex justify-between text-base"><span class="font-bold text-gray-800 dark:text-white">ราคาขายรวม:</span><span class="font-bold text-brand-600 dark:text-indigo-400">฿${formatNumber(totalAmount)}</span></div>
      ${r.downPayment > 0 ? `
      <div class="flex justify-between text-sm mt-1"><span class="text-gray-500 dark:text-gray-400">เงินดาวน์:</span><span class="font-medium">฿${formatNumber(r.downPayment)}</span></div>
      <div class="flex justify-between text-sm"><span class="text-gray-500 dark:text-gray-400">ยอดจัด:</span><span class="font-medium text-red-500">฿${formatNumber(totalAmount - r.downPayment)}</span></div>
      ` : ''}
      <hr class="dark:border-darkbg-700">
      ${r.customerName ? `<div class="flex justify-between"><span class="text-gray-500 dark:text-gray-400">ลูกค้า:</span><span class="font-medium">${r.customerName}</span></div>` : ''}
      ${r.customerPhone ? `<div class="flex justify-between"><span class="text-gray-500 dark:text-gray-400">เบอร์โทร:</span><span class="font-medium">${r.customerPhone}</span></div>` : ''}
    </div>
    <div class="text-center mt-4 text-xs text-gray-400"><p>ขอบคุณที่ใช้บริการ KP Shop</p></div>`;
  document.getElementById('receiptModal').classList.remove('hidden');
}

function viewFullImage(url) {
  if (!url) return;
  document.getElementById('imageViewerImg').src = url;
  document.getElementById('imageViewerModal').classList.remove('hidden');
}

function closeImageViewer() {
  document.getElementById('imageViewerModal').classList.add('hidden');
}

// ====== ระบบแก้ไข & ลบบิลการขาย (ผู้จัดการเท่านั้น) ======
let currentEditBill = null;

function openEditBillModal(bill) {
  currentEditBill = bill;
  document.getElementById('edit_billId').value = bill.saleId;
  document.getElementById('edit_customerName').value = bill.customerName || '';
  document.getElementById('edit_customerPhone').value = bill.customerPhone || '';
  document.getElementById('edit_downPayment').value = bill.downPayment || 0;
  document.getElementById('edit_saleType').value = bill.saleType || '';
  document.getElementById('edit_totalPrice').value = bill.soldPrice || '';
  
  // แสดงชื่อพนักงานเป็นข้อความ (readonly - ไม่อนุญาตให้แก้ไข)
  const salespersonDisplay = document.getElementById('edit_salesperson_display');
  if (salespersonDisplay) salespersonDisplay.textContent = bill.salesperson || '(ไม่ระบุ)';
  
  // แสดงรูปใบเสร็จ POS ถ้ามี
  const posReceiptBtn = document.getElementById('edit_posReceiptBtn');
  if (posReceiptBtn) {
    if (bill.receiptImage) {
      posReceiptBtn.classList.remove('hidden');
      posReceiptBtn.onclick = () => viewFullImage(bill.receiptImage);
    } else {
      posReceiptBtn.classList.add('hidden');
    }
  }
  
  // แปลงรูปแบบวันที่ DD/MM/YYYY ของ Google Sheets เป็น YYYY-MM-DD สำหรับอินพุตเดท
  const dDate = parseDueDate(bill.dueDate);
  let dateVal = '';
  if (dDate) {
    const y = dDate.getFullYear();
    const m = String(dDate.getMonth() + 1).padStart(2, '0');
    const d = String(dDate.getDate()).padStart(2, '0');
    dateVal = `${y}-${m}-${d}`;
  }
  document.getElementById('edit_dueDate').value = dateVal;
  
  document.getElementById('editBillModal').classList.remove('hidden');
}

function closeEditBillModal() {
  document.getElementById('editBillModal').classList.add('hidden');
  currentEditBill = null;
}

async function handleEditBillSubmit(e) {
  e.preventDefault();
  if (!currentEditBill) return;
  
  const saleId = document.getElementById('edit_billId').value;
  const customerName = document.getElementById('edit_customerName').value.trim();
  const customerPhone = document.getElementById('edit_customerPhone').value.trim();
  const saleType = document.getElementById('edit_saleType').value.trim();
  const totalPrice = parseFloat(document.getElementById('edit_totalPrice').value) || 0;
  const downPayment = parseFloat(document.getElementById('edit_downPayment').value) || 0;
  const rawDueDate = document.getElementById('edit_dueDate').value; // YYYY-MM-DD
  
  // ไม่เปลี่ยนชื่อพนักงาน (salesperson) ใช้ค่าเดิมเสมอ
  const salesperson = currentEditBill.salesperson || '';
  
  // แปลงรูปแบบวันที่กลับเป็น DD/MM/YYYY สำหรับ Google Sheets
  let dueDate = '';
  if (rawDueDate) {
    const parts = rawDueDate.split('-');
    if (parts.length === 3) {
      dueDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }

  const billData = {
    customerName,
    customerPhone,
    salesperson,
    downPayment,
    dueDate,
    saleType,
    totalPrice,
  };

  showLoading(true);
  try {
    const res = await apiPost('updateSaleBill', { saleId, billData });
    showLoading(false);
    if (res.success) {
      alert(res.message || 'แก้ไขข้อมูลบิลสำเร็จ!');
      closeEditBillModal();
      await refreshDashboard();
    } else {
      alert(res.message || 'แก้ไขข้อมูลบิลไม่สำเร็จ: ' + (res.error || res.message));
    }
  } catch (err) {
    showLoading(false);
    console.error('Update sale bill error:', err);
    alert('เกิดข้อผิดพลาดในการแก้ไขบิล: ' + err.message);
  }
}

async function deleteSaleBill(saleId) {
  if (!confirm(`⚠️ คำเตือนสำคัญ:\nคุณแน่ใจหรือไม่ที่จะทำการลบบิลการขายรหัส "${saleId}"?\n\nการลบนี้จะ:\n1. ลบประวัติการขายใน Google Sheets\n2. คืนสถานะสินค้าในบิลกลับเป็น "พร้อมขาย" (Available) ในคลังสินค้าและ Firebase โดยอัตโนมัติ`)) {
    return;
  }
  
  showLoading(true);
  try {
    const res = await apiPost('deleteSaleBill', { saleId });
    showLoading(false);
    if (res.success) {
      alert(res.message || 'ลบบิลการขายสำเร็จ!');
      await refreshDashboard();
    } else {
      alert(res.message || 'ลบบิลไม่สำเร็จ: ' + (res.error || res.message));
    }
  } catch (err) {
    showLoading(false);
    console.error('Delete sale bill error:', err);
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + err.message);
  }
}

