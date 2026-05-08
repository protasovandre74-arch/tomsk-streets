const SHEET_URL = 'https://opensheet.elk.sh/1g-GgmfkSMtES2p6-2tzSw5LsIFRe6dWd58aKOShPWVM/Sheet1';
const TOMSK_CENTER = [56.4846, 84.9482];

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

ymaps.ready(init);

let map;
let objectManager;
let allPlaces = [];
let visiblePlaces = [];
let activeCategory = 'all';
let activePlaceId = null;

function init() {
  map = new ymaps.Map('map', {
    center: TOMSK_CENTER,
    zoom: 15,
    controls: ['zoomControl', 'fullscreenControl']
  });

  objectManager = new ymaps.ObjectManager({
    clusterize: true,
    gridSize: 64,
    clusterDisableClickZoom: false
  });

  objectManager.objects.options.set({
    iconColor: '#7fb4ff'
  });

  map.geoObjects.add(objectManager);
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
      map.setCenter(TOMSK_CENTER, 15);
    })
    .catch(error => {
      console.error('Failed to load places:', error);
      document.getElementById('places-count').textContent = 'Не удалось загрузить объекты';
      document.getElementById('place-info').innerHTML =
        '<div class="empty-state"><span>Ошибка загрузки</span><p>Проверьте подключение к интернету или таблицу с данными.</p></div>';
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
    image: row.image || ''
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
  const geoJson = {
    type: 'FeatureCollection',
    features: places.map(place => ({
      type: 'Feature',
      id: place.id,
      geometry: {
        type: 'Point',
        coordinates: [place.lat, place.lng]
      },
      properties: {
        hintContent: place.title,
        balloonContent: getBalloonHtml(place),
        placeData: place
      },
      options: {
        preset: getPresetByCategory(place.category),
        iconColor: getColorByCategory(place.category)
      }
    }))
  };

  objectManager.removeAll();
  objectManager.add(geoJson);

  objectManager.objects.events.remove('click', onObjectClick);
  objectManager.objects.events.add('click', onObjectClick);
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

function onObjectClick(e) {
  const objectId = e.get('objectId');
  const object = objectManager.objects.getById(objectId);

  if (!object || !object.properties || !object.properties.placeData) {
    return;
  }

  selectPlace(object.properties.placeData, false);
}

function selectPlace(place, moveMap) {
  activePlaceId = place.id;
  showPlaceInfo(place);
  renderPlacesList(visiblePlaces);

  if (moveMap) {
    map.setCenter([place.lat, place.lng], Math.max(map.getZoom(), 15), {
      duration: 350
    });
  }
}

function fitVisiblePlaces() {
  if (!visiblePlaces.length) {
    return;
  }

  const bounds = visiblePlaces.map(place => [place.lat, place.lng]);
  map.setBounds(ymaps.util.bounds.fromPoints(bounds), {
    checkZoomRange: true,
    zoomMargin: [90, 440, 120, 80]
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
    <div style="max-width:250px;font-family:Arial,sans-serif">
      <strong>${escapeHtml(place.title)}</strong><br>
      ${place.image ? `<img src="${escapeAttr(place.image)}" style="width:100%;margin:8px 0;border-radius:10px;">` : ''}
      <div>${escapeHtml(place.address || '')}</div>
      <p>${escapeHtml(place.description || '')}</p>
    </div>
  `;
}

function showPlaceInfo(place) {
  document.getElementById('place-info').innerHTML = `
    <div class="place-card">
      ${place.image ? `<img src="${escapeAttr(place.image)}" alt="">` : ''}
      <h3>${escapeHtml(place.title)}</h3>
      <p><strong>Категория:</strong> ${escapeHtml(getCategoryLabel(place.category))}</p>
      ${place.address ? `<p><strong>Адрес:</strong> ${escapeHtml(place.address)}</p>` : ''}
      ${place.description ? `<p>${escapeHtml(place.description)}</p>` : ''}
    </div>
  `;
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

function getPresetByCategory(category) {
  switch (normalizeCategory(category)) {
    case 'architecture':
      return 'islands#pinkIcon';
    case 'parks':
      return 'islands#greenIcon';
    case 'history':
      return 'islands#yellowIcon';
    case 'museum':
      return 'islands#darkBlueIcon';
    case 'church':
      return 'islands#violetIcon';
    case 'university':
      return 'islands#orangeIcon';
    case 'monument':
      return 'islands#redIcon';
    default:
      return 'islands#blueIcon';
  }
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
