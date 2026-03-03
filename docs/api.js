// docs/api.js
// ====================================================================
// API Layer — แทนที่ google.script.run ด้วย fetch()
// ทุกฟังก์ชันจะส่ง API Key + Session Token ไปกับทุก request
// ====================================================================

// ====== จัดการ Session ใน localStorage ======
const SESSION_KEY = 'kpshop_session';

function saveSession(token, user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }));
}

function getSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

// ====== Core API Call (GET) ======
async function apiGet(action, extraParams = {}) {
    const session = getSession();
    const token = session ? session.token : '';

    const params = new URLSearchParams({
        action,
        apiKey: CONFIG.API_KEY,
        token,
        ...extraParams
    });

    const url = `${CONFIG.GAS_URL}?${params.toString()}`;

    const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow'
    });

    if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();

    if (data.code === 401) {
        // Token หมดอายุ — ออกจากระบบ
        clearSession();
        window.location.reload();
        throw new Error('Session expired');
    }

    return data;
}

// ====== Core API Call (POST) ======
async function apiPost(action, body = {}) {
    const session = getSession();
    const token = session ? session.token : '';

    const payload = {
        action,
        apiKey: CONFIG.API_KEY,
        token,
        ...body
    };

    const response = await fetch(CONFIG.GAS_URL, {
        method: 'POST',
        redirect: 'follow',
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();

    if (data.code === 401) {
        clearSession();
        window.location.reload();
        throw new Error('Session expired');
    }

    return data;
}

// ====================================================================
// API Functions — ใช้แทน google.script.run.xxx()
// ====================================================================

// Login — ไม่ต้องการ Token เดิม
async function API_login(username, password) {
    return apiPost('login', { username, password });
}

// Logout
async function API_logout() {
    const session = getSession();
    if (session && session.token) {
        try { await apiPost('logout', {}); } catch (e) { /* ไม่เป็นไร */ }
    }
    clearSession();
}

// ดึงสินค้าทั้งหมด
async function API_getProducts() {
    const res = await apiGet('getProducts');
    if (!res.success) throw new Error(res.error || 'getProducts failed');
    return res.data;
}

// ดึง Settings
async function API_getSettings() {
    const res = await apiGet('getSettings');
    if (!res.success) throw new Error(res.error || 'getSettings failed');
    return res.data;
}

// ดึงสรุปยอดขาย Dashboard
async function API_getSalesSummary() {
    const res = await apiGet('getSalesSummary');
    if (!res.success) throw new Error(res.error || 'getSalesSummary failed');
    return res.data;
}

// เพิ่มสินค้า
async function API_addProduct(productData) {
    return apiPost('addProduct', { productData });
}

// แก้ไขสินค้า
async function API_updateProduct(productData) {
    return apiPost('updateProduct', { productData });
}

// ขายสินค้า
async function API_sellProduct(saleData) {
    return apiPost('sellProduct', { saleData });
}

// ลบสินค้า
async function API_deleteProduct(productId) {
    return apiPost('deleteProduct', { productId });
}

// เปลี่ยนสถานะ
async function API_changeStatus(productId, newStatus) {
    return apiPost('changeStatus', { productId, newStatus });
}

// ย้ายคลัง
async function API_moveProduct(productId, targetSheet) {
    return apiPost('moveProduct', { productId, targetSheet });
}

// เพิ่มคอมเมนต์อะไหล่
async function API_addComment(productId, commentText) {
    return apiPost('addComment', { productId, commentText });
}

// ดึงคอมเมนต์
async function API_getComments(productId) {
    const res = await apiGet('getComments', { productId });
    if (!res.success) throw new Error(res.error || 'getComments failed');
    return res.data;
}

// อัปโหลดรูปภาพสินค้า
async function API_uploadImage(dataURI, filename) {
    const res = await apiPost('uploadImage', { dataURI, filename });
    return res.url || null;
}

// อัปโหลดรูปใบเสร็จ
async function API_uploadReceiptImage(dataURI, filename) {
    const res = await apiPost('uploadReceiptImage', { dataURI, filename });
    return res.url || null;
}

// ====================================================================
// อัปโหลดรูปทีละรูปแบบ recursive (แทน uploadImagesToDrive เดิม)
// ====================================================================
async function uploadImagesToDrive(queue) {
    const uploadedUrls = [];
    for (const file of queue) {
        try {
            const url = await API_uploadImage(file.dataURI, file.filename);
            if (url) uploadedUrls.push(url);
        } catch (e) {
            console.error('Upload error:', e);
        }
    }
    return uploadedUrls;
}
