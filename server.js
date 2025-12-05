require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const Category = require("./models/Category");
const Cake = require("./models/Cake");

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static('public'));

// Explicit route for assets to ensure MIME types
app.get('/assets/*', (req, res) => {
  const filePath = __dirname + '/public' + req.path;
  res.sendFile(filePath);
});

// Use a cached mongoose connection for serverless environments (Vercel)
const mongoUrl = process.env.MONGO_URL;

// Cached connection across lambda invocations
const cached = global._mongoCached || (global._mongoCached = { conn: null, promise: null });

async function connectToDatabase() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    if (!mongoUrl) {
      throw new Error('MONGO_URL environment variable is not set');
    }
    const opts = {
      // prevent mongoose from buffering operations indefinitely
      bufferCommands: false,
      // other options can go here
    };
    cached.promise = mongoose.connect(mongoUrl, opts).then((mongooseInstance) => {
      cached.conn = mongooseInstance;
      console.log('✅ MongoDB Connected');
      return cached.conn;
    }).catch((err) => {
      console.error('❌ MongoDB Connection Error:', err && err.message ? err.message : err);
      // rethrow so callers can handle
      throw err;
    });
  }

  return cached.promise;
}

// =============== DEFAULT TEST ROUTE (IMPORTANT FOR VERCEL) ===============
app.get("/", (req, res) => {
  res.send("🎂 Cake Backend API is Running on Vercel!");
});

// ========================================================================
// ALL YOUR EXISTING ROUTES (no change)
// ========================================================================

// GET ALL CATEGORIES
app.get("/api/categories", async (req, res) => {
  try {
    await connectToDatabase();
    const cat = await Category.find();
    res.json(cat);
  } catch {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// FILTER OPTIONS
app.get("/api/filter-options", async (req, res) => {
  try {
    await connectToDatabase();
    const cakes = await Cake.find();

    const categories = [...new Set(cakes.flatMap(c => c.categories || []))];
    const flavours = [...new Set(cakes.map(c => c.flavour).filter(Boolean))];
    const weights = [...new Set(cakes.flatMap(c => c.weightOptions || []))];
    const vegOptions = [...new Set(cakes.map(c => (c.veg ? "veg" : "nonveg")))];

    const allPrices = cakes.flatMap(c => c.prices || []);
    const priceRange = {
      min: allPrices.length ? Math.min(...allPrices) : 0,
      max: allPrices.length ? Math.max(...allPrices) : 0
    };

    res.json({ categories, flavours, weights, vegOptions, priceRange });

  } catch (err) {
    console.error("Filter options error:", err);
    res.status(500).json({ error: "Failed to fetch filter options" });
  }
});

// SEARCH SUGGESTIONS
app.get("/api/search-suggestions", async (req, res) => {
  try {
    await connectToDatabase();
    const q = req.query.q || "";
    if (!q.trim()) return res.json([]);

    const regex = new RegExp(q, "i");

    const results = await Cake.find(
      {
        $or: [
          { name: regex },
          { flavour: regex },
          { categories: regex }
        ]
      },
      { name: 1, flavour: 1, categories: 1 }
    ).limit(10);

    const suggestions = [];

    results.forEach(cake => {
      if (cake.name?.match(regex)) suggestions.push(cake.name);
      if (cake.flavour?.match(regex)) suggestions.push(cake.flavour);
      (cake.categories || []).forEach(cat => {
        if (cat.match(regex)) suggestions.push(cat);
      });
    });

    res.json([...new Set(suggestions)]);

  } catch (err) {
    console.error("Suggestion error:", err);
    res.status(500).json([]);
  }
});

// SEARCH
app.get("/api/search", async (req, res) => {
  try {
    await connectToDatabase();
    const q = req.query.q || "";
    if (!q.trim()) return res.json([]);

    const tokens = q
      .toLowerCase()
      .split(" ")
      .map(t => t.trim())
      .filter(Boolean);

    const orConditions = [];

    tokens.forEach(token => {
      const regex = new RegExp(token, "i");

      orConditions.push({ name: regex });
      orConditions.push({ flavour: regex });
      orConditions.push({ categories: regex });
      orConditions.push({ tags: regex });
      orConditions.push({ longDescription: regex });
      orConditions.push({ weightOptions: regex });
    });

    const results = await Cake.find({ $or: orConditions }).limit(50);
    res.json(results);

  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

// FILTERED CAKES
app.get("/api/cakes/filter", async (req, res) => {
  try {
    await connectToDatabase();
    let { category, flavour, weight, veg, sort } = req.query;

    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const query = {};

    if (veg !== "all") query.veg = veg === "veg";

    if (category !== "all") {
      const rx = new RegExp(`^${escapeRegex(category)}$`, "i");
      query.categories = { $elemMatch: { $regex: rx } };
    }

    if (flavour !== "all") {
      const rx = new RegExp(`^${escapeRegex(flavour)}$`, "i");
      query.flavour = { $regex: rx };
    }

    if (weight !== "all") {
      const rx = new RegExp(`^${escapeRegex(weight)}$`, "i");
      query.weightOptions = { $elemMatch: { $regex: rx } };
    }

    let cakes = await Cake.find(query);

    if (sort === "low") cakes.sort((a, b) => (a.prices[0] || 0) - (b.prices[0] || 0));
    if (sort === "high") cakes.sort((a, b) => (b.prices[0] || 0) - (a.prices[0] || 0));

    res.json(cakes);

  } catch (err) {
    res.status(500).json({ error: "Failed to fetch cakes" });
  }
});

// ALL CAKES
app.get("/api/cakes", async (req, res) => {
  try {
    await connectToDatabase();
    const cakes = await Cake.find();
    res.json(cakes);
  } catch {
    res.status(500).json({ error: "Failed to fetch cakes" });
  }
});

// CAKES BY CATEGORY
app.get("/api/cakes/:category", async (req, res) => {
  try {
    await connectToDatabase();
    const q = req.params.category;
    const cakes = await Cake.find({
      $or: [{ categories: q }, { category: q }],
    });
    res.json(cakes);
  } catch {
    res.status(500).json({ error: "Failed to fetch category cakes" });
  }
});

// SINGLE CAKE
app.get("/api/cake/:id", async (req, res) => {
  try {
    await connectToDatabase();
    const cake = await Cake.findById(req.params.id);
    if (!cake) return res.status(404).json({ error: "Cake not found" });
    res.json(cake);
  } catch {
    res.status(500).json({ error: "Failed to fetch cake details" });
  }
});

// RELATED CAKES
app.get("/api/related-cakes/:id", async (req, res) => {
  try {
    await connectToDatabase();
    const cake = await Cake.findById(req.params.id);
    if (!cake) return res.status(404).json({ error: "Cake not found" });

    const related = await Cake.find({
      _id: { $ne: cake._id },
      categories: { $in: cake.categories }
    }).limit(10);

    res.json(related);
  } catch {
    res.json([]);
  }
});



// GET ALL CATEGORIES (old route for compatibility)
app.get("/categories", async (req, res) => {
  try {
    await connectToDatabase();
    const cat = await Category.find();
    res.json(cat);
  } catch {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});


app.get("/api/test-db", async (req, res) => {
  try {
    await connectToDatabase();
    res.send("DB Connected Successfully");
  } catch (err) {
    res.status(500).send("DB FAILED: " + err.message);
  }
});

// ALL CAKES (old route for compatibility)
app.get("/cakes", async (req, res) => {
  try {
    await connectToDatabase();
    const cakes = await Cake.find();
    res.json(cakes);
  } catch {
    res.status(500).json({ error: "Failed to fetch cakes" });
  }
});

// =============== EXPORT APP FOR VERCEL ===============
module.exports = app;
