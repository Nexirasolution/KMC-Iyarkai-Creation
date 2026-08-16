// app/api/razorpay/verify/route.js
import { NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import Product from "@/models/Product";

async function generateOrderNumber() {
  const prefix = "KMC";
  const date = new Date();
  const datePart = `${date.getFullYear().toString().slice(-2)}${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}${date.getDate().toString().padStart(2, "0")}`;
  const count = await Order.countDocuments();
  const seq = (count + 1).toString().padStart(4, "0");
  return `${prefix}-${datePart}-${seq}`;
}

export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      customer,
      items,
      shippingFee = 0,
    } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: "Missing payment details." }, { status: 400 });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json({ error: "Payment verification failed." }, { status: 400 });
    }

    if (!customer?.name || !customer?.phone || !customer?.address) {
      return NextResponse.json({ error: "Name, phone and address are required." }, { status: 400 });
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
    }

    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isActive) {
        return NextResponse.json({ error: `Product unavailable: ${item.name || item.productId}` }, { status: 400 });
      }
      if (product.stock < item.quantity) {
        return NextResponse.json({ error: `Insufficient stock for ${product.name}.` }, { status: 400 });
      }
      subtotal += product.price * item.quantity;
      validatedItems.push({
        product: product._id,
        name: product.name,
        image: product.media?.[0]?.url || product.images?.[0]?.url || "",
        price: product.price,
        quantity: item.quantity,
        unit: product.unit,
      });
    }

    const total = subtotal + Number(shippingFee || 0);
    const orderNumber = await generateOrderNumber();

    const order = await Order.create({
      orderNumber,
      customer,
      items: validatedItems,
      subtotal,
      shippingFee,
      total,
      paymentMethod: "Online",
      paymentStatus: "paid",
      status: "confirmed",
      statusHistory: [{ status: "confirmed", note: "Paid via Razorpay" }],
      razorpay: {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
      },
    });

    // Stock reduction — same as COD flow
    for (const item of validatedItems) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.quantity } });
    }

    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Payment verification failed." }, { status: 500 });
  }
}