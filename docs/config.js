// docs/config.js
// ====================================================================
// ⚠️  ไฟล์นี้อยู่ใน .gitignore — ห้าม push ขึ้น GitHub !!!
// ====================================================================
// วิธีใช้:
// 1. Copy ไฟล์นี้จาก config.example.js แล้วตั้งชื่อ config.js
// 2. กรอก GAS_URL และ API_KEY ของคุณ
// 3. Save แล้วเปิด index.html ได้เลย
// ====================================================================

const CONFIG = {
    // URL ของ Google Apps Script Web App ของคุณ
    // ได้มาจาก: Apps Script → Deploy → New deployment → Web app → Copy URL
    GAS_URL: 'https://script.google.com/macros/s/AKfycbxURfg9mXnRzBfgOjdhtcmTjB8j52mAn_GDwjlJRDHMEoEsHo6_SF0KyKbLxXSkeTv3/exec',

    // API Key — ต้องตรงกับค่า API_KEY ใน Code.js
    API_KEY: 'KPSHOP168',

    // URL ของ Firebase Realtime Database
    FIREBASE_DB_URL: 'https://kpshop-stock-mobile-phone-default-rtdb.asia-southeast1.firebasedatabase.app/'
};
