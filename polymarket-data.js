// const fetch = require('node-fetch');

// const BASE = 'https://data-api.polymarket.com';

// // ---- Get recent trades for a market ----
// async function getMarketTrades(slug, limit = 5) {
//   const url = `${BASE}/trades?market=${slug}&limit=${limit}`;
//   const res = await fetch(url);
//   if (!res.ok) return [];
//   return res.json();
// }

// // ---- Get top holders for a market ----
// async function getTopHolders(slug, limit = 5) {
//   const url = `${BASE}/top-holders?market=${slug}&limit=${limit}`;
//   const res = await fetch(url);
//   if (!res.ok) return [];
//   return res.json();
// }

// // ---- Get wallet activity ----
// async function getWalletActivity(wallet, limit = 5) {
//   const url = `${BASE}/activity?user=${wallet}&limit=${limit}`;
//   const res = await fetch(url);
//   if (!res.ok) return [];
//   return res.json();
// }

// module.exports = {
//   getMarketTrades,
//   getTopHolders,
//   getWalletActivity,
// };
