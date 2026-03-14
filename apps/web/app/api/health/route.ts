export async function GET() {
  return Response.json({
    ok: true,
    service: "web",
    tinybirdConfigured: Boolean(
      process.env.TINYBIRD_TOKEN && process.env.TINYBIRD_URL,
    ),
  });
}
