require('dotenv').config();
const http = require('http');
const fetch = require('node-fetch');

const PORT = process.env.PORT || 3000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

const POLYMARKET_API =
  'https://gamma-api.polymarket.com/events?order=id&ascending=false&closed=false&limit=50';

let seenEvents = new Set(); 

// ---- Send message to Telegram ----
async function sendTelegramMessage(message) {
  try {
    await fetch(TELEGRAM_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    });
  } catch (error) {
    console.error('Error sending Telegram message:', error.message);
  }
}

// ---- Fetch latest Polymarket events ----
async function fetchPolymarketEvents() {
  try {
    const response = await fetch(POLYMARKET_API);
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching Polymarket events:', error.message);
    return [];
  }
}

// ---- Process and send new events ----
async function processNewEvents(events) {
  const newEvents = events.filter(ev => !seenEvents.has(ev.id));

  if (newEvents.length === 0) {
    console.log('No new events found.');
    return;
  }

  for (const ev of newEvents) {
    const eventUrl = `https://polymarket.com/event/${ev.slug}`;
    const message = `🚨 *New Polymarket Listing!*\n\n*${ev.title || ev.question}*\n\n🔗 [View Market](${eventUrl})`;

    console.log('Sending alert for:', ev.slug);
    await sendTelegramMessage(message);
    seenEvents.add(ev.id);
  }

  // keep memory small
  if (seenEvents.size > 500) {
    const ids = Array.from(seenEvents).slice(-250);
    seenEvents = new Set(ids);
  }
}

// ---- HTTP Server for Render ----
const server = http.createServer(async (req, res) => {
  if (req.url === '/post-on-ping' && req.method === 'POST') {
    const events = await fetchPolymarketEvents();
    await processNewEvents(events);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Polymarket check completed' }));
  } else if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Polymarket Alert Bot is running!');
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' })); 
  }
});

// ---- Start the server ----
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
