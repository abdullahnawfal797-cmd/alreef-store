// High-Converting Landing Page Client Logic (Iraq Edition)
let currentProduct = null;
let currentSettings = null;
let selectedQuantity = 1;

// Extract slug from URL: /p/smart-watch-ultra or ?p=smart-watch-ultra
function getProductIdentifier() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts[0] === 'p' && pathParts[1]) {
    return decodeURIComponent(pathParts[1]);
  }
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('p') || urlParams.get('id') || 'smart-watch-ultra';
}

// Format numbers
function formatPrice(num) {
  return Number(num || 0).toLocaleString('en-US');
}

// Fetch and render product data
async function loadLandingPage() {
  const identifier = getProductIdentifier();
  try {
    const res = await fetch(`/api/products/${encodeURIComponent(identifier)}`);
    if (res.ok) {
      const data = await res.json();
      currentProduct = data.product;
      currentSettings = data.settings || {};
      renderProductUI();
      initCountdownTimer();
      return;
    }

    // Fallback: Check phone local storage cache
    const raw = localStorage.getItem('alreef_local_products') || localStorage.getItem('alreef_storefront_cache');
    if (raw) {
      const list = JSON.parse(raw);
      const found = Array.isArray(list) ? list.find(p => p.id === identifier || p.slug === identifier) : null;
      if (found) {
        currentProduct = found;
        currentSettings = { storeName: 'الريف ستور | Al-Reef Store', currency: 'د.ع' };
        renderProductUI();
        initCountdownTimer();
        // Silently restore server in background
        fetch('/api/products/bulk-restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ products: list })
        }).catch(() => {});
        return;
      }
    }

    document.body.innerHTML = `
      <div style="text-align: center; padding: 80px 20px; font-family: 'Cairo', sans-serif;">
        <h2 style="color: #e11d48; margin-bottom: 12px; font-weight: 900;">عذراً، هذا المنتج غير متوفر أو تم حذفه</h2>
        <p style="color: #64748b; margin-bottom: 24px; font-weight: 600;">يرجى مراجعة الرابط أو العودة لصفحة البداية</p>
        <a href="/" style="display: inline-block; padding: 14px 28px; background: #4f46e5; color: #fff; border-radius: 999px; text-decoration: none; font-weight: 800;">العودة للمتجر الرئيسي</a>
      </div>
    `;
  } catch (err) {
    console.error('Error loading product:', err);
  }
}

function renderProductUI() {
  const p = currentProduct;
  const s = currentSettings;
  const currency = s.currency || 'د.ع';

  // Page Title
  document.title = `${p.title} | ${s.storeName || 'العلم ستور'}`;

  // Top Bar Announcement
  const topbar = document.getElementById('lpAnnouncement');
  if (topbar && s.announcement) {
    topbar.innerText = s.announcement;
  }

  // Store Brand Nav
  const brandName = document.getElementById('lpBrandName');
  if (brandName) brandName.innerText = s.storeName || 'العلم ستور | Al-Alam Express';

  // Badge & Stock
  const badgeEl = document.getElementById('lpBadge');
  if (badgeEl) {
    if (p.badge) {
      badgeEl.innerText = p.badge;
      badgeEl.style.display = 'inline-block';
    } else {
      badgeEl.style.display = 'none';
    }
  }

  const stockEl = document.getElementById('lpStock');
  const submitBtn = document.getElementById('lpSubmitBtn');
  const stickyBtn = document.querySelector('.lp-sticky-btn');

  if (p.stock <= 0) {
    if (stockEl) {
      stockEl.innerText = 'عذراً، نفدت الكمية بالكامل ❌';
      stockEl.style.color = '#e11d48';
      stockEl.style.background = '#ffe4e6';
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.style.background = '#94a3b8';
      submitBtn.style.animation = 'none';
      submitBtn.style.cursor = 'not-allowed';
      submitBtn.innerHTML = '<span>عذراً، نفدت الكمية حالياً ❌</span>';
    }
    if (stickyBtn) {
      stickyBtn.disabled = true;
      stickyBtn.style.background = '#94a3b8';
      stickyBtn.style.cursor = 'not-allowed';
      stickyBtn.innerText = 'نفدت الكمية ❌';
    }
  } else if (stockEl) {
    stockEl.innerText = `متبقي في المخزون ${p.stock} قطعة فقط ⚠️`;
  }

  // Title & Rating
  document.getElementById('lpTitle').innerText = p.title;
  document.getElementById('lpRatingText').innerText = `${p.rating || 4.9} (${p.reviewsCount || 350}+ عميل راضٍ بالعراق)`;

  // Pricing
  updatePricingDisplay();

  // Images & Gallery
  const mainImg = document.getElementById('lpMainImage');
  mainImg.src = p.image;
  mainImg.alt = p.title;

  const thumbRow = document.getElementById('lpThumbRow');
  thumbRow.innerHTML = '';
  const gallery = (p.gallery && p.gallery.length > 0) ? p.gallery : [p.image];
  
  gallery.forEach((imgUrl, idx) => {
    const thumb = document.createElement('div');
    thumb.className = `lp-thumb-item ${idx === 0 ? 'active' : ''}`;
    thumb.innerHTML = `<img src="${imgUrl}" alt="صورة ${idx + 1}" />`;
    thumb.onclick = () => {
      document.querySelectorAll('.lp-thumb-item').forEach(el => el.classList.remove('active'));
      thumb.classList.add('active');
      mainImg.src = imgUrl;
    };
    thumbRow.appendChild(thumb);
  });

  // Brief & Features
  const briefEl = document.getElementById('lpBrief');
  if (briefEl) briefEl.innerText = p.brief || '';

  const featuresList = document.getElementById('lpFeaturesList');
  featuresList.innerHTML = '';
  if (p.features && p.features.length > 0) {
    p.features.forEach(f => {
      const li = document.createElement('li');
      li.className = 'lp-feature-item';
      li.innerHTML = `
        <span class="lp-check-icon">✓</span>
        <span>${f}</span>
      `;
      featuresList.appendChild(li);
    });
  }

  // Setup WhatsApp Direct Order Button
  setupWhatsAppButton();
}

function updatePricingDisplay() {
  const p = currentProduct;
  const s = currentSettings;
  const currency = s.currency || 'د.ع';
  const unitPrice = p.price;
  const totalPrice = unitPrice * selectedQuantity;
  const oldPrice = (p.originalPrice || unitPrice * 1.6) * selectedQuantity;
  const savedAmount = Math.max(0, oldPrice - totalPrice);

  // Main Card
  document.getElementById('lpCurrentPrice').innerText = formatPrice(totalPrice);
  document.getElementById('lpCurrency').innerText = currency;
  document.getElementById('lpOldPrice').innerText = `${formatPrice(oldPrice)} ${currency}`;
  
  const saveBadge = document.getElementById('lpSaveBadge');
  if (saveBadge) {
    saveBadge.innerText = `وفر ${formatPrice(savedAmount)} ${currency} اليوم`;
  }

  // Sticky bottom bar
  const stickyPrice = document.getElementById('lpStickyPrice');
  if (stickyPrice) {
    stickyPrice.innerText = `${formatPrice(totalPrice)} ${currency}`;
  }

  // Quantity value
  const qtyVal = document.getElementById('lpQtyVal');
  if (qtyVal) qtyVal.innerText = selectedQuantity;
}

// Quantity Stepper
function changeQuantity(delta) {
  selectedQuantity = Math.max(1, selectedQuantity + delta);
  if (currentProduct && currentProduct.stock > 0) {
    selectedQuantity = Math.min(selectedQuantity, currentProduct.stock);
  }
  updatePricingDisplay();
  setupWhatsAppButton();
}

// Sticky CTA scroll to form
function scrollToOrderForm() {
  const orderCard = document.getElementById('lpOrderSection');
  if (orderCard) {
    orderCard.scrollIntoView({ behavior: 'smooth' });
    const nameInput = document.getElementById('orderName');
    if (nameInput) setTimeout(() => nameInput.focus(), 500);
  }
}

// Countdown Timer (Urgency)
function initCountdownTimer() {
  let totalSeconds = 4 * 3600 + 35 * 60 + 20; // 4 hours 35 mins
  const hoursEl = document.getElementById('tHours');
  const minsEl = document.getElementById('tMins');
  const secsEl = document.getElementById('tSecs');

  setInterval(() => {
    if (totalSeconds > 0) {
      totalSeconds--;
    } else {
      totalSeconds = 4 * 3600;
    }
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    if (hoursEl) hoursEl.innerText = String(h).padStart(2, '0');
    if (minsEl) minsEl.innerText = String(m).padStart(2, '0');
    if (secsEl) secsEl.innerText = String(s).padStart(2, '0');
  }, 1000);
}

// WhatsApp Direct Order Link
function setupWhatsAppButton() {
  const btn = document.getElementById('lpBtnWhatsApp');
  if (!btn || !currentProduct) return;

  const phone = (currentSettings && currentSettings.whatsappNumber) || '9647723457175';
  const cleanPhone = phone.replace(/[^0-9]/g, '');

  const p = currentProduct;
  const currency = (currentSettings && currentSettings.currency) || 'د.ع';
  const total = p.price * selectedQuantity;

  const message = `السلام عليكم ورحمة الله،
أود طلب: *${p.title}*
- الكمية: ${selectedQuantity}
- السعر الإجمالي: ${formatPrice(total)} ${currency}
(توصيل لباب البيت والدفع عند الاستلام والمعاينة)

يرجى تأكيد توفر المنتج لإرسال اسمي ومحافظتي.`;

  const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  
  btn.onclick = () => {
    window.open(waUrl, '_blank');
  };
}

// Handle Order Form Submission
async function submitOrder(e) {
  e.preventDefault();
  const submitBtn = document.getElementById('lpSubmitBtn');
  const originalText = submitBtn.innerHTML;

  const customerName = document.getElementById('orderName').value.trim();
  const customerPhone = document.getElementById('orderPhone').value.trim();
  const governorate = document.getElementById('orderGovernorate').value;
  const cityDetail = document.getElementById('orderCity').value.trim();
  const customerNotes = document.getElementById('orderNotes').value.trim();

  if (!customerName || !customerPhone || !governorate || !cityDetail) {
    alert('يرجى اختيار المحافظة وملء جميع الحقول المطلوبة');
    return;
  }

  const fullCity = `${governorate} - ${cityDetail}`;

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span>جاري تثبيت الطلب... ⏳</span>`;

  try {
    const payload = {
      productId: currentProduct.id,
      customerName,
      customerPhone,
      customerCity: fullCity,
      customerNotes,
      quantity: selectedQuantity,
      source: window.location.pathname
    };

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'فشل تسجيل الطلب');
    }

    // Show Success Modal
    showSuccessModal(result.order);
    document.getElementById('lpOrderForm').reset();
  } catch (err) {
    alert('حدث خطأ أثناء إرسال الطلب: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

function showSuccessModal(order) {
  const modal = document.getElementById('lpSuccessModal');
  const detailsEl = document.getElementById('modalOrderDetails');
  
  detailsEl.innerHTML = `
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 18px; border-radius: 16px; margin: 18px 0; text-align: right; font-size: 0.95rem;">
      <p style="margin-bottom: 6px;"><strong>رقم الطلب:</strong> <span style="color: #4f46e5; font-weight: 800;">#${order.id}</span></p>
      <p style="margin-bottom: 6px;"><strong>المنتج:</strong> ${order.productTitle}</p>
      <p style="margin-bottom: 6px;"><strong>الكمية:</strong> ${order.quantity}</p>
      <p style="margin-bottom: 6px;"><strong>المبلغ المطلوب عند الاستلام:</strong> <span style="color: #059669; font-weight: 900; font-size: 1.1rem;">${formatPrice(order.totalAmount)} ${order.currency}</span></p>
      <p style="margin-bottom: 6px;"><strong>الزبون:</strong> ${order.customerName} (${order.customerPhone})</p>
      <p style="margin-bottom: 0;"><strong>عنوان التوصيل:</strong> ${order.customerCity}</p>
    </div>
  `;

  // WhatsApp follow-up button inside modal
  const modalWaBtn = document.getElementById('modalWaFollowup');
  const phone = (currentSettings && currentSettings.whatsappNumber) || '9647723457175';
  const cleanPhone = phone.replace(/[^0-9]/g, '');

  if (modalWaBtn) {
    const msg = `مرحباً، قمت بتأكيد طلبي رقم #${order.id} لمنتج: ${order.productTitle}. أود متابعة الشحن والتوصيل.`;
    modalWaBtn.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    modalWaBtn.style.display = 'inline-flex';
  }

  modal.classList.add('active');
}

function closeSuccessModal() {
  const modal = document.getElementById('lpSuccessModal');
  modal.classList.remove('active');
}

// Lightbox HD Image View
function openLightbox() {
  const mainImg = document.getElementById('lpMainImage');
  const lbModal = document.getElementById('lpImageLightbox');
  const lbImg = document.getElementById('lightboxImg');
  if (mainImg && lbModal && lbImg) {
    lbImg.src = mainImg.src;
    lbModal.classList.add('active');
  }
}

function closeLightbox(e) {
  if (e && e.target && e.target.id === 'lightboxImg') return; // Don't close if clicking on image
  const lbModal = document.getElementById('lpImageLightbox');
  if (lbModal) lbModal.classList.remove('active');
}

// Event Listeners on Load
document.addEventListener('DOMContentLoaded', () => {
  loadLandingPage();

  const form = document.getElementById('lpOrderForm');
  if (form) {
    form.addEventListener('submit', submitOrder);
  }
});
