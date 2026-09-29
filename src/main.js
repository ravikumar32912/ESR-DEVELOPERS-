import confetti from 'canvas-confetti';
import * as THREE from 'three';
import { INITIAL_PLOTS } from './plotsData.js';

// Global State
let plots = [];
let currentView = 'grid'; // 'grid' or 'table'
let current360Spot = 1;
let countdownSeconds = 30;
let countdownTimer = null;
let selectedPlotForBooking = null;

// Three.js 360 Panorama variables
let scene, camera, renderer, sphereMesh;
let isUserInteracting = false;
let onPointerDownPointerX = 0, onPointerDownPointerY = 0;
let lon = 0, onPointerDownLon = 0;
let lat = 0, onPointerDownLat = 0;
let phi = 0, theta = 0;

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  loadPlotData();
  setupEventListeners();
  renderPlots();
  updateStatsCounter();
  initAutoRefreshEngine();
  init360Viewer();
  initLeafletMap();
  initMasterPlanHotspots();
});

// Load Plot Data from LocalStorage or Initial Default
function loadPlotData() {
  const stored = localStorage.getItem('esr_plots_data_v1');
  if (stored) {
    try {
      plots = JSON.parse(stored);
    } catch (e) {
      plots = [...INITIAL_PLOTS];
    }
  } else {
    plots = [...INITIAL_PLOTS];
    savePlotData();
  }
}

function savePlotData() {
  localStorage.setItem('esr_plots_data_v1', JSON.stringify(plots));
}

// Format Currency INR
function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}

// Update Header & Hero Stats Counter
function updateStatsCounter() {
  const total = plots.length;
  const avail = plots.filter(p => p.status === 'available').length;
  const booked = plots.filter(p => p.status === 'booked' || p.status === 'sold').length;

  document.getElementById('totalPlotsCount').textContent = total;
  document.getElementById('availPlotsCount').textContent = avail;
  document.getElementById('bookedPlotsCount').textContent = booked;
}

// Render Plots Grid & Table
function renderPlots() {
  const gridContainer = document.getElementById('plotsGrid');
  const tableBody = document.getElementById('plotsTableBody');
  
  const searchVal = document.getElementById('plotSearchInput').value.toLowerCase();
  const statusVal = document.getElementById('statusFilter').value;
  const facingVal = document.getElementById('facingFilter').value;
  const sizeVal = document.getElementById('sizeFilter').value;

  // Filter Plots
  const filtered = plots.filter(plot => {
    // Search filter
    const matchesSearch = plot.number.includes(searchVal) || plot.phase.toLowerCase().includes(searchVal);
    
    // Status filter
    const matchesStatus = statusVal === 'all' || plot.status === statusVal;

    // Facing filter
    const matchesFacing = facingVal === 'all' || plot.facing.includes(facingVal);

    // Size filter
    let matchesSize = true;
    if (sizeVal === '150-200') matchesSize = plot.sqYards >= 150 && plot.sqYards <= 200;
    else if (sizeVal === '201-300') matchesSize = plot.sqYards >= 201 && plot.sqYards <= 300;
    else if (sizeVal === '301+') matchesSize = plot.sqYards >= 301;

    return matchesSearch && matchesStatus && matchesFacing && matchesSize;
  });

  // Render Grid Cards
  gridContainer.innerHTML = '';
  if (filtered.length === 0) {
    gridContainer.innerHTML = `
      <div class="col-12 text-center py-5 glass-card w-100" style="grid-column: 1 / -1;">
        <i class="fa-solid fa-face-frown text-gold fs-4 mb-2"></i>
        <h3>No Plots Found Matching Criteria</h3>
        <p class="text-muted text-sm">Try changing your filters or searching for another plot number.</p>
      </div>
    `;
  } else {
    filtered.forEach(plot => {
      const totalPrice = plot.sqYards * plot.pricePerSqYd;
      
      let statusBadgeClass = 'badge-available';
      let statusText = '🟢 Available';
      if (plot.status === 'booked') {
        statusBadgeClass = 'badge-booked';
        statusText = '🟡 Pre-Booked';
      } else if (plot.status === 'sold') {
        statusBadgeClass = 'badge-sold';
        statusText = '🔴 Sold Out';
      }

      const card = document.createElement('div');
      card.className = 'plot-card glass-card';
      card.innerHTML = `
        <div class="plot-card-header">
          <div class="d-flex align-center gap-2">
            <span class="plot-number-title text-gold">PLOT #${plot.number}</span>
            ${plot.isCorner ? '<span class="badge badge-gold text-xs">Corner Plot</span>' : ''}
          </div>
          <span class="plot-badge-status ${statusBadgeClass}">${statusText}</span>
        </div>

        <div class="plot-card-body">
          <div class="text-xs text-muted mb-2"><i class="fa-solid fa-layer-group me-1"></i> ${plot.phase}</div>
          
          <!-- DISPLAY SQUARE YARDS PROMINENTLY BELOW DETAILS -->
          <div class="plot-sqyd-highlight">
            <div class="sqyd-label">TOTAL PLOT AREA</div>
            <div class="sqyd-val">${plot.sqYards} <span class="text-xs text-muted">SQ. YARDS</span></div>
            <div class="text-xs text-gold-light mt-1">Dimensions: ${plot.dimensions}</div>
          </div>

          <div class="plot-spec-list">
            <div class="spec-item">
              <span class="spec-key">Facing Direction</span>
              <span class="spec-val"><i class="fa-solid fa-compass me-1 text-gold"></i> ${plot.facing}</span>
            </div>
            <div class="spec-item">
              <span class="spec-key">Road Approach</span>
              <span class="spec-val"><i class="fa-solid fa-road me-1 text-gold"></i> ${plot.roadWidth}</span>
            </div>
          </div>

          <div class="plot-price-box">
            <div class="rate-per-yd">
              <span>Price / Sq. Yard:</span>
              <strong class="text-light">${formatINR(plot.pricePerSqYd)}</strong>
            </div>
            <div class="d-flex justify-between align-center mt-1">
              <span class="text-xs text-muted">Total Calculated Price:</span>
              <div class="total-calculated-price">${formatINR(totalPrice)}</div>
            </div>
          </div>

          <div class="plot-card-actions">
            ${plot.status === 'available' ? `
              <button class="btn btn-gold w-100 book-plot-btn" data-plot-id="${plot.id}">
                <i class="fa-solid fa-bolt me-1"></i> Pre-Book Plot
              </button>
            ` : `
              <button class="btn btn-outline-light w-100" disabled>
                ${plot.status === 'booked' ? 'Pre-Booked' : 'Sold Out'}
              </button>
            `}
            <a href="https://wa.me/919876543210?text=Hi%20ESR%20Developers,%20I%20want%20details%20about%20Plot%20${plot.number}%20(${plot.sqYards}%20Sq.Yds)" target="_blank" class="btn btn-whatsapp btn-sm" title="WhatsApp Owner">
              <i class="fa-brands fa-whatsapp"></i>
            </a>
          </div>
        </div>
      `;
      gridContainer.appendChild(card);
    });
  }

  // Render Table Body
  tableBody.innerHTML = '';
  filtered.forEach(plot => {
    const totalPrice = plot.sqYards * plot.pricePerSqYd;
    let statusBadgeClass = 'badge-available';
    let statusText = 'Available';
    if (plot.status === 'booked') { statusBadgeClass = 'badge-booked'; statusText = 'Pre-Booked'; }
    if (plot.status === 'sold') { statusBadgeClass = 'badge-sold'; statusText = 'Sold Out'; }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong class="text-gold">#${plot.number}</strong></td>
      <td>${plot.phase}</td>
      <td>${plot.dimensions}</td>
      <td><strong class="text-gold-light">${plot.sqYards} Sq.Yds</strong></td>
      <td>${plot.facing}</td>
      <td>${formatINR(plot.pricePerSqYd)} / Sq.Yd</td>
      <td><strong class="text-gold">${formatINR(totalPrice)}</strong></td>
      <td><span class="plot-badge-status ${statusBadgeClass}">${statusText}</span></td>
      <td>
        ${plot.status === 'available' ? `
          <button class="btn btn-gold btn-xs book-plot-btn" data-plot-id="${plot.id}">Pre-Book</button>
        ` : `<span class="text-xs text-muted">N/A</span>`}
      </td>
    `;
    tableBody.appendChild(tr);
  });

  // Attach Book Plot Button Click Handlers
  document.querySelectorAll('.book-plot-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const plotId = e.currentTarget.getAttribute('data-plot-id');
      openBookingModal(plotId);
    });
  });
}

// 30-Second Auto Update Refresh Engine
function initAutoRefreshEngine() {
  const countdownEl = document.getElementById('syncCountdown');
  const tickerCountdownEl = document.getElementById('tickerCountdown');
  const timerFillEl = document.getElementById('timerProgressFill');
  const liveTickerMsg = document.getElementById('liveTickerMsg');

  const tickerMessages = [
    "Simulating real-time buyer inquiries for Phase 1 Royal Enclave...",
    "Live DTCP inventory sync complete: 42 plots available for registration.",
    "Notice: Plot #104 East facing plot has high inquiry volume!",
    "Site visits scheduled today with Chairman Pinamareddy Eshwarudu garu.",
    "Updating price indices per square yard: Best investment return layout."
  ];

  countdownTimer = setInterval(() => {
    countdownSeconds--;
    if (countdownEl) countdownEl.textContent = countdownSeconds;
    if (tickerCountdownEl) tickerCountdownEl.textContent = countdownSeconds + 's';
    
    if (timerFillEl) {
      const pct = (countdownSeconds / 30) * 100;
      timerFillEl.style.width = pct + '%';
    }

    if (countdownSeconds <= 0) {
      triggerLiveAutoRefresh();
      countdownSeconds = 30;
      // Change ticker message
      const randomMsg = tickerMessages[Math.floor(Math.random() * tickerMessages.length)];
      if (liveTickerMsg) liveTickerMsg.textContent = randomMsg;
    }
  }, 1000);

  // Manual Refresh Button
  const manualBtn = document.getElementById('manualRefreshBtn');
  if (manualBtn) {
    manualBtn.addEventListener('click', () => {
      const icon = document.getElementById('refreshSpinIcon');
      if (icon) icon.classList.add('spinning');
      triggerLiveAutoRefresh();
      countdownSeconds = 30;
      setTimeout(() => {
        if (icon) icon.classList.remove('spinning');
      }, 800);
    });
  }
}

function triggerLiveAutoRefresh() {
  loadPlotData();
  renderPlots();
  updateStatsCounter();
  
  const badge = document.getElementById('syncBadgeContainer');
  if (badge) {
    badge.style.transform = 'scale(1.08)';
    setTimeout(() => { badge.style.transform = 'scale(1)'; }, 400);
  }
}

// Booking Modal Controls
function openBookingModal(plotId) {
  const plot = plots.find(p => p.id === plotId) || plots.find(p => p.status === 'available');
  if (!plot) return;

  selectedPlotForBooking = plot;
  const totalPrice = plot.sqYards * plot.pricePerSqYd;

  document.getElementById('bookingPlotId').value = plot.id;
  document.getElementById('modalPlotNoTitle').textContent = `Plot #${plot.number} (${plot.phase})`;
  document.getElementById('modalPlotFacing').textContent = plot.facing;
  document.getElementById('modalPlotArea').textContent = `${plot.sqYards} Sq. Yards (${plot.dimensions})`;
  document.getElementById('modalPricePerYd').textContent = `${formatINR(plot.pricePerSqYd)} / Sq.Yd`;
  document.getElementById('modalTotalCost').textContent = formatINR(totalPrice);
  document.getElementById('modalTokenAmt').textContent = formatINR(plot.tokenAmount);

  const bookingModal = document.getElementById('bookingModal');
  bookingModal.classList.add('show');
}

function closeBookingModal() {
  document.getElementById('bookingModal').classList.remove('show');
}

// Receipt Modal Controls
function showReceiptModal(bookingData) {
  const plot = selectedPlotForBooking;
  const totalPrice = plot.sqYards * plot.pricePerSqYd;
  const balance = totalPrice - plot.tokenAmount;
  const receiptNo = `ESR-BK-${Math.floor(100000 + Math.random() * 900000)}`;

  document.getElementById('receiptId').textContent = receiptNo;
  document.getElementById('receiptDate').textContent = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  document.getElementById('receiptPlotTitle').textContent = `Plot #${plot.number} (${plot.phase})`;
  document.getElementById('receiptPlotArea').textContent = `${plot.sqYards} Sq. Yards (${plot.dimensions})`;
  document.getElementById('receiptFacing').textContent = plot.facing;
  document.getElementById('receiptPriceYd').textContent = `${formatINR(plot.pricePerSqYd)} / Sq.Yd`;
  document.getElementById('receiptTotalVal').textContent = formatINR(totalPrice);
  document.getElementById('receiptTokenPaid').textContent = formatINR(plot.tokenAmount);
  document.getElementById('receiptBalance').textContent = formatINR(balance);

  document.getElementById('receiptBuyerName').textContent = bookingData.name;
  document.getElementById('receiptBuyerPhone').textContent = bookingData.phone;

  // WhatsApp Pre-filled link
  const waMsg = encodeURIComponent(
    `*ESR DEVELOPERS - NEW PLOT PRE-BOOKING*\n` +
    `Receipt No: ${receiptNo}\n` +
    `Plot No: Plot #${plot.number}\n` +
    `Area: ${plot.sqYards} Sq. Yards (${plot.facing})\n` +
    `Total Price: ${formatINR(totalPrice)}\n` +
    `Token Paid: ${formatINR(plot.tokenAmount)}\n` +
    `Buyer Name: ${bookingData.name}\n` +
    `Buyer Mobile: ${bookingData.phone}\n` +
    `City: ${bookingData.city}`
  );
  document.getElementById('receiptWhatsAppBtn').href = `https://wa.me/919876543210?text=${waMsg}`;

  document.getElementById('receiptModal').classList.add('show');

  // Trigger celebration confetti
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 }
  });
}

// 360 Degree Three.js Panorama Viewer
function init360Viewer() {
  const container = document.getElementById('container360');
  if (!container) return;

  const width = container.clientWidth || 800;
  const height = container.clientHeight || 520;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, width / height, 1, 1100);
  camera.target = new THREE.Vector3(0, 0, 0);

  const geometry = new THREE.SphereGeometry(500, 60, 40);
  geometry.scale(-1, 1, 1);

  const textureLoader = new THREE.TextureLoader();
  const texture = textureLoader.load('/images/plots/panorama_360.jpg');
  const material = new THREE.MeshBasicMaterial({ map: texture });

  sphereMesh = new THREE.Mesh(geometry, material);
  scene.add(sphereMesh);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  // Mouse & Touch Controls
  container.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  window.addEventListener('resize', onWindowResize);

  animate360();

  // 360 Spot switching buttons
  document.getElementById('btn360Spot1')?.addEventListener('click', () => switch360Texture('/images/plots/entrance.jpg'));
  document.getElementById('btn360Spot2')?.addEventListener('click', () => switch360Texture('/images/plots/panorama_360.jpg'));
  document.getElementById('btn360Spot3')?.addEventListener('click', () => switch360Texture('/images/plots/plot_site1.jpg'));
  
  // Fullscreen button
  document.getElementById('fullscreen360Btn')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(err => console.log(err));
    } else {
      document.exitFullscreen();
    }
  });
}

function switch360Texture(imagePath) {
  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(imagePath, (newTexture) => {
    sphereMesh.material.map = newTexture;
    sphereMesh.material.needsUpdate = true;
  });
}

function onPointerDown(event) {
  isUserInteracting = true;
  onPointerDownPointerX = event.clientX;
  onPointerDownPointerY = event.clientY;
  onPointerDownLon = lon;
  onPointerDownLat = lat;
}

function onPointerMove(event) {
  if (!isUserInteracting) return;
  lon = (onPointerDownPointerX - event.clientX) * 0.2 + onPointerDownLon;
  lat = (event.clientY - onPointerDownPointerY) * 0.2 + onPointerDownLat;
}

function onPointerUp() {
  isUserInteracting = false;
}

function onWindowResize() {
  const container = document.getElementById('container360');
  if (!container || !renderer) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate360() {
  requestAnimationFrame(animate360);

  if (!isUserInteracting) {
    lon += 0.05; // Auto slow rotation
  }

  lat = Math.max(-85, Math.min(85, lat));
  phi = THREE.MathUtils.degToRad(90 - lat);
  theta = THREE.MathUtils.degToRad(lon);

  camera.target.x = 500 * Math.sin(phi) * Math.cos(theta);
  camera.target.y = 500 * Math.cos(phi);
  camera.target.z = 500 * Math.sin(phi) * Math.sin(theta);

  camera.lookAt(camera.target);
  renderer.render(scene, camera);
}

// Leaflet Map Integration (Google Maps Coordinates)
function initLeafletMap() {
  const mapEl = document.getElementById('leafletMap');
  if (!mapEl) return;

  // Site Coordinates (Vijayawada-Guntur Corridor)
  const latLng = [16.5062, 80.6480];

  const map = L.map('leafletMap', { scrollWheelZoom: false }).setView(latLng, 14);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap | ESR Developers Site Location'
  }).addTo(map);

  // Custom Pin Marker
  const customIcon = L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="background:#d4af37; color:#000; padding:6px 10px; border-radius:12px; font-weight:bold; font-size:12px; border:2px solid #fff; box-shadow:0 4px 12px rgba(0,0,0,0.4);"><i class="fa-solid fa-gem me-1"></i> ESR DEVELOPERS</div>`,
    iconSize: [140, 40],
    iconAnchor: [70, 20]
  });

  const marker = L.marker(latLng, { icon: customIcon }).addTo(map);
  marker.bindPopup(`
    <div style="font-family:sans-serif; padding:4px;">
      <h4 style="margin:0 0 4px; color:#d4af37;">ESR DEVELOPERS</h4>
      <p style="margin:0 0 8px; font-size:12px;">Royal Palms Estate Layout</p>
      <a href="https://maps.google.com/?q=${latLng[0]},${latLng[1]}" target="_blank" style="color:#10b981; font-weight:bold; font-size:12px;">Get Navigation Directions</a>
    </div>
  `).openPopup();
}

// Master Plan Hotspot Generation
function initMasterPlanHotspots() {
  const overlay = document.getElementById('masterPlanOverlay');
  if (!overlay) return;
}

// General Event Listeners
function setupEventListeners() {
  // Navigation View Toggle
  document.getElementById('viewGridBtn')?.addEventListener('click', (e) => {
    document.getElementById('viewGridBtn').classList.add('active');
    document.getElementById('viewTableBtn').classList.remove('active');
    document.getElementById('plotsGrid').classList.remove('d-none');
    document.getElementById('plotsTableContainer').classList.add('d-none');
  });

  document.getElementById('viewTableBtn')?.addEventListener('click', (e) => {
    document.getElementById('viewTableBtn').classList.add('active');
    document.getElementById('viewGridBtn').classList.remove('active');
    document.getElementById('plotsGrid').classList.add('d-none');
    document.getElementById('plotsTableContainer').classList.remove('d-none');
  });

  // Filter Listeners
  document.getElementById('plotSearchInput')?.addEventListener('input', renderPlots);
  document.getElementById('statusFilter')?.addEventListener('change', renderPlots);
  document.getElementById('facingFilter')?.addEventListener('change', renderPlots);
  document.getElementById('sizeFilter')?.addEventListener('change', renderPlots);

  // Modal Closures
  document.getElementById('closeBookingModal')?.addEventListener('click', closeBookingModal);
  document.getElementById('cancelBookingBtn')?.addEventListener('click', closeBookingModal);
  
  document.getElementById('navPreBookBtn')?.addEventListener('click', () => {
    openBookingModal(null);
  });

  // Pre-Booking Form Submit
  document.getElementById('preBookingForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('buyerName').value;
    const phone = document.getElementById('buyerPhone').value;
    const email = document.getElementById('buyerEmail').value;
    const city = document.getElementById('buyerCity').value;

    if (!selectedPlotForBooking) return;

    // Update Plot Status in Local State
    const targetPlot = plots.find(p => p.id === selectedPlotForBooking.id);
    if (targetPlot) {
      targetPlot.status = 'booked';
      targetPlot.bookedBy = `${name} (${city})`;
      savePlotData();
    }

    closeBookingModal();
    renderPlots();
    updateStatsCounter();

    // Show Printable Receipt Modal
    showReceiptModal({ name, phone, email, city });
  });

  // Close Receipt Modal
  document.getElementById('receiptModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      e.currentTarget.classList.remove('show');
    }
  });

  document.getElementById('printReceiptBtn')?.addEventListener('click', () => {
    window.print();
  });

  // Contact Form Submit
  document.getElementById('contactOwnerForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('contactName').value;
    const phone = document.getElementById('contactPhone').value;
    const size = document.getElementById('contactPlotSize').value;
    const msg = document.getElementById('contactMessage').value;

    const waText = encodeURIComponent(`Hi ESR Developers Owner,\nI am ${name} (${phone}).\nI want details regarding ${size}.\nMessage: ${msg}`);
    window.open(`https://wa.me/919876543210?text=${waText}`, '_blank');
  });

  // Schedule Cab Visit Button
  document.getElementById('bookCabBtn')?.addEventListener('click', () => {
    const waText = encodeURIComponent("Hi ESR Developers, I want to book a Free Cab Pick-up for Plot Site Visit.");
    window.open(`https://wa.me/919876543210?text=${waText}`, '_blank');
  });

  // Lightbox Image Gallery
  document.querySelectorAll('.gallery-card').forEach(card => {
    card.addEventListener('click', () => {
      const imgSrc = card.getAttribute('data-img');
      const caption = card.getAttribute('data-caption');
      
      document.getElementById('lightboxImg').src = imgSrc;
      document.getElementById('lightboxCaption').textContent = caption;
      document.getElementById('imageLightboxModal').classList.add('show');
    });
  });

  document.getElementById('closeLightboxBtn')?.addEventListener('click', () => {
    document.getElementById('imageLightboxModal').classList.remove('show');
  });

  document.getElementById('imageLightboxModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      e.currentTarget.classList.remove('show');
    }
  });

  // Mobile Navigation Menu Toggle
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const navLinks = document.getElementById('navLinks');
  if (mobileBtn && navLinks) {
    mobileBtn.addEventListener('click', () => {
      navLinks.classList.toggle('mobile-open');
    });
  }
}
