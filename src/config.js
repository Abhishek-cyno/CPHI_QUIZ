// ============================================================
//  EQOVA MEDICARE — CPHI Quiz · App configuration
//  Edit these values. No need to touch component code.
// ============================================================

export const CONFIG = {
  // Brand
  brandName: 'Eqova Medicare',
  eventName: 'CPHI',
  tagline: 'Test Your Pharma Knowledge',

  // Number of questions each visitor gets (randomly picked from the bank)
  questionsPerQuiz: 3,

  // ---- The one and only backend ----
  // Apps Script Web App URL from google-apps-script-cphi.gs. Unlike the
  // doctor app (which talks to three separate scripts), this single
  // endpoint serves the question bank AND the prize catalog, checks prize
  // eligibility, and records every entry.
  //
  // That script is bound to the SAME two Google Sheets the doctor app
  // uses, but reads the `QuestionsCPHI` tab and writes the `CphiEntries`
  // tab, so the two campaigns never touch each other's rows. The Gifts and
  // Settings tabs are shared.
  //
  // Leave EMPTY ('') to run entirely on the bundled questions in
  // src/data/questions.json — handy for local work. The wheel needs the
  // endpoint, though: prizes only ever come from the Sheet.
  apiEndpoint: '',
}
