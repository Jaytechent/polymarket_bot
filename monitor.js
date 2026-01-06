
require("dotenv").config();
const axios = require("axios");
const http = require("http");

/* ===================== CONFIG ===================== */

const DATA_API = "https://data-api.polymarket.com";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const PORT = process.env.PORT || 3000;

// polling window
const TRADE_LOOKBACK = 50;
const POLL_WINDOW_SECONDS = 300; // last 5 minutes
const WHALE_THRESHOLD_USD = 500;

/* ===================== TELEGRAM ===================== */

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: false,
    });
  } catch (err) {
    console.error("Telegram error:", err.response?.data || err.message);
  }
}

/* ===================== POLYMARKET ===================== */

async function fetchRecentTrades() {
  try {
    const res = await axios.get(
      `${DATA_API}/trades?limit=${TRADE_LOOKBACK}`
    );
    return res.data || [];
  } catch (err) {
    console.error("Trades fetch error:", err.message);
    return [];
  }
}

/* ===================== CORE LOGIC ===================== */

async function scanPolymarket() {
  const now = Math.floor(Date.now() / 1000);
  const trades = await fetchRecentTrades();

  // filter trades in time window
  const recentTrades = trades.filter(
    (t) => now - Number(t.timestamp) <= POLL_WINDOW_SECONDS
  );

  let alertsSent = 0;

  /* -------- 🐳 WHALE TRADES -------- */
  for (const t of recentTrades) {
    const usdValue = Number(t.size) * Number(t.price);
    if (usdValue < WHALE_THRESHOLD_USD) continue;

    const msg = `
🐳 *Whale Trade Detected*

📊 *Market:* ${t.title}
🆔 \`${t.conditionId}\`
🎯 *Outcome:* ${t.outcome}

👛 Wallet: \`${t.proxyWallet}\`
🔄 Action: *${t.side}*
💰 Size: *$${usdValue.toFixed(2)}*
⏱ Time: ${new Date(t.timestamp * 1000).toUTCString()}

🔗 [Place Trade](https://polymarket.com/market/${t.slug})
    `.trim();

    await sendTelegram(msg);
    alertsSent++;
  }

  /* -------- 🧠 TOP TRADERS (DERIVED) -------- */
  const walletAgg = {};

  for (const t of recentTrades) {
    const usd = Number(t.size) * Number(t.price);
    if (!walletAgg[t.proxyWallet]) {
      walletAgg[t.proxyWallet] = { usd: 0, market: t };
    }
    walletAgg[t.proxyWallet].usd += usd;
  }

  const topTraders = Object.entries(walletAgg)
    .filter(([, v]) => v.usd >= WHALE_THRESHOLD_USD)
    .sort((a, b) => b[1].usd - a[1].usd)
    .slice(0, 3);

  if (topTraders.length) {
    let msg = `🧠 *Top Traders (last 5 mins)*\n\n`;

    topTraders.forEach(([wallet, data], i) => {
      msg += `${i + 1}. \`${wallet.slice(0, 6)}...${wallet.slice(-4)}\`\n`;
      msg += `   💰 $${data.usd.toFixed(2)} on *${data.market.title}*\n\n`;
    });

    await sendTelegram(msg.trim());
    alertsSent++;
  }

  /* -------- 🤖 HEARTBEAT -------- */
  if (alertsSent === 0) {
    await sendTelegram(
      `🤖 *Bot Active*\n\nScanning Polymarket...\nNo whale trades or major activity detected in the last 5 minutes.`
    );
  }
}

/* ===================== AUTO RUN ===================== */

(async () => {
  await scanPolymarket();
})();

/* ===================== RENDER HTTP SERVER ===================== */

const server = http.createServer(async (req, res) => {
  if (req.url === "/post-on-ping" && req.method === "POST") {
    await scanPolymarket();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "scan complete" }));
  } else if (req.url === "/") {
    res.writeHead(200);
    res.end("Polymarket Alert Bot is running.");
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
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






