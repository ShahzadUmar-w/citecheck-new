/* ============================================================
   Cite Check — Word integration via Office.js
   Replaces the entire .docx/PDF/inline parsing layer.
   Word hands us footnotes in document order with clean boundaries.
   ============================================================ */

// Read all footnotes from the open document, in order, with italic-lead detection.
async function readFootnotesFromWord(){
  return Word.run(async (context) => {
    const fns = context.document.body.footnotes;
    fns.load("items");
    await context.sync();

    if(!fns.items.length) return [];

    // Load each footnote's body text + the first paragraph's font (for italic-lead).
    const notes = [];
    for(let i = 0; i < fns.items.length; i++){
      const body = fns.items[i].body;
      body.load("text");
      const paras = body.paragraphs;
      paras.load("items");
      await context.sync();

      let italicLead = false;
      if(paras.items.length){
        const firstPara = paras.items[0];
        firstPara.load("font/italic");
        await context.sync();
        italicLead = !!firstPara.font.italic;
      }

      notes.push({
        id: i + 1,                       // sequential document order — always correct
        text: (body.text || "").trim(),
        italicLead,
        _index: i                        // keep Word index for navigation/edits
      });
    }
    return notes.filter(n => n.text);
  });
}

// Move the user's cursor/selection to a given footnote (by Word index).
async function jumpToFootnote(index){
  return Word.run(async (context) => {
    const fns = context.document.body.footnotes;
    fns.load("items");
    await context.sync();
    if(fns.items[index]){
      fns.items[index].reference.select();
      await context.sync();
    }
  });
}

async function replaceFootnoteText(index, newText){
  return Word.run(async (context) => {
    const fns = context.document.body.footnotes;
    fns.load("items");
    await context.sync();
    if(fns.items[index]){
      fns.items[index].body.clear();
      fns.items[index].body.insertText(newText, "Start");
      await context.sync();
    }
  });
}

window.CiteCheckWord = { readFootnotesFromWord, jumpToFootnote, replaceFootnoteText };
