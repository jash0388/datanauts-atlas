/**
 * Parse AI response text into a command + thought.
 * Handles various LLM quirks: inline thoughts, markdown formatting, etc.
 */
export function parseAgentResponse(text: string): { command: string; thought: string } {
  const clean = text.replace(/```[a-z]*/gi, "").replace(/```/g, "").trim();
  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean);

  let command = "";
  let thought = "";

  for (const line of lines) {
    const m = line.match(/^(GOTO|CLICK|TYPE|PRESS|SCROLL|WAIT|DONE)\b\s*(.*)/i);

    if (m && !command) {
      const type = m[1].toUpperCase();
      const body = (m[2] || "").trim();

      switch (type) {
        case "GOTO": {
          const urlMatch = body.match(/https?:\/\/[^\s"'`<>]+/);
          if (urlMatch) {
            command = `GOTO ${urlMatch[0]}`;
          } else if (body) {
            command = `GOTO https://${body.split(/\s/)[0]}`;
          }
          break;
        }
        case "DONE":
          command = "DONE";
          break;
        case "PRESS": {
          command = `${type} ${body.split(" ")[0]}`;
          if (body.includes(" ")) {
            thought = body.substring(body.indexOf(" ") + 1);
          }
          break;
        }
        case "CLICK":
        case "TYPE":
        case "SCROLL":
        case "WAIT": {
          const tIdx = body.search(/\s+Thought:/i);
          if (tIdx > 0) {
            command = `${type} ${body.slice(0, tIdx).trim()}`;
            thought = body.slice(tIdx).replace(/^\s*Thought:\s*/i, "").trim();
          } else {
            command = `${type} ${body}`;
          }
          break;
        }
      }
    } else if (command && !thought) {
      thought = line.replace(/^Thought:\s*/i, "").trim();
    }
  }

  command = command.replace(/[`*]/g, "").trim();
  if (!command) command = "DONE";

  return { command, thought };
}
