import { BRAND_NAME } from "@/packages/core/brand";

export async function GET() {
  return Response.json({
    brand: BRAND_NAME,
    profile: process.env.APP_PROFILE ?? "local",
  });
}
