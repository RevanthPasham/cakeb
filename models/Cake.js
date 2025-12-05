const mongoose = require("mongoose");

const cakeSchema = new mongoose.Schema({
  name: { type: String, required: true },

  prices: { type: [Number], default: [] },        // e.g. [499, 799, 1299]
  cutPrices: { type: [Number], default: [] },     // e.g. [699, 999, 1499]
  discounts: { type: [String], default: [] },     // e.g. ["20%", "15%"]
  images: { type: [String], default: [] },        // multiple images

  categories: { type: [String], default: [] },    // e.g. ["Chocolate", "Birthday"]
  flavour: { type: String, default: "" },
  weightOptions: { type: [String], default: [] }, // e.g. ["500g", "1kg"]

  shortDescription: { type: String, default: "" },
  longDescription: { type: String, default: "" },

  tags: { type: [String], default: [] },
  veg: { type: Boolean, default: true }
});

module.exports = mongoose.model("Cake", cakeSchema);
