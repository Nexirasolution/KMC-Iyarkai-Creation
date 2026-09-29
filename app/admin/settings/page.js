"use client";

import { useEffect, useState } from "react";
import { INDIAN_STATES } from "@/lib/indianStates";

const DEFAULT_SETTINGS = {
  storeName: "KMC Iyarkai Creation",
  email: "admin@kmcorganicfarm.com",
  phone: "",
  whatsapp: "",
  address: "",
  shippingFee: "49",
  freeShipping: "999",
  stateShippingRates: [],
  deliveryTime: "2-4 Days",
  instagram: "",
  facebook: "",
  youtube: "",
  seoTitle: "KMC Iyarkai Creation",
  seoDescription: "",
  maintenanceMode: false,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadSettings() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.settings) {
        setSettings({
          ...DEFAULT_SETTINGS,
          ...data.settings,
          shippingFee: String(data.settings.shippingFee ?? "49"),
          freeShipping: String(data.settings.freeShipping ?? "999"),
          stateShippingRates: (data.settings.stateShippingRates || []).map((r) => ({
            state: r.state,
            fee: String(r.fee ?? "0"),
          })),
        });
      }
    } catch (err) {
      console.error("Failed to load settings", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  function addStateRate() {
    const usedStates = new Set(settings.stateShippingRates.map((r) => r.state));
    const nextState = INDIAN_STATES.find((s) => !usedStates.has(s)) || INDIAN_STATES[0];
    setSettings((prev) => ({
      ...prev,
      stateShippingRates: [...prev.stateShippingRates, { state: nextState, fee: prev.shippingFee || "0" }],
    }));
  }

  function updateStateRate(index, field, value) {
    setSettings((prev) => {
      const rows = [...prev.stateShippingRates];
      rows[index] = { ...rows[index], [field]: value };
      return { ...prev, stateShippingRates: rows };
    });
  }

  function removeStateRate(index) {
    setSettings((prev) => ({
      ...prev,
      stateShippingRates: prev.stateShippingRates.filter((_, i) => i !== index),
    }));
  }

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          shippingFee: Number(settings.shippingFee),
          freeShipping: Number(settings.freeShipping),
          stateShippingRates: settings.stateShippingRates
            .filter((r) => r.state)
            .map((r) => ({ state: r.state, fee: Number(r.fee) || 0 })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save settings.");
      alert("Settings Saved Successfully!");
      loadSettings();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F7F2] p-5 md:p-8">
        <p className="text-muted">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7F2] p-5 md:p-8">
      <div className="max-w-6xl mx-auto">

        <h1 className="text-3xl md:text-4xl font-bold text-green-700 mb-8">
          Store Settings
        </h1>

        <div className="bg-white rounded-3xl shadow-xl p-6 md:p-10">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <div className="md:col-span-2">
              <label className="font-semibold block mb-2">Store Name</label>
              <input
                type="text"
                name="storeName"
                value={settings.storeName}
                onChange={handleChange}
                className="w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-green-600 outline-none"
              />
            </div>

            <div>
              <label className="font-semibold block mb-2">Email</label>
              <input
                type="email"
                name="email"
                value={settings.email}
                onChange={handleChange}
                className="w-full border rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="font-semibold block mb-2">Phone Number</label>
              <input
                type="text"
                name="phone"
                value={settings.phone}
                onChange={handleChange}
                className="w-full border rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="font-semibold block mb-2">WhatsApp Number</label>
              <input
                type="text"
                name="whatsapp"
                value={settings.whatsapp}
                onChange={handleChange}
                placeholder="919876543210"
                className="w-full border rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="font-semibold block mb-2">Delivery Time</label>
              <input
                type="text"
                name="deliveryTime"
                value={settings.deliveryTime}
                onChange={handleChange}
                className="w-full border rounded-xl px-4 py-3"
              />
            </div>

            <div className="md:col-span-2">
              <label className="font-semibold block mb-2">Address</label>
              <textarea
                rows={3}
                name="address"
                value={settings.address}
                onChange={handleChange}
                className="w-full border rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="font-semibold block mb-2">Default Shipping Fee (₹)</label>
              <input
                type="number"
                name="shippingFee"
                value={settings.shippingFee}
                onChange={handleChange}
                className="w-full border rounded-xl px-4 py-3"
              />
              <p className="mt-1 text-xs text-gray-500">
                Used for every order when no state rates are set below. Once you add state rates,
                only those states are offered at checkout, each with its own fee.
              </p>
            </div>

            <div>
              <label className="font-semibold block mb-2">Free Shipping Above (₹)</label>
              <input
                type="number"
                name="freeShipping"
                value={settings.freeShipping}
                onChange={handleChange}
                className="w-full border rounded-xl px-4 py-3"
              />
              <p className="mt-1 text-xs text-gray-500">
                Applies store-wide, on top of any order, regardless of state.
              </p>
            </div>

            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-2">
                <label className="font-semibold">Shipping Fee by State</label>
                <button
                  type="button"
                  onClick={addStateRate}
                  className="rounded-xl border border-green-700 px-4 py-1.5 text-sm font-semibold text-green-700 hover:bg-green-50"
                >
                  + Add State Rate
                </button>
              </div>

              <p className="mb-3 text-xs text-gray-500">
                Customers can only choose the states listed here at checkout. States without a rate
                are not delivered to.
              </p>

              {settings.stateShippingRates.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No state rates yet — checkout shows all states and every order uses the default
                  shipping fee above.
                </p>
              ) : (
                <div className="space-y-3">
                  {settings.stateShippingRates.map((row, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-3">
                      <select
                        value={row.state}
                        onChange={(e) => updateStateRate(idx, "state", e.target.value)}
                        className="flex-1 min-w-[180px] border rounded-xl px-4 py-2.5"
                      >
                        {INDIAN_STATES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">₹</span>
                        <input
                          type="number"
                          value={row.fee}
                          onChange={(e) => updateStateRate(idx, "fee", e.target.value)}
                          className="w-28 border rounded-xl px-4 py-2.5"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeStateRate(idx)}
                        className="text-sm font-semibold text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="font-semibold block mb-2">Instagram</label>
              <input
                type="url"
                name="instagram"
                value={settings.instagram}
                onChange={handleChange}
                className="w-full border rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="font-semibold block mb-2">Facebook</label>
              <input
                type="url"
                name="facebook"
                value={settings.facebook}
                onChange={handleChange}
                className="w-full border rounded-xl px-4 py-3"
              />
            </div>

            <div className="md:col-span-2">
              <label className="font-semibold block mb-2">YouTube</label>
              <input
                type="url"
                name="youtube"
                value={settings.youtube}
                onChange={handleChange}
                className="w-full border rounded-xl px-4 py-3"
              />
            </div>

            <div className="md:col-span-2">
              <label className="font-semibold block mb-2">SEO Title</label>
              <input
                type="text"
                name="seoTitle"
                value={settings.seoTitle}
                onChange={handleChange}
                className="w-full border rounded-xl px-4 py-3"
              />
            </div>

            <div className="md:col-span-2">
              <label className="font-semibold block mb-2">SEO Description</label>
              <textarea
                rows={4}
                name="seoDescription"
                value={settings.seoDescription}
                onChange={handleChange}
                className="w-full border rounded-xl px-4 py-3"
              />
            </div>

            <div className="md:col-span-2 flex items-center gap-3">
              <input
                type="checkbox"
                name="maintenanceMode"
                checked={settings.maintenanceMode}
                onChange={handleChange}
                className="h-5 w-5"
              />
              <label className="font-semibold">Enable Maintenance Mode</label>
            </div>

          </div>

          <div className="mt-10 flex flex-wrap gap-4">
            <button
              onClick={saveSettings}
              disabled={saving}
              className="rounded-xl bg-green-700 px-8 py-3 font-semibold text-white transition hover:bg-green-800 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>

            <button
              onClick={handleReset}
              className="rounded-xl border border-gray-300 bg-white px-8 py-3 font-semibold hover:bg-gray-100"
            >
              Reset
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}