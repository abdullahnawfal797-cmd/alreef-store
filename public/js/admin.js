// Admin Dashboard Client Logic
let allProducts = [];
let allOrders = [];
let currentSettings = {};

function showToast(text, icon = '✅') {
  const toast = document.getElementById('adminToast');
  document.getElementById('adminToastText').innerText = text;
  document.getElementById('adminToastIcon').innerText = icon;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

// Switch Tabs
function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-pane').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  
  const target = document.getElementById(tabId);
  if (target) target.style.display = 'block';
  if (btn) btn.classList.add('active');

  if (tabId === 'ordersTab') loadOrders();
  if (tabId === 'productsTab') loadProducts();
  if (tabId === 'settingsTab') loadSettings();
}

// Format numbers
function formatNum(n) {
  return Number(n || 0).toLocaleString('ar-SA');
}

// 1. Dashboard Stats
async function loadDashboardStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    const currency = data.currency || 'ريال';

    document.getElementById('statProducts').innerText = data.totalProducts;
    document.getElementById('statActiveProducts').innerText = `${data.activeProducts} بوابة نشطة حالياً`;

    document.getElementById('statRevenue').innerText = `${formatNum(data.totalRevenue)} ${currency}`;
    document.getElementById('statProfit').innerText = `أرباحك التقديرية: ${formatNum(data.totalEstimatedProfit)} ${currency}`;

    document.getElementById('statPendingOrders').innerText = data.pendingOrders;
    document.getElementById('statTotalOrders').innerText = data.totalOrders;
    document.getElementById('statConfirmedOrders').innerText = `${data.confirmedOrders} طلب مؤكد ومستلم`;

    document.getElementById('tabCountProducts').innerText = data.totalProducts;
    document.getElementById('tabCountOrders').innerText = data.totalOrders;
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

// 2. Products Management
async function loadProducts() {
  try {
    const [pRes, cRes, sRes] = await Promise.all([
      fetch('/api/products'),
      fetch('/api/categories'),
      fetch('/api/settings')
    ]);

    allProducts = await pRes.json();
    const categories = await cRes.json();
    currentSettings = await sRes.json();

    // Populate Category Datalist and Select
    populateCategorySelectors(categories);

    renderProductsTable(allProducts);
    loadDashboardStats();
  } catch (err) {
    console.error('Error loading products:', err);
  }
}

function populateCategorySelectors(categories) {
  const datalist = document.getElementById('categoriesList');
  if (datalist) {
    datalist.innerHTML = categories.map(c => `<option value="${c}">`).join('');
  }

  const select = document.getElementById('categoryFilter');
  if (select) {
    select.innerHTML = '<option value="الكل">جميع الفئات</option>' +
      categories.filter(c => c !== 'الكل').map(c => `<option value="${c}">${c}</option>`).join('');
  }
}

function renderProductsTable(products) {
  const tbody = document.getElementById('productsTableBody');
  const currency = currentSettings.currency || 'ريال';

  if (!products || products.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 40px; color: #94a3b8;">
          لا توجد بوابات منتجات مسجلة. اضغط على "+ إضافة بوابة منتج جديدة" للبدء فوراً!
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = products.map(p => {
    const margin = (p.price || 0) - (p.supplierCost || 0);
    const landingUrl = `/p/${p.slug || p.id}`;
    const fullLandingUrl = `${window.location.origin}${landingUrl}`;

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 12px;">
            <img src="${p.image}" alt="${p.title}" style="width: 48px; height: 48px; border-radius: 8px; object-fit: cover; border: 1px solid rgba(255,255,255,0.1);" />
            <div>
              <div style="font-weight: 800; color: #fff; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${p.title}
              </div>
              <small style="color: #64748b;">${p.slug || p.id}</small>
            </div>
          </div>
        </td>
        <td><span style="background: rgba(255,255,255,0.06); padding: 4px 10px; border-radius: 6px; font-weight: 700;">${p.category}</span></td>
        <td style="font-weight: 800; color: #34d399;">${formatNum(p.price)} ${currency}</td>
        <td style="color: #94a3b8;">${formatNum(p.supplierCost)} ${currency}</td>
        <td>
          <span style="font-weight: 800; color: ${margin > 0 ? '#60a5fa' : '#f87171'};">
            ${margin > 0 ? '+' : ''}${formatNum(margin)} ${currency}
          </span>
        </td>
        <td>
          <span style="font-weight: 800; color: ${p.stock <= 5 ? '#f87171' : '#fff'};">
            ${p.stock} قطعة
          </span>
        </td>
        <td>
          <span class="status-badge ${p.active ? 'confirmed' : 'cancelled'}">
            ${p.active ? 'نشط' : 'معطل'}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 6px;">
            <a href="${landingUrl}" target="_blank" class="nav-btn primary" style="padding: 4px 10px; font-size: 0.8rem;" title="فتح صفحة الهبوط">
              فتح ↗
            </a>
            <button type="button" class="nav-btn outline" style="padding: 4px 10px; font-size: 0.8rem;" onclick="copyLandingLink('${p.slug || p.id}')" title="نسخ الرابط لتيك توك وإنستا">
              🔗 نسخ
            </button>
          </div>
        </td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="nav-btn outline" style="padding: 4px 8px; font-size: 0.85rem;" onclick="editProduct('${p.id}')">
              ✏️ تعديل
            </button>
            <button type="button" class="nav-btn outline" style="padding: 4px 8px; font-size: 0.85rem; color: #f87171;" onclick="deleteProduct('${p.id}', '${p.title.replace(/'/g, "\\'")}')">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterProductsTable() {
  const query = (document.getElementById('productSearch').value || '').toLowerCase().trim();
  const category = document.getElementById('categoryFilter').value;

  const filtered = allProducts.filter(p => {
    const matchQuery = !query || p.title.toLowerCase().includes(query) || (p.slug && p.slug.toLowerCase().includes(query));
    const matchCategory = category === 'الكل' || p.category === category;
    return matchQuery && matchCategory;
  });

  renderProductsTable(filtered);
}

function copyLandingLink(slug) {
  const url = `${window.location.origin}/p/${slug}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast('تم نسخ رابط صفحة الهبوط! ضعه الآن في بايو تيك توك أو إعلانك 🚀', '📋');
  }).catch(() => {
    prompt('انسخ الرابط:', url);
  });
}

// 3. Add / Edit Product Modal
function openProductModal(product = null) {
  const modal = document.getElementById('productModal');
  const title = document.getElementById('productModalTitle');
  const form = document.getElementById('productForm');

  form.reset();
  document.getElementById('marginPreview').innerText = '';

  if (product) {
    title.innerText = 'تعديل بوابة المنتج: ' + product.title;
    document.getElementById('prodEditId').value = product.id;
    document.getElementById('prodTitle').value = product.title;
    document.getElementById('prodCategory').value = product.category;
    document.getElementById('prodSlug').value = product.slug || '';
    document.getElementById('prodPrice').value = product.price;
    document.getElementById('prodOriginalPrice').value = product.originalPrice || '';
    document.getElementById('prodSupplierCost').value = product.supplierCost || '';
    document.getElementById('prodStock').value = product.stock;
    document.getElementById('prodBadge').value = product.badge || '';
    document.getElementById('prodImage').value = product.image;
    document.getElementById('prodGallery').value = (product.gallery || []).join('\n');
    document.getElementById('prodBrief').value = product.brief || '';
    document.getElementById('prodFeatures').value = (product.features || []).join('\n');
    document.getElementById('prodActive').checked = product.active !== false;
    calculateMarginPreview();
  } else {
    title.innerText = 'إضافة بوابة منتج جديدة';
    document.getElementById('prodEditId').value = '';
    document.getElementById('prodActive').checked = true;
    document.getElementById('prodStock').value = 50;
  }

  modal.classList.add('active');
}

function closeProductModal() {
  document.getElementById('productModal').classList.remove('active');
}

function calculateMarginPreview() {
  const price = parseFloat(document.getElementById('prodPrice').value) || 0;
  const cost = parseFloat(document.getElementById('prodSupplierCost').value) || 0;
  const currency = currentSettings.currency || 'ريال';
  const preview = document.getElementById('marginPreview');

  if (price > 0 && cost > 0) {
    const margin = price - cost;
    preview.innerText = `عمولتك الصافية المتوقعة: ${margin} ${currency} لكل قطعة`;
  } else {
    preview.innerText = '';
  }
}

function editProduct(id) {
  const p = allProducts.find(item => item.id === id);
  if (p) openProductModal(p);
}

async function saveProduct(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSaveProduct');
  btn.disabled = true;

  const id = document.getElementById('prodEditId').value;
  const galleryText = document.getElementById('prodGallery').value;
  const featuresText = document.getElementById('prodFeatures').value;

  const gallery = galleryText
    .split(/[\n,]/)
    .map(s => s.trim())
    .filter(s => s.length > 5);

  const features = featuresText
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const payload = {
    title: document.getElementById('prodTitle').value.trim(),
    category: document.getElementById('prodCategory').value.trim() || 'عام',
    slug: document.getElementById('prodSlug').value.trim(),
    price: parseFloat(document.getElementById('prodPrice').value) || 0,
    originalPrice: parseFloat(document.getElementById('prodOriginalPrice').value) || 0,
    supplierCost: parseFloat(document.getElementById('prodSupplierCost').value) || 0,
    stock: parseInt(document.getElementById('prodStock').value, 10) || 0,
    badge: document.getElementById('prodBadge').value.trim(),
    image: document.getElementById('prodImage').value.trim(),
    gallery,
    brief: document.getElementById('prodBrief').value.trim(),
    features,
    active: document.getElementById('prodActive').checked
  };

  try {
    const url = id ? `/api/products/${id}` : '/api/products';
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'فشل حفظ المنتج');

    showToast(id ? 'تم تحديث بوابة المنتج بنجاح!' : 'تم نشر بوابة المنتج بنجاح!', '🎉');
    closeProductModal();
    loadProducts();
  } catch (err) {
    alert('خطأ: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

async function deleteProduct(id, title) {
  if (!confirm(`هل أنت متأكد من رغبتك في حذف بوابة المنتج: "${title}"؟`)) {
    return;
  }

  try {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'فشل الحذف');

    showToast('تم حذف المنتج بنجاح', '🗑️');
    loadProducts();
  } catch (err) {
    alert('خطأ: ' + err.message);
  }
}

// 4. Orders Management
async function loadOrders() {
  const status = document.getElementById('orderStatusFilter').value;
  try {
    const url = status && status !== 'all' ? `/api/orders?status=${status}` : '/api/orders';
    const res = await fetch(url);
    allOrders = await res.json();
    renderOrdersTable(allOrders);
  } catch (err) {
    console.error('Error loading orders:', err);
  }
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById('ordersTableBody');
  const storeName = currentSettings.storeName || 'المتجر';

  if (!orders || orders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px; color: #94a3b8;">
          لا توجد طلبات واردة في هذا القسم حالياً. شارك روابط صفحات الهبوط على تيك توك لتستقبل أول طلب!
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = orders.map(o => {
    const orderDate = new Date(o.createdAt).toLocaleDateString('ar-SA', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Clean Phone for WhatsApp (Iraq normalization: 07XXXXXXXX -> 9647XXXXXXXX)
    let cleanPhone = (o.customerPhone || '').replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('07')) {
      cleanPhone = '964' + cleanPhone.slice(1);
    } else if (cleanPhone.startsWith('7')) {
      cleanPhone = '964' + cleanPhone;
    }

    const waMsg = `السلام عليكم ورحمة الله أخي الكريم ${o.customerName}،
معك متجر *${storeName}*.
بخصوص طلبك رقم *#${o.id}* لمنتج: *${o.productTitle}*
- الكمية: ${o.quantity}
- الإجمالي عند الاستلام: ${formatNum(o.totalAmount)} ${o.currency}
- العنوان المسجل: ${o.customerCity}

هل العنوان والطلب مؤكدين للشحن والتوصيل غداً؟`;

    const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waMsg)}`;

    return `
      <tr>
        <td><strong style="color: #60a5fa;">#${o.id}</strong></td>
        <td style="color: #94a3b8; font-size: 0.85rem;">${orderDate}</td>
        <td>
          <div style="font-weight: 700; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${o.productTitle}
          </div>
        </td>
        <td>
          <div style="font-weight: 800; color: #fff;">${o.customerName}</div>
          <div style="color: #94a3b8; font-family: monospace;" dir="ltr">${o.customerPhone}</div>
        </td>
        <td>
          <div style="max-width: 180px; font-size: 0.85rem; color: #cbd5e1;">${o.customerCity}</div>
          ${o.customerNotes ? `<small style="color: #f59e0b; display: block;">ملاحظة: ${o.customerNotes}</small>` : ''}
        </td>
        <td>
          <div style="font-weight: 800; color: #34d399;">${formatNum(o.totalAmount)} ${o.currency}</div>
          <small style="color: #94a3b8;">(${o.quantity} قطعة)</small>
        </td>
        <td>
          <select class="form-select" style="padding: 4px 8px; font-size: 0.85rem;" onchange="updateOrderStatus('${o.id}', this.value)">
            <option value="pending_confirmation" ${o.status === 'pending_confirmation' ? 'selected' : ''}>⏳ بانتظار التأكيد</option>
            <option value="confirmed" ${o.status === 'confirmed' ? 'selected' : ''}>✅ تم التأكيد</option>
            <option value="shipped" ${o.status === 'shipped' ? 'selected' : ''}>🚚 تم الشحن للعميل</option>
            <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>💵 تم الاستلام والدفع</option>
            <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>❌ ملغي</option>
          </select>
        </td>
        <td>
          <a href="${waLink}" target="_blank" class="nav-btn primary" style="padding: 6px 12px; font-size: 0.82rem; background: #25d366; box-shadow: 0 4px 10px rgba(37,211,102,0.3);">
            <span>واتساب العميل 💬</span>
          </a>
        </td>
      </tr>
    `;
  }).join('');
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error('فشل تحديث الحالة');
    showToast('تم تحديث حالة الطلب', '🔄');
    loadDashboardStats();
  } catch (err) {
    alert('خطأ: ' + err.message);
  }
}

// Export Orders to CSV (for the courier/supplier)
function exportOrdersToCSV() {
  if (!allOrders || allOrders.length === 0) {
    alert('لا توجد طلبات لتصديرها حالياً');
    return;
  }

  const headers = ['رقم الطلب', 'تاريخ الطلب', 'المنتج', 'الكمية', 'المبلغ الإجمالي', 'العملة', 'اسم العميل', 'رقم الهاتف', 'المدينة والعنوان', 'ملاحظات العميل', 'حالة الطلب'];
  const rows = allOrders.map(o => [
    `"${o.id}"`,
    `"${new Date(o.createdAt).toLocaleString('ar-SA')}"`,
    `"${(o.productTitle || '').replace(/"/g, '""')}"`,
    o.quantity,
    o.totalAmount,
    `"${o.currency || 'ريال'}"`,
    `"${(o.customerName || '').replace(/"/g, '""')}"`,
    `"${o.customerPhone}"`,
    `"${(o.customerCity || '').replace(/"/g, '""')}"`,
    `"${(o.customerNotes || '').replace(/"/g, '""')}"`,
    `"${o.status}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('تم تحميل ملف الطلبات بنجاح!', '📥');
}

// 5. Settings
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    currentSettings = await res.json();

    document.getElementById('settingStoreName').value = currentSettings.storeName || '';
    document.getElementById('settingWhatsapp').value = currentSettings.whatsappNumber || '';
    document.getElementById('settingCurrency').value = currentSettings.currency || 'د.ع';
    document.getElementById('settingAnnouncement').value = currentSettings.announcement || '';
    document.getElementById('settingAdminPassword').value = '';
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const payload = {
    storeName: document.getElementById('settingStoreName').value.trim(),
    whatsappNumber: document.getElementById('settingWhatsapp').value.trim(),
    currency: document.getElementById('settingCurrency').value.trim(),
    announcement: document.getElementById('settingAnnouncement').value.trim()
  };

  const newPass = document.getElementById('settingAdminPassword').value.trim();
  if (newPass) {
    payload.adminPassword = newPass;
  }

  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('فشل حفظ الإعدادات');
    currentSettings = payload;
    showToast('تم حفظ إعدادات المتجر بنجاح!', '💾');
    document.getElementById('settingAdminPassword').value = '';
    loadDashboardStats();
  } catch (err) {
    alert('خطأ: ' + err.message);
  }
}

// 6. Admin Authentication Handlers
function checkAdminAuth() {
  const token = sessionStorage.getItem('reef_admin_auth');
  const overlay = document.getElementById('adminLoginOverlay');
  if (token) {
    if (overlay) overlay.classList.remove('active');
    loadProducts();
  } else {
    if (overlay) overlay.classList.add('active');
    setTimeout(() => {
      const passInput = document.getElementById('adminLoginPass');
      if (passInput) passInput.focus();
    }, 200);
  }
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const pass = document.getElementById('adminLoginPass').value.trim();
  const errEl = document.getElementById('loginErrorMsg');
  const btn = document.getElementById('btnLoginSubmit');
  
  btn.disabled = true;
  btn.innerText = 'جاري التحقق... ⏳';
  errEl.style.display = 'none';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass })
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || 'كلمة المرور غير صحيحة');
    }

    sessionStorage.setItem('reef_admin_auth', result.token);
    document.getElementById('adminLoginOverlay').classList.remove('active');
    document.getElementById('adminLoginForm').reset();
    showToast('مرحباً بك! تم الدخول إلى لوحة إدارة الريف ستور 🌿', '🔓');
    loadProducts();
  } catch (err) {
    errEl.innerText = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerText = 'فتح لوحة التحكم 🔐';
  }
}

function logoutAdmin() {
  if (confirm('هل تريد قفل لوحة التحكم وتسجيل الخروج؟')) {
    sessionStorage.removeItem('reef_admin_auth');
    document.getElementById('adminLoginOverlay').classList.add('active');
    showToast('تم قفل لوحة التحكم بنجاح', '🔒');
  }
}

// Initial Load with Authentication Check
document.addEventListener('DOMContentLoaded', () => {
  checkAdminAuth();
});
