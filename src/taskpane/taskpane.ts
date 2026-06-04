/* ============================================================
   Cite Check — Rule Engine (input-agnostic)
   Operates on an array of { id, text, italicLead } note objects.
   Identical logic to the web tool; no DOM, no file parsing here.
   ============================================================ */

const T6_CASE_WORDS = {
  "Association":"Ass'n","Brothers":"Bros.","Company":"Co.","Corporation":"Corp.",
  "Incorporated":"Inc.","Limited":"Ltd.","Department":"Dep't","Government":"Gov't",
  "International":"Int'l","National":"Nat'l","Manufacturing":"Mfg.","Brotherhood":"Bhd.",
  "Federation":"Fed'n","University":"Univ.","Board":"Bd.","Education":"Educ.",
  "Employees":"Emps.","Commission":"Comm'n","Commissioner":"Comm'r","Authority":"Auth.",
  "District":"Dist.","Division":"Div.","Railroad":"R.R.","Railway":"Ry.","Insurance":"Ins.",
  "Development":"Dev.","Industries":"Indus.","Services":"Servs.","Systems":"Sys.",
  "Technology":"Tech.","Laboratories":"Lab'ys","Hospital":"Hosp.","Institute":"Inst."
};
const SIGNALS = ["See also","See, e.g.,","See generally","But see","But cf.","Cf.","Compare","Contra","Accord","See","E.g.,"];

const REPORTER_RE = /\b(\d+)\s+([A-Z][A-Za-z.0-9 ]*?\.(?:\s?\d?(?:d|th|st|nd|rd)?)?)\s+(\d+)/;
const YEAR_PAREN_RE = /\((?:[A-Za-z. 0-9]+\s)?(\d{4})\)/;

function F(note, layer, severity, issue, suggestion, rule){ return { note, layer, severity, issue, suggestion, rule: rule || "" }; }

function checkStructure(n, out){
  const { id, text, italicLead } = n;
  if(REPORTER_RE.test(text) && !/U\.S\.C/.test(text) && !/C\.F\.R/.test(text)
     && !/Fed\. Reg\./.test(text) && !/Stat\./.test(text)){
    if(!YEAR_PAREN_RE.test(text))
      out.push(F(id,"STRUCTURE","warning","Case citation appears to lack a parenthetical year.","Add court/year parenthetical, e.g. (9th Cir. 2024) or (1972).","Rule 10.5 (date parenthetical)"));
  }
  if(/^\s*Id\b/.test(text) && /Id\.\s+\d/.test(text))
    out.push(F(id,"STRUCTURE","error","Id. pincite missing 'at'.","Use 'Id. at 312' rather than 'Id. 312'.","Rule 10.9 / 3.2 (short form, pincite)"));
  if(/\bat\s+\d+-\d+/.test(text))
    out.push(F(id,"STRUCTURE","warning","Page range uses a hyphen.","Use an en dash (\u2013) for page spans, e.g. 538\u201341.","Rule 3.2(a) (page spans)"));
  for(const sig of SIGNALS){
    if(text.startsWith(sig)){
      if(!italicLead)
        out.push(F(id,"STRUCTURE","error",`Introductory signal '${sig.trim()}' is not italicized.`,"Italicize the signal (but not the comma after it).","Rule 1.2 / 2.1(d) (signals, typeface)"));
      break;
    }
  }
  if(!/[.\)\]\u201d]\s*$/.test(text))
    out.push(F(id,"STRUCTURE","warning","Footnote does not end with a period.","Bluebook citation sentences end with a period.","Rule 1.1 (citation sentences)"));
}

function checkSubstance(n, out){
  const { id, text } = n;
  const head = text.split(",")[0];
  for(const [full, abbr] of Object.entries(T6_CASE_WORDS)){
    if(new RegExp(`\\b${full}\\b`).test(head))
      out.push(F(id,"SUBSTANCE","warning",`Case-name word '${full}' should be abbreviated (Table T6).`,`Use '${abbr}'.`,"Rule 10.2.1(c) / Table T6"));
  }
  if(/\bF\.\s+(2d|3d|4th)\b/.test(text))
    out.push(F(id,"SUBSTANCE","error","Federal Reporter series has a stray space.","Close it up: 'F.3d', not 'F. 3d'.","Rule 6.1(a) / Table T1 (reporter spacing)"));
  if(/\bU\.S\.C\.\s+/.test(text) && !/§/.test(text))
    out.push(F(id,"SUBSTANCE","info","U.S.C. citation may be missing a section symbol.","Use § (or §§ for multiple sections).","Rule 12 / 3.3 (statutes, sections)"));
}

// Stateful cross-reference layer — compares against the PREVIOUS footnote.
function checkCrossref(notes){
  const out = [];
  const seenNotes = new Set();
  let prevHadSingleAuthority = false;
  let prevNoteId = null;

  for(const n of notes){
    const { id, text } = n;
    const t = text.trim();

    if(/^\s*Id\b/.test(t)){
      if(prevNoteId === null)
        out.push(F(id,"CROSS-REF","error","'Id.' used but no preceding footnote exists.","Replace with a full citation.","Rule 10.9 / 4.1 (Id.)"));
      else if(!prevHadSingleAuthority)
        out.push(F(id,"CROSS-REF","warning",`'Id.' refers to footnote ${prevNoteId}, which appears to cite more than one authority.`,"Id. may only refer to a single immediately-preceding authority; use supra or a short form.","Rule 4.1 (Id. — single authority)"));
    }

    let m; const supraRe = /([A-Z][A-Za-z.'\u2019 &]+?),?\s+supra\s+note\s+(\d+)/g;
    while((m = supraRe.exec(t))){
      const target = parseInt(m[2]);
      if(target >= id)
        out.push(F(id,"CROSS-REF","error",`'supra note ${target}' points forward or to itself.`,"supra must reference an earlier footnote.","Rule 4.2 (supra)"));
      else if(!seenNotes.has(target))
        out.push(F(id,"CROSS-REF","warning",`'supra note ${target}' references a note with no recorded full citation.`,`Verify note ${target} actually contains the full citation.`,"Rule 4.2 (supra)"));
    }

    if(/\[hereinafter\s+[^\]]+\]/.test(t)) seenNotes.add(id);
    const isFull = REPORTER_RE.test(t) || /U\.S\.C/.test(t) || /C\.F\.R/.test(t)
                   || /Fed\. Reg\./.test(t) || /\d+\s+[A-Z].*L\.\s?(Rev|J)/.test(t);
    if(isFull) seenNotes.add(id);

    const authorityCount = (t.match(/\bv\.\s+[A-Z]/g) || []).length
                         + (t.match(/U\.S\.C|C\.F\.R|Fed\. Reg\./g) || []).length;
    const single = isFull && authorityCount <= 1 && !/;\s/.test(t.replace(/\([^)]*\)/g,""));

    prevHadSingleAuthority = single;
    prevNoteId = id;
  }
  return out;
}

function runRules(notes){
  const out = [];
  for(const n of notes){ checkStructure(n, out); checkSubstance(n, out); }
  out.push(...checkCrossref(notes));
  out.sort((a,b) => a.note - b.note || a.layer.localeCompare(b.layer));
  return out;
}

// AI pass — calls a serverless proxy (NOT the API directly) so the key stays server-side.
// Set PROXY_URL to your deployed function. Returns [] if unset.
const PROXY_URL = ""; // e.g. "https://your-host.netlify.app/.netlify/functions/ai-review"

async function aiReview(notes){
  if(!PROXY_URL) throw new Error("AI review isn't configured yet (no proxy URL set).");
  const payload = notes.map(n => `${n.id}: ${n.text}`).join("\n");
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload })
  });
  if(!res.ok) throw new Error("Proxy returned " + res.status);
  const data = await res.json();
  let txt = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  txt = txt.replace(/```json|```/g, "").trim();
  let arr = []; try { arr = JSON.parse(txt); } catch(e){ throw new Error("Could not parse AI response."); }
  return arr.map(it => F(parseInt(it.note), "AI", "ai", it.issue || "", it.suggestion || ""));
}

// Export for the task pane (loaded as a plain script; attaches to window).
window.CiteCheckEngine = { runRules, aiReview, T6_CASE_WORDS };
