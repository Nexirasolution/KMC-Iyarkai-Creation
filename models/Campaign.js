import mongoose from "mongoose";

const RecipientSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true }, // 91XXXXXXXXXX
    name: { type: String, default: "" },
    status: { type: String, enum: ["pending", "sent", "skipped"], default: "pending" },
    sentAt: { type: Date, default: null },
  },
  { _id: false }
);

const CampaignSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    productSnapshot: {
      name: String,
      slug: String,
      price: Number,
    },
    link: { type: String, required: true },
    // Placeholders: {name} {product} {price} {link}
    messageTemplate: { type: String, required: true },
    recipients: { type: [RecipientSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.Campaign || mongoose.model("Campaign", CampaignSchema);