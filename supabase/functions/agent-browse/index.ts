import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AGENT_SYSTEM_PROMPT = `You are DataNauts Agent — an autonomous browser agent controlling a real browser.

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
- NEVER put anything after the command on line 1. NO explanation, NO "Thought:", NOTHING.
- NEVER use google.com (CAPTCHAs). Use https://duckduckgo.com for searches.
- If you see CAPTCHA/"unusual traffic", immediately GOTO https://duckduckgo.com
- For CLICK, use EXACT text from VISIBLE LINKS or VISIBLE BUTTONS on the page.
- After TYPE, you need PRESS Enter to submit.
- If an action fails, try a DIFFERENT approach. Never repeat the same failed command.
- Output DONE when the task is complete or the requested page is displayed.

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
    const body = await req.json();
    const { action, url, userTask, agentHistory, pageContext } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // ═══════════════════════════════════════════════
    // ACTION: get-next-action — Ask AI for next command
    // ═══════════════════════════════════════════════
    if (action === "get-next-action") {
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

    // ═══════════════════════════════════════════════
    // ACTION: fetch-page — Scrape a URL using Firecrawl
    // ═══════════════════════════════════════════════
    if (action === "fetch-page") {
      const targetUrl = url;
      if (!targetUrl) {
        return new Response(
          JSON.stringify({ success: false, error: "URL is required in the request body" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let formattedUrl = targetUrl.trim();
      if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
        formattedUrl = `https://${formattedUrl}`;
      }

      console.log("Fetching page:", formattedUrl);

      // Try Firecrawl first for better results + screenshot
      const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

      if (FIRECRAWL_API_KEY) {
        try {
          const fcResp = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: formattedUrl,
              formats: ["markdown", "screenshot", "links"],
              onlyMainContent: true,
              waitFor: 2000,
            }),
          });

          const fcData = await fcResp.json();

          if (fcResp.ok && fcData.success !== false) {
            const content = fcData.data || fcData;
            const markdown = content.markdown || "";
            const screenshot = content.screenshot || null;
            const links = content.links || [];
            const metadata = content.metadata || {};

            const title = metadata.title || "Untitled";
            const pageUrl = metadata.sourceURL || formattedUrl;

            const summary = `Page: ${title}\nURL: ${pageUrl}\n\nContent:\n${markdown.slice(0, 2000)}\n\nLinks on page:\n${links.slice(0, 15).map((l: string) => `- ${l}`).join("\n")}`;

            return new Response(
              JSON.stringify({
                success: true,
                pageInfo: { url: pageUrl, title },
                pageSummary: summary,
                screenshot,
                linksCount: links.length,
                markdown: markdown.slice(0, 3000),
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          console.error("Firecrawl error:", fcData);
        } catch (err) {
          console.error("Firecrawl fetch failed:", err);
        }
      }

      // Fallback: direct fetch
      try {
        const pageRes = await fetch(formattedUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
        });
        const html = await pageRes.text();

        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
        const title = titleMatch ? titleMatch[1].trim() : "Untitled";

        const textContent = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 2000);

        const linkMatches = [...html.matchAll(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi)];
        const links = linkMatches
          .slice(0, 15)
          .map((m) => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, "").trim() }))
          .filter((l) => l.text.length > 0);

        const summary = `Page: ${title}\nURL: ${formattedUrl}\n\nVisible text:\n${textContent.slice(0, 1000)}\n\nLinks on page:\n${links.map((l) => `- "${l.text}" → ${l.href}`).join("\n")}`;

        return new Response(
          JSON.stringify({
            success: true,
            pageInfo: { url: formattedUrl, title },
            pageSummary: summary,
            screenshot: null,
            linksCount: links.length,
            markdown: textContent.slice(0, 3000),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : "Failed to fetch page",
            pageInfo: { url: formattedUrl, title: "" },
            pageSummary: "",
            screenshot: null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ═══════════════════════════════════════════════
    // ACTION: summarize — Generate a summary of what agent did
    // ═══════════════════════════════════════════════
    if (action === "summarize") {
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
