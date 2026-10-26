const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'store.json');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database helper functions
function readData() {
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

function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing data:', err);
    return false;
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

// 1. Settings
app.get('/api/settings', (req, res) => {
  const data = readData();
  res.json(data.settings || {});
});

app.put('/api/settings', (req, res) => {
  const data = readData();
  data.settings = { ...data.settings, ...req.body };
  writeData(data);
  res.json({ success: true, settings: data.settings });
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
    currency: (data.settings && data.settings.currency) || 'ريال',
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

  order.status = status;
  order.updatedAt = new Date().toISOString();
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
    currency: (data.settings && data.settings.currency) || 'ريال'
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

// Fallback to Storefront
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: path.join(__dirname, 'public') });
});

// Start Server
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Landing Hub Server Running on http://localhost:${PORT}`);
  console.log(`🛒 Storefront Catalog: http://localhost:${PORT}`);
  console.log(`⚙️  Admin Control Panel: http://localhost:${PORT}/admin`);
  console.log(`🎯 Example Landing Page: http://localhost:${PORT}/p/smart-watch-ultra`);
  console.log(`===============================================`);
});
