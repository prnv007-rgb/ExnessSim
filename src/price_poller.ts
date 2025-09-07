import WebSocket from 'ws';
import { createClient } from 'redis';

const REDIS_URL = "redis://localhost:6379";
const REDIS_CHANNEL = 'asset-price-updates';

// Assets we want to track
const assets = ["btcusdt", "ethusdt", "solusdt", "bnbusdt","adausdt"];

async function startPricePoller() {
    const publisher = createClient({ url: REDIS_URL });
    await publisher.connect();
    console.log('Price Poller connected to Redis.');

    const streamUrl = `wss://stream.binance.com:9443/stream?streams=${assets.map(a => `${a}@trade`).join("/")}`;
    const ws = new WebSocket(streamUrl);

    ws.on('open', () => console.log('Connected to Binance combined stream'));

    ws.on('message', async (data) => {
        try {
            const payload = JSON.parse(data.toString());
            const trade = payload.data; // Binance wraps each trade under `data`
            const assetSymbol = trade.s.replace("USDT", "").toUpperCase()
            const price = trade.p;

            // Save latest price in Redis hash
            await publisher.hSet("latest_price", assetSymbol, price);

            // Publish raw trade to channel for WebSocket clients
            publisher.publish(REDIS_CHANNEL, JSON.stringify(trade));

            console.log(`Updated ${assetSymbol}: $${price}`);
        } catch (err) {
            console.error("Error parsing Binance message:", err);
        }
    });

    ws.on('close', () => {
        console.log('Disconnected. Reconnecting in 5 seconds...');
        setTimeout(startPricePoller, 5000);
    });

    ws.on('error', (err) => {
        console.error("Binance WS Error:", err);
    });
}

startPricePoller();
