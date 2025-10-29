// polymarket-graphql.js
const fetch = require('node-fetch');

async function getTopTradersForMarket(slug) {
  try {
    // Fetch event details by slug
    const eventRes = await fetch(`https://gamma-api.polymarket.com/events/slug/${slug}`);
    if (!eventRes.ok) throw new Error(`Event not found`);
    const eventData = await eventRes.json();

    if (!eventData?.markets?.length) return [];

    // Pick first market id
    const marketId = eventData.markets[0].id;

    // Fetch trades for that market
    const tradesRes = await fetch(`https://gamma-api.polymarket.com/trades?market_id=${marketId}&limit=10`);
    if (!tradesRes.ok) throw new Error(`Trades not found`);
    const tradesData = await tradesRes.json();

    // Simplify top traders
    const top = tradesData.map(t => ({
      trader: t.trader.toLowerCase(),
      amount: `$${Number(t.size).toFixed(2)}`,
      outcome: t.outcome,
    }));

    return top;
  } catch (err) {
    console.error('Error in getTopTradersForMarket:', err.message);
    return [];
  }
}

module.exports = { getTopTradersForMarket };


// const fetch = require('node-fetch');

// // ✅ Safe GraphQL fetch with null checks
// async function getTopTradersForMarket(slug) {
//   try {
//     const query = `
//       query MarketStats($slug: String!) {
//         market(slug: $slug) {
//           id
//           volume24h
//           trades(first: 5, order: timestamp_DESC) {
//             id
//             maker
//             outcome
//             amount
//           }
//         }
//       }
//     `;

//     const response = await fetch("https://gamma-api.polymarket.com/query", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ query, variables: { slug } }),
//     });

//     const result = await response.json();
//     const market = result.data?.market;

//     if (!market) {
//       console.warn(`⚠️ No market data found for ${slug}`);
//       return [];
//     }

//     const trades = market.trades || [];

//     // Simplify trader data
//     return trades.map(trade => ({
//       trader: trade.maker,
//       outcome: trade.outcome,
//       amount: trade.amount,
//     }));
//   } catch (error) {
//     console.error(`Error fetching traders for ${slug}:`, error.message);
//     return [];
//   }
// }

// module.exports = { getTopTradersForMarket };
