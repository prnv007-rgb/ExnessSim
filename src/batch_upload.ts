import { createClient } from "redis";
import { Pool } from "pg";

const REDIS_CHANNEL = "asset-price-updates";
const pool = new Pool({
  connectionString: "postgresql://postgres:password@localhost:5432/timescale",
});

const DECIMALS = 8; // number of decimal places to store

async function startMarketDataUploader() {
  const subscriber = createClient();
  await subscriber.connect();
  console.log("Market Data Uploader connected to Redis.");

  await subscriber.subscribe(REDIS_CHANNEL, async (message) => {
    try {
      const trade = JSON.parse(message);
         console.log("Received trade message:", message);
      const symbol = trade.s; // e.g., BTCUSDT
      const price = parseFloat(trade.p);
      const qty = parseFloat(trade.q);
      const side = trade.m ? "SELL" : "BUY"; // Binance 'm' = market maker flag
      const ts = new Date(trade.T);

      // Convert price and qty to integer + decimals
      const price_value = Math.floor(price * 10 ** DECIMALS);
      const quantity_value = Math.floor(qty * 10 ** DECIMALS);

      await pool.query(
         `INSERT INTO trades(trade_time, symbol, price_value, quantity_value)
   VALUES ($1, $2, $3, $4)`,
  [ts, symbol, price_value, quantity_value]
      );

      console.log(`Stored trade: ${symbol} ${qty}@${price}`);
    } catch (err) {
      console.error("Error inserting market trade:", err);
    }
  });
}

startMarketDataUploader().catch(console.error);
