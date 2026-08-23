/* Copyright (c) 2026 Department of Arabic Language & Literature - All Rights Reserved. */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =====================================================
   1. مجلد الرفوعات
   ===================================================== */
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/* =====================================================
   2. Multer
   ===================================================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `attachment-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
  const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimeType = allowedTypes.test(file.mimetype);
  if (extName && mimeType) return cb(null, true);
  cb(new Error('عفواً، نوع الملف غير مدعوم. يرجى رفع صورة أو ملف PDF/Word فقط.'));
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter
});

/* =====================================================
   3. Firebase
   ===================================================== */
if (!admin.apps.length) {
  const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  const serviceAccountPath = path.join(__dirname, 'config', 'serviceAccountKey.json');

  if (serviceAccountEnv) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountEnv)) });
    console.log('✅ Firebase من متغيرة البيئة');
  } else if (fs.existsSync(serviceAccountPath)) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))) });
    console.log('✅ Firebase من الملف المحلي');
  } else {
    console.error('❌ لم يتم العثور على مفاتيح Firebase');
    process.exit(1);
  }
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

/* =====================================================
   4. التحقق من توكن Firebase للمسؤول
   ===================================================== */
async function verifyAdminToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'يجب تسجيل الدخول أولاً'
    });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.admin = decodedToken;
    next();
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return res.status(401).json({
      success: false,
      error: 'جلسة غير صالحة أو منتهية. يرجى إعادة تسجيل الدخول'
    });
  }
}

/* =====================================================
   5. مفاتيح RSA
   ===================================================== */
const PRIVATE_KEY_PATH = path.join(__dirname, 'config', 'admin_private.pem');
const PUBLIC_KEY_PATH = path.join(__dirname, 'config', 'admin_public.pem');

let ADMIN_PRIVATE_KEY = null;
let ADMIN_PUBLIC_KEY = null;

function loadRSAKeys() {
  try {
    if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
      ADMIN_PRIVATE_KEY = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
      ADMIN_PUBLIC_KEY = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
      console.log('✅ تم تحميل مفاتيح RSA من الملفات');
      return;
    }

    if (process.env.ADMIN_PRIVATE_KEY && process.env.ADMIN_PUBLIC_KEY) {
      ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n');
      ADMIN_PUBLIC_KEY = process.env.ADMIN_PUBLIC_KEY.replace(/\\n/g, '\n');
      console.log('✅ تم تحميل مفاتيح RSA من متغيرات البيئة');
      return;
    }

    console.warn('⚠️ لا توجد مفاتيح RSA → سيتم توليدها الآن');
    generateAndSaveRSAKeys();
  } catch (err) {
    console.error('❌ خطأ في تحميل مفاتيح RSA:', err.message);
    process.exit(1);
  }
}

function generateAndSaveRSAKeys() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const configDir = path.join(__dirname, 'config');
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

  fs.writeFileSync(PRIVATE_KEY_PATH, privateKey);
  fs.writeFileSync(PUBLIC_KEY_PATH, publicKey);

  ADMIN_PRIVATE_KEY = privateKey;
  ADMIN_PUBLIC_KEY = publicKey;

  console.log('✅ تم توليد زوج مفاتيح RSA جديد وحفظه');
  console.log('⚠️  لا تحذف الملفين بعد الآن ولا ترفعهما إلى Git');
}

loadRSAKeys();

/* =====================================================
   6. دوال فك التشفير الهجين
   ===================================================== */
function decryptAESKeyWithRSA(encryptedAESKeyBase64) {
  try {
    const encryptedBuffer = Buffer.from(encryptedAESKeyBase64, 'base64');
    return crypto.privateDecrypt(
      {
        key: ADMIN_PRIVATE_KEY,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      encryptedBuffer
    );
  } catch (err) {
    console.error('❌ فشل فك تشفير مفتاح AES (RSA):', err.message);
    return null;
  }
}

function decryptWithAES(ciphertextBase64, ivBase64, aesKeyBuffer) {
  try {
    const ciphertext = Buffer.from(ciphertextBase64, 'base64');
    const iv = Buffer.from(ivBase64, 'base64');

    const authTag = ciphertext.subarray(ciphertext.length - 16);
    const encryptedData = ciphertext.subarray(0, ciphertext.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKeyBuffer, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('❌ فشل فك تشفير البيانات (AES-GCM):', err.message);
    return null;
  }
}

function hybridDecrypt(encryptedPayload) {
  const { iv, ciphertext, encrypted_aes_key } = encryptedPayload || {};
  if (!iv || !ciphertext || !encrypted_aes_key) {
    console.error('❌ بيانات التشفير الهجين ناقصة');
    return null;
  }

  const aesKeyBuffer = decryptAESKeyWithRSA(encrypted_aes_key);
  if (!aesKeyBuffer) return null;

  return decryptWithAES(ciphertext, iv, aesKeyBuffer);
}

/* =====================================================
   7. Express
   ===================================================== */
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

const ticketWriteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    error: 'تم تجاوز الحد المسموح من الطلبات. يرجى المحاولة بعد 10 دقائق.'
  }
});

/* =====================================================
   8. المفتاح العام
   ===================================================== */
app.get('/api/public-key', (req, res) => {
  try {
    const keyObject = crypto.createPublicKey(ADMIN_PUBLIC_KEY);
    const spkiDer = keyObject.export({ type: 'spki', format: 'der' });
    const spkiBase64 = spkiDer.toString('base64');

    res.json({
      success: true,
      publicKey: spkiBase64,
      algorithm: 'RSA-OAEP',
      hash: 'SHA-256'
    });
  } catch (err) {
    console.error('Error exporting public key:', err);
    res.status(500).json({ success: false, error: 'تعذر تصدير المفتاح العام' });
  }
});
// DELETE /api/admin/reports/:id
app.delete('/api/admin/reports/:id', verifyAdminToken, async (req, res) => {
  try {
    const reportId = req.params.id;
    const docRef = db.collection('reports').doc(reportId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'البلاغ غير موجود' });
    }

    const data = doc.data();

    // حذف الملف المرفق من Firebase Storage إذا كان موجوداً
    if (data.attachment_url) {
      try {
        const fileRef = storage.refFromURL(data.attachment_url);
        await fileRef.delete();
      } catch (storageErr) {
        console.warn('لم يتم العثور على الملف في Storage أو تم حذفه سابقاً:', storageErr.message);
      }
    }

    // حذف المستند من Firestore
    await docRef.delete();

    res.json({ success: true, message: 'تم حذف البلاغ والمرفق بنجاح' });
  } catch (error) {
    console.error('خطأ في عملية الحذف:', error);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء حذف البلاغ' });
  }
});
/* =====================================================
   9. تقديم بلاغ
   - details / module_code / room / category = نصوص عادية
   - البريد فقط يُشفَّر داخل encrypted_payload
   ===================================================== */
app.post('/api/reports', ticketWriteLimiter, upload.single('attachment'), async (req, res) => {
  try {
    const {
      category,
      sub_category,
      module_code,
      room,
      details,              // نص عادي
      iv,
      ciphertext,
      encrypted_aes_key     // تشفير البريد فقط
    } = req.body;

    if (!category || !iv || !ciphertext || !encrypted_aes_key) {
      return res.status(400).json({
        success: false,
        error: 'البيانات غير مكتملة (التصنيف + تشفير البريد مطلوبان)'
      });
    }

    const ticketId = `SANAD_${Date.now()}`;

    const reportData = {
      ticket_id: ticketId,
      category: category || 'عام',
      sub_category: sub_category || null,
      module_code: module_code || null,
      room: room || null,
      details: details || '',   // ظاهر للإدارة مباشرة
      encrypted_payload: {      // يحتوي البريد فقط
        iv,
        ciphertext,
        encrypted_aes_key
      },
      attachment_url: req.file ? `/uploads/${req.file.filename}` : null,
      status: 'PENDING',
      admin_note: 'طلبك قيد الدراسة والمراجعة من قبل الجهة المختصة.',
      timestamp: new Date().toISOString(),
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('reports').doc(ticketId).set(reportData);

    console.log(`✅ تم حفظ تذكرة جديدة: ${ticketId}`);

    res.json({
      success: true,
      message: 'تم استقبال طلبك بنجاح (البريد مشفر، التفاصيل ظاهرة للإدارة)',
      ticket_id: ticketId
    });
  } catch (error) {
    console.error('❌ Error saving report:', error);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء حفظ الطلب' });
  }
});

/* =====================================================
   10. استعلام عن حالة التذكرة
   ===================================================== */
app.get('/api/reports/status/:ticketId', async (req, res) => {
  try {
    const ticketId = req.params.ticketId.trim();
    const doc = await db.collection('reports').doc(ticketId).get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: 'رقم التذكرة غير موجود'
      });
    }

    const data = doc.data();
    res.json({
      success: true,
      ticket_id: data.ticket_id,
      category: data.category,
      sub_category: data.sub_category,
      status: data.status,
      admin_note: data.admin_note || 'لا توجد ملاحظات إضافية',
      timestamp: data.timestamp
    });
  } catch (error) {
    console.error('Error fetching ticket status:', error);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء استرجاع الحالة' });
  }
});

/* =====================================================
   11. مسارات لوحة الإدارة (محمية بـ Firebase Auth)
   ===================================================== */

// جلب كافة التذاكر (تشمل details / module_code / room كنصوص عادية)
app.get('/api/admin/reports', verifyAdminToken, async (req, res) => {
  try {
    const snapshot = await db.collection('reports').orderBy('timestamp', 'desc').get();
    const reports = [];
    snapshot.forEach(doc => reports.push(doc.data()));
    res.json({ success: true, reports });
  } catch (error) {
    console.error('Error fetching admin reports:', error);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء جلب الطلبات' });
  }
});

// فك تشفير البريد فقط
app.post('/api/admin/reports/:ticketId/decrypt', verifyAdminToken, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const doc = await db.collection('reports').doc(ticketId).get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'التذكرة غير موجودة' });
    }

    const data = doc.data();
    const encryptedPayload = data.encrypted_payload;

    if (!encryptedPayload?.iv || !encryptedPayload?.ciphertext || !encryptedPayload?.encrypted_aes_key) {
      return res.status(404).json({
        success: false,
        error: 'لا توجد بيانات بريد مشفرة لهذه التذكرة'
      });
    }

    const decryptedJson = hybridDecrypt(encryptedPayload);

    if (!decryptedJson) {
      return res.status(500).json({
        success: false,
        error: 'فشل فك التشفير. تأكد من أن المفتاح الخاص صحيح'
      });
    }

    let sensitiveData;
    try {
      sensitiveData = JSON.parse(decryptedJson);
    } catch {
      // توافق مع حالة تشفير البريد كنص مباشر
      sensitiveData = { email: decryptedJson };
    }

    res.json({
      success: true,
      email: sensitiveData.email || null,
      data: sensitiveData
    });
  } catch (error) {
    console.error('Error decrypting report:', error);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء فك التشفير' });
  }
});

// تحديث حالة التذكرة
app.put('/api/admin/reports/:ticketId', verifyAdminToken, ticketWriteLimiter, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status, admin_note } = req.body;

    const docRef = db.collection('reports').doc(ticketId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'التذكرة غير موجودة' });
    }

    await docRef.update({
      status: status || 'PENDING',
      admin_note: admin_note || ''
    });

    res.json({ success: true, message: 'تم تحديث الحالة بنجاح' });
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء التحديث' });
  }
});

/* =====================================================
   12. معالجة أخطاء Multer
   ===================================================== */
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: 'حجم الملف يتجاوز 5 ميجابايت' });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
  if (err) return res.status(400).json({ success: false, error: err.message });
  next();
});

/* =====================================================
   13. تشغيل السيرفر
   ===================================================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('===========================================');
  console.log(`🚀 Server running on Port: ${PORT}`);
  console.log('🔐 تشفير البريد فقط (AES-256-GCM + RSA-OAEP)');
  console.log('🔐 Firebase Authentication مفعّل للوحة الإدارة');
  console.log('===========================================');
});