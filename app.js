const SHEET_URL = 'https://opensheet.elk.sh/1g-GgmfkSMtES2p6-2tzSw5LsIFRe6dWd58aKOShPWVM/Sheet1';

ymaps.ready(init);

let map;
let objectManager;
let allPlaces = [];

function init() {
  map = new ymaps.Map('map', {
    center: [56.4846, 84.9482],
    zoom: 12,
    controls: ['zoomControl', 'fullscreenControl']
  });

  objectManager = new ymaps.ObjectManager({
    clusterize: true,
    gridSize: 64,
    clusterDisableClickZoom: false
  });

  map.geoObjects.add(objectManager);

  fetch(SHEET_URL)
    .then(response => response.json())
    .then(rows => {
      allPlaces = rows
        .map(normalizePlace)
        .filter(place => place.lat && place.lng);

      renderPlaces(allPlaces);
      bindFilters();
    })
    .catch(error => {
      console.error('Failed to load places:', error);
      document.getElementById('place-info').innerHTML =
        '<p>Не удалось загрузить объекты.</p>';
    });
}

function normalizePlace(row) {
  return {
    id: row.id,
    title: row.title,
    lat: parseFloat(row.lat),
    lng: parseFloat(row.lng),
    category: row.category,
    address: row.address,
    description: row.description,
    image: row.image
  };
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
        preset: getPresetByCategory(place.category)
      }
    }))
  };

  objectManager.removeAll();
  objectManager.add(geoJson);

  objectManager.objects.events.remove('click', onObjectClick);
  objectManager.objects.events.add('click', onObjectClick);
}

function onObjectClick(e) {
  const objectId = e.get('objectId');
  const object = objectManager.objects.getById(objectId);

  if (!object || !object.properties || !object.properties.placeData) {
    return;
  }

  showPlaceInfo(object.properties.placeData);
}

function getBalloonHtml(place) {
  return `
        <div style="max-width:240px">
            <strong>${escapeHtml(place.title)}</strong><br>
            ${place.image ? `<img src="${escapeAttr(place.image)}" style="width:100%;margin:8px 0;border-radius:6px;">` : ''}
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
            <p><strong>Адрес:</strong> ${escapeHtml(place.address || '')}</p>
            <p>${escapeHtml(place.description || '')}</p>
        </div>
    `;
}

function bindFilters() {
  document.querySelectorAll('[data-category]').forEach(button => {
    button.addEventListener('click', () => {
      const category = button.dataset.category;

      const filtered = category === 'all'
        ? allPlaces
        : allPlaces.filter(place => place.category === category);

      renderPlaces(filtered);
    });
  });
}

function getPresetByCategory(category) {
  switch (category) {
    case 'architecture':
      return 'islands#redIcon';
    case 'park':
    case 'parks':
      return 'islands#greenIcon';
    case 'museum':
      return 'islands#darkBlueIcon';
    case 'church':
      return 'islands#violetIcon';
    case 'university':
      return 'islands#orangeIcon';
    case 'monument':
      return 'islands#yellowIcon';
    case 'history':
      return 'islands#brownIcon';
    default:
      return 'islands#blueIcon';
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



