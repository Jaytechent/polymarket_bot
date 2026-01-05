require("dotenv").config();
const axios = require("axios");
const http = require("http");

/* ===================== CONFIG ===================== */

const DATA_API = "https://data-api.polymarket.com";
const CORE_API = "https://api.polymarket.com";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TRADE_LOOKBACK = Number(process.env.TRADE_LOOKBACK || 50);
const WHALE_THRESHOLD = 500; // USD
const PORT = process.env.PORT || 3000;

/* ===================== TELEGRAM ===================== */

async function sendTelegram(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await axios.post(url, {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: "Markdown",
    disable_web_page_preview: false,
  });
}

/* ===================== POLYMARKET FETCHERS ===================== */

// 1️⃣ Trades → discover active markets
async function fetchRecentConditionIds() {
  try {
    const res = await axios.get(
      `${DATA_API}/trades?limit=${TRADE_LOOKBACK}`
    );

    const ids = new Set();
    res.data?.forEach((t) => {
      if (t.conditionId) ids.add(t.conditionId);
    });

    return [...ids];
  } catch (err) {
    console.error("Trades error:", err.message);
    return [];
  }
}

// 🐳 Whale trades (uses /trades correctly)
async function fetchWhaleTrades() {
  try {
    const res = await axios.get(
      `${DATA_API}/trades?limit=${TRADE_LOOKBACK}`
    );

    return (res.data || []).filter(
      (t) => Number(t.usdValue) >= WHALE_THRESHOLD
    );
  } catch (err) {
    console.error("Whale trades error:", err.message);
    return [];
  }
}

// 2️⃣ Market metadata (name + slug)
async function fetchMarketDetails(conditionId) {
  try {
    const res = await axios.get(
      `${CORE_API}/markets/${conditionId}`
    );

    return {
      title: res.data?.title || "Unknown Market",
      slug: res.data?.slug || conditionId,
    };
  } catch {
    return {
      title: "Unknown Market",
      slug: conditionId,
    };
  }
}

// 3️⃣ Top holders
async function fetchTopHolders(conditionId) {
  try {
    const res = await axios.get(
      `${DATA_API}/top-holders?market=${conditionId}&limit=10`
    );
    return res.data || [];
  } catch {
    return [];
  }
}

// 4️⃣ Activity
async function fetchActivity(conditionId) {
  try {
    const res = await axios.get(
      `${DATA_API}/activity?market=${conditionId}`
    );
    return res.data || [];
  } catch {
    return [];
  }
}

/* ===================== CORE WORKFLOW ===================== */

async function fetchPolymarketEvents() {
  return fetchRecentConditionIds();
}

async function processNewEvents(conditionIds) {
  const whaleTrades = await fetchWhaleTrades();

  for (const cid of conditionIds) {
    const market = await fetchMarketDetails(cid);
    const tradeLink = `https://polymarket.com/market/${market.slug}`;

    /* -------- TOP HOLDERS -------- */
    const holders = await fetchTopHolders(cid);

    if (holders.length) {
      let msg = `🧠 *Top Holders Update*\n\n`;
      msg += `📊 *Market:* ${market.title}\n`;
      msg += `🆔 \`${cid}\`\n`;
      msg += `🔗 [Place Trade](${tradeLink})\n\n`;

      holders.forEach((token) => {
        token.holders?.forEach((h) => {
          msg += `• ${h.pseudonym || h.proxyWallet}: *$${Number(h.amount).toFixed(2)}*\n`;
        });
      });

      await sendTelegram(msg);
    }

    /* -------- ACTIVITY -------- */
    const activity = await fetchActivity(cid);

    if (activity.length) {
      let msg = `🔍 *Recent Activity*\n\n`;
      msg += `📊 *Market:* ${market.title}\n`;
      msg += `🆔 \`${cid}\`\n`;
      msg += `🔗 [Place Trade](${tradeLink})\n\n`;

      activity.slice(0, 10).forEach((a) => {
        msg += `• ${a.action || "action"} by \`${a.wallet}\`\n`;
      });

      await sendTelegram(msg);
    }

    /* -------- 🐳 WHALE TRADES -------- */
    for (const trade of whaleTrades) {
      if (trade.conditionId !== cid) continue;

      const whaleMsg = `
🐳 *Whale Trade Detected*

📊 *Market:* ${market.title}
🆔 \`${cid}\`
🔗 [Place Trade](${tradeLink})

👛 Wallet: \`${trade.wallet}\`
🔄 Action: *${trade.side}*
💰 Amount: *$${Number(trade.usdValue).toFixed(2)}*
⏱ Time: ${new Date(trade.timestamp).toUTCString()}
      `.trim();

      await sendTelegram(whaleMsg);
    }
  }
}

/* ===================== AUTO RUN ===================== */

(async () => {
  const events = await fetchPolymarketEvents();
  await processNewEvents(events);
})();

/* ===================== RENDER SERVER ===================== */

const server = http.createServer(async (req, res) => {
  if (req.url === "/post-on-ping" && req.method === "POST") {
    const events = await fetchPolymarketEvents();
    await processNewEvents(events);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Polymarket check completed" }));
  } else if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Polymarket Alert Bot is running!");
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



