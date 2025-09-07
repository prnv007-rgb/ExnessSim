import { createClient } from "redis";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const redisClient = createClient({ url: "redis://localhost:6379" });
redisClient.connect();

const ORDERS_QUEUE = "orders_queue";
const EXECUTED_CHANNEL = "trade_executed";

async function executeOrder(order: any) {
  const { userId, type, asset, qty, price } = order;

  if (type === "buy") {
    const cost = qty * price;
    const usdtBalance = await prisma.userAsset.findFirst({
      where: { userId, asset: "USDT" },
    });
    if (!usdtBalance || usdtBalance.qty < cost) {
      console.error("Insufficient USDT balance for user", userId);
      return;
    }

    // Subtract USDT
    await prisma.userAsset.update({
      where: { id: usdtBalance.id },
      data: { qty: usdtBalance.qty - cost },
    });

    // Fetch asset balance
    const assetBalance = await prisma.userAsset.findFirst({
      where: { userId, asset },
    });

    if (assetBalance) {
      await prisma.userAsset.update({
        where: { id: assetBalance.id },
        data: { qty: assetBalance.qty + qty },
      });
    } else {
      await prisma.userAsset.create({
        data: { userId, asset, qty, type },
      });
    }
  } else if (type === "sell") {
    // Fetch asset balance
    const assetBalance = await prisma.userAsset.findFirst({
      where: { userId, asset },
    });
    if (!assetBalance || assetBalance.qty < qty) {
      console.error("Insufficient asset balance for user", userId);
      return;
    }

    // Subtract sold asset
    await prisma.userAsset.update({
      where: { id: assetBalance.id },
      data: { qty: assetBalance.qty - qty },
    });

    // Add USDT from sale
    const revenue = qty * price;
    const usdtBalance = await prisma.userAsset.findFirst({
      where: { userId, asset: "USDT" },
    });

    if (usdtBalance) {
      await prisma.userAsset.update({
        where: { id: usdtBalance.id },
        data: { qty: usdtBalance.qty + revenue },
      });
    } else {
      await prisma.userAsset.create({
        data: { userId, asset: "USDT", qty: revenue, type: "buy" },
      });
    }
  }

  // Publish trade executed event
  await redisClient.publish(EXECUTED_CHANNEL, JSON.stringify(order));
}

async function pollOrders() {
  while (true) {
    const orderJSON = await redisClient.lPop(ORDERS_QUEUE);
    if (orderJSON) {
      const order = JSON.parse(orderJSON);
      console.log("Executing order:", order);
      await executeOrder(order);
    } else {
      await new Promise((r) => setTimeout(r, 500)); // wait 0.5s
    }
  }
}

pollOrders().catch(console.error);
