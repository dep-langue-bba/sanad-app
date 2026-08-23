const admin = require('firebase-admin');
const path = require('path');

// استدعاء ملف المفتاح من نفس المجلد
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

console.log('🔥 تم الاتصال بقاعدة بيانات Firebase Firestore بنجاح.');

module.exports = db;