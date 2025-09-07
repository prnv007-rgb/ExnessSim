import { createClient } from "redis";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const REDIS_CHANNEL = "asset-price-updates";

const activeAssets = new Set<string>(); // only assets with open limit orders

// Track asset for limit orders
export function trackAsset(asset: string) {
  if (!activeAssets.has(asset)) {
    activeAssets.add(asset);
    console.log(`Started tracking ${asset} for limit orders`);
  }
}

// Untrack asset if no open limit orders remain
async function untrackAssetIfDone(asset: string) {
  const remaining = await prisma.order.count({
    where: { asset, isLimit: true, status: "open" },
  });
  if (remaining === 0 && activeAssets.has(asset)) {
    activeAssets.delete(asset);
    console.log(`Stopped tracking ${asset} (no open limit orders left)`);
  }
}

export async function startLimitOrderWorker() {
  const subscriber = createClient({ url: "redis://localhost:6379" });
  await subscriber.connect();

  const publisher = createClient({ url: "redis://localhost:6379" });
  await publisher.connect();

  console.log("Limit order worker connected to Redis");

  await subscriber.subscribe(REDIS_CHANNEL, async (message) => {
    try {
      const trade = JSON.parse(message);
      const asset = trade.s.replace("USDT", "").toUpperCase();
      const currentPrice = parseFloat(trade.p);
      console.log(`[TRADE] Received trade for ${asset}: $${currentPrice}`);

      if (!activeAssets.has(asset)) {
        console.log(`[SKIP] Asset ${asset} not being tracked`);
        return;
      }

      // Fetch only the latest open limit order for this asset
      const order = await prisma.order.findFirst({
        where: { asset, isLimit: true, status: "open" },
        orderBy: { createdAt: "desc" }, // latest order first
      });

      if (!order) {
        console.log(`[INFO] No open limit order for ${asset}`);
        return;
      }

      const shouldExecute =
        (order.type === "buy" && currentPrice <= order.limitPrice!) ||
        (order.type === "sell" && currentPrice >= order.limitPrice!);

      console.log(
        `[CHECK] Order ${order.id} (${order.type}) limit ${order.limitPrice}, current $${currentPrice}, shouldExecute: ${shouldExecute}`
      );

      if (!shouldExecute) return;

      // Execute order in transaction
      await prisma.$transaction(async (tx) => {
        if (order.type === "buy") {
          const usdAsset = await tx.userAsset.findFirst({
            where: { userId: order.userId, asset: "USD" },
          });
          if (!usdAsset || usdAsset.qty < order.qty * currentPrice) {
            console.log(`Skipping order ${order.id}: insufficient USD`);
            return;
          }

          await tx.userAsset.update({
            where: { id: usdAsset.id },
            data: { qty: usdAsset.qty - order.qty * currentPrice },
          });

          const assetBalance = await tx.userAsset.findFirst({
            where: { userId: order.userId, asset: order.asset },
          });
          if (assetBalance) {
            await tx.userAsset.update({
              where: { id: assetBalance.id },
              data: { qty: assetBalance.qty + order.qty },
            });
          } else {
            await tx.userAsset.create({
              data: {
                userId: order.userId,
                asset: order.asset,
                qty: order.qty,
                type: "crypto",
              },
            });
          }
        } else {
          // sell
          const assetBalance = await tx.userAsset.findFirst({
            where: { userId: order.userId, asset: order.asset },
          });
          if (!assetBalance || assetBalance.qty < order.qty) {
            console.log(`Skipping order ${order.id}: insufficient ${order.asset}`);
            return;
          }

          await tx.userAsset.update({
            where: { id: assetBalance.id },
            data: { qty: assetBalance.qty - order.qty },
          });

          const usdAsset = await tx.userAsset.findFirst({
            where: { userId: order.userId, asset: "USD" },
          });
          if (usdAsset) {
            await tx.userAsset.update({
              where: { id: usdAsset.id },
              data: { qty: usdAsset.qty + order.qty * currentPrice },
            });
          } else {
            await tx.userAsset.create({
              data: {
                userId: order.userId,
                asset: "USD",
                qty: order.qty * currentPrice,
                type: "fiat",
              },
            });
          }
        }

        // Mark order as closed
        const result = await tx.order.updateMany({
          where: { id: order.id, status: "open" },
          data: { status: "closed", price: currentPrice, executedAt: new Date() },
        });

        if (result.count === 0) {
          console.log(`Order ${order.id} was already executed by another worker`);
          return;
        }

        const executedOrder = await tx.order.findUnique({ where: { id: order.id } });
        if (!executedOrder) return;

        await publisher.rPush("orders_queue", JSON.stringify(executedOrder));
        await publisher.publish("trade_executed", JSON.stringify(executedOrder));

        console.log(`Executed limit order: ${executedOrder.id} at $${currentPrice}`);
      });

      // Check if we can stop tracking this asset
      await untrackAssetIfDone(asset);
    } catch (err) {
      console.error("Error in limit order worker:", err);
    }
  });
}

// Start worker immediately
startLimitOrderWorker().catch(console.error);
