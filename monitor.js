require("dotenv").config();
const axios = require("axios");
const http = require("http");

/* ===================== CONFIG ===================== */

const DATA_API = "https://data-api.polymarket.com";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const PORT = process.env.PORT || 3000;

// polling window
const TRADE_LOOKBACK = 100;
const POLL_WINDOW_SECONDS = 300; // 5 mins
const WHALE_THRESHOLD_USD = 500;
const HIGH_VOLUME_THRESHOLD = 4_000_000;

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

function isCryptoMarket(trade) {
  const text = `${trade.title} ${trade.slug}`.toLowerCase();
  return (
    text.includes("bitcoin") ||
    text.includes("market") ||
    text.includes("ethereum") ||
    text.includes("airdrop") ||
    text.includes("token") ||
    text.includes("buyback") ||
    text.includes("FDV") ||
    text.includes("price") ||
    text.includes("sale") ||
    text.includes("launch") ||
    text.includes("dip") ||
    text.includes("exchange") ||
    text.includes("cap") ||
    text.includes("solana") ||
    text.includes("crypto")
  );
}

function outcomeLabel(outcome) {
  if (!outcome) return "Unknown";
  if (["yes", "up"].includes(outcome.toLowerCase())) return "YES";
  if (["no", "down"].includes(outcome.toLowerCase())) return "NO";
  return outcome;
}

/* ===================== CORE SCAN ===================== */

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

    const msg = `
🐳 *Whale Trade Detected*

📊 *Market:* ${t.title}
🎯 *Outcome:* ${outcomeLabel(t.outcome)} (${t.outcome})
👛 Wallet: \`${t.proxyWallet}\`

💰 *Spent:* $${usdValue.toFixed(2)}
📈 *Price:* $${Number(t.price).toFixed(2)}
⏱ ${new Date(t.timestamp * 1000).toUTCString()}

🔗 [Place Trade](https://polymarket.com/market/${t.slug})
    `.trim();

    await sendTelegram(msg);
    alertsSent++;
  }

  /* -------- 🔥 HIGH-VOLUME CRYPTO MARKETS -------- */
  const marketAgg = {};

  for (const t of recentTrades) {
    if (!isCryptoMarket(t)) continue;

    const usd = Number(t.size) * Number(t.price);
    if (!marketAgg[t.conditionId]) {
      marketAgg[t.conditionId] = {
        title: t.title,
        slug: t.slug,
        total: 0,
        outcomes: {},
      };
    }

    marketAgg[t.conditionId].total += usd;

    const key = outcomeLabel(t.outcome);
    if (!marketAgg[t.conditionId].outcomes[key]) {
      marketAgg[t.conditionId].outcomes[key] = {};
    }

    marketAgg[t.conditionId].outcomes[key][t.proxyWallet] =
      (marketAgg[t.conditionId].outcomes[key][t.proxyWallet] || 0) + usd;
  }

  let cryptoAlertSent = false;

  for (const market of Object.values(marketAgg)) {
    if (market.total < HIGH_VOLUME_THRESHOLD) continue;

    cryptoAlertSent = true;

    let msg = `🔥 *High-Volume Crypto Market (Last 5 mins)*\n\n`;
    msg += `📊 *Market:* ${market.title}\n`;
    msg += `💵 *Total Volume:* $${market.total.toFixed(2)}\n\n`;

    for (const [side, wallets] of Object.entries(market.outcomes)) {
      msg += side === "YES" ? `🟢 *YES Buyers*\n` : `🔴 *NO Buyers*\n`;

      Object.entries(wallets)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([wallet, usd]) => {
          msg += `• \`${wallet.slice(0, 6)}...${wallet.slice(-4)}\` — $${usd.toFixed(2)}\n`;
        });

      msg += `\n`;
    }

    msg += `🔗 [Place Trade](https://polymarket.com/market/${market.slug})`;

    await sendTelegram(msg.trim());
    alertsSent++;
  }

  if (!cryptoAlertSent) {
    await sendTelegram(
      `🤖 *Crypto Scan*\n\nNo high-volume crypto whale activity detected in the last 5 minutes.`
    );
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

/* ===================== RENDER SERVER ===================== */

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

// /* ===================== CONFIG ===================== */a

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






