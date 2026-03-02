// docs/config.example.js
// ====================================================================
// ✅ ไฟล์นี้เป็นแค่ตัวอย่าง — push ขึ้น GitHub ได้
// ====================================================================
// วิธีใช้:
// 1. Copy ไฟล์นี้ แล้วตั้งชื่อว่า config.js
// 2. กรอก GAS_URL และ API_KEY ของจริงใน config.js
// ====================================================================

const CONFIG = {
    // URL ของ Google Apps Script Web App
    // ได้มาจาก: Apps Script → Deploy → New deployment → Web app → Copy URL
    GAS_URL: 'https://script.google.com/macros/s/YOUR_SCRIPT_DEPLOYMENT_ID/exec',

    // API Key ต้องตรงกับค่า API_KEY ใน Code.js
    API_KEY: 'YOUR_SECRET_API_KEY_HERE'
};
