import { getRedis } from "@/app/lib/redis";

type Stored = {
  id: string;
  tipper: string;
  recipient: string;
  text: string;
  displayName: string | null;
  anonymous: boolean;
  txSignature: string | null;
  amount: string | null;
  mint: string | null;
  createdAt: number;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export async function GET() {
  try {
    const raws = await getRedis().zrange<string[]>(
      "msgs:feed:global",
      0,
      19,
      { rev: true },
    );
    const messages: Stored[] = [];
    for (const raw of raws ?? []) {
      try {
        const m: Stored =
          typeof raw === "string" ? JSON.parse(raw) : (raw as Stored);
        messages.push(m);
      } catch {
        // Skip corrupt entries
      }
    }
    return Response.json(
      { messages },
      {
        headers: {
          ...corsHeaders,
          "Cache-Control":
            "public, max-age=0, s-maxage=10, stale-while-revalidate=30",
        },
      },
    );
  } catch (err) {
    console.error("[feed] unhandled", err);
    return Response.json(
      {
        messages: [],
        error: err instanceof Error ? err.message : String(err),
      },
      {
        status: 502,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      },
    );
  }
}
