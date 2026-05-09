const SHEET_URL = 'https://opensheet.elk.sh/1g-GgmfkSMtES2p6-2tzSw5LsIFRe6dWd58aKOShPWVM/Sheet1';
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
const TOMSK_CENTER = [84.9595, 56.4842];
const DEFAULT_ZOOM = 16;

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

const EMPTY_FEATURE_COLLECTION = {
  type: 'FeatureCollection',
  features: []
};

let map;
let popup;
let allPlaces = [];
let visiblePlaces = [];
let placesById = new Map();
let activeCategory = 'all';
let activePlaceId = null;
let placesLoaded = false;
let mapLoaded = false;

document.addEventListener('DOMContentLoaded', init);

function init() {
  map = new maplibregl.Map({
    container: 'map',
    style: MAP_STYLE_URL,
    center: TOMSK_CENTER,
    zoom: DEFAULT_ZOOM,
    pitch: 58,
    bearing: -18,
    antialias: true,
    attributionControl: true
  });

  map.addControl(new maplibregl.NavigationControl({
    visualizePitch: true
  }), 'bottom-left');

  map.on('load', () => {
    mapLoaded = true;
    addBuildingLayer();
    addPlacesSourceAndLayers();
    renderPlaces(visiblePlaces);
    showAppWhenReady();
  });

  map.on('error', event => {
    console.error('MapLibre error:', event.error || event);
    mapLoaded = true;
    showAppWhenReady();
  });

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
      placesById = new Map(allPlaces.map(place => [String(place.id), place]));

      updateCategoryCounts();
      applyFilter('all');
      map.jumpTo({
        center: TOMSK_CENTER,
        zoom: DEFAULT_ZOOM,
        pitch: 58,
        bearing: -18
      });
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

function addBuildingLayer() {
  if (map.getLayer('tomsk-3d-buildings')) {
    return;
  }

  const labelLayer = findFirstSymbolLayer();

  try {
    map.addLayer({
      id: 'tomsk-3d-buildings',
      source: 'openmaptiles',
      'source-layer': 'building',
      filter: ['==', ['geometry-type'], 'Polygon'],
      type: 'fill-extrusion',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': [
          'interpolate',
          ['linear'],
          ['zoom'],
          14,
          '#334566',
          17,
          '#6f86ad'
        ],
        'fill-extrusion-height': [
          'interpolate',
          ['linear'],
          ['zoom'],
          14,
          0,
          15,
          ['coalesce', ['get', 'render_height'], ['get', 'height'], 24]
        ],
        'fill-extrusion-base': [
          'coalesce',
          ['get', 'render_min_height'],
          ['get', 'min_height'],
          0
        ],
        'fill-extrusion-opacity': .82
      }
    }, labelLayer);
  } catch (error) {
    console.warn('3D buildings layer was not added:', error);
  }
}

function addPlacesSourceAndLayers() {
  if (map.getSource('places')) {
    return;
  }

  map.addSource('places', {
    type: 'geojson',
    data: EMPTY_FEATURE_COLLECTION,
    cluster: true,
    clusterRadius: 44,
    clusterMaxZoom: 16
  });

  map.addLayer({
    id: 'place-clusters',
    type: 'circle',
    source: 'places',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#ffe45c',
      'circle-radius': [
        'step',
        ['get', 'point_count'],
        19,
        8,
        24,
        18,
        30
      ],
      'circle-stroke-color': 'rgba(255,255,255,.88)',
      'circle-stroke-width': 2,
      'circle-opacity': .94
    }
  });

  map.addLayer({
    id: 'place-cluster-count',
    type: 'symbol',
    source: 'places',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-size': 13
    },
    paint: {
      'text-color': '#171717'
    }
  });

  map.addLayer({
    id: 'place-points-halo',
    type: 'circle',
    source: 'places',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': 16,
      'circle-color': [
        'match',
        ['get', 'category'],
        'architecture', 'rgba(236,122,199,.18)',
        'parks', 'rgba(117,221,115,.18)',
        'history', 'rgba(255,228,92,.18)',
        'rgba(127,180,255,.18)'
      ]
    }
  });

  map.addLayer({
    id: 'place-points',
    type: 'circle',
    source: 'places',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': [
        'case',
        ['==', ['get', 'id'], activePlaceId || ''],
        10,
        8
      ],
      'circle-color': [
        'match',
        ['get', 'category'],
        'architecture', '#ec7ac7',
        'parks', '#75dd73',
        'history', '#ffe45c',
        '#7fb4ff'
      ],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2.6
    }
  });

  map.on('click', 'place-clusters', onClusterClick);
  map.on('click', 'place-points', onPointClick);
  map.on('mouseenter', 'place-clusters', setPointerCursor);
  map.on('mouseenter', 'place-points', setPointerCursor);
  map.on('mouseleave', 'place-clusters', resetCursor);
  map.on('mouseleave', 'place-points', resetCursor);
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

  if (popup) {
    popup.remove();
  }
}

function renderPlaces(places) {
  const source = map && map.getSource('places');
  if (!source) {
    return;
  }

  source.setData({
    type: 'FeatureCollection',
    features: places.map(place => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [place.lng, place.lat]
      },
      properties: {
        id: String(place.id),
        title: place.title,
        category: normalizeCategory(place.category)
      }
    }))
  });

  updatePointStyle();
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

function onClusterClick(event) {
  const features = map.queryRenderedFeatures(event.point, {
    layers: ['place-clusters']
  });
  const clusterId = features[0]?.properties?.cluster_id;
  const source = map.getSource('places');

  if (clusterId === undefined || !source) {
    return;
  }

  const zoomResult = source.getClusterExpansionZoom(clusterId);
  Promise.resolve(zoomResult).then(zoom => {
    map.easeTo({
      center: features[0].geometry.coordinates,
      zoom,
      pitch: 58,
      duration: 450
    });
  }).catch(error => {
    console.warn('Cluster expansion failed:', error);
  });
}

function onPointClick(event) {
  const feature = event.features && event.features[0];
  const place = placesById.get(String(feature?.properties?.id));

  if (!place) {
    return;
  }

  selectPlace(place, false);
}

function selectPlace(place, moveMap) {
  activePlaceId = String(place.id);
  showPlaceInfo(place);
  renderPlacesList(visiblePlaces);
  updatePointStyle();
  openPlacePopup(place);

  if (moveMap) {
    map.easeTo({
      center: [place.lng, place.lat],
      zoom: Math.max(map.getZoom(), DEFAULT_ZOOM),
      pitch: 60,
      bearing: map.getBearing(),
      duration: 500
    });
  }
}

function openPlacePopup(place) {
  if (popup) {
    popup.remove();
  }

  popup = new maplibregl.Popup({
    className: 'place-popup',
    maxWidth: '300px',
    offset: 18
  })
    .setLngLat([place.lng, place.lat])
    .setHTML(getBalloonHtml(place))
    .addTo(map);
}

function fitVisiblePlaces() {
  if (!visiblePlaces.length) {
    return;
  }

  const bounds = visiblePlaces.reduce((lngLatBounds, place) => (
    lngLatBounds.extend([place.lng, place.lat])
  ), new maplibregl.LngLatBounds(
    [visiblePlaces[0].lng, visiblePlaces[0].lat],
    [visiblePlaces[0].lng, visiblePlaces[0].lat]
  ));

  map.fitBounds(bounds, {
    padding: {
      top: 110,
      right: window.innerWidth > 760 ? 470 : 32,
      bottom: window.innerWidth > 760 ? 110 : Math.round(window.innerHeight * .54),
      left: 70
    },
    maxZoom: 16,
    pitch: 58,
    duration: 650
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

function updatePointStyle() {
  if (!map || !map.getLayer('place-points')) {
    return;
  }

  map.setPaintProperty('place-points', 'circle-radius', [
    'case',
    ['==', ['get', 'id'], activePlaceId || ''],
    10,
    8
  ]);
}

function findFirstSymbolLayer() {
  const layers = map.getStyle().layers || [];
  return layers.find(layer => layer.type === 'symbol')?.id;
}

function setPointerCursor() {
  map.getCanvas().style.cursor = 'pointer';
}

function resetCursor() {
  map.getCanvas().style.cursor = '';
}

function showAppWhenReady() {
  if (placesLoaded && mapLoaded) {
    requestAnimationFrame(() => {
      map.resize();
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
