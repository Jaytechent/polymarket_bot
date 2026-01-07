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

/* ===================== HELPERS ===================== */

function interpretTrade(trade) {
  const price = Number(trade.price);
  const impliedProb = Math.round(price * 100);

  let strength = "Neutral";
  if (price >= 0.8) strength = "Heavy Favorite";
  else if (price >= 0.6) strength = "Favorite";
  else if (price <= 0.2) strength = "Heavy Underdog";
  else if (price <= 0.4) strength = "Underdog";

  return { price, impliedProb, strength };
}

/* ===================== CORE LOGIC ===================== */

async function scanPolymarket() {
  const now = Math.floor(Date.now() / 1000);
  const trades = await fetchRecentTrades();

  const recentTrades = trades.filter(
    (t) => now - Number(t.timestamp) <= POLL_WINDOW_SECONDS
  );

  let alertsSent = 0;

  /* -------- 🐳 WHALE TRADES -------- */
  for (const t of recentTrades) {
    const usdValue = Number(t.size) * Number(t.price);
    if (usdValue < WHALE_THRESHOLD_USD) continue;

    const { price, impliedProb, strength } = interpretTrade(t);

    const msg = `
🐳 *Whale Trade Detected*

📊 *Market:* ${t.title}
🆔 \`${t.conditionId}\`

🎯 *Outcome Bought:* ${t.outcome}
💵 *Entry Price:* $${price.toFixed(2)} (${impliedProb}% implied)
⚖️ *Market Side:* ${strength}

👛 Wallet: \`${t.proxyWallet}\`
🔄 Action: *BUY*
💰 *Position Size:* $${usdValue.toFixed(2)}
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

// require("dotenv").config();
// const axios = require("axios");
// const http = require("http");

// /* ===================== CONFIG ===================== */

// const DATA_API = "https://data-api.polymarket.com";

// const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
// const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// const PORT = process.env.PORT || 3000;

// // polling window
// const TRADE_LOOKBACK = 50;
// const POLL_WINDOW_SECONDS = 300; // last 5 minutes
// const WHALE_THRESHOLD_USD = 500;

// /* ===================== TELEGRAM ===================== */

// async function sendTelegram(text) {
//   const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
//   try {
//     await axios.post(url, {
//       chat_id: TELEGRAM_CHAT_ID,
//       text,
//       parse_mode: "Markdown",
//       disable_web_page_preview: false,
//     });
//   } catch (err) {
//     console.error("Telegram error:", err.response?.data || err.message);
//   }
// }

// /* ===================== POLYMARKET ===================== */

// async function fetchRecentTrades() {
//   try {
//     const res = await axios.get(
//       `${DATA_API}/trades?limit=${TRADE_LOOKBACK}`
//     );
//     return res.data || [];
//   } catch (err) {
//     console.error("Trades fetch error:", err.message);
//     return [];
//   }
// }

// /* ===================== CORE LOGIC ===================== */

// async function scanPolymarket() {
//   const now = Math.floor(Date.now() / 1000);
//   const trades = await fetchRecentTrades();

//   // filter trades in time window
//   const recentTrades = trades.filter(
//     (t) => now - Number(t.timestamp) <= POLL_WINDOW_SECONDS
//   );

//   let alertsSent = 0;

//   /* -------- 🐳 WHALE TRADES -------- */
//   for (const t of recentTrades) {
//     const usdValue = Number(t.size) * Number(t.price);
//     if (usdValue < WHALE_THRESHOLD_USD) continue;

//     const msg = `
// 🐳 *Whale Trade Detected*

// 📊 *Market:* ${t.title}
// 🆔 \`${t.conditionId}\`
// 🎯 *Outcome:* ${t.outcome}

// 👛 Wallet: \`${t.proxyWallet}\`
// 🔄 Action: *${t.side}*
// 💰 Size: *$${usdValue.toFixed(2)}*
// ⏱ Time: ${new Date(t.timestamp * 1000).toUTCString()}

// 🔗 [Place Trade](https://polymarket.com/market/${t.slug})
//     `.trim();

//     await sendTelegram(msg);
//     alertsSent++;
//   }

//   /* -------- 🧠 TOP TRADERS (DERIVED) -------- */
//   const walletAgg = {};

//   for (const t of recentTrades) {
//     const usd = Number(t.size) * Number(t.price);
//     if (!walletAgg[t.proxyWallet]) {
//       walletAgg[t.proxyWallet] = { usd: 0, market: t };
//     }
//     walletAgg[t.proxyWallet].usd += usd;
//   }

//   const topTraders = Object.entries(walletAgg)
//     .filter(([, v]) => v.usd >= WHALE_THRESHOLD_USD)
//     .sort((a, b) => b[1].usd - a[1].usd)
//     .slice(0, 3);

//   if (topTraders.length) {
//     let msg = `🧠 *Top Traders (last 5 mins)*\n\n`;

//     topTraders.forEach(([wallet, data], i) => {
//       msg += `${i + 1}. \`${wallet.slice(0, 6)}...${wallet.slice(-4)}\`\n`;
//       msg += `   💰 $${data.usd.toFixed(2)} on *${data.market.title}*\n\n`;
//     });

//     await sendTelegram(msg.trim());
//     alertsSent++;
//   }

//   /* -------- 🤖 HEARTBEAT -------- */
//   if (alertsSent === 0) {
//     await sendTelegram(
//       `🤖 *Bot Active*\n\nScanning Polymarket...\nNo whale trades or major activity detected in the last 5 minutes.`
//     );
//   }
// }

// /* ===================== AUTO RUN ===================== */

// (async () => {
//   await scanPolymarket();
// })();

// /* ===================== RENDER HTTP SERVER ===================== */

// const server = http.createServer(async (req, res) => {
//   if (req.url === "/post-on-ping" && req.method === "POST") {
//     await scanPolymarket();
//     res.writeHead(200, { "Content-Type": "application/json" });
//     res.end(JSON.stringify({ status: "scan complete" }));
//   } else if (req.url === "/") {
//     res.writeHead(200);
//     res.end("Polymarket Alert Bot is running.");
//   } else {
//     res.writeHead(404);
//     res.end();
//   }
// });

// server.listen(PORT, () =>
//   console.log(`Server running on port ${PORT}`)
// );


