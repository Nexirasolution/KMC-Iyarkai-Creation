// lib/settings.js
import { connectDB } from "@/lib/mongodb";
import Settings from "@/models/Settings";

const DEFAULTS = {
  storeName: "KMC Iyarkai Creation",
  email: "",
  phone: "",
  whatsapp: "",
  address: "",
  shippingFee: 49,
  freeShipping: 999,
  stateShippingRates: [],
  deliveryTime: "2-4 Days",
  courier: "",
  trackingUrlTemplate: "",
  couriers: [],
  instagram: "",
  facebook: "",
  youtube: "",
  seoTitle: "KMC Iyarkai Creation",
  seoDescription: "",
  maintenanceMode: false,
};

export async function getSettings() {
  await connectDB();
  const settings = await Settings.findOne().lean();
  return settings ? { ...DEFAULTS, ...JSON.parse(JSON.stringify(settings)) } : DEFAULTS;
}