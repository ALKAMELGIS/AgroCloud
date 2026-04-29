# Agri Cloud

نظام إدارة زراعية مع واجهة **React + Vite** وخادم **Express** اختياري. المستودع منظم كـ **monorepo** (`frontend/` + `backend/`).

📁 راجع [`docs/REPOSITORY_STRUCTURE.md`](docs/REPOSITORY_STRUCTURE.md) لهيكل المجلدات وملاحظات النشر.

## المتطلبات

- Node.js **18+** (يُفضّل LTS)
- npm **9+** (دعم workspaces)

## التثبيت

من **جذر المستودع** (يثبّت كلا الحزمتين):

```bash
npm install
```

## التشغيل للتطوير

- **الواجهة + الخادم معاً:**

```bash
npm run dev
```

- **واجهة فقط (Vite، غالباً `http://localhost:5173`):**

```bash
npm run dev:client
```

- **خادم API فقط (`http://localhost:3001`):**

```bash
npm run dev:server
```

البروكسي في Vite يوجّه `/api` و `/ws` إلى الخادم المحلي.

## البناء للإنتاج

```bash
npm run build
```

المخرجات: **`frontend/dist`**. الخلفية تخدم هذا المجلد عند تشغيل `npm run start -w backend`.

معاينة الواجهة المبنية:

```bash
npm run preview
```

## جودة الكود

```bash
npm run typecheck
npm test
npm run test:e2e
```

## إعدادات النظام في المتصفح

- المفتاح: `agri_system_settings_v1` في **localStorage**.
- التفاصيل السابقة حول الثيم والقوائم لا تزال صالحة؛ المسارات أصبحت تحت `frontend/src/`.

## صلاحيات

- إعدادات النظام: `#/admin/system-settings` — للمستخدمين ذوي الصلاحية المناسبة (انظر الكود في `frontend/src`).

## Docker

```bash
docker build -t agri-cloud .
```

يبني الواجهة ثم يشغّل الخلفية (منفذ **3001**).
