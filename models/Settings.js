import mongoose from "mongoose";

const StateShippingRateSchema = new mongoose.Schema(
  {
    state: { type: String, required: true, trim: true },
    fee: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const CourierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Tracking link template. {trackingNumber} is replaced with the order's tracking ID.
    // e.g. https://www.delhivery.com/track/package/{trackingNumber}
    trackingUrlTemplate: { type: String, default: "", trim: true },
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

    // Courier partners the admin can choose from on each order.
    couriers: { type: [CourierSchema], default: [] },

    // LEGACY: old single-courier fields. Kept so existing data still works;
    // used only as a fallback when no couriers have been added yet.
    courier: { type: String, default: "" },
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