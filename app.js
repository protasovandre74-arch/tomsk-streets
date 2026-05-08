const SHEET_URL = 'https://opensheet.elk.sh/1g-GgmfkSMtES2p6-2tzSw5LsIFRe6dWd58aKOShPWVM/Sheet1';
const TOMSK_CENTER = [56.4842, 84.9658];
const DEFAULT_ZOOM = 15;

const CATEGORY_LABELS = {
  architecture: 'Архитектура',
  parks: 'Парки',
  park: 'Парки',
  history: 'История',
  museum: 'Музеи',
  church: 'Храмы',
  university: 'Университеты',
  monument: 'Памятники'
};

let map;
let tileLayer;
let markersLayer;
let allPlaces = [];
let visiblePlaces = [];
let activeCategory = 'all';
let activePlaceId = null;
let placesLoaded = false;
let mapTilesLoaded = false;

document.addEventListener('DOMContentLoaded', init);

function init() {
  map = L.map('map', {
    center: TOMSK_CENTER,
    zoom: DEFAULT_ZOOM,
    zoomControl: false,
    preferCanvas: true
  });

  L.control.zoom({
    position: 'bottomleft'
  }).addTo(map);

  tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }).addTo(map);

  tileLayer.once('load', () => {
    mapTilesLoaded = true;
    showAppWhenReady();
  });

  setTimeout(() => {
    mapTilesLoaded = true;
    showAppWhenReady();
  }, 3500);

  markersLayer = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 42,
    spiderfyOnMaxZoom: true,
    disableClusteringAtZoom: 17,
    iconCreateFunction: createClusterIcon
  }).addTo(map);

  bindUi();
  loadPlaces();
}

function loadPlaces() {
  fetch(SHEET_URL)
    .then(response => response.json())
    .then(rows => {
      allPlaces = rows
        .map(normalizePlace)
        .filter(place => Number.isFinite(place.lat) && Number.isFinite(place.lng));

      updateCategoryCounts();
      applyFilter('all');
      map.setView(TOMSK_CENTER, DEFAULT_ZOOM);
      placesLoaded = true;
      showAppWhenReady();
    })
    .catch(error => {
      console.error('Failed to load places:', error);
      document.getElementById('places-count').textContent = 'Не удалось загрузить объекты';
      document.getElementById('place-info').innerHTML =
        '<div class="empty-state"><span>Ошибка загрузки</span><p>Проверьте подключение к интернету или таблицу с данными.</p></div>';
      placesLoaded = true;
      showAppWhenReady();
    });
}

function normalizePlace(row, index) {
  const category = String(row.category || '').trim().toLowerCase();

  return {
    id: row.id || `place-${index}`,
    title: row.title || 'Без названия',
    lat: parseFloat(row.lat),
    lng: parseFloat(row.lng),
    category,
    address: row.address || '',
    description: row.description || '',
    image: normalizeImageUrl(row.image || '')
  };
}

function bindUi() {
  document.querySelectorAll('[data-category]').forEach(button => {
    button.addEventListener('click', () => applyFilter(button.dataset.category));
  });

  document.getElementById('fit-button').addEventListener('click', fitVisiblePlaces);

  const aboutButton = document.getElementById('about-button');
  const aboutCard = document.getElementById('about-card');
  const closeAbout = document.getElementById('close-about');

  aboutButton.addEventListener('click', () => {
    aboutCard.hidden = !aboutCard.hidden;
  });
  closeAbout.addEventListener('click', () => {
    aboutCard.hidden = true;
  });
}

function applyFilter(category) {
  activeCategory = category;
  activePlaceId = null;

  document.querySelectorAll('[data-category]').forEach(button => {
    button.classList.toggle('active', button.dataset.category === category);
  });

  visiblePlaces = category === 'all'
    ? allPlaces
    : allPlaces.filter(place => normalizeCategory(place.category) === category);

  renderPlaces(visiblePlaces);
  renderPlacesList(visiblePlaces);
  updatePlacesCount();
  showEmptyState();
}

function renderPlaces(places) {
  markersLayer.clearLayers();

  places.forEach(place => {
    const marker = L.marker([place.lat, place.lng], {
      icon: createPlaceIcon(place),
      title: place.title
    });

    marker.bindPopup(getBalloonHtml(place), {
      maxWidth: 280,
      className: 'place-popup'
    });

    marker.on('click', () => selectPlace(place, false));
    markersLayer.addLayer(marker);
  });
}

function renderPlacesList(places) {
  const list = document.getElementById('places-list');

  if (!places.length) {
    list.innerHTML = '<div class="empty-state"><span>Ничего не найдено</span><p>Выберите другой слой.</p></div>';
    return;
  }

  list.innerHTML = places.map(place => `
    <button class="place-list-button${place.id === activePlaceId ? ' active' : ''}" type="button" data-place-id="${escapeAttr(place.id)}">
      <span>${escapeHtml(place.title)}</span>
      <small>${escapeHtml(place.address || getCategoryLabel(place.category))}</small>
    </button>
  `).join('');

  list.querySelectorAll('[data-place-id]').forEach(button => {
    button.addEventListener('click', () => {
      const place = visiblePlaces.find(item => String(item.id) === button.dataset.placeId);
      if (place) {
        selectPlace(place, true);
      }
    });
  });
}

function selectPlace(place, moveMap) {
  activePlaceId = place.id;
  showPlaceInfo(place);
  renderPlacesList(visiblePlaces);

  if (moveMap) {
    map.setView([place.lat, place.lng], Math.max(map.getZoom(), DEFAULT_ZOOM), {
      animate: true,
      duration: .35
    });
  }
}

function fitVisiblePlaces() {
  if (!visiblePlaces.length) {
    return;
  }

  const bounds = L.latLngBounds(visiblePlaces.map(place => [place.lat, place.lng]));
  map.fitBounds(bounds, {
    paddingTopLeft: [80, 90],
    paddingBottomRight: [460, 120],
    maxZoom: 16
  });
}

function updatePlacesCount() {
  const label = activeCategory === 'all'
    ? 'всего объектов'
    : getCategoryLabel(activeCategory).toLowerCase();

  document.getElementById('places-count').textContent = `${visiblePlaces.length} ${label}`;
}

function updateCategoryCounts() {
  const counts = allPlaces.reduce((acc, place) => {
    const category = normalizeCategory(place.category);
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  document.getElementById('count-architecture').textContent = counts.architecture || 0;
  document.getElementById('count-parks').textContent = counts.parks || 0;
  document.getElementById('count-history').textContent = counts.history || 0;
}

function showEmptyState() {
  document.getElementById('place-info').innerHTML = `
    <div class="empty-state">
      <span>Выберите объект на карте</span>
      <p>Кликните по метке или по объекту в списке, чтобы увидеть описание.</p>
    </div>
  `;
}

function getBalloonHtml(place) {
  return `
    <div class="popup-content">
      <strong>${escapeHtml(place.title)}</strong>
      ${place.image ? `<img src="${escapeAttr(place.image)}" loading="lazy" decoding="async" onerror="this.style.display='none'">` : ''}
      <div>${escapeHtml(place.address || '')}</div>
      <p>${escapeHtml(place.description || '')}</p>
    </div>
  `;
}

function showPlaceInfo(place) {
  document.getElementById('place-info').innerHTML = `
    <div class="place-card">
      ${place.image ? `<img src="${escapeAttr(place.image)}" alt="" loading="lazy" decoding="async" onerror="this.replaceWith(createImageFallback())">` : getImageFallbackHtml()}
      <h3>${escapeHtml(place.title)}</h3>
      <p><strong>Категория:</strong> ${escapeHtml(getCategoryLabel(place.category))}</p>
      ${place.address ? `<p><strong>Адрес:</strong> ${escapeHtml(place.address)}</p>` : ''}
      ${place.description ? `<p>${escapeHtml(place.description)}</p>` : ''}
    </div>
  `;
}

function createPlaceIcon(place) {
  const category = normalizeCategory(place.category);
  const color = getColorByCategory(category);

  return L.divIcon({
    className: 'place-marker-shell',
    html: `<span class="place-marker" style="--marker-color:${color}"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
  });
}

function createClusterIcon(cluster) {
  const count = cluster.getChildCount();

  return L.divIcon({
    html: `<span>${count}</span>`,
    className: 'place-cluster',
    iconSize: [42, 42]
  });
}

function showAppWhenReady() {
  if (placesLoaded && mapTilesLoaded) {
    requestAnimationFrame(() => {
      map.invalidateSize();
      document.body.classList.remove('is-loading');
      document.body.classList.add('is-ready');
    });
  }
}

function normalizeImageUrl(url) {
  url = String(url || '').trim();

  if (!url) {
    return '';
  }

  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveMatch) {
    return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
  }

  const openMatch = url.match(/[?&]id=([^&]+)/);
  if (url.includes('drive.google.com') && openMatch) {
    return `https://drive.google.com/uc?export=view&id=${openMatch[1]}`;
  }

  return url;
}

function createImageFallback() {
  const fallback = document.createElement('div');
  fallback.className = 'image-fallback';
  fallback.textContent = 'Изображение недоступно';
  return fallback;
}

function getImageFallbackHtml() {
  return '<div class="image-fallback">Изображение не добавлено</div>';
}

function normalizeCategory(category) {
  if (category === 'park') {
    return 'parks';
  }

  return category || 'other';
}

function getCategoryLabel(category) {
  return CATEGORY_LABELS[normalizeCategory(category)] || 'Другое';
}

function getColorByCategory(category) {
  switch (normalizeCategory(category)) {
    case 'architecture':
      return '#ec7ac7';
    case 'parks':
      return '#75dd73';
    case 'history':
      return '#ffe45c';
    default:
      return '#7fb4ff';
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}
