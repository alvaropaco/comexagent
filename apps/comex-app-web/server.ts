import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import axios from "axios";
import Parser from "rss-parser";
import Stripe from "stripe";
import { isbot } from "isbot";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };
import fs from "fs";
import dotenv from "dotenv";

const envCandidates = [".env.local", ".env"];
for (const candidate of envCandidates) {
  const fullPath = path.join(process.cwd(), candidate);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath });
    break;
  }
}

// Initialize Firebase Admin
if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const db = getFirestore();
const auth = getAuth();

// Lazy initialize Stripe
let stripe: Stripe | null = null;
const getStripe = () => {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      console.warn("STRIPE_SECRET_KEY is not set. Stripe features will be disabled.");
      return null;
    }
    stripe = new Stripe(key);
  }
  return stripe;
};

const CORE_API_URL = (process.env.VITE_CORE_DATA_API_URL || "https://core-data-api-iugpkvri4q-uc.a.run.app").replace(/\/$/, "");
const CHAT_API_URL = (process.env.VITE_COMEX_API_URL || "https://comex-api-iugpkvri4q-uc.a.run.app").replace(/\/$/, "");
const parser = new Parser();

const proxyApi = axios.create({
  timeout: 60000,
  validateStatus: () => true, // Don't throw on 4xx/5xx, handle manually for better logging
});

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT ?? 3000);
  const VITE_HMR_PORT = Number(process.env.VITE_HMR_PORT ?? process.env.HMR_PORT ?? 24678);

  app.use(cors());

  // Serve static files from public directory
  app.use(express.static(path.join(process.cwd(), 'public')));
  
  // Stripe Webhook MUST be before express.json() for raw body
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const stripeClient = getStripe();

    if (!stripeClient || !sig || !webhookSecret) {
      return res.status(400).send("Webhook Error: Missing stripe client, signature or secret");
    }

    let event;

    try {
      event = stripeClient.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error(`Webhook Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const firebaseUID = session.metadata?.firebaseUID;
          const subscriptionId = session.subscription as string;
          
          console.log(`Checkout session completed for user ${firebaseUID}, subscription ${subscriptionId}`);
          
          if (firebaseUID && subscriptionId) {
            const subscription = await stripeClient.subscriptions.retrieve(subscriptionId) as any;
            const priceId = subscription.items.data[0].price.id;
            const yearlyPriceId = process.env.STRIPE_YEARLY_PRICE_ID || process.env.VITE_STRIPE_YEARLY_PRICE_ID;
            const plan = priceId === yearlyPriceId ? "yearly" : "monthly";
            
            // 'active', 'trialing', and 'incomplete' (temporarily) are considered premium for UX
            const isPremiumStatus = ["active", "trialing", "incomplete"].includes(subscription.status);
            const status = isPremiumStatus ? "premium" : "free";

            // Use dot notation to update nested fields safely
            await db.collection("users").doc(firebaseUID).update({
              "subscription.status": status,
              "subscription.stripeStatus": subscription.status,
              "subscription.stripeCustomerId": session.customer as string,
              "subscription.stripeSubscriptionId": subscriptionId,
              "subscription.plan": plan,
              "subscription.currentPeriodEnd": new Date(subscription.current_period_end * 1000),
              "subscription.cancelAtPeriodEnd": subscription.cancel_at_period_end,
              "subscription.lastUpdated": FieldValue.serverTimestamp()
            }).catch(async (err) => {
              // If update fails (e.g. document doesn't have subscription field yet), use set with merge
              console.log("Update failed, falling back to set with merge:", err.message);
              await db.collection("users").doc(firebaseUID).set({
                subscription: {
                  status: status,
                  stripeStatus: subscription.status,
                  stripeCustomerId: session.customer as string,
                  stripeSubscriptionId: subscriptionId,
                  plan: plan,
                  currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                  cancelAtPeriodEnd: subscription.cancel_at_period_end,
                  lastUpdated: FieldValue.serverTimestamp()
                }
              }, { merge: true });
            });
            
            console.log(`User ${firebaseUID} upgraded to ${status} via checkout (Stripe status: ${subscription.status})`);
          }
          break;
        }
        case "invoice.paid": {
          const invoice = event.data.object as any;
          const subscriptionId = invoice.subscription as string;
          console.log(`Invoice paid for subscription ${subscriptionId}`);
          
          if (subscriptionId) {
            const subscription = await stripeClient.subscriptions.retrieve(subscriptionId) as any;
            const userSnapshot = await db.collection("users").where("subscription.stripeSubscriptionId", "==", subscriptionId).limit(1).get();
            
            if (!userSnapshot.empty) {
              const userDoc = userSnapshot.docs[0];
              await userDoc.ref.update({
                "subscription.status": "premium",
                "subscription.stripeStatus": subscription.status,
                "subscription.currentPeriodEnd": new Date(subscription.current_period_end * 1000),
                "subscription.lastUpdated": FieldValue.serverTimestamp()
              });
              console.log(`Subscription ${subscriptionId} renewed and status set to premium`);
            } else {
              console.log(`No user found for subscription ${subscriptionId} during invoice.paid`);
            }
          }
          break;
        }
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const subscription = event.data.object as any;
          console.log(`Subscription ${subscription.id} ${event.type} (Stripe status: ${subscription.status})`);
          
          // 'active' and 'trialing' are considered premium
          const isPremiumStatus = ["active", "trialing"].includes(subscription.status);
          const status = isPremiumStatus ? "premium" : "free";
          
          const userSnapshot = await db.collection("users").where("subscription.stripeSubscriptionId", "==", subscription.id).limit(1).get();
          
          if (!userSnapshot.empty) {
            const userDoc = userSnapshot.docs[0];
            await userDoc.ref.update({
              "subscription.status": status,
              "subscription.stripeStatus": subscription.status,
              "subscription.currentPeriodEnd": new Date(subscription.current_period_end * 1000),
              "subscription.cancelAtPeriodEnd": subscription.cancel_at_period_end,
              "subscription.lastUpdated": FieldValue.serverTimestamp()
            });
            console.log(`Subscription ${subscription.id} updated to ${status} in Firestore`);
          } else {
            console.log(`No user found for subscription ${subscription.id} during ${event.type}`);
          }
          break;
        }
      }
      res.json({ received: true });
    } catch (error) {
      console.error("Error processing webhook event:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  app.use(express.json());

  // Handle cookie check return URL fix for custom domains
  app.get("/__cookie_check.html", (req, res, next) => {
    const returnUrl = req.query.return_url as string;
    if (returnUrl && (returnUrl.includes("ais-pre-mcxq3eiv5pgxbxiuv4yi3o-539481878417.us-east1.run.app") || returnUrl.includes("run.app"))) {
      const host = req.headers["x-forwarded-host"] || req.headers.host || "www.comexagent.com";
      // Ensure we use the correct host and protocol
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const cleanHost = (host as string).split(':')[0]; // Remove port if present
      
      // Replace any run.app URL with the custom domain
      const newReturnUrl = returnUrl.replace(/https?:\/\/[^/]+/, `${protocol}://${cleanHost}`);
      
      console.log(`[CookieCheck] Fixing return_url: ${returnUrl} -> ${newReturnUrl}`);
      return res.redirect(`/__cookie_check.html?return_url=${encodeURIComponent(newReturnUrl)}`);
    }
    next();
  });

  // --- SEO & BOT RENDERING ---

  // Bot detection middleware
  const botMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const userAgent = req.headers["user-agent"] || "";
    if (isbot(userAgent)) {
      (req as any).isBot = true;
    }
    next();
  };

  app.use(botMiddleware);

  // Robots.txt
  app.get("/robots.txt", (req, res) => {
    res.type("text/plain");
    res.send(`User-agent: *
Allow: /
Sitemap: https://www.comexagent.com/sitemap.xml
`);
  });

  // Dynamic Sitemap
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const salesSnapshot = await db.collection("sales").get();
      const buyOrdersSnapshot = await db.collection("buy-orders").get();
      
      const baseUrl = "https://www.comexagent.com";
      let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/</loc><priority>1.0</priority></url>
  <url><loc>${baseUrl}/market</loc><priority>0.8</priority></url>
  <url><loc>${baseUrl}/marketplace</loc><priority>0.8</priority></url>`;

      salesSnapshot.forEach(doc => {
        const data = doc.data();
        const slug = `${data.commodity}-${data.origin}-${data.destination}`.toLowerCase().replace(/\s+/g, '-');
        sitemap += `\n  <url><loc>${baseUrl}/offers/${slug}</loc><priority>0.6</priority></url>`;
      });

      buyOrdersSnapshot.forEach(doc => {
        const data = doc.data();
        const slug = `${data.commodity}-${data.origin}-${data.destination}`.toLowerCase().replace(/\s+/g, '-');
        sitemap += `\n  <url><loc>${baseUrl}/buy-orders/${slug}</loc><priority>0.6</priority></url>`;
      });

      sitemap += "\n</urlset>";
      res.type("application/xml");
      res.send(sitemap);
    } catch (error) {
      console.error("Sitemap generation error:", error);
      res.status(500).send("Error generating sitemap");
    }
  });

  // Bot-based SSR fallback renderer
  const renderBotHtml = async (req: express.Request) => {
    const path = req.path;
    let title = "Comex Agent | AI-Native Commodities Marketplace";
    let description = "The premier AI-native marketplace for global commodity trading.";
    let content = "<h1>Comex Agent</h1><p>The AI-native commodities trading marketplace.</p>";
    let structuredData = null;

    // Route-specific content for bots
    if (path.startsWith("/offers/")) {
      const slug = path.split("/").pop() || "";
      // In a real app, we'd query by slug. Here we'll simulate.
      title = `Trade Offer: ${slug.replace(/-/g, ' ')} | Comex Agent`;
      description = `View details for the trade offer: ${slug.replace(/-/g, ' ')}. High-quality commodities available for global trade.`;
      content = `<h2>Trade Offer: ${slug.replace(/-/g, ' ')}</h2><p>${description}</p>`;
      structuredData = {
        "@context": "https://schema.org",
        "@type": "Offer",
        "name": title,
        "description": description,
        "availability": "https://schema.org/InStock"
      };
    } else if (path === "/market") {
      title = "Market Intelligence | Comex Agent";
      description = "Real-time commodity price analytics and market trends.";
      content = "<h2>Market Intelligence</h2><p>Latest commodity prices and trends for coffee, pepper, and more.</p>";
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  ${structuredData ? `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>` : ""}
</head>
<body>
  <div id="root">
    <header><h1>Comex Agent</h1></header>
    <main>
      ${content}
    </main>
    <footer>
      <p>&copy; 2026 Comex Agent. All rights reserved.</p>
      <nav>
        <a href="/">Home</a> | <a href="/market">Market</a> | <a href="/marketplace">Marketplace</a>
      </nav>
    </footer>
  </div>
</body>
</html>`;
    return html;
  };

  // Stripe Checkout Session
  app.post("/api/create-checkout-session", async (req, res) => {
    const { priceId, firebaseUID, email } = req.body;
    const stripeClient = getStripe();

    if (!stripeClient) {
      return res.status(500).json({ error: "Stripe is not configured" });
    }

    // Validation to help users catch Product ID vs Price ID errors
    if (priceId && priceId.startsWith("prod_")) {
      return res.status(400).json({ 
        error: `Invalid Price ID: '${priceId}'. It looks like you provided a Product ID (starting with 'prod_') instead of a Price ID (starting with 'price_'). Please update your Stripe environment variables in the settings.` 
      });
    }

    try {
      const session = await stripeClient.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        customer_email: email,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        metadata: {
          firebaseUID: firebaseUID,
        },
        success_url: `${req.headers.origin}/copilot?payment=success`,
        cancel_url: `${req.headers.origin}/copilot?payment=cancel`,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Stripe Customer Portal
  app.post("/api/create-portal-session", async (req, res) => {
    const { firebaseUID } = req.body;
    const stripeClient = getStripe();

    if (!stripeClient) {
      return res.status(500).json({ error: "Stripe is not configured" });
    }

    if (!firebaseUID) {
      return res.status(400).json({ error: "Missing Firebase UID" });
    }

    try {
      const userDoc = await db.collection("users").doc(firebaseUID).get();
      const userData = userDoc.data();
      const customerId = userData?.subscription?.stripeCustomerId;

      if (!customerId) {
        return res.status(400).json({ error: "No Stripe customer found for this user. They may not have a subscription yet." });
      }

      const session = await stripeClient.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${req.headers.origin}/copilot`,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating portal session:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // News RSS Proxy
  app.get("/api/news", async (req, res) => {
    try {
      // Using Investing.com Commodities RSS as a reliable source
      const feed = await parser.parseURL("https://www.investing.com/rss/news_11.rss");
      
      // Prioritize coffee and pepper
      const priorityKeywords = ["coffee", "pepper"];
      const generalKeywords = ["commodity", "trade", "market", "sugar", "cocoa"];
      
      const items = feed.items.map(item => {
        const content = (item.title + " " + (item.contentSnippet || "")).toLowerCase();
        let score = 0;
        if (priorityKeywords.some(kw => content.includes(kw))) score += 100;
        if (generalKeywords.some(kw => content.includes(kw))) score += 10;
        
        // Add a small time-based score to prefer newer items within the same priority
        const pubDate = item.pubDate ? new Date(item.pubDate).getTime() : 0;
        return { ...item, score, pubDate };
      });

      const sortedItems = items.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.pubDate - a.pubDate;
      });

      // Ensure we return at least 8 items if available, or all if less than 8
      const finalItems = sortedItems.slice(0, 12);

      res.json(finalItems);
    } catch (error) {
      console.error("Error fetching RSS:", error);
      res.status(500).json({ error: "Failed to fetch news" });
    }
  });

  // Proxy routes to Core Data API
  app.post("/api/sales", async (req, res) => {
    try {
      const response = await proxyApi.post(`${CORE_API_URL}/sales`, req.body, {
        headers: { 'Content-Type': 'application/json' }
      });
      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error("Proxy POST /api/sales Error:", error.message);
      res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
  });

  app.get("/api/sales", async (req, res) => {
    try {
      const response = await proxyApi.get(`${CORE_API_URL}/sales`, { params: req.query });
      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error("Proxy GET /api/sales Error:", error.message);
      res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
  });

  app.post("/api/buy-orders", async (req, res) => {
    try {
      const response = await proxyApi.post(`${CORE_API_URL}/buy-orders`, req.body, {
        headers: { 'Content-Type': 'application/json' }
      });
      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error("Proxy POST /api/buy-orders Error:", error.message);
      res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
  });

  app.get("/api/buy-orders", async (req, res) => {
    try {
      const response = await proxyApi.get(`${CORE_API_URL}/buy-orders`, { params: req.query });
      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error("Proxy GET /api/buy-orders Error:", error.message);
      res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
  });

  app.get("/api/matches", async (req, res) => {
    try {
      const response = await proxyApi.get(`${CORE_API_URL}/matches`, { params: req.query });
      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error("Proxy GET /api/matches Error:", error.message);
      res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
  });

  app.get("/api/matches/explain", async (req, res) => {
    try {
      const response = await proxyApi.get(`${CORE_API_URL}/matches/explain`, { params: req.query });
      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error("Proxy GET /api/matches/explain Error:", error.message);
      res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
  });

  app.post("/api/vector/search", async (req, res) => {
    try {
      const response = await proxyApi.post(`${CORE_API_URL}/vector/search`, req.body, {
        headers: { 'Content-Type': 'application/json' }
      });
      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error("Proxy POST /api/vector/search Error:", error.message);
      res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
  });

  app.post("/api/chat", async (req, res) => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    console.log(`[ChatProxy] Received request ${requestId} for ${CHAT_API_URL}/v1/request`);
    
    const endpoints = [
      `${CHAT_API_URL}/v1/request`,
      `${CHAT_API_URL}/request`,
      `${CHAT_API_URL}/api/v1/request`
    ];

    let lastError: any = null;
    let success = false;

    for (const endpoint of endpoints) {
      try {
        console.log(`[ChatProxy] Trying endpoint: ${endpoint} for ${requestId}`);
        const response = await proxyApi.post(endpoint, req.body, {
          headers: { 
            'Content-Type': 'application/json',
            'x-request-id': requestId
          }
        });

        if (response.status === 404) {
          console.log(`[ChatProxy] Endpoint ${endpoint} returned 404, trying next...`);
          continue;
        }

        console.log(`[ChatProxy] Response from backend for ${requestId} at ${endpoint}: ${response.status}`);
        res.status(response.status).json(response.data);
        success = true;
        break;
      } catch (error: any) {
        lastError = error;
        console.error(`[ChatProxy] Error at ${endpoint} for ${requestId}:`, error.message);
        // If it's a network error (not a 404), we might want to stop or continue
        // For now, we continue to the next endpoint
      }
    }

    if (!success) {
      const status = lastError?.response?.status || 500;
      const data = lastError?.response?.data || { error: "Internal Server Error", details: lastError?.message };
      res.status(status).json(data);
    }
  });

  app.get("/api/market/coffee/latest", async (req, res) => {
    try {
      const response = await proxyApi.get(`${CORE_API_URL}/market/coffee/latest`);
      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error("Proxy GET /api/market/coffee/latest Error:", error.message);
      res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
  });

  app.get("/api/market/yahoo/chart/coffee/level4", async (req, res) => {
    try {
      const response = await proxyApi.get(`${CORE_API_URL}/market/yahoo/chart/coffee/level4`);
      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error("Proxy GET /api/market/yahoo/chart/coffee/level4 Error:", error.message);
      res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
  });

  app.get("/api/market/yahoo/movers/commodities", async (req, res) => {
    try {
      const response = await proxyApi.get(`${CORE_API_URL}/market/yahoo/movers/commodities`);
      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error("Proxy GET /api/market/yahoo/movers/commodities Error:", error.message);
      res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
  });

  app.get("/api/market/yahoo/chart/series", async (req, res) => {
    try {
      const query = new URLSearchParams();
      if (typeof req.query.symbol === "string") query.set("symbol", req.query.symbol);
      if (typeof req.query.interval === "string") query.set("interval", req.query.interval);
      if (typeof req.query.range === "string") query.set("range", req.query.range);
      const qs = query.toString();
      const response = await proxyApi.get(`${CORE_API_URL}/market/yahoo/chart/series${qs ? `?${qs}` : ""}`);
      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error("Proxy GET /api/market/yahoo/chart/series Error:", error.message);
      res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
  });

  app.get("/api/market/ticks/ticker-tape", async (req, res) => {
    try {
      const query = new URLSearchParams();
      if (typeof req.query.timeframe === "string") query.set("timeframe", req.query.timeframe);
      if (typeof req.query.limit === "string") query.set("limit", req.query.limit);
      const qs = query.toString();
      const response = await proxyApi.get(`${CORE_API_URL}/market/ticks/ticker-tape${qs ? `?${qs}` : ""}`);
      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error("Proxy GET /api/market/ticks/ticker-tape Error:", error.message);
      res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
  });

  app.get("/api/market/ticks/chart", async (req, res) => {
    try {
      const query = new URLSearchParams();
      if (typeof req.query.symbol === "string") query.set("symbol", req.query.symbol);
      if (typeof req.query.timeframe === "string") query.set("timeframe", req.query.timeframe);
      if (typeof req.query.limit === "string") query.set("limit", req.query.limit);
      const qs = query.toString();
      const response = await proxyApi.get(`${CORE_API_URL}/market/ticks/chart${qs ? `?${qs}` : ""}`);
      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error("Proxy GET /api/market/ticks/chart Error:", error.message);
      res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
  });

  app.get("/api/market/indexes", async (req, res) => {
    try {
      const query = new URLSearchParams();
      if (typeof req.query.symbol === "string") query.set("symbol", req.query.symbol);
      if (typeof req.query.timeframe === "string") query.set("timeframe", req.query.timeframe);
      if (typeof req.query.limit === "string") query.set("limit", req.query.limit);
      const qs = query.toString();
      const response = await proxyApi.get(`${CORE_API_URL}/market/indexes${qs ? `?${qs}` : ""}`);
      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error("Proxy GET /api/market/indexes Error:", error.message);
      res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
  });

  app.get("/api/debug", async (req, res) => {
    const debugInfo: any = {
      CORE_API_URL,
      CHAT_API_URL,
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT || 3000,
      headers: {
        host: req.headers.host,
        'x-forwarded-host': req.headers['x-forwarded-host'],
        'x-forwarded-proto': req.headers['x-forwarded-proto'],
      },
      envStatus: {
        VITE_CORE_DATA_API_URL: process.env.VITE_CORE_DATA_API_URL ? "DEFINED" : "UNDEFINED (Using Default)",
        VITE_COMEX_API_URL: process.env.VITE_COMEX_API_URL ? "DEFINED" : "UNDEFINED (Using Default)",
      },
      connectivity: {}
    };

    // Check Core API
    try {
      const coreCheck = await proxyApi.get(`${CORE_API_URL}/sales`, { timeout: 10000 });
      debugInfo.connectivity.core = { status: coreCheck.status, ok: true };
    } catch (e: any) {
      debugInfo.connectivity.core = { ok: false, error: e.message };
    }

    // Check Chat API with multiple endpoints
    const chatEndpoints = [
      { name: 'root', url: CHAT_API_URL },
      { name: 'v1_request', url: `${CHAT_API_URL}/v1/request` },
      { name: 'request', url: `${CHAT_API_URL}/request` },
      { name: 'api_v1_request', url: `${CHAT_API_URL}/api/v1/request` }
    ];

    debugInfo.connectivity.chat = {};

    for (const endpoint of chatEndpoints) {
      try {
        console.log(`[Debug] Checking Chat API ${endpoint.name}: ${endpoint.url}`);
        const check = await proxyApi.get(endpoint.url, { timeout: 10000 });
        debugInfo.connectivity.chat[endpoint.name] = { 
          status: check.status, 
          ok: true,
          method: 'GET'
        };
      } catch (e: any) {
        debugInfo.connectivity.chat[endpoint.name] = { 
          ok: false, 
          error: e.message 
        };
      }
    }

    res.json(debugInfo);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { port: VITE_HMR_PORT } },
      appType: "spa",
    });
    
    app.use(async (req, res, next) => {
      if ((req as any).isBot) {
        const botHtml = await renderBotHtml(req);
        return res.send(botHtml);
      }
      vite.middlewares(req, res, next);
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", async (req, res) => {
      if ((req as any).isBot) {
        const botHtml = await renderBotHtml(req);
        return res.send(botHtml);
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
