
// on load: quote + voice + page-specific init
document.addEventListener('DOMContentLoaded', () => {
  // Home page: fetch quote
  const quoteBox = document.getElementById('quote-box');
  if (quoteBox) {
    fetch('https://zenquotes.io/api/random')
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then(d => {
        const { q, a } = d[0];
        quoteBox.innerHTML = `<blockquote>“${q}”</blockquote>&mdash; ${a}`;
      })
      .catch(() => { quoteBox.innerText = 'Sorry, quote unavailable.'; });
  }

  // Set up voice commands on all pages
  initVoiceCommands();

  // Stocks page: attach lookup handler & load Reddit table
  const lookupBtn = document.getElementById('lookup-btn');
  if (lookupBtn) {
    lookupBtn.addEventListener('click', lookupStock);
    loadTopRedditStocks();
  }

  // Dogs page: load images and breeds
  if (document.getElementById('dogCarousel')) {
    loadBreedDetails()
      .then(() => {
        loadBreedList();
        loadRandomDogsWithRetries();
      });
  }
});

// Audio controls
function turnOnListening()  { if (window.annyang) annyang.start(); }
function turnOffListening() { if (window.annyang) annyang.abort(); }

// Voice commands setup
function initVoiceCommands() {
  if (!window.annyang) return;
  const cmds = {
    'hello': () => alert('Hello World'),
    'change the color to *color': color => document.body.style.backgroundColor = color,
    'navigate to *page': page => {
      const p = page.toLowerCase().trim();
      if (p === 'home')   window.location.href = 'a2homepage.html';
      if (p === 'stocks') window.location.href = 'a2stocks.html';
      if (p === 'dogs')   window.location.href = 'a2dogs.html';
    },
    'lookup *ticker': ticker => {
      const T = ticker.toUpperCase().trim();
      document.getElementById('range').value  = '30';
      document.getElementById('ticker').value = T;
      lookupStock();
    },
    'load dog breed *breed': breed => showBreedInfo(breed)
  };
  annyang.addCommands(cmds);
}

// Stocks

const POLYGON_KEY = 'xu5MWprXX4B0mZeoiEIopTbYZSy4RpRs';
let stockChart;

function lookupStock() {
  const symbol = document.getElementById('ticker').value.trim().toUpperCase();
  const days   = +document.getElementById('range').value;
  if (!symbol) return alert('Please enter a ticker.');

  const to   = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - days);
  const fromE = Math.floor(from.getTime() / 1000);
  const toE   = Math.floor(to.getTime()   / 1000);

  const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}` +
              `/range/1/day/${fromE}/${toE}` +
              `?adjusted=true&sort=asc&limit=500&apiKey=${POLYGON_KEY}`;

  fetch(url)
    .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
    .then(j => {
      const labels = j.results.map(x => new Date(x.t * 1000).toLocaleDateString());
      const data   = j.results.map(x => x.c);
      drawChart(labels, data, symbol);
    })
    .catch(() => alert('Error fetching stock data.'));
}

function drawChart(labels, data, symbol) {
  const ctx = document.getElementById('stockChart').getContext('2d');
  if (stockChart) stockChart.destroy();
  stockChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: symbol, data, fill: false, borderColor: '#0070C9', tension: 0.1 }]
    },
    options: {
      scales: {
        x: { display: true, title: { display: true, text: 'Date' } },
        y: { display: true, title: { display: true, text: 'Close Price ($)' } }
      }
    }
  });
}

function loadTopRedditStocks() {
  const body = document.getElementById('stocks-table-body');
  const date = '2022-04-03'; // fixed date for consistent data
  fetch(`https://tradestie.com/api/v1/apps/reddit?date=${date}`)
    .then(r => r.json())
    .then(arr => {
      const top5 = arr.sort((a,b) => b.comment_count - a.comment_count).slice(0,5);
      body.innerHTML = top5.map(x => {
        const icon = x.sentiment === 'Bullish' ? '🐂' : '🐻';
        return `
          <tr>
            <td><a href="https://finance.yahoo.com/quote/${x.ticker}" target="_blank">${x.ticker}</a></td>
            <td>${x.comment_count}</td>
            <td>${icon}</td>
          </tr>`;
      }).join('');
    })
    .catch(() => {
      body.innerHTML = '<tr><td colspan="3">Unable to load Reddit data.</td></tr>';
    });
}

// Dogs

const DOG_API_KEY = 'live_aIuj2zpH7amgXjY1ckG2ZE2YHqmBlhAVy4wGgRIcEaITjHvMLxNQbqpnfqOpG2GU';
const breedMap = {};

// Preload helper
function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(url);
    img.onerror = () => reject(url);
    img.src     = url;
  });
}

// Attempt up to 3 fetch rounds to get at least 5 valid images
function loadRandomDogsWithRetries(attempts = 3, needed = 5) {
  fetch('https://dog.ceo/api/breeds/image/random/10')
    .then(r => { if (!r.ok) throw new Error('Network error'); return r.json(); })
    .then(data => Promise.allSettled(data.message.map(preloadImage)))
    .then(results => {
      const validUrls = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      console.log(`Loaded ${validUrls.length} images in attempt`);

      if (validUrls.length >= needed || attempts <= 1) {
        renderDogCarousel(validUrls);
      } else {
        // try again to fill up to needed
        loadRandomDogsWithRetries(attempts - 1, needed);
      }
    })
    .catch(err => {
      console.error('Error fetching dog images:', err);
      document.getElementById('dogCarousel').innerText = 'Failed to load images.';
    });
}

function renderDogCarousel(urls) {
  const carousel = document.getElementById('dogCarousel');
  if (urls.length === 0) {
    carousel.innerText = 'No images available.';
    return;
  }
  carousel.innerHTML = urls.map(u => `<img src="${u}">`).join('');
  new SimpleSlider('#dogCarousel');
}

function loadBreedDetails() {
  return fetch('https://api.thedogapi.com/v1/breeds', { headers: { 'x-api-key': DOG_API_KEY } })
    .then(r => r.json())
    .then(arr => {
      arr.forEach(b => {
        breedMap[b.name.toLowerCase()] = {
          name: b.name,
          description: b.temperament || b.bred_for || 'No description available',
          lifeSpan: b.life_span
        };
      });
    });
}

function loadBreedList() {
  fetch('https://dog.ceo/api/breeds/list/all')
    .then(r => r.json())
    .then(d => {
      const valid = Object.keys(d.message).filter(b => breedMap[b]).slice(0,10);
      const container = document.getElementById('breedButtons');
      valid.forEach(b => {
        const btn = document.createElement('button');
        btn.className = 'button-1';
        btn.textContent = b;
        btn.onclick = () => showBreedInfo(b);
        container.appendChild(btn);
      });
    });
}

function showBreedInfo(breed) {
  const info = breedMap[breed.toLowerCase()];
  if (!info) {
    alert('Details not available for ' + breed);
    return;
  }
  const nums = info.lifeSpan.match(/\d+/g) || [];
  const min  = nums[0] || '?', max = nums[1] || '?';
  const panel = document.getElementById('breedInfo');
  panel.innerHTML = `
    <h3>${info.name}</h3>
    <p>${info.description}</p>
    <p>Life span: ${min} – ${max} years</p>`;
  panel.style.display = 'block';
}
