import mongoose from "mongoose";

const StateShippingRateSchema = new mongoose.Schema(
  {
    state: { type: String, required: true, trim: true },
    fee: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const SettingsSchema = new mongoose.Schema(
  {
    storeName: { type: String, default: "KMC Iyarkai Creation" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    whatsapp: { type: String, default: "" },
    address: { type: String, default: "" },

    // Default/fallback fee used when the customer's state has no specific rate below.
    shippingFee: { type: Number, default: 49 },
    // Order subtotal (₹) at or above which shipping is free, regardless of state.
    freeShipping: { type: Number, default: 999 },
    // Per-state overrides. Any state not listed here falls back to `shippingFee`.
    stateShippingRates: { type: [StateShippingRateSchema], default: [] },

    deliveryTime: { type: String, default: "2-4 Days" },

    // Courier used for every shipment. Copied onto each order when its tracking ID is saved.
    courier: { type: String, default: "" },
    // Tracking link template. {trackingNumber} is replaced with the order's tracking ID.
    // e.g. https://www.delhivery.com/track/package/{trackingNumber}
    trackingUrlTemplate: { type: String, default: "" },

    instagram: { type: String, default: "" },
    facebook: { type: String, default: "" },
    youtube: { type: String, default: "" },

    seoTitle: { type: String, default: "KMC Iyarkai Creation" },
    seoDescription: { type: String, default: "" },

    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.Settings || mongoose.model("Settings", SettingsSchema);