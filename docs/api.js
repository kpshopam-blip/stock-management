// docs/api.js
// ====================================================================
// API Layer — แทนที่ google.script.run ด้วย fetch()
// ทุกฟังก์ชันจะส่ง API Key + Session Token ไปกับทุก request
// ====================================================================

// ====== จัดการ Session ใน sessionStorage (ไม่เก็บข้ามเบราว์เซอร์ เพื่อตัดปัญหา Token ตกค้าง) ======
const SESSION_KEY = 'kpshop_session';

function saveSession(token, user) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }));
    localStorage.removeItem(SESSION_KEY); // ล้างคีย์เก่าที่อาจค้างใน localStorage
}

function getSession() {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
}

// ====== Re-authentication Modal เมื่อ Token หมดอายุ ======
let reLoginPromise = null;

function promptReLogin() {
    if (reLoginPromise) return reLoginPromise;

    reLoginPromise = new Promise((resolve, reject) => {
        const session = getSession();
        const currentUser = session && session.user ? session.user.username || session.user.name || '' : '';

        // สร้าง Overlay Modal
        const overlay = document.createElement('div');
        overlay.id = 'relogin-modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.65);
            backdrop-filter: blur(4px);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Kanit', sans-serif, system-ui;
        `;

        overlay.innerHTML = `
            <div style="background: #ffffff; width: 90%; max-width: 400px; padding: 24px; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3); text-align: center;">
                <div style="width: 56px; height: 56px; background: #fee2e2; color: #ef4444; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 28px;">
                    🔒
                </div>
                <h3 style="margin: 0 0 8px; font-size: 20px; font-weight: 600; color: #1f2937;">เซสชันของคุณหมดอายุ</h3>
                <p style="margin: 0 0 20px; font-size: 14px; color: #6b7280; line-height: 1.5;">
                    ไม่ได้ใช้งานนานเกินกำหนด กรุณากรอกรหัสผ่านเพื่อยืนยันตัวตนและทำรายการต่อโดยไม่ต้องกรอกข้อมูลใหม่
                </p>
                <form id="relogin-form" style="text-align: left;">
                    <div style="margin-bottom: 12px;">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 4px;">ชื่อผู้ใช้งาน</label>
                        <input type="text" id="relogin-username" value="${currentUser}" required style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;" />
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 4px;">รหัสผ่าน</label>
                        <input type="password" id="relogin-password" required placeholder="กรอกรหัสผ่านเพื่อยืนยัน" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;" />
                    </div>
                    <div id="relogin-error" style="color: #ef4444; font-size: 13px; margin-bottom: 12px; display: none;"></div>
                    <div style="display: flex; gap: 8px;">
                        <button type="button" id="relogin-cancel-btn" style="flex: 1; padding: 10px; border: 1px solid #d1d5db; background: #f3f4f6; color: #374151; border-radius: 8px; font-size: 14px; cursor: pointer; font-weight: 500;">ออกจากระบบ</button>
                        <button type="submit" id="relogin-submit-btn" style="flex: 2; padding: 10px; border: none; background: #2563eb; color: #ffffff; border-radius: 8px; font-size: 14px; cursor: pointer; font-weight: 500;">เข้าสู่ระบบและทำต่อ</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(overlay);

        const passwordInput = overlay.querySelector('#relogin-password');
        passwordInput.focus();

        const errorDiv = overlay.querySelector('#relogin-error');
        const form = overlay.querySelector('#relogin-form');
        const cancelBtn = overlay.querySelector('#relogin-cancel-btn');
        const submitBtn = overlay.querySelector('#relogin-submit-btn');

        form.onsubmit = async (e) => {
            e.preventDefault();
            const username = overlay.querySelector('#relogin-username').value.trim();
            const password = passwordInput.value;

            if (!username || !password) return;

            submitBtn.disabled = true;
            submitBtn.textContent = 'กำลังยืนยัน...';
            errorDiv.style.display = 'none';

            try {
                const payload = {
                    action: 'login',
                    apiKey: CONFIG.API_KEY,
                    username,
                    password
                };
                const res = await fetchWithRetry(CONFIG.GAS_URL, {
                    method: 'POST',
                    mode: 'cors',
                    credentials: 'omit',
                    redirect: 'follow',
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.success && data.token) {
                    saveSession(data.token, data.user);
                    document.body.removeChild(overlay);
                    reLoginPromise = null;
                    resolve(true);
                } else {
                    errorDiv.textContent = data.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
                    errorDiv.style.display = 'block';
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'เข้าสู่ระบบและทำต่อ';
                }
            } catch (err) {
                errorDiv.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง';
                errorDiv.style.display = 'block';
                submitBtn.disabled = false;
                submitBtn.textContent = 'เข้าสู่ระบบและทำต่อ';
            }
        };

        cancelBtn.onclick = () => {
            document.body.removeChild(overlay);
            reLoginPromise = null;
            clearSession();
            window.location.reload();
            reject(new Error('User cancelled re-login'));
        };
    });

    return reLoginPromise;
}

// ====== Helper: Fetch พร้อมระบบ Auto-Retry สำหรับ Google Apps Script ======
// แก้ปัญหา Cold Start / Timeout / 404 / 500 ชั่วคราวของ Google Apps Script
async function fetchWithRetry(url, options = {}, maxRetries = 3, retryDelay = 1500) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        // ให้เวลาแต่ละคำขอ 35 วินาที เผื่อ Apps Script รันครั้งแรก (Cold Start)
        const timeoutMs = 35000;
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const fetchOptions = {
                ...options,
                signal: controller.signal
            };

            const response = await fetch(url, fetchOptions);
            clearTimeout(timer);

            // หากสถานะเป็น 404 (ซึ่งมักเกิดจาก proxy redirect ของ Apps Script ยังสร้างไม่เสร็จ) หรือ 5xx
            const retryableStatuses = [404, 408, 429, 500, 502, 503, 504];
            if (!response.ok) {
                if (retryableStatuses.includes(response.status) && attempt < maxRetries) {
                    console.warn(`[KP Shop API] ตรวจพบ HTTP ${response.status} (รอบที่ ${attempt}/${maxRetries}) กำลังลองส่งใหม่อัตโนมัติในอีก ${retryDelay / 1000} วินาที...`);
                    await new Promise(r => setTimeout(r, retryDelay));
                    continue;
                }
                throw new Error(`HTTP Error: ${response.status}`);
            }

            return response;
        } catch (err) {
            clearTimeout(timer);
            lastError = err;

            const isAbort = err.name === 'AbortError' || (err.message && err.message.includes('aborted'));
            const isNetwork = err instanceof TypeError || (err.message && err.message.includes('Failed to fetch'));
            const isRetryable = isAbort || isNetwork || (err.message && (err.message.includes('404') || err.message.includes('50')));

            if (isRetryable && attempt < maxRetries) {
                console.warn(`[KP Shop API] การเชื่อมต่อสะดุด (รอบที่ ${attempt}/${maxRetries}: ${err.message}) กำลังลองใหม่อัตโนมัติ...`);
                await new Promise(r => setTimeout(r, retryDelay));
            } else {
                throw lastError;
            }
        }
    }
    throw lastError;
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

    const response = await fetchWithRetry(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        redirect: 'follow'
    });

    const data = await response.json();

    if (data.code === 401) {
        // Token หมดอายุ — แสดง Modal ป๊อบอัปให้เข้าสู่ระบบใหม่ และ Retry request เดิม
        const reloginSuccess = await promptReLogin();
        if (reloginSuccess) {
            return await apiGet(action, extraParams);
        }
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

    const response = await fetchWithRetry(CONFIG.GAS_URL, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        redirect: 'follow',
        body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.code === 401) {
        // Token หมดอายุ — แสดง Modal ป๊อบอัปให้เข้าสู่ระบบใหม่ และ Retry request เดิม
        const reloginSuccess = await promptReLogin();
        if (reloginSuccess) {
            return await apiPost(action, body);
        }
        throw new Error('Session expired');
    }

    return data;
}

// ====================================================================
// API Functions — ใช้แทน google.script.run.xxx()
// ====================================================================

// Helper: สร้าง Fast Token บน Client-side ลงลายมือชื่อด้วย API_KEY ป้องกันการปลอมแปลง
function createFastSessionToken(user, apiKey) {
    const payload = {
        u: user.username,
        n: user.name,
        r: user.role,
        exp: Date.now() + 24 * 60 * 60 * 1000 // 24 ชั่วโมง
    };
    const jsonStr = JSON.stringify(payload);
    // Base64 encode รองรับอักขระภาษาไทย
    const b64 = btoa(encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));

    let hash = 0;
    const strToSign = b64 + '_' + apiKey;
    for (let i = 0; i < strToSign.length; i++) {
        hash = ((hash << 5) - hash) + strToSign.charCodeAt(i);
        hash |= 0;
    }
    return `kptk.${b64}.${Math.abs(hash).toString(36)}`;
}

// Login — ตรวจสอบผ่าน Firebase ก่อนเพื่อความเร็วระดับเสี้ยววินาที (0.1s)
async function API_login(username, password) {
    const cleanUser = (username || '').toString().trim();
    const cleanPass = (password || '').toString().trim();

    // 1. ตรวจสอบผ่าน Firebase Realtime Database ก่อน (เร็วมาก 100-300ms ไม่ต้องรอ Google Apps Script)
    try {
        if (CONFIG.FIREBASE_DB_URL) {
            const url = `${CONFIG.FIREBASE_DB_URL}users/${encodeURIComponent(cleanUser)}.json`;
            const fbRes = await fetch(url);
            if (fbRes.ok) {
                const userData = await fbRes.json();
                if (userData && userData.username) {
                    if (userData.password !== cleanPass) {
                        return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
                    }
                    if (userData.status && userData.status !== 'Active') {
                        return { success: false, message: 'บัญชีนี้ถูกระงับการใช้งาน' };
                    }

                    const user = {
                        username: userData.username,
                        name: userData.name,
                        role: userData.role,
                        saleName: userData.name
                    };

                    const token = createFastSessionToken(user, CONFIG.API_KEY);

                    return {
                        success: true,
                        token: token,
                        user: user
                    };
                }
            }
        }
    } catch (fbErr) {
        console.warn('Firebase login check failed, falling back to GAS API:', fbErr);
    }

    // 2. Fallback: หากยังไม่ได้ซิงค์ Users ขึ้น Firebase หรือ Firebase ขัดข้อง ให้ยิงไปที่ Apps Script
    return apiPost('login', { username: cleanUser, password: cleanPass });
}

// Logout (Instant Clear Session + Background Notice)
async function API_logout() {
    const session = getSession();
    clearSession();
    if (session && session.token) {
        // ส่งคำขอ logout ไปหลังบ้านแบบฉากหลัง (Fire-and-forget) ไม่รบกวนหน้าจอ
        try {
            fetch(CONFIG.GAS_URL, {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit',
                redirect: 'follow',
                body: JSON.stringify({
                    action: 'logout',
                    apiKey: CONFIG.API_KEY,
                    token: session.token
                })
            }).catch(() => {});
        } catch (e) {}
    }
}

// ดึงสินค้าทั้งหมด
async function API_getProducts() {
    try {
        const session = getSession();
        const user = session ? session.user : null;
        const role = user ? user.role : 'Employee';

        if (!CONFIG.FIREBASE_DB_URL) {
            throw new Error('Firebase DB URL not configured');
        }

        // ดึงข้อมูลตรงๆ จาก Firebase เพื่อความเร็วระดับมิลลิวินาที
        const url = `${CONFIG.FIREBASE_DB_URL}products.json`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Firebase Error: ${response.status}`);
        }
        
        const rawProducts = await response.json() || {};
        
        // แปลงจาก Object { P10001: {...} } เป็น Array และประกอบรหัสโมเดลต่อท้ายชื่อรุ่นสำหรับแสดงผลหน้าร้าน
        const productsList = Object.values(rawProducts).map(prod => {
            const fullModel = prod.modelCode ? `${prod.model} ${prod.modelCode}` : prod.model;
            return {
                ...prod,
                rawModel: prod.model,
                model: fullModel
            };
        });

        // กรองข้อมูลตามบทบาท (Role) ของผู้ใช้งานเหมือนใน Apps Script
        const isManager = role === 'Manager' || role === 'ผู้จัดการ';
        const isTech = role === 'ช่าง' || role === 'Technician';

        const filteredProducts = productsList.filter(prod => {
            const status = prod.status || 'Available';
            const stockType = prod.stockType || 'Products';

            if (isManager) {
                // Manager เห็นสินค้าทุกตัวในทุกคลัง
                return true;
            } else if (isTech) {
                // ช่างเห็นสินค้าในคลังพร้อมขาย (Products) และคลังอะไหล่ (Spare)
                // ยกเว้นสินค้าที่ขายแล้ว (Sold) หรือเอาออกจากระบบแล้ว (Unavailable)
                if (stockType === 'Employee') return false;
                if (status.toLowerCase() === 'sold' || status.toLowerCase() === 'unavailable') {
                    return false;
                }
                return true;
            } else {
                // พนักงานทั่วไป (Employee) หรืออื่นๆ เห็นเฉพาะคลังพร้อมขาย (Products) ที่มีสถานะ 'Available' (พร้อมขาย) เท่านั้น
                if (stockType !== 'Products') return false;
                if (status.toLowerCase() !== 'available') {
                    return false;
                }
                return true;
            }
        });

        // จัดเรียงจากรหัสสินค้าล่าสุดขึ้นก่อน (P-YYYYMMDD-HHmmss)
        return filteredProducts.sort((a, b) => b.id.localeCompare(a.id));
    } catch (e) {
        console.warn('Failed to get products from Firebase, falling back to GAS API:', e);
        // หาก Firebase ขัดข้อง ให้ใช้ Fallback กลับไปดึงจาก Google Apps Script แบบเดิม
        const res = await apiGet('getProducts');
        if (!res.success) throw new Error(res.error || 'getProducts failed');
        return (res.data || []).map(prod => {
            const fullModel = prod.modelCode ? `${prod.model} ${prod.modelCode}` : prod.model;
            return {
                ...prod,
                rawModel: prod.model,
                model: fullModel
            };
        });
    }
}

// ดึง Settings (พร้อม Caching & Firebase Realtime DB เพื่อความเร็วสูงสุด)
const SETTINGS_CACHE_KEY = 'kpshop_settings_cache';

function getCachedSettings() {
    try {
        const cached = localStorage.getItem(SETTINGS_CACHE_KEY);
        return cached ? JSON.parse(cached) : null;
    } catch (e) {
        return null;
    }
}

function saveCachedSettings(data) {
    if (!data) return;
    try {
        localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(data));
    } catch (e) {}
}

async function API_getSettings() {
    const cached = getCachedSettings();

    // 1. ลองดึงจาก Firebase Realtime Database ก่อน (เร็วมาก 10-50ms)
    try {
        const baseUrl = (CONFIG.FIREBASE_DB_URL || '').replace(/\/$/, '');
        if (baseUrl) {
            const fbRes = await fetch(`${baseUrl}/settings.json`);
            if (fbRes.ok) {
                const fbData = await fbRes.json();
                if (fbData && (fbData.brands || fbData.brandModels)) {
                    saveCachedSettings(fbData);
                    return fbData;
                }
            }
        }
    } catch (fbErr) {
        console.warn('ดึง Settings จาก Firebase ล้มเหลว สลับไปใช้ Cache / GAS API:', fbErr);
    }

    // 2. ถ้ามี Cache ในเครื่อง คืนค่า Cache ออกไปทันที
    if (cached) {
        // แอบยิงดึงข้อมูลล่าสุดจาก GAS เบื้องหลังเพื่ออัปเดต Cache ล่าสุด
        apiGet('getSettings').then(res => {
            if (res && res.success && res.data) saveCachedSettings(res.data);
        }).catch(() => {});
        return cached;
    }

    // 3. ถ้าไม่มีทั้ง Firebase และ Cache ค่อยยิงดึงจาก GAS API
    const res = await apiGet('getSettings');
    if (!res.success) throw new Error(res.error || 'getSettings failed');
    saveCachedSettings(res.data);
    return res.data;
}

// ดึงสรุปยอดขาย Dashboard (ดึงตรงจาก Firebase Realtime DB เสี้ยววินาที)
async function API_getSalesSummary() {
    const session = getSession();
    const user = session ? session.user : null;
    const roleStr = (user && user.role ? user.role : '').toString().toLowerCase();
    const isManager = roleStr === 'manager' || roleStr === 'ผู้จัดการ' || roleStr === 'admin';

    // 1. ลองดึงตรงจาก Firebase Realtime Database ก่อน (เร็วมาก 100-300ms)
    try {
        if (CONFIG.FIREBASE_DB_URL) {
            const url = `${CONFIG.FIREBASE_DB_URL}salesSummary.json`;
            const fbRes = await fetch(url);
            if (fbRes.ok) {
                const summary = await fbRes.json();
                if (summary && summary.salesList) {
                    // หากไม่ใช่ Manager ให้กรองเฉพาะยอดขายของตัวเอง และซ่อนกำไร/ต้นทุน
                    if (!isManager && user) {
                        const mySales = (summary.salesList || []).filter(s => s.salesperson === user.name);
                        return {
                            ...summary,
                            today: {
                                ...summary.today,
                                profit: 0
                            },
                            month: {
                                ...summary.month,
                                profit: 0
                            },
                            stock: {
                                ...summary.stock,
                                value: 0
                            },
                            salesList: mySales.map(s => ({ ...s, cost: 0, profit: 0 }))
                        };
                    }
                    return summary;
                }
            }
        }
    } catch (fbErr) {
        console.warn('Firebase salesSummary read failed, falling back to GAS API:', fbErr);
    }

    // 2. Fallback ไปที่ Google Apps Script API
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

// เอาสินค้าออก
async function API_removeProduct(productId, reason) {
    return apiPost('removeProduct', { productId, reason });
}

// ย้ายคลัง
async function API_moveProduct(productId, targetSheet) {
    return apiPost('moveProduct', { productId, targetSheet });
}

// โอนข้ามสาขาหลายรายการ
async function API_bulkTransfer(productIds, targetLocation) {
    return apiPost('bulkTransfer', { productIds, targetLocation });
}

// ดึงประวัติการโอน
async function API_getTransferHistory() {
    const res = await apiGet('getTransferHistory');
    if (!res.success) throw new Error(res.error || 'getTransferHistory failed');
    return res.data;
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
// อัปโหลดรูปภาพแบบ Batch Queue (รอบละ 2 รูปพร้อมกัน) เพื่อความเร็วสูงสุดและไม่ชน Concurrent Limit
// ====================================================================
async function uploadImagesToDrive(queue, onProgress = null) {
    if (!queue || queue.length === 0) return [];
    const uploadedUrls = [];
    const BATCH_SIZE = 2; // ส่งพร้อมกันครั้งละ 2 รูป ปลอดภัยและเร็วขึ้น 2 เท่า
    let completedCount = 0;

    for (let i = 0; i < queue.length; i += BATCH_SIZE) {
        const chunk = queue.slice(i, i + BATCH_SIZE);
        const chunkPromises = chunk.map(async (file, idx) => {
            const fileIndex = i + idx;
            let url = null;
            let attempt = 0;
            const maxAttempts = 2;

            while (attempt < maxAttempts && !url) {
                try {
                    url = await API_uploadImage(file.dataURI, file.filename);
                    if (url) break;
                } catch (err) {
                    console.warn(`[Upload Retry] รูปที่ ${fileIndex + 1}/${queue.length} ลองส่งซ้ำ:`, err);
                }
                attempt++;
                if (!url && attempt < maxAttempts) {
                    await new Promise(r => setTimeout(r, 600));
                }
            }

            completedCount++;
            if (typeof onProgress === 'function') {
                try {
                    onProgress(completedCount, queue.length, url);
                } catch (pErr) {}
            }
            return url;
        });

        const chunkResults = await Promise.all(chunkPromises);
        for (const u of chunkResults) {
            if (u) uploadedUrls.push(u);
        }

        // เว้นระยะสั้นๆ 100ms ระหว่างแต่ละคู่
        if (i + BATCH_SIZE < queue.length) {
            await new Promise(r => setTimeout(r, 100));
        }
    }

    return uploadedUrls;
}

// ล็อกสินค้าชั่วคราว ผ่าน Firebase ตรงๆ เพื่อความเร็วสูงระดับมิลลิวินาที
async function API_lockProduct(productId) {
    const session = getSession();
    const user = session ? session.user : null;
    const username = user ? user.name : 'Unknown';
    
    if (!CONFIG.FIREBASE_DB_URL) {
        throw new Error('Firebase DB URL not configured');
    }
    
    const url = `${CONFIG.FIREBASE_DB_URL}products/${productId}.json`;
    
    try {
        // 1. ตรวจสอบการกดจองชนกันก่อนบันทึกจริง
        const checkRes = await fetch(url);
        if (checkRes.ok) {
            const currentProd = await checkRes.json();
            const now = Date.now();
            if (currentProd && currentProd.lockedBy && currentProd.lockedBy !== username && currentProd.lockExpires > now) {
                return { success: false, message: 'สินค้านี้ถูกจองไว้แล้วโดยคุณ ' + currentProd.lockedBy };
            }
        }

        // 2. บันทึกข้อมูลการจอง
        const payload = {
            lockedBy: username,
            lockExpires: Date.now() + 10 * 60 * 1000 // ล็อก 10 นาที
        };

        const response = await fetch(url, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`Firebase status: ${response.status}`);
        }
        
        return { success: true };
    } catch (e) {
        console.error('Firebase lock error, fallback to GAS:', e);
        // หาก Firebase ขัดข้อง ให้ใช้ระบบสำรองผ่าน Apps Script
        return apiPost('lockProduct', { productId });
    }
}

// ปลดล็อกสินค้า ผ่าน Firebase ตรงๆ
async function API_unlockProduct(productId) {
    if (!CONFIG.FIREBASE_DB_URL) {
        throw new Error('Firebase DB URL not configured');
    }
    
    const url = `${CONFIG.FIREBASE_DB_URL}products/${productId}.json`;
    const payload = {
        lockedBy: null,
        lockExpires: null
    };
    
    try {
        const response = await fetch(url, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`Firebase status: ${response.status}`);
        }
        
        return { success: true };
    } catch (e) {
        console.error('Firebase unlock error, fallback to GAS:', e);
        // สำรอง
        return apiPost('unlockProduct', { productId });
    }
}

// บันทึกขายหลายเครื่องพร้อมกัน
async function API_sellBulkProducts(bulkSaleData) {
    return apiPost('sellBulkProducts', { bulkSaleData });
}

// อัปเดตสถานะชำระเงินของบิลเงินเชื่อ
async function API_updatePaymentStatus(saleId, paymentStatus, paymentSlipDataURI = null) {
    const res = await apiPost('updatePaymentStatus', { saleId, paymentStatus, paymentSlipDataURI });
    if (!res.success) throw new Error(res.message || 'updatePaymentStatus failed');
    return res;
}

// รับคืนสินค้า / แจ้งเคลม / เปลี่ยนเครื่อง
async function API_returnProduct(claimData) {
    return apiPost('returnProduct', { claimData });
}

// อัปเดตเฉพาะรายการรูปภาพสินค้าไปยัง GAS
async function API_updateProductImageUrls(productId, targetSheet, images) {
    return apiPost('updateProductImages', { productId, targetSheet, images });
}

// อัปเดตรายการรูปภาพไปยัง Firebase ตรงๆ
async function API_updateFirebaseProductImages(productId, images) {
    if (!CONFIG.FIREBASE_DB_URL) return;
    const url = `${CONFIG.FIREBASE_DB_URL}products/${productId}/images.json`;
    try {
        await fetch(url, {
            method: 'PUT',
            body: JSON.stringify(images)
        });
    } catch (e) {
        console.warn('Direct Firebase image update failed:', e);
    }
}
