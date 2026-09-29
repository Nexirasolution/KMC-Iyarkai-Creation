import mongoose from "mongoose";

// One row per phone that has replied STOP (or re-subscribed with START).
const MarketingContactSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, index: true }, // 91XXXXXXXXXX
    optedOut: { type: Boolean, default: false },
    optedOutAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.MarketingContact ||
  mongoose.model("MarketingContact", MarketingContactSchema);