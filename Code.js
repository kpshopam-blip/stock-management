// ====================================================================
// ระบบจัดการสต็อก มือ 2 — KP Shop
// Backend: Google Apps Script REST API
// รองรับ: GitHub Pages Frontend ผ่าน fetch()
// ====================================================================

// ====== ตั้งค่าตัวแปรระบบ ======
const SHEET_ID          = '1UlmIagEWf8fT6VOlzih6HSpgs0ieGqxeTbwwITS1ZM0';
const DB_PRODUCTS       = 'Products';
const DB_USERS          = 'Users';
const DB_SETTINGS       = 'Settings';
const DB_ACTIVITY_LOG   = 'ActivityLog';
const DB_SALES          = 'SalesData';
const IMAGE_FOLDER_ID   = '11kuV-LSUvPIx4d462MFxe8dZmouQy_yD';
const RECEIPT_FOLDER_ID = '1JNBgLibx5avXdXSqcXn5cwD4UzhEJ2gJ';

// ====== ความปลอดภัย ======
// *** เปลี่ยน API_KEY นี้ให้เป็นรหัสลับของคุณเอง (ห้ามบอกใคร) ***
const API_KEY = 'KPSHOP_SECRET_KEY_2024_CHANGE_THIS';

// Session Token มีอายุ 8 ชั่วโมง (วินาที)
const TOKEN_TTL_SECONDS = 28800;

// ====================================================================
// HELPER: สร้าง HTTP Response แบบ JSON พร้อม CORS Headers
// ====================================================================
function createJsonResponse(data) {
  const output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ====================================================================
// HELPER: ตรวจสอบ API Key
// ====================================================================
function validateApiKey(apiKey) {
  return apiKey === API_KEY;
}

// ====================================================================
// HELPER: สร้าง Session Token หลัง Login สำเร็จ
// ====================================================================
function createSessionToken(userObj) {
  const token = Utilities.getUuid();
  const cache = CacheService.getScriptCache();
  // เก็บ JSON ของ user ใน Cache โดยใช้ token เป็น key
  cache.put('token_' + token, JSON.stringify(userObj), TOKEN_TTL_SECONDS);
  return token;
}

// ====================================================================
// HELPER: ตรวจสอบ Token และดึงข้อมูล User กลับมา
// ====================================================================
function getUserFromToken(token) {
  if (!token) return null;
  const cache = CacheService.getScriptCache();
  const userData = cache.get('token_' + token);
  if (!userData) return null;
  try {
    return JSON.parse(userData);
  } catch (e) {
    return null;
  }
}

// ====================================================================
// HELPER: ลบ Token (Logout)
// ====================================================================
function removeToken(token) {
  if (!token) return;
  const cache = CacheService.getScriptCache();
  cache.remove('token_' + token);
}

// ====================================================================
// ENTRY POINT — GET Request (ดึงข้อมูล)
// ====================================================================
function doGet(e) {
  const params = e.parameter || {};
  const action = params.action || '';
  const apiKey = params.apiKey || '';
  const token  = params.token  || '';

  // ตรวจสอบ API Key ก่อนทุกครั้ง
  if (!validateApiKey(apiKey)) {
    return createJsonResponse({ success: false, error: 'Unauthorized: Invalid API Key', code: 401 });
  }

  try {
    switch (action) {

      case 'getProducts': {
        const user = getUserFromToken(token);
        if (!user) return createJsonResponse({ success: false, error: 'Unauthorized: Invalid or expired token', code: 401 });
        const products = getProducts();
        return createJsonResponse({ success: true, data: products });
      }

      case 'getSettings': {
        const user = getUserFromToken(token);
        if (!user) return createJsonResponse({ success: false, error: 'Unauthorized: Invalid or expired token', code: 401 });
        const settings = getSettings();
        return createJsonResponse({ success: true, data: settings });
      }

      case 'getSalesSummary': {
        const user = getUserFromToken(token);
        if (!user) return createJsonResponse({ success: false, error: 'Unauthorized: Invalid or expired token', code: 401 });
        if (user.role !== 'Manager') return createJsonResponse({ success: false, error: 'Forbidden: Manager only', code: 403 });
        const summary = getSalesSummary();
        return createJsonResponse({ success: true, data: summary });
      }

      default:
        return createJsonResponse({ success: false, error: 'Unknown action: ' + action, code: 400 });
    }
  } catch (err) {
    console.error('doGet error:', err);
    return createJsonResponse({ success: false, error: err.toString(), code: 500 });
  }
}

// ====================================================================
// ENTRY POINT — POST Request (แก้ไขข้อมูล)
// ====================================================================
function doPost(e) {
  let body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return createJsonResponse({ success: false, error: 'Invalid JSON body', code: 400 });
  }

  const action = body.action || '';
  const apiKey = body.apiKey || '';
  const token  = body.token  || '';

  // ตรวจสอบ API Key
  if (!validateApiKey(apiKey)) {
    return createJsonResponse({ success: false, error: 'Unauthorized: Invalid API Key', code: 401 });
  }

  try {
    switch (action) {

      // Login ไม่ต้องการ Token (ขอ token ตรงนี้)
      case 'login': {
        const result = checkLogin(body.username, body.password);
        if (result.success) {
          const token = createSessionToken(result.user);
          return createJsonResponse({ success: true, token: token, user: result.user });
        }
        return createJsonResponse({ success: false, message: result.message });
      }

      // Logout — ลบ Token
      case 'logout': {
        removeToken(token);
        return createJsonResponse({ success: true, message: 'ออกจากระบบเรียบร้อย' });
      }

      case 'addProduct': {
        const user = getUserFromToken(token);
        if (!user) return createJsonResponse({ success: false, error: 'Unauthorized', code: 401 });
        if (user.role !== 'Manager') return createJsonResponse({ success: false, error: 'Forbidden: Manager only', code: 403 });
        const result = addProduct(body.productData);
        return createJsonResponse(result);
      }

      case 'updateProduct': {
        const user = getUserFromToken(token);
        if (!user) return createJsonResponse({ success: false, error: 'Unauthorized', code: 401 });
        if (user.role !== 'Manager') return createJsonResponse({ success: false, error: 'Forbidden: Manager only', code: 403 });
        const result = updateProduct(body.productData);
        return createJsonResponse(result);
      }

      case 'sellProduct': {
        const user = getUserFromToken(token);
        if (!user) return createJsonResponse({ success: false, error: 'Unauthorized', code: 401 });
        const result = sellProduct(body.saleData);
        return createJsonResponse(result);
      }

      case 'deleteProduct': {
        const user = getUserFromToken(token);
        if (!user) return createJsonResponse({ success: false, error: 'Unauthorized', code: 401 });
        if (user.role !== 'Manager') return createJsonResponse({ success: false, error: 'Forbidden: Manager only', code: 403 });
        const result = deleteProduct(body.productId, user.name);
        return createJsonResponse(result);
      }

      case 'changeStatus': {
        const user = getUserFromToken(token);
        if (!user) return createJsonResponse({ success: false, error: 'Unauthorized', code: 401 });
        if (user.role !== 'Manager') return createJsonResponse({ success: false, error: 'Forbidden: Manager only', code: 403 });
        const result = changeProductStatus(body.productId, body.newStatus, user.name);
        return createJsonResponse(result);
      }

      case 'uploadImage': {
        const user = getUserFromToken(token);
        if (!user) return createJsonResponse({ success: false, error: 'Unauthorized', code: 401 });
        const url = uploadImage(body.dataURI, body.filename);
        return createJsonResponse({ success: !!url, url: url });
      }

      case 'uploadReceiptImage': {
        const user = getUserFromToken(token);
        if (!user) return createJsonResponse({ success: false, error: 'Unauthorized', code: 401 });
        const url = uploadReceiptImage(body.dataURI, body.filename);
        return createJsonResponse({ success: !!url, url: url });
      }

      default:
        return createJsonResponse({ success: false, error: 'Unknown action: ' + action, code: 400 });
    }
  } catch (err) {
    console.error('doPost error:', err);
    return createJsonResponse({ success: false, error: err.toString(), code: 500 });
  }
}

// ====================================================================
// ฟังก์ชัน Business Logic (เหมือนเดิม ไม่เปลี่ยน)
// ====================================================================

// ====== 2. ฟังก์ชันระบบ Login ======
function checkLogin(username, password) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(DB_USERS);
    if (!sheet) return { success: false, message: "ไม่พบ Sheet 'Users'" };

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      let row = data[i];
      if (row[0].toString() === username.toString() && row[1].toString() === password.toString()) {
        if (row[4] !== 'Active') return { success: false, message: 'บัญชีนี้ถูกระงับการใช้งาน' };
        return {
          success: true,
          user: { username: row[0], name: row[2], role: row[3], saleName: row[2] }
        };
      }
    }
    return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  } catch (error) {
    return { success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล' };
  }
}

// ====== 3. ดึงข้อมูลสินค้าทั้งหมด ======
function getProducts() {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(DB_PRODUCTS);
    if (!sheet) return [];

    const data = sheet.getDataRange().getDisplayValues();
    if (data.length <= 1) return [];

    const products = [];
    for (let i = 1; i < data.length; i++) {
      let row = data[i];
      if (row[0] && row[0] !== 'ID') {
        products.push({
          id:          row[0],
          brand:       row[1],
          model:       row[2],
          ram:         row[3],
          storage:     row[4],
          color:       row[5],
          source:      row[6],
          cost:        parseFloat(row[7].toString().replace(/,/g, '')) || 0,
          price:       parseFloat(row[8].toString().replace(/,/g, '')) || 0,
          imei:        row[9],
          condition:   row[10],
          defect:      row[11],
          images:      row[12] ? row[12].toString().split(',') : [],
          status:      row[13] || 'Available',
          dateAdded:   row[14] || '',
          dateSold:    row[15] || '',
          battery:     row[16] || '',
          accessories: row[17] || '',
          location:    row[18] || '',
          notes:       row[19] || '',
          receiver:    row[20] || ''
        });
      }
    }
    return products.reverse();
  } catch (error) {
    console.error(error);
    return [];
  }
}

// ====== 4. อัปโหลดรูปภาพสินค้า ======
function uploadImage(dataURI, filename) {
  try {
    const folder = DriveApp.getFolderById(IMAGE_FOLDER_ID);
    const parts = dataURI.split(',');
    const mimeString = parts[0].split(':')[1].split(';')[0];
    const base64Data = parts[1];
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeString, filename);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'https://lh3.googleusercontent.com/d/' + file.getId();
  } catch (error) {
    console.error('Upload error:', error);
    return null;
  }
}

// ====== 4.1 อัปโหลดรูปใบเสร็จ POS ======
function uploadReceiptImage(dataURI, filename) {
  try {
    const folder = DriveApp.getFolderById(RECEIPT_FOLDER_ID);
    const parts = dataURI.split(',');
    const mimeString = parts[0].split(':')[1].split(';')[0];
    const base64Data = parts[1];
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeString, filename);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'https://lh3.googleusercontent.com/d/' + file.getId();
  } catch (error) {
    console.error('Upload receipt error:', error);
    return null;
  }
}

// ====== 5. เพิ่มสินค้าใหม่ ======
function addProduct(productData) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(DB_PRODUCTS);
    const now = new Date();
    const id = 'P-' + Utilities.formatDate(now, 'Asia/Bangkok', 'yyyyMMdd-HHmmss');
    const formattedDate = Utilities.formatDate(now, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm');

    const rowData = [
      id, productData.brand, productData.model, productData.ram,
      productData.storage, productData.color, productData.source,
      productData.cost, productData.price, productData.imei,
      productData.condition, productData.defect,
      productData.images ? productData.images.join(',') : '',
      'Available', formattedDate, '',
      productData.battery || '', productData.accessories || '',
      productData.location || '', productData.notes || '',
      productData.receiver || ''
    ];

    if (sheet.getLastRow() === 0) setupInitialSheet();
    sheet.appendRow(rowData);
    logActivity(productData.receiver || '', 'ADD_PRODUCT', id, 'เพิ่มสินค้า: ' + productData.brand + ' ' + productData.model);
    return { success: true, message: 'เพิ่มสินค้าเรียบร้อยแล้ว!' };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'บันทึกข้อมูลไม่สำเร็จ: ' + error.toString() };
  }
}

// ====== 6. อัปเดตข้อมูลสินค้า ======
function updateProduct(productData) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(DB_PRODUCTS);
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === productData.id) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) return { success: false, message: 'ไม่พบสินค้ารหัส ' + productData.id };

    const oldRow = data[rowIndex - 1];
    let finalImages = oldRow[12] ? oldRow[12].toString() : '';
    if (productData.images && productData.images.length > 0) {
      finalImages = productData.images.join(',');
    }

    const rowData = [
      productData.id, productData.brand, productData.model, productData.ram,
      productData.storage, productData.color, productData.source,
      productData.cost, productData.price, productData.imei,
      productData.condition, productData.defect, finalImages,
      oldRow[13], oldRow[14], oldRow[15],
      productData.battery || '', productData.accessories || '',
      productData.location || '', productData.notes || '',
      oldRow[20] || productData.receiver || ''
    ];

    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    logActivity(productData.receiver || '', 'EDIT_PRODUCT', productData.id, 'แก้ไขข้อมูล: ' + productData.brand + ' ' + productData.model);
    return { success: true, message: 'อัปเดตข้อมูลสำเร็จ!' };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'อัปเดตข้อมูลไม่สำเร็จ: ' + error.toString() };
  }
}

// ====== 7. บันทึกการขายสินค้า ======
function sellProduct(saleData) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const prodSheet = ss.getSheetByName(DB_PRODUCTS);
    const prodData = prodSheet.getDataRange().getValues();
    let rowIndex = -1, productRow = null;

    for (let i = 1; i < prodData.length; i++) {
      if (prodData[i][0] === saleData.productId) {
        rowIndex = i + 1;
        productRow = prodData[i];
        break;
      }
    }
    if (rowIndex === -1) return { success: false, message: 'ไม่พบสินค้ารหัส ' + saleData.productId };

    let receiptImageUrl = '';
    if (saleData.receiptImage && saleData.receiptImage.dataURI) {
      receiptImageUrl = uploadReceiptImage(saleData.receiptImage.dataURI, saleData.receiptImage.filename || 'receipt.jpg');
    }

    const now = new Date();
    const saleId = 'SALE-' + Utilities.formatDate(now, 'Asia/Bangkok', 'yyyyMMddHHmmss');
    const saleDate = saleData.saleDate || Utilities.formatDate(now, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm');

    let salesSheet = ss.getSheetByName(DB_SALES);
    if (!salesSheet) {
      salesSheet = ss.insertSheet(DB_SALES);
      salesSheet.appendRow(['SaleID','ProductID','Brand','Model','Spec','IMEI','CostPrice','SoldPrice','Profit','SaleType','Salesperson','SaleDate','CustomerName','CustomerPhone','ReceiptImageURL','RecordedBy','RecordedAt']);
      salesSheet.setFrozenRows(1);
      salesSheet.getRange('A1:Q1').setFontWeight('bold').setBackground('#fce5cd');
    }

    const spec = (productRow[3] || '') + '/' + (productRow[4] || '') + ' ' + (productRow[5] || '');
    const costPrice = parseFloat(productRow[7]) || 0;
    const soldPrice = parseFloat(saleData.soldPrice) || 0;
    const profit = soldPrice - costPrice;

    salesSheet.appendRow([
      saleId, saleData.productId,
      productRow[1] || '', productRow[2] || '', spec.trim(), productRow[9] || '',
      costPrice, soldPrice, profit,
      saleData.saleType || '', saleData.salesperson || '', saleDate,
      saleData.customerName || '', saleData.customerPhone || '',
      receiptImageUrl, saleData.recordedBy || '',
      Utilities.formatDate(now, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss')
    ]);

    prodSheet.getRange(rowIndex, 14).setValue('Sold');
    prodSheet.getRange(rowIndex, 16).setValue(saleDate);

    logActivity(saleData.recordedBy || '', 'SELL_PRODUCT', saleData.productId,
      'ขายสินค้า: ' + productRow[1] + ' ' + productRow[2] + ' ราคา ฿' + soldPrice);

    return {
      success: true,
      message: 'บันทึกการขายเรียบร้อย!',
      receipt: {
        saleId, brand: productRow[1] || '', model: productRow[2] || '',
        spec: spec.trim(), imei: productRow[9] || '',
        costPrice, soldPrice, profit,
        saleType: saleData.saleType || '', salesperson: saleData.salesperson || '',
        saleDate, customerName: saleData.customerName || '',
        customerPhone: saleData.customerPhone || '', location: productRow[18] || ''
      }
    };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'บันทึกการขายไม่สำเร็จ: ' + error.toString() };
  }
}

// ====== 8. เปลี่ยนสถานะสินค้า ======
function changeProductStatus(productId, newStatus, username) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(DB_PRODUCTS);
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === productId) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) return { success: false, message: 'ไม่พบสินค้ารหัส ' + productId };

    const oldStatus = data[rowIndex - 1][13] || 'Available';
    sheet.getRange(rowIndex, 14).setValue(newStatus);

    if (newStatus === 'Sold') {
      const ts = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm');
      sheet.getRange(rowIndex, 16).setValue(ts);
    }
    if (oldStatus === 'Sold' && newStatus !== 'Sold') {
      sheet.getRange(rowIndex, 16).setValue('');
    }

    const statusNames = { Available: 'พร้อมขาย', Reserved: 'ติดจอง', Repair: 'ส่งซ่อม/เคลม', Sold: 'ขายแล้ว' };
    logActivity(username || '', 'CHANGE_STATUS', productId,
      'เปลี่ยนสถานะ: ' + (statusNames[oldStatus] || oldStatus) + ' → ' + (statusNames[newStatus] || newStatus));
    return { success: true, message: 'เปลี่ยนสถานะเป็น "' + (statusNames[newStatus] || newStatus) + '" เรียบร้อย!' };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'เปลี่ยนสถานะไม่สำเร็จ: ' + error.toString() };
  }
}

// ====== 8.1 ลบสินค้า (เฉพาะ Manager) ======
function deleteProduct(productId, username) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(DB_PRODUCTS);
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1, productName = '';

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === productId) {
        rowIndex = i + 1;
        productName = (data[i][1] || '') + ' ' + (data[i][2] || '');
        break;
      }
    }
    if (rowIndex === -1) return { success: false, message: 'ไม่พบสินค้ารหัส ' + productId };

    sheet.deleteRow(rowIndex);
    logActivity(username || '', 'DELETE_PRODUCT', productId, 'ลบสินค้า: ' + productName.trim());
    return { success: true, message: 'ลบสินค้า "' + productName.trim() + '" เรียบร้อยแล้ว!' };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'ลบสินค้าไม่สำเร็จ: ' + error.toString() };
  }
}

// ====== 9. บันทึก Activity Log ======
function logActivity(username, action, productId, details) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let logSheet = ss.getSheetByName(DB_ACTIVITY_LOG);
    if (!logSheet) {
      logSheet = ss.insertSheet(DB_ACTIVITY_LOG);
      logSheet.appendRow(['Timestamp', 'Username', 'Action', 'ProductID', 'Details']);
      logSheet.setFrozenRows(1);
      logSheet.getRange('A1:E1').setFontWeight('bold').setBackground('#f4cccc');
    }
    const ts = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss');
    logSheet.appendRow([ts, username || 'System', action, productId || '', details || '']);
  } catch (e) {
    console.error('Log error:', e);
  }
}

// ====== 10. ดึงข้อมูลตั้งค่า ======
function getSettings() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let settingsSheet = ss.getSheetByName(DB_SETTINGS);
    if (!settingsSheet) {
      setupSettingsSheet(ss);
      settingsSheet = ss.getSheetByName(DB_SETTINGS);
    }

    const data = settingsSheet.getDataRange().getValues();
    const settings = { saleTypes: [], brands: [], locations: [] };
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim() !== '') settings.saleTypes.push(data[i][0].toString().trim());
      if (data[i][1] && data[i][1].toString().trim() !== '') settings.brands.push(data[i][1].toString().trim());
      if (data[i][2] && data[i][2].toString().trim() !== '') settings.locations.push(data[i][2].toString().trim());
    }
    return settings;
  } catch (e) {
    console.error('getSettings error:', e);
    return { saleTypes: [], brands: [], locations: [] };
  }
}

// ====== 11. สร้าง Sheet ตั้งค่า ======
function setupSettingsSheet(ss) {
  if (!ss) ss = SpreadsheetApp.openById(SHEET_ID);
  let settingsSheet = ss.getSheetByName(DB_SETTINGS);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(DB_SETTINGS);
    settingsSheet.appendRow(['รูปแบบการขาย (SaleType)', 'ยี่ห้อ (Brand)', 'สาขา/ที่อยู่ (Location)']);
    settingsSheet.setFrozenRows(1);
    settingsSheet.getRange('A1:C1').setFontWeight('bold').setBackground('#d9d2e9');

    const defaultSaleTypes = ['ขายเงินสด', 'ขายผ่อน', 'ขาย Trade-in', 'ขายออนไลน์'];
    const defaultBrands    = ['Apple', 'Samsung', 'Oppo', 'Vivo', 'Xiaomi', 'Other'];
    const defaultLocations = ['สาขาหลัก', 'สาขา 2'];

    const maxRows = Math.max(defaultSaleTypes.length, defaultBrands.length, defaultLocations.length);
    for (let i = 0; i < maxRows; i++) {
      settingsSheet.appendRow([defaultSaleTypes[i] || '', defaultBrands[i] || '', defaultLocations[i] || '']);
    }
  }
}

// ====== 12. ดึงข้อมูลสรุปยอดขาย (Dashboard) ======
function getSalesSummary() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const now = new Date();
    const todayStr = Utilities.formatDate(now, 'Asia/Bangkok', 'dd/MM/yyyy');
    const monthStr = Utilities.formatDate(now, 'Asia/Bangkok', 'MM/yyyy');

    let salesSheet = ss.getSheetByName(DB_SALES);
    let salesData = [];
    if (salesSheet && salesSheet.getLastRow() > 1) {
      salesData = salesSheet.getRange(2, 1, salesSheet.getLastRow() - 1, 17).getValues();
    }

    let prodSheet = ss.getSheetByName(DB_PRODUCTS);
    let prodData = [];
    if (prodSheet && prodSheet.getLastRow() > 1) {
      prodData = prodSheet.getRange(2, 1, prodSheet.getLastRow() - 1, 21).getValues();
    }

    let stockCount = 0, stockValue = 0;
    prodData.forEach(row => {
      const status = (row[13] || 'Available').toString().toLowerCase();
      if (status !== 'sold') { stockCount++; stockValue += parseFloat(row[7]) || 0; }
    });

    let todaySales = 0, todayRevenue = 0, todayProfit = 0;
    let monthSales = 0, monthRevenue = 0, monthProfit = 0;
    let dailyData = {}, salesList = [], salespersonSet = {};

    salesData.forEach(row => {
      let saleDateFormatted = '', dateOnly = '';
      const rawDate = row[11];
      if (rawDate instanceof Date) {
        saleDateFormatted = Utilities.formatDate(rawDate, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm');
        dateOnly = Utilities.formatDate(rawDate, 'Asia/Bangkok', 'dd/MM/yyyy');
      } else {
        saleDateFormatted = (rawDate || '').toString();
        dateOnly = saleDateFormatted.split(' ')[0];
      }

      const revenue = parseFloat(row[7]) || 0;
      const profit  = parseFloat(row[8]) || 0;
      const salesperson = (row[10] || '').toString();

      if (dateOnly === todayStr) { todaySales++; todayRevenue += revenue; todayProfit += profit; }
      const saleMM = dateOnly.substring(3);
      if (saleMM === monthStr) { monthSales++; monthRevenue += revenue; monthProfit += profit; }

      if (!dailyData[dateOnly]) dailyData[dateOnly] = { count: 0, revenue: 0, profit: 0 };
      dailyData[dateOnly].count++;
      dailyData[dateOnly].revenue += revenue;
      dailyData[dateOnly].profit  += profit;

      if (salesperson) salespersonSet[salesperson] = true;

      salesList.push({
        saleId: (row[0] || '').toString(), productId: (row[1] || '').toString(),
        brand: (row[2] || '').toString(),  model: (row[3] || '').toString(),
        spec: (row[4] || '').toString(),   imei: (row[5] || '').toString(),
        cost: parseFloat(row[6]) || 0,     soldPrice: revenue, profit,
        saleType: (row[9] || '').toString(), salesperson,
        saleDate: saleDateFormatted,
        customerName: (row[12] || '').toString(), customerPhone: (row[13] || '').toString(),
        receiptImage: (row[14] || '').toString(), recordedBy: (row[15] || '').toString(),
        recordedAt: (row[16] || '').toString()
      });
    });

    salesList.reverse();

    let last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
      const dStr = Utilities.formatDate(d, 'Asia/Bangkok', 'dd/MM/yyyy');
      const dayLabel = Utilities.formatDate(d, 'Asia/Bangkok', 'dd/MM');
      const data = dailyData[dStr] || { count: 0, revenue: 0, profit: 0 };
      last7Days.push({ date: dayLabel, count: data.count, revenue: data.revenue, profit: data.profit });
    }

    return {
      today: { sales: todaySales, revenue: todayRevenue, profit: todayProfit },
      month: { sales: monthSales, revenue: monthRevenue, profit: monthProfit },
      stock: { count: stockCount, value: stockValue },
      last7Days, salesList,
      salespersons: Object.keys(salespersonSet)
    };
  } catch (e) {
    console.error('getSalesSummary error:', e);
    return { today: {}, month: {}, stock: {}, last7Days: [], salesList: [], salespersons: [] };
  }
}

// ====== 13. ตั้งค่าฐานข้อมูลทั้งระบบ (รันครั้งแรก) ======
function setupInitialSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  let usersSheet = ss.getSheetByName(DB_USERS);
  if (!usersSheet) {
    usersSheet = ss.insertSheet(DB_USERS);
    usersSheet.appendRow(['Username', 'Password', 'Name', 'Role', 'Status']);
    usersSheet.appendRow(['admin', '1234', 'ผู้จัดการร้าน', 'Manager', 'Active']);
    usersSheet.appendRow(['user', '1234', 'พนักงานขาย', 'Employee', 'Active']);
    usersSheet.setFrozenRows(1);
    usersSheet.getRange('A1:E1').setFontWeight('bold').setBackground('#d9ead3');
  }

  const productHeaders = [
    'ID', 'Brand (ยี่ห้อ)', 'Model (รุ่น)', 'RAM', 'Storage (ความจุ)', 'Color (สี)',
    'Source (แหล่งที่มา)', 'Cost (ต้นทุน)', 'Price (ราคาขาย)', 'IMEI',
    'Condition (สภาพ)', 'Defect (ตำหนิ)', 'Images (URL รูปภาพ)', 'Status (สถานะ)',
    'Date Added (วันที่รับเข้า)', 'Date Sold (วันที่ขาย)',
    'Battery (% แบตเตอรี่)', 'Accessories (อุปกรณ์)', 'Location (สาขา/ที่อยู่)',
    'Notes (หมายเหตุ)', 'Receiver (ผู้รับเข้าสต็อก)'
  ];
  let productsSheet = ss.getSheetByName(DB_PRODUCTS);
  if (!productsSheet) { productsSheet = ss.insertSheet(DB_PRODUCTS); }
  if (productsSheet.getLastRow() === 0) {
    productsSheet.appendRow(productHeaders);
    productsSheet.setFrozenRows(1);
    productsSheet.getRange('A1:U1').setFontWeight('bold').setBackground('#cfe2f3');
  }

  setupSettingsSheet(ss);
  return '✅ เตรียมฐานข้อมูลเรียบร้อย!';
}
