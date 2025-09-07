    import express from "express"
    import jwt from "jsonwebtoken"
    import  cors from "cors"
    import { PrismaClient } from "@prisma/client";
    const prisma = new PrismaClient();
    const app=express();
    import { createClient } from 'redis';
    import { WebSocketServer } from 'ws';
    const REDIS_CHANNEL = 'asset-price-updates';
    import { Request, Response, NextFunction } from "express";
    import { trackAsset } from "./order";
    const redisClient = createClient({ url: "redis://localhost:6379" }); // or your Redis host
    redisClient.connect();
    app.use(cors())
    app.use(express.json())


    interface AuthRequest extends Request {
    userId?: number;
    }


    app.post("/signup",async(req,res)=>{
        try{
        const {email,password}=req.body
        if (!email || !password){
            return res.status(400).json({message:"fill the missing fields"})
        }
        const check=await prisma.user.findUnique({where:{email}});
        if (check){
            return res.status(409).json({message:"existing user"})
        }
        const user=await prisma.user.create({
            data:{
                email,
                password
            }
        })
    return res.status(201).json({
        message: "User created successfully",
        user,
        });
    }
        catch(err){
        console.error(err);
        res.status(500).json({ message: "Error creating user" });    
    }})

    app.post("/signin",async (req,res)=>{
    try{
    const {email,password}=req.body
    if (!email || !password){
            return res.status(400).json({message:"fill the missing fields"})
        }const check=await prisma.user.findUnique({where:{email}});
        if (check){
            if(check.password!=password){
                res.status(403).json({message:"wrong password"})
            }
            else{
        const token=jwt.sign({email},"abc123")
                const redisKey = `user:${check.uid}`;
        await redisClient.hSet(redisKey, {
        email: check.email});
        res.status(200).json({token:token})
        }}
        else{
            res.status(403).json({message:"invalid"})
        }
    }
    catch(err){
        res.status(400).json({message:"error"})
    }
    })

    async function auth(req: AuthRequest, res: Response, next: NextFunction) {
    try {
        const token = req.headers.token as string | undefined;
        if (!token) return res.status(401).json({ message: "No token provided" });
        const payload = jwt.verify(token, "abc123") as { email: string };
        const user = await prisma.user.findUnique({ where: { email: payload.email } });
        if (!user) return res.status(403).json({ message: "Unauthorized" });
        req.userId = user.uid;
        next();
    } catch (err) {
        console.error(err);
        return res.status(401).json({ message: "Invalid token" });
    }
    }
    app.post("/add", auth, async (req: AuthRequest, res: Response) => {
    try {
        const { amount } = req.body;

        if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
        }

        let usdAsset = await prisma.userAsset.findFirst({
        where: { userId: req.userId, asset: "USD" },
        });

        if (usdAsset) {
        usdAsset = await prisma.userAsset.update({
            where: { id: usdAsset.id },
            data: { qty: usdAsset.qty + amount },
        });
        } else {
        usdAsset = await prisma.userAsset.create({
            data: {
            userId: req.userId!,
            asset: "USD",
            qty: amount,
            type: "fiat",
            },
        });
        }
        return res.status(200).json({
        message: "Balance updated",
        balance: usdAsset,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error updating balance" });
    }
    });

    app.get("/balances", auth, async (req: AuthRequest, res: Response) => {
    try {
        const assets = await prisma.userAsset.findMany({
        where: { userId: req.userId },
        select: {
            asset: true,
            qty: true,
            type: true
        }
        });
        res.status(200).json(assets);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error fetching balances" });
    }
    });
app.post("/orders", auth, async (req: AuthRequest, res: Response) => {
  try {
    const { type, asset, qty } = req.body;
    if (!["buy", "sell"].includes(type)) {
      return res.status(400).json({ message: "Invalid order type" });
    }

    const user = await prisma.user.findUnique({ where: { uid: req.userId } });
    if (!user) return res.status(403).json({ message: "Unauthorized" });

    // Get latest prices from Redis
    const assets = await redisClient.hGetAll("latest_price");
    const prices: Record<string, number> = Object.fromEntries(
      Object.entries(assets).map(([key, price]) => [key.toUpperCase() + "USDT", parseFloat(price)])
    );

    const price = prices[asset];
    if (!price) {
      return res.status(400).json({ message: `No price available for ${asset}` });
    }

    // Fetch USD balance
    const usdBalance = await prisma.userAsset.findFirst({
      where: { userId: user.uid, asset: "USD" },
    });

    // Fetch asset balance
    let assetBalance = await prisma.userAsset.findFirst({
      where: { userId: user.uid, asset },
    });

    if (type === "buy") {
      const cost = qty * price;
      if (!usdBalance || usdBalance.qty < cost) {
        return res.status(400).json({ message: "Insufficient USD balance" });
      }

      // Deduct USD
      await prisma.userAsset.update({
        where: { id: usdBalance.id },
        data: { qty: usdBalance.qty - cost },
      });

      // Add purchased asset
      if (assetBalance) {
        await prisma.userAsset.update({
          where: { id: assetBalance.id },
          data: { qty: assetBalance.qty + qty },
        });
      } else {
        assetBalance = await prisma.userAsset.create({
          data: { userId: user.uid, asset, qty, type: "crypto" },
        });
      }

    } else if (type === "sell") {
      if (!assetBalance || assetBalance.qty < qty) {
        return res.status(400).json({ message: "Insufficient asset balance" });
      }

      const proceeds = qty * price;

      // Deduct sold asset
      await prisma.userAsset.update({
        where: { id: assetBalance.id },
        data: { qty: assetBalance.qty - qty },
      });

      // Add USD
      if (usdBalance) {
        await prisma.userAsset.update({
          where: { id: usdBalance.id },
          data: { qty: usdBalance.qty + proceeds },
        });
      } else {
        await prisma.userAsset.create({
          data: { userId: user.uid, asset: "USD", qty: proceeds, type: "fiat" },
        });
      }
    }

    // Create the order record
    const order = await prisma.order.create({
      data: {
        userId: user.uid,
        type,
        asset,
        qty,
        price,
        isLimit: false,
        status: "closed",
        executedAt: new Date(),
      },
    });

    await redisClient.rPush("orders_queue", JSON.stringify(order));
    await redisClient.publish("trade_executed", JSON.stringify(order));

    res.status(201).json({ message: "Order placed", order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error placing order" });
  }
});
app.get("/latest_prices", async (req: Request, res: Response) => {
  try {
    const assets = await redisClient.hGetAll("latest_price");
    const prices: Record<string, number> = Object.fromEntries(
      Object.entries(assets).map(([key, price]) => [key.toUpperCase() + "USDT", parseFloat(price)])
    );
    res.status(200).json(prices);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching latest prices" });
  }
});
    app.post("/limit", auth, async (req: AuthRequest, res: Response) => {
  try {
    const { type, asset, qty, limitPrice } = req.body;
    if (!["buy", "sell"].includes(type)) {
      return res.status(400).json({ message: "Invalid order type" });
    }
    if (!limitPrice || limitPrice == 0) {
      return res.status(400).json({ message: "Invalid price" });
    }
    const user = await prisma.user.findUnique({ where: { uid: req.userId } });
    if (!user) return res.status(403).json({ message: "unauth" });

    if (type === "buy") {
      const cost = qty * limitPrice;
      const balance = await prisma.userAsset.findFirst({
        where: { userId: user.uid, asset: "USD" },
      });
      if (!balance || balance.qty < cost) {
        return res.status(400).json({ message: "Insufficient USD balance" });
      }
    } else if (type === "sell") {
      const balance = await prisma.userAsset.findFirst({
        where: { userId: user.uid, asset },
      });
      if (!balance || balance.qty < qty) {
        return res.status(400).json({ message: "Insufficient asset balance" });
      }
    }
    const normalizedAsset = asset.replace("USDT", "").toUpperCase();
    const order = await prisma.order.create({
      data: {
        userId: user.uid,
        type,
        asset:normalizedAsset,
        qty,
        price: 0,
        limitPrice,
        status: "open",
        isLimit: true,
        executedAt: null,
      },
    });

    // **NEW:** tell worker to watch this asset
    trackAsset(normalizedAsset);

    res.status(201).json({ message: "Limit order placed", order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error placing limit order" });
  }
});


    const wss = new WebSocketServer({ port: 8080 });
    wss.on('connection',(wsClient)=>{
        console.log('Frontend client connected');
        wsClient.on('close',()=>{
            console.log('Frontend client disconnected');
        })
    });
    function broadcast(message:String) {
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }
    async function startredis() {
        const subscriber = createClient({ url: "redis://localhost:6379" });
        await subscriber.connect();
        await subscriber.subscribe(REDIS_CHANNEL, (message) => {
            broadcast(message); // send to all connected WebSocket clients
        });
        await subscriber.subscribe("trade_executed", (message) => broadcast(message));
    }
    import { Pool } from "pg";

    // TimescaleDB connection (make sure env var or creds are set)
    const pool = new Pool({
    connectionString: "postgres://postgres:password@localhost:5432/timescale",
    });

    // GET /candles?symbol=BTCUSDT&interval=1m&limit=100
    app.get("/candles", async (req: Request, res: Response) => {
    try {
        const { symbol, interval = "1m", limit = 100 } = req.query;

        if (!symbol) {
        return res.status(400).json({ error: "symbol is required" });
        }

        // Map interval -> continuous aggregate view
        const viewMap: Record<string, string> = {
        "30s": "trades_30s",
        "1m": "trades_1m",
        "5m": "trades_5m",
        "10m": "trades_10m",
        "30m": "trades_30m",
        };

        const viewName = viewMap[interval as string];
        if (!viewName) {
        return res.status(400).json({ error: "Invalid interval" });
        }

        const query = `
        SELECT 
            bucket AS time,
            open_value AS open,
            high_value AS high,
            low_value AS low,
            close_value AS close,
            volume_value AS volume
        FROM ${viewName}
        WHERE symbol = $1
        ORDER BY bucket DESC
        LIMIT $2
        `;

        const { rows } = await pool.query(query, [symbol, limit]);

        res.json(rows.reverse()); // oldest → newest
    } catch (err) {
        console.error("Error fetching candles:", err);
        res.status(500).json({ error: "Error fetching candles" });
    }
    });
    app.listen(3000, () => {
        startredis().catch(console.error);
    });