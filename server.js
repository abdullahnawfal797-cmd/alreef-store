const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'store.json');

// Ensure uploads and data directories exist
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Middleware with 50MB limit to support direct high-res device image uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// PostgreSQL Persistent Database Adapter (Render Postgres / Cloud Database)
const { Pool } = require('pg');

let pool = null;
if (process.env.DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    });
    console.log('🔗 PostgreSQL Pool initialized from DATABASE_URL.');
  } catch (err) {
    console.error('Failed to initialize PostgreSQL pool:', err);
  }
}

let cachedData = null;

function readDataFromFile() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return { settings: {}, categories: [], products: [], orders: [] };
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading data:', err);
    return { settings: {}, categories: [], products: [], orders: [] };
  }
}

// Database helper functions (Synchronous in-memory reads for zero-latency)
function readData() {
  if (cachedData) {
    return cachedData;
  }
  cachedData = readDataFromFile();
  return cachedData;
}

function writeData(data) {
  try {
    cachedData = data;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');

    // Asynchronously persist to PostgreSQL if connected
    if (pool) {
      pool.query(
        `INSERT INTO alreef_store (id, data, updated_at)
         VALUES ('main_data', $1, NOW())
         ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = NOW()`,
        [JSON.stringify(data)]
      ).catch(err => {
        console.error('⚠️ Failed to sync data to PostgreSQL:', err.message);
      });
    }
    return true;
  } catch (err) {
    console.error('Error writing data:', err);
    return false;
  }
}

// Initialize and sync database on startup
async function initDatabase() {
  if (!pool) {
    console.log('ℹ️ Running in local file storage mode (data/store.json).');
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alreef_store (
        id VARCHAR(50) PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ PostgreSQL table alreef_store verified.');

    const res = await pool.query(`SELECT data FROM alreef_store WHERE id = 'main_data'`);
    if (res.rows && res.rows.length > 0 && res.rows[0].data) {
      cachedData = res.rows[0].data;
      fs.writeFileSync(DATA_FILE, JSON.stringify(cachedData, null, 2), 'utf8');
      console.log(`✅ Loaded ${cachedData.products?.length || 0} products & ${cachedData.orders?.length || 0} orders from persistent PostgreSQL.`);
    } else {
      console.log('ℹ️ No existing PostgreSQL data found. Seeding from local file...');
      const initial = readDataFromFile();
      await pool.query(
        `INSERT INTO alreef_store (id, data) VALUES ('main_data', $1) ON CONFLICT (id) DO UPDATE SET data = $1`,
        [JSON.stringify(initial)]
      );
      cachedData = initial;
      console.log('✅ Initial seed saved to PostgreSQL.');
    }
  } catch (err) {
    console.error('⚠️ PostgreSQL connection failed on startup:', err.message);
  }
}

// Generate URL slug
function createSlug(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u0621-\u064A\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '') || 'product-' + Date.now();
}

// --- API ENDPOINTS ---

// 1. Settings & Admin Auth
app.get('/api/settings', (req, res) => {
  const data = readData();
  const safeSettings = { ...(data.settings || {}) };
  delete safeSettings.adminPassword; // Don't expose password to public
  res.json(safeSettings);
});

// Admin Login Check
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const data = readData();
  const currentPassword = (data.settings && data.settings.adminPassword) || 'reef2026';

  if (password === currentPassword) {
    res.json({ success: true, token: 'reef_authenticated_' + Date.now() });
  } else {
    res.status(401).json({ success: false, error: 'كلمة المرور غير صحيحة' });
  }
});

app.put('/api/settings', (req, res) => {
  const data = readData();
  data.settings = { ...data.settings, ...req.body };
  writeData(data);
  const safeSettings = { ...data.settings };
  delete safeSettings.adminPassword;
  res.json({ success: true, settings: safeSettings });
});

// Image Upload Endpoint (Direct device photo upload - no external links required)
app.post('/api/upload', (req, res) => {
  try {
    const { image, filename } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'لم يتم إرسال أي صورة' });
    }

    // Check if it's a data URL
    const matches = image.match(/^data:([A-Za-z0-9\-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      // If it's already an HTTP URL or local path, return it directly
      return res.json({ success: true, url: image });
    }

    const mime = matches[1].toLowerCase();
    let ext = 'png';
    if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
    else if (mime.includes('webp')) ext = 'webp';
    else if (mime.includes('gif')) ext = 'gif';
    else if (mime.includes('svg')) ext = 'svg';

    const safeRandom = Math.random().toString(36).substring(2, 8);
    const cleanFileName = `prod_${Date.now()}_${safeRandom}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, cleanFileName);

    const buffer = Buffer.from(matches[2], 'base64');
    fs.writeFileSync(filePath, buffer);

    const fileUrl = `/uploads/${cleanFileName}`;
    res.json({ success: true, url: fileUrl });
  } catch (err) {
    console.error('Image upload error:', err);
    res.status(500).json({ error: 'فشل حفظ الصورة: ' + err.message });
  }
});

// Multiple Images Upload Endpoint
app.post('/api/upload-multiple', (req, res) => {
  try {
    const { images } = req.body;
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'لم يتم إرسال أي صور' });
    }

    const urls = [];
    images.forEach((img, idx) => {
      const matches = img.match(/^data:([A-Za-z0-9\-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        urls.push(img);
        return;
      }

      const mime = matches[1].toLowerCase();
      let ext = 'png';
      if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
      else if (mime.includes('webp')) ext = 'webp';
      else if (mime.includes('gif')) ext = 'gif';

      const safeRandom = Math.random().toString(36).substring(2, 8);
      const cleanFileName = `prod_${Date.now()}_${idx}_${safeRandom}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, cleanFileName);

      const buffer = Buffer.from(matches[2], 'base64');
      fs.writeFileSync(filePath, buffer);
      urls.push(`/uploads/${cleanFileName}`);
    });

    res.json({ success: true, urls });
  } catch (err) {
    console.error('Multiple images upload error:', err);
    res.status(500).json({ error: 'فشل حفظ الصور: ' + err.message });
  }
});

// 2. Categories
app.get('/api/categories', (req, res) => {
  const data = readData();
  res.json(data.categories || []);
});

app.post('/api/categories', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'اسم الفئة مطلوب' });
  const data = readData();
  if (!data.categories.includes(name)) {
    data.categories.push(name);
    writeData(data);
  }
  res.json({ success: true, categories: data.categories });
});

// 3. Products
app.get('/api/products', (req, res) => {
  const data = readData();
  const { category, activeOnly } = req.query;
  let list = data.products || [];

  if (activeOnly === 'true') {
    list = list.filter(p => p.active !== false);
  }
  if (category && category !== 'الكل') {
    list = list.filter(p => p.category === category);
  }

  res.json(list);
});

// Get single product by id or slug
app.get('/api/products/:identifier', (req, res) => {
  const data = readData();
  const identifier = req.params.identifier;
  const product = (data.products || []).find(
    p => p.id === identifier || p.slug === identifier
  );

  if (!product) {
    return res.status(404).json({ error: 'المنتج غير موجود' });
  }

  res.json({
    product,
    settings: data.settings
  });
});

// Add new product
app.post('/api/products', (req, res) => {
  const data = readData();
  const {
    title,
    category,
    price,
    originalPrice,
    stock,
    badge,
    image,
    gallery,
    brief,
    features,
    supplierCost,
    active
  } = req.body;

  if (!title || !price) {
    return res.status(400).json({ error: 'اسم المنتج وسعر البيع مطلوبان' });
  }

  const id = 'prod_' + Date.now();
  const slug = req.body.slug ? createSlug(req.body.slug) : createSlug(title);

  // Ensure slug uniqueness
  let uniqueSlug = slug;
  let counter = 1;
  while (data.products.some(p => p.slug === uniqueSlug)) {
    uniqueSlug = `${slug}-${counter++}`;
  }

  const newProduct = {
    id,
    slug: uniqueSlug,
    title,
    category: category || 'عام',
    price: Number(price) || 0,
    originalPrice: Number(originalPrice) || Number(price),
    stock: Number(stock) || 0,
    badge: badge || '',
    rating: 5.0,
    reviewsCount: Math.floor(Math.random() * 50) + 10,
    image: image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80',
    gallery: Array.isArray(gallery) && gallery.length > 0 ? gallery : [image],
    brief: brief || '',
    features: Array.isArray(features) ? features.filter(f => f && f.trim() !== '') : [],
    supplierCost: Number(supplierCost) || 0,
    active: active !== undefined ? Boolean(active) : true,
    createdAt: new Date().toISOString()
  };

  data.products.unshift(newProduct);
  writeData(data);

  res.status(201).json({ success: true, product: newProduct });
});

// Edit product
app.put('/api/products/:id', (req, res) => {
  const data = readData();
  const id = req.params.id;
  const index = data.products.findIndex(p => p.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'المنتج غير موجود' });
  }

  const current = data.products[index];
  const updatedSlug = req.body.slug ? createSlug(req.body.slug) : current.slug;

  const updatedProduct = {
    ...current,
    ...req.body,
    id: current.id, // don't change id
    slug: updatedSlug,
    price: Number(req.body.price !== undefined ? req.body.price : current.price),
    originalPrice: Number(req.body.originalPrice !== undefined ? req.body.originalPrice : current.originalPrice),
    stock: Number(req.body.stock !== undefined ? req.body.stock : current.stock),
    supplierCost: Number(req.body.supplierCost !== undefined ? req.body.supplierCost : current.supplierCost),
    features: Array.isArray(req.body.features) ? req.body.features.filter(f => f && f.trim() !== '') : current.features,
    updatedAt: new Date().toISOString()
  };

  data.products[index] = updatedProduct;
  writeData(data);

  res.json({ success: true, product: updatedProduct });
});

// Delete product
app.delete('/api/products/:id', (req, res) => {
  const data = readData();
  const id = req.params.id;
  const initialLength = data.products.length;
  data.products = data.products.filter(p => p.id !== id);

  if (data.products.length === initialLength) {
    return res.status(404).json({ error: 'المنتج غير موجود' });
  }

  writeData(data);
  res.json({ success: true, message: 'تم حذف المنتج بنجاح' });
});

// 4. Orders
app.get('/api/orders', (req, res) => {
  const data = readData();
  const { status } = req.query;
  let orders = data.orders || [];

  if (status && status !== 'all') {
    orders = orders.filter(o => o.status === status);
  }

  res.json(orders);
});

// Create new order (from landing page)
app.post('/api/orders', (req, res) => {
  const data = readData();
  const {
    productId,
    customerName,
    customerPhone,
    customerCity,
    customerNotes,
    quantity = 1,
    source = 'landing_page'
  } = req.body;

  if (!productId || !customerName || !customerPhone || !customerCity) {
    return res.status(400).json({ error: 'جميع الحقول الأساسية مطلوبة (الاسم، الهاتف، المدينة/العنوان)' });
  }

  const product = data.products.find(p => p.id === productId || p.slug === productId);
  if (!product) {
    return res.status(404).json({ error: 'المنتج المطلوب غير متاح' });
  }

  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  const totalAmount = (product.price || 0) * qty;

  const newOrder = {
    id: 'ord_' + Math.floor(100000 + Math.random() * 900000),
    productId: product.id,
    productTitle: product.title,
    productImage: product.image,
    customerName: customerName.trim(),
    customerPhone: customerPhone.trim(),
    customerCity: customerCity.trim(),
    customerNotes: (customerNotes || '').trim(),
    quantity: qty,
    unitPrice: product.price,
    totalAmount,
    currency: (data.settings && data.settings.currency) || 'د.ع',
    supplierCost: (product.supplierCost || 0) * qty,
    estimatedProfit: (totalAmount - ((product.supplierCost || 0) * qty)),
    status: 'pending_confirmation', // pending_confirmation, confirmed, shipped, delivered, cancelled
    createdAt: new Date().toISOString(),
    source
  };

  // Decrement stock if available
  if (product.stock > 0) {
    product.stock = Math.max(0, product.stock - qty);
  }

  data.orders.unshift(newOrder);
  writeData(data);

  res.status(201).json({
    success: true,
    order: newOrder,
    whatsappNumber: (data.settings && data.settings.whatsappNumber) || ''
  });
});

// Update order status
app.patch('/api/orders/:id/status', (req, res) => {
  const data = readData();
  const id = req.params.id;
  const { status } = req.body;

  const order = data.orders.find(o => o.id === id);
  if (!order) {
    return res.status(404).json({ error: 'الطلب غير موجود' });
  }

  const previousStatus = order.status;
  order.status = status;
  order.updatedAt = new Date().toISOString();

  // Dynamic Stock Management:
  // If an order is cancelled, return the reserved items to stock
  if (status === 'cancelled' && previousStatus !== 'cancelled') {
    const product = data.products.find(p => p.id === order.productId);
    if (product) {
      product.stock = (product.stock || 0) + (order.quantity || 1);
    }
  } else if (previousStatus === 'cancelled' && status !== 'cancelled') {
    // If order was cancelled and now re-activated/confirmed, deduct stock again
    const product = data.products.find(p => p.id === order.productId);
    if (product) {
      product.stock = Math.max(0, (product.stock || 0) - (order.quantity || 1));
    }
  }

  writeData(data);
  res.json({ success: true, order });
});

// 5. Dashboard Stats
app.get('/api/stats', (req, res) => {
  const data = readData();
  const orders = data.orders || [];
  const products = data.products || [];

  const totalOrders = orders.length;
  const pendingOrders = orders.filter(o => o.status === 'pending_confirmation').length;
  const confirmedOrders = orders.filter(o => o.status === 'confirmed' || o.status === 'delivered' || o.status === 'shipped').length;
  
  const totalRevenue = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  const totalEstimatedProfit = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + (o.estimatedProfit || 0), 0);

  res.json({
    totalProducts: products.length,
    activeProducts: products.filter(p => p.active !== false).length,
    totalOrders,
    pendingOrders,
    confirmedOrders,
    totalRevenue,
    totalEstimatedProfit,
    currency: (data.settings && data.settings.currency) || 'د.ع'
  });
});

// Clean URLs for Landing Pages: /p/:slug or /p/:id
app.get('/p/:slug', (req, res) => {
  res.sendFile('landing.html', { root: path.join(__dirname, 'public') });
});

// Clean Admin Route
app.get('/admin', (req, res) => {
  res.sendFile('admin.html', { root: path.join(__dirname, 'public') });
});

// Bulk Restore / Client Backup Sync Endpoint
app.post('/api/products/bulk-restore', (req, res) => {
  try {
    const { products, categories, settings } = req.body;
    if (!products || !Array.isArray(products)) {
      return res.status(400).json({ error: 'صيغة بيانات المنتجات غير صحيحة' });
    }
    const data = readData();
    data.products = products;
    if (categories && Array.isArray(categories)) {
      data.categories = categories;
    }
    if (settings && typeof settings === 'object') {
      data.settings = { ...data.settings, ...settings };
    }
    writeData(data);
    res.json({ success: true, count: products.length, message: `تمت استعادة ${products.length} منتج بنجاح!` });
  } catch (err) {
    console.error('Bulk restore error:', err);
    res.status(500).json({ error: 'فشل استعادة المنتجات: ' + err.message });
  }
});

// Full Backup Export Endpoint
app.get('/api/backup/export', (req, res) => {
  const data = readData();
  const safeData = {
    ...data,
    settings: { ...(data.settings || {}) }
  };
  delete safeData.settings.adminPassword;
  res.setHeader('Content-Disposition', 'attachment; filename=alreef_store_backup.json');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(safeData, null, 2));
});

// Fallback to Storefront
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: path.join(__dirname, 'public') });
});

// Start Server & Initialize Database
app.listen(PORT, async () => {
  console.log(`===============================================`);
  console.log(`🚀 Landing Hub Server Running on http://localhost:${PORT}`);
  console.log(`🛒 Storefront Catalog: http://localhost:${PORT}`);
  console.log(`⚙️  Admin Control Panel: http://localhost:${PORT}/admin`);
  console.log(`===============================================`);
  await initDatabase();
});
