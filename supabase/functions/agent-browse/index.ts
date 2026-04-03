import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AGENT_SYSTEM_PROMPT = `You are DataNauts Agent — an autonomous browser agent controlling a virtual browser.

AVAILABLE COMMANDS (output EXACTLY ONE per response):
GOTO <url>
CLICK "<text>"
TYPE "<field>" "<value>"
PRESS <key>
SCROLL UP or SCROLL DOWN
WAIT <1-3>
DONE

RULES:
- Your response must be EXACTLY 2 lines: Line 1 = the command. Line 2 = your reasoning.
- NEVER put anything after the command on line 1.
- NEVER use google.com (CAPTCHAs). Use https://duckduckgo.com for searches.
- If you see CAPTCHA/"unusual traffic", immediately GOTO https://duckduckgo.com
- For CLICK, use EXACT text from visible links or buttons.
- After TYPE, you need PRESS Enter to submit.
- If an action fails, try a DIFFERENT approach. Never repeat the same failed command.
- Output DONE when the task is complete.

EXAMPLE RESPONSES:

GOTO https://duckduckgo.com
Navigating to search engine

TYPE "Search the web without being tracked" "SpaceX launches"
Typing search query into DuckDuckGo search box

PRESS Enter
Submitting the search

CLICK "SpaceX Launches - Wikipedia"
Clicking the most relevant search result

DONE
The Wikipedia page about SpaceX launches is now displayed`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, messages, userTask, agentHistory, pageContext } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (action === "get-next-action") {
      // Build messages for the AI to decide next browser action
      const aiMessages: any[] = [
        { role: "system", content: AGENT_SYSTEM_PROMPT },
        { role: "user", content: `Task: ${userTask}` },
        ...(agentHistory || []),
      ];

      if (pageContext) {
        aiMessages.push({
          role: "user",
          content: `Current browser state:\n${pageContext}`,
        });
      }

      const response = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: aiMessages,
            max_tokens: 150,
          }),
        }
      );

      if (!response.ok) {
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        throw new Error("AI service error");
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "DONE";

      return new Response(JSON.stringify({ text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "fetch-page") {
      // Fetch a URL and return page content summary
      const { url } = await req.json().catch(() => ({ url: null }));
      const targetUrl = url || (messages && messages[0]?.url);

      if (!targetUrl) {
        return new Response(
          JSON.stringify({ error: "URL required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const pageRes = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
        });
        const html = await pageRes.text();

        // Extract title
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
        const title = titleMatch ? titleMatch[1].trim() : "Untitled";

        // Extract text content (simplified)
        const textContent = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 2000);

        // Extract links
        const linkMatches = [...html.matchAll(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi)];
        const links = linkMatches
          .slice(0, 15)
          .map((m) => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, "").trim() }))
          .filter((l) => l.text.length > 0);

        const summary = `Page: ${title}\nURL: ${targetUrl}\n\nVisible text:\n${textContent.slice(0, 1000)}\n\nLinks on page:\n${links.map((l) => `- "${l.text}" → ${l.href}`).join("\n")}`;

        return new Response(
          JSON.stringify({
            success: true,
            pageInfo: { url: targetUrl, title },
            pageSummary: summary,
            linksCount: links.length,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : "Failed to fetch page",
            pageInfo: { url: targetUrl, title: "" },
            pageSummary: "",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "summarize") {
      // Generate a summary of what the agent did
      const response = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content:
                  "You are DataNauts AI. The user asked you to do a web task and you just finished. Summarize what you did in 2-3 sentences. Be concise and helpful. Use markdown. Never mention any AI model names.",
              },
              {
                role: "user",
                content: `The task was: "${userTask}". Here's what happened:\n${(agentHistory || []).map((h: any) => `${h.role}: ${h.content}`).join("\n")}\n\nSummarize what was accomplished.`,
              },
            ],
            max_tokens: 200,
          }),
        }
      );

      if (!response.ok) throw new Error("AI service error");

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "Task completed.";

      return new Response(JSON.stringify({ text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use: get-next-action, fetch-page, or summarize" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("agent-browse error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
