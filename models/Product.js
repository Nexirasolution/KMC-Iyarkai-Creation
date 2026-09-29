import mongoose from "mongoose";

const MediaSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["image", "video"],
      default: "image",
    },
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    description: { type: String, default: "" },
    shortDescription: { type: String, default: "" },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    price: { type: Number, required: true },
    compareAtPrice: { type: Number, default: 0 },
    unit: { type: String, default: "piece" },

    // Optional product weight. value 0 = "not set".
    weight: {
      value: { type: Number, default: 0, min: 0 },
      unit: { type: String, enum: ["g", "kg"], default: "g" },
    },

    // Images + Videos
    media: {
      type: [MediaSchema],
      default: [],
    },

    stock: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    tags: { type: [String], default: [] },

    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },

    attributes: {
      handmade: { type: Boolean, default: true },
      natural: { type: Boolean, default: true },
      ecoFriendly: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

ProductSchema.index({
  name: "text",
  description: "text",
  tags: "text",
});

export default mongoose.models.Product ||
  mongoose.model("Product", ProductSchema);