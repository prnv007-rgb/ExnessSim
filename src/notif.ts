import { createClient } from "redis";

const redisClient = createClient({ url: "redis://localhost:6379" });
redisClient.connect();

const EXECUTED_CHANNEL = "trade_executed";

async function sendNotification(userId: number, message: string) {
  // Fetch user contact info from Redis hash
  const userKey = `user:${userId}`;
  const email = await redisClient.hGet(userKey, "email");

  if (email) {
    // Replace with your email service
    console.log(`Sending email to ${email}: ${message}`);
  }
}

async function worker() {
  const subscriber = createClient();
  await subscriber.connect();

  console.log("Notification worker subscribed to", EXECUTED_CHANNEL);

  await subscriber.subscribe(EXECUTED_CHANNEL, async (orderJSON) => {
    try {
      const order = JSON.parse(orderJSON);
      const { userId, type, asset, qty, price } = order;

      const msg = `Your ${type.toUpperCase()} order executed: ${qty} ${asset} at $${price}`;
      await sendNotification(userId, msg);
    } catch (err) {
      console.error("Error processing trade notification:", err);
    }
  });
}

worker().catch(console.error);
