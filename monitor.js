require('dotenv').config();
const http = require('http');
const fetch = require('node-fetch');

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const GAMMA_API =
  'https://gamma-api.polymarket.com/events?order=id&ascending=false&closed=false&limit=50';

const DATA_API = 'https://data-api.polymarket.com';

let seenEvents = new Set();
let seenTrades = new Set();
let knownWallets = new Set();
let watchedWallets = new Set();
let watchedMarkets = new Set();

/* ---------------- TELEGRAM ---------------- */

async function sendTG(text) {
  await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    })
  });
}

/* ---------------- HELPERS ---------------- */

const fmt = n => `$${Number(n).toLocaleString()}`;
const short = w => `${w.slice(0, 6)}…${w.slice(-4)}`;

/* ---------------- MARKET LISTINGS (OLD FORMAT) ---------------- */

async function fetchEvents() {
  const r = await fetch(GAMMA_API);
  return r.json();
}

async function processEvents(events) {
  for (const ev of events) {
    if (seenEvents.has(ev.id)) continue;

    const msg =
`🚨 *New Polymarket Listing!*

*${ev.title || ev.question}*

📅 Ends: ${new Date(ev.endDate).toDateString()}
💰 Volume: ${fmt(ev.volume || 0)}
🔗 [View Market](https://polymarket.com/event/${ev.slug})`;

    await sendTG(msg);
    seenEvents.add(ev.id);
  }
}

/* ---------------- TRADES & WHALE ALERTS ---------------- */

async function fetchTrades() {
  const r = await fetch(`${DATA_API}/trades?limit=50`);
  return r.json();
}

async function processTrades(trades) {
  for (const t of trades) {
    if (seenTrades.has(t.id)) continue;
    seenTrades.add(t.id);

    const usd = Number(t.amountUSD);
    const wallet = t.user;

    if (!knownWallets.has(wallet) && usd >= 1000) {
      await sendTG(
`🆕 *New Wallet Trade*
👛 ${short(wallet)}
💰 ${fmt(usd)}
📊 ${t.market}`
      );
      knownWallets.add(wallet);
    }

    if (usd >= 20000) {
      await sendTG(
`🐳 *WHALE ALERT*
👛 ${short(wallet)}
💰 ${fmt(usd)}
📊 ${t.market}`
      );
    }

    if (watchedWallets.has(wallet) || watchedMarkets.has(t.market)) {
      await sendTG(
`👀 *Watched Trade*
👛 ${short(wallet)}
💰 ${fmt(usd)}
📊 ${t.market}`
      );
    }
  }
}

/* ---------------- TELEGRAM COMMANDS ---------------- */

async function handleCommand(text) {
  const [cmd, arg, val] = text.split(' ');

  if (cmd === '/market') {
    const r = await fetch(`${DATA_API}/trades?market=${arg}`);
    const trades = await r.json();

    let msg = `📊 *Market Activity*\n${arg}\n\n`;
    trades.slice(0, 5).forEach(t => {
      msg += `• ${fmt(t.amountUSD)} — ${short(t.user)}\n`;
    });
    return sendTG(msg);
  }

  if (cmd === '/wallet') {
    const r = await fetch(`${DATA_API}/activity?user=${arg}`);
    const acts = await r.json();

    let msg = `👛 *Wallet Activity*\n${short(arg)}\n\n`;
    acts.slice(0, 5).forEach(a => {
      msg += `• ${fmt(a.amountUSD)} — ${a.market}\n`;
    });
    return sendTG(msg);
  }

  if (cmd === '/watch' && arg === 'wallet') {
    watchedWallets.add(val);
    return sendTG(`👀 Watching wallet ${short(val)}`);
  }

  if (cmd === '/watch' && arg === 'market') {
    watchedMarkets.add(val);
    return sendTG(`👀 Watching market ${val}`);
  }
}

/* ---------------- SERVER ---------------- */

http.createServer(async (req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      const update = JSON.parse(body);
      if (update.message?.text) {
        await handleCommand(update.message.text);
      }
      res.end('ok');
    });
    return;
  }

  const events = await fetchEvents();
  const trades = await fetchTrades();

  await processEvents(events);
  await processTrades(trades);

  res.end('running');
}).listen(PORT, () =>
  console.log(`🚀 Bot live on ${PORT}`)
);


// require('dotenv').config();
// const http = require('http');
// const fetch = require('node-fetch');
// const { getTopTradersForMarket } = require('./polymarket-graphql');

// const PORT = process.env.PORT || 3000;

// const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
// const CHAT_ID = process.env.CHAT_ID;
// const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

// const POLYMARKET_API =
//   'https://gamma-api.polymarket.com/events?order=id&ascending=false&closed=false&limit=50';

// let seenEvents = new Set(); // store seen market IDs

// // ---- Send message to Telegram ----
// async function sendTelegramMessage(message) {
//   try {
//     await fetch(TELEGRAM_API_URL, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({
//         chat_id: CHAT_ID,
//         text: message,
//         parse_mode: 'Markdown',
//         disable_web_page_preview: false,
//       }),
//     });
//   } catch (error) {
//     console.error('Error sending Telegram message:', error.message);
//   }
// }

// // ---- Fetch latest Polymarket events ----
// async function fetchPolymarketEvents() {
//   try {
//     const response = await fetch(POLYMARKET_API);
//     if (!response.ok) throw new Error(`API Error: ${response.status}`);
//     const data = await response.json();
//     return Array.isArray(data) ? data : [];
//   } catch (error) {
//     console.error('Error fetching Polymarket events:', error.message);
//     return [];
//   }
// }

// // ---- Format helper functions ----
// function formatCurrency(num) {
//   if (!num) return 'N/A';
//   return `$${Number(num).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
// }

// function formatDate(endDate) {
//   try {
//     const end = new Date(endDate);
//     const now = new Date();
//     const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
//     return `${end.toDateString()} (${diffDays > 0 ? diffDays + ' days left' : 'expired'})`;
//   } catch {
//     return 'N/A';
//   }
// }

// // ---- Process and send new events ----
// async function processNewEvents(events) {
//   const newEvents = events.filter(ev => !seenEvents.has(ev.id));

//   if (newEvents.length === 0) {
//     console.log('No new events found.');
//     return;
//   }

//   for (const ev of newEvents) {
//     const eventUrl = `https://polymarket.com/event/${ev.slug}`;
//     const title = ev.title || ev.question || 'Untitled Market';
//     const volume = formatCurrency(ev.volume24hr || ev.volume);
//     const endDate = formatDate(ev.endDate);

//     // ---- Fetch top traders for this market ----
//     console.log('🔍 Fetching top traders for market slug:', ev.slug);

//     let tradersText = '';
//     try {
//    const traders = await getTopTradersForMarket(ev.slug);


//       if (traders.length > 0) {
//         tradersText = '\n\n💼 *Top Traders:*\n';
//         traders.forEach((t, i) => {
//           tradersText += `${i + 1}. [${t.trader.slice(0, 6)}...${t.trader.slice(-4)}](https://polymarket.com/${t.trader}) — ${t.amount} on ${t.outcome}\n`;
//         });
//       }
//     } catch (err) {
//       console.error(`Error fetching traders for ${ev.slug}:`, err.message);
//     }


//     // ---- Compose final message ----
//     const message = `🚨 *New Polymarket Listing!*\n\n*${title}*\n\n📅 *Ends:* ${endDate}\n💰 *Volume:* ${volume}\n🔗 [View Market](${eventUrl})${tradersText}`;

//     console.log('Sending alert for:', ev.slug);
//     await sendTelegramMessage(message);
//     seenEvents.add(ev.id);
//   }

//   // Limit memory
//   if (seenEvents.size > 500) {
//     const ids = Array.from(seenEvents).slice(-250);
//     seenEvents = new Set(ids);
//   }
// }

// // ---- HTTP Server for Render ----
// const server = http.createServer(async (req, res) => {
//   if (req.url === '/post-on-ping' && req.method === 'POST') {
//     const events = await fetchPolymarketEvents();
//     await processNewEvents(events);

//     res.writeHead(200, { 'Content-Type': 'application/json' });
//     res.end(JSON.stringify({ message: 'Polymarket check completed' }));
//   } else if (req.url === '/') {
//     res.writeHead(200, { 'Content-Type': 'text/plain' });
//     res.end('Polymarket Alert Bot is running!');
//   } else {
//     res.writeHead(404, { 'Content-Type': 'application/json' });
//     res.end(JSON.stringify({ error: 'Not Found' }));
//   }
// });

// // ---- Start the server ----
// server.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });

