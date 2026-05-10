const STATUS_URL = process.env.SYMPHONY_STATUS_URL ?? "http://127.0.0.1:4010";

export async function GET(): Promise<Response> {
  try {
    const response = await fetch(`${STATUS_URL}/api/v1/runs`, { cache: "no-store" });
    if (!response.ok) {
      return Response.json({ runs: [], events: [] }, { status: 200 });
    }
    return Response.json(await response.json(), { status: 200 });
  } catch {
    return Response.json({ runs: [], events: [] }, { status: 200 });
  }
}
