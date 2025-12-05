const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  image: { type: String, required: true },

  categories: { type: [String], default: [] }   // e.g. ["offer", "wedding", "new"]
});

module.exports = mongoose.model("Category", categorySchema);
