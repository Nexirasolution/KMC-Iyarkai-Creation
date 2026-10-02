import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Settings from "@/models/Settings";

async function getOrCreateSettings() {
  let settings = await Settings.findOne();
  if (!settings) settings = await Settings.create({});
  return settings;
}

export async function GET() {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch settings." }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();

    // Clean up state shipping rates: trim names, coerce fees, drop blank rows,
    // and collapse duplicate states (last one wins) so lookups stay unambiguous.
    if (Array.isArray(body.stateShippingRates)) {
      const byState = new Map();
      for (const row of body.stateShippingRates) {
        const state = String(row?.state || "").trim();
        if (!state) continue;
        const fee = Number(row?.fee);
        byState.set(state.toLowerCase(), { state, fee: Number.isFinite(fee) ? fee : 0 });
      }
      body.stateShippingRates = Array.from(byState.values());
    }

    // Courier / tracking URL: trim whitespace.
    if (typeof body.courier === "string") body.courier = body.courier.trim();
    if (typeof body.trackingUrlTemplate === "string") {
      body.trackingUrlTemplate = body.trackingUrlTemplate.trim();
    }

    let settings = await Settings.findOne();
    if (settings) {
      Object.assign(settings, body);
      await settings.save();
    } else {
      settings = await Settings.create(body);
    }
    return NextResponse.json({ settings });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save settings." }, { status: 500 });
  }
}