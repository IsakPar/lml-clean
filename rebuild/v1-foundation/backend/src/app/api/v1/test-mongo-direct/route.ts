import { testMongoConnection } from '../../../../lib/services/mongodb';

export async function GET() {
  console.log("🚨 MongoDB TEST ROUTE HIT - fresh version loaded");
  try {
    const result = await testMongoConnection();
    return Response.json({ success: true, result });
  } catch (error) {
    return Response.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
