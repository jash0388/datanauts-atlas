import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AGENT_SYSTEM_PROMPT = `You are DataNauts Agent — an autonomous browser agent controlling a real browser via web scraping.

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
- For CLICK, use the EXACT visible link text from the page. The system will navigate to that link's URL.
- After TYPE, use PRESS Enter to submit.
- If an action fails or returns 403/forbidden, try a DIFFERENT site or approach immediately.
- Output DONE when the task is complete or you have gathered the requested information.
- When you need to search, prefer GOTO https://duckduckgo.com/?q=YOUR+SEARCH+QUERY directly.
- You CANNOT play media, videos, or audio. Instead, find the content and present links/info to the user.
- You CANNOT interact with complex web apps (login walls, CAPTCHAs, etc). If blocked, report what you found.
- After finding relevant info, output DONE — don't keep scrolling or clicking aimlessly.
- If a site returns 403 Forbidden, do NOT retry it. Try an alternative site or search instead.
- SCROLL is useful to see more content. You can scroll multiple times but stop after finding what you need.
- Be efficient: prefer direct URLs over searching when you know the site.

STRATEGY:
1. For "open X" requests → GOTO the site directly (e.g., GOTO https://youtube.com)
2. If blocked (403) → search for it on DuckDuckGo and click a working link
3. For "search for X" → GOTO https://duckduckgo.com/?q=X
4. For "find info about X" → search, click top result, extract key info, DONE
5. Present useful findings before saying DONE

EXAMPLE RESPONSES:

GOTO https://youtube.com
Navigating directly to YouTube

GOTO https://duckduckgo.com/?q=trending+github+repos
Searching for trending GitHub repos

CLICK "GitHub Trending"
Clicking the trending repos link from search results

DONE
Found the requested information and presented it to the user`;

// ─── Firecrawl scrape helper ───
async function scrapePage(targetUrl: string, apiKey: string | undefined) {
  let formattedUrl = targetUrl.trim();
  if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
    formattedUrl = `https://${formattedUrl}`;
  }

  console.log("Scraping:", formattedUrl);

  // Try Firecrawl
  if (apiKey) {
    try {
      const fcResp = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: formattedUrl,
          formats: ["markdown", "screenshot", "links"],
          onlyMainContent: true,
          waitFor: 3000,
        }),
      });

      const fcData = await fcResp.json();
      if (fcResp.ok && fcData.success !== false) {
        const content = fcData.data || fcData;
        const markdown = content.markdown || "";
        const screenshot = content.screenshot || null;
        const rawLinks = content.links || [];
        const metadata = content.metadata || {};
        const title = metadata.title || "Untitled";
        const pageUrl = metadata.sourceURL || formattedUrl;

        // Parse links into structured format
        const links = rawLinks.slice(0, 30).map((l: string) => {
          try {
            const u = new URL(l, formattedUrl);
            return { href: u.href, text: u.pathname.split("/").pop() || u.hostname };
          } catch {
            return { href: l, text: l };
          }
        });

        return {
          success: true,
          pageInfo: { url: pageUrl, title },
          pageSummary: `Page: ${title}\nURL: ${pageUrl}\n\nContent:\n${markdown.slice(0, 2000)}\n\nLinks:\n${links.map((l: any) => `- "${l.text}" → ${l.href}`).join("\n")}`,
          screenshot,
          linksCount: rawLinks.length,
          markdown: markdown.slice(0, 3000),
          links,
        };
      }
      console.error("Firecrawl error:", fcData);
    } catch (err) {
      console.error("Firecrawl failed:", err);
    }
  }

  // Fallback: direct fetch
  try {
    const pageRes = await fetch(formattedUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
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
      .slice(0, 30)
      .map((m) => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, "").trim() }))
      .filter((l) => l.text.length > 0);

    return {
      success: true,
      pageInfo: { url: formattedUrl, title },
      pageSummary: `Page: ${title}\nURL: ${formattedUrl}\n\nContent:\n${textContent.slice(0, 1000)}\n\nLinks:\n${links.map((l) => `- "${l.text}" → ${l.href}`).join("\n")}`,
      screenshot: null,
      linksCount: links.length,
      markdown: textContent.slice(0, 3000),
      links,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch",
      pageInfo: { url: formattedUrl, title: "" },
      pageSummary: "",
      screenshot: null,
      links: [],
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, url, command, pageLinks, currentUrl, userTask, agentHistory, pageContext } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

    // ═══════════════════════════════════════════════
    // get-next-action
    // ═══════════════════════════════════════════════
    if (action === "get-next-action") {
      const aiMessages: any[] = [
        { role: "system", content: AGENT_SYSTEM_PROMPT },
        { role: "user", content: `Task: ${userTask}` },
        ...(agentHistory || []),
      ];
      if (pageContext) {
        aiMessages.push({ role: "user", content: `Current browser state:\n${pageContext}` });
      }

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: aiMessages, max_tokens: 150 }),
      });

      if (!response.ok) { const t = await response.text(); console.error("AI error:", response.status, t); throw new Error("AI service error"); }
      const data = await response.json();
      return new Response(JSON.stringify({ text: data.choices?.[0]?.message?.content || "DONE" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══════════════════════════════════════════════
    // fetch-page — Scrape a URL
    // ═══════════════════════════════════════════════
    if (action === "fetch-page") {
      if (!url) {
        return new Response(JSON.stringify({ success: false, error: "URL required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await scrapePage(url, FIRECRAWL_API_KEY);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══════════════════════════════════════════════
    // execute-command — Handle CLICK, TYPE, PRESS, SCROLL intelligently
    // ═══════════════════════════════════════════════
    if (action === "execute-command") {
      const cmd = (command || "").trim();
      const upperCmd = cmd.toUpperCase();

      // CLICK — find the matching link and navigate to it
      if (upperCmd.startsWith("CLICK ")) {
        const clickText = cmd.slice(6).replace(/^["']|["']$/g, "").trim().toLowerCase();
        const links = pageLinks || [];

        // Find best matching link
        let bestLink: string | null = null;
        let bestScore = 0;

        for (const link of links) {
          const linkText = (link.text || "").toLowerCase();
          const linkHref = (link.href || "").toLowerCase();

          // Exact match
          if (linkText === clickText) { bestLink = link.href; bestScore = 100; break; }
          // Contains match
          if (linkText.includes(clickText) || clickText.includes(linkText)) {
            const score = 50 + Math.min(linkText.length, clickText.length);
            if (score > bestScore) { bestScore = score; bestLink = link.href; }
          }
          // URL contains the search term
          if (linkHref.includes(clickText.replace(/\s+/g, ""))) {
            if (30 > bestScore) { bestScore = 30; bestLink = link.href; }
          }
        }

        if (bestLink) {
          // Resolve relative URLs
          let resolvedUrl = bestLink;
          try {
            resolvedUrl = new URL(bestLink, currentUrl || "https://example.com").href;
          } catch { resolvedUrl = bestLink; }

          console.log(`CLICK "${clickText}" → navigating to ${resolvedUrl}`);
          const result = await scrapePage(resolvedUrl, FIRECRAWL_API_KEY);
          return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // No matching link found — try searching for it
        const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(clickText)}`;
        console.log(`CLICK "${clickText}" — no match, searching: ${searchUrl}`);
        const result = await scrapePage(searchUrl, FIRECRAWL_API_KEY);
        return new Response(JSON.stringify({ ...result, warning: `No exact link match for "${clickText}", searched instead` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // TYPE + smart detection — if on a search page, construct search URL
      if (upperCmd.startsWith("TYPE ")) {
        // Extract the value being typed
        const typeMatch = cmd.match(/TYPE\s+"[^"]*"\s+"([^"]*)"/i);
        const typedValue = typeMatch ? typeMatch[1] : cmd.slice(5).trim();

        // If on DuckDuckGo, construct search URL
        if (currentUrl && currentUrl.includes("duckduckgo.com")) {
          const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(typedValue)}`;
          console.log(`TYPE on DuckDuckGo → ${searchUrl}`);
          const result = await scrapePage(searchUrl, FIRECRAWL_API_KEY);
          return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Otherwise just acknowledge
        return new Response(JSON.stringify({
          success: true,
          pageInfo: { url: currentUrl || "", title: "" },
          pageSummary: `Typed "${typedValue}" into the field. You may need to PRESS Enter to submit.`,
          screenshot: null,
          links: pageLinks || [],
          typed: typedValue,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // PRESS Enter — if there's a pending search, execute it
      if (upperCmd.startsWith("PRESS")) {
        if (currentUrl && currentUrl.includes("duckduckgo.com")) {
          // The search was likely already executed by TYPE, just return current state
          return new Response(JSON.stringify({
            success: true,
            pageInfo: { url: currentUrl, title: "" },
            pageSummary: "Form submitted.",
            screenshot: null,
            links: pageLinks || [],
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({
          success: true,
          pageInfo: { url: currentUrl || "", title: "" },
          pageSummary: "Key pressed.",
          screenshot: null,
          links: pageLinks || [],
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // SCROLL / WAIT — acknowledge
      return new Response(JSON.stringify({
        success: true,
        pageInfo: { url: currentUrl || "", title: "" },
        pageSummary: `Command "${cmd}" executed.`,
        screenshot: null,
        links: pageLinks || [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══════════════════════════════════════════════
    // summarize
    // ═══════════════════════════════════════════════
    if (action === "summarize") {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are DataNauts AI. Summarize the web task in 2-3 sentences. Be concise. Use markdown. Never mention AI model names." },
            { role: "user", content: `Task: "${userTask}". History:\n${(agentHistory || []).map((h: any) => `${h.role}: ${h.content}`).join("\n")}\n\nSummarize.` },
          ],
          max_tokens: 200,
        }),
      });
      if (!response.ok) throw new Error("AI service error");
      const data = await response.json();
      return new Response(JSON.stringify({ text: data.choices?.[0]?.message?.content || "Task completed." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("agent-browse error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
