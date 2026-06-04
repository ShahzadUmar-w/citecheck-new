// Netlify function: keeps the Anthropic API key server-side.
// Deploy to Netlify, set ANTHROPIC_API_KEY in the site's environment variables,
// then point PROXY_URL in engine.js at:
//   https://<your-site>.netlify.app/.netlify/functions/ai-review

exports.handler = async (event) => {
  if(event.httpMethod !== "POST"){
    return { statusCode: 405, body: "Method not allowed" };
  }
  let payload;
  try { payload = JSON.parse(event.body).payload; }
  catch { return { statusCode: 400, body: "Bad request" }; }

  const prompt =
    "You are a meticulous law-review cite editor. For each numbered footnote below, flag ONLY " +
    "Bluebook problems a rule engine would miss: improper case-name shortening, wrong abbreviation " +
    "choices, signal misuse or wrong signal, ambiguous or incorrect short forms, and ordering within " +
    "string citations. Do NOT restate obvious formatting the engine already catches. Respond with ONLY " +
    'a JSON array, no markdown, no preface: [{"note":N,"issue":"short description","suggestion":"concrete fix"}]. ' +
    "If a footnote is clean, omit it.\n\n" + payload;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await r.json();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    };
  } catch(e){
    return { statusCode: 502, body: "Upstream error: " + e.message };
  }
};
