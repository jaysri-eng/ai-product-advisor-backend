console.log("🔄 Starting server.js...");
import express from "express";
import catalog from "./catalog.json" assert { type: "json" };
import cors from "cors";
import "dotenv/config";
import applyFallbackScore from "./utils/fallbackScore.js";
console.log("✅ Imports loaded successfully");

const app = express();
const PORT = process.env.PORT || 3000
console.log("✅ Middleware initialized");

// ✅ Middleware
app.use(cors());
app.use(express.json());

app.get('/hello',(req,res)=>{
  res.status(500).json({ error: "Gemini API call failed" });
})
// ✅ Route to call Gemini safely
app.post("/recommend", async (req, res) => {
  try {
    const { query } = req.body;

    // 🔑 Keep your API key in environment vars (never in code!)
    const API_KEY = process.env.GEMINI_API_KEY;
    console.log("🔑 GEMINI_API_KEY loaded:", API_KEY?.slice(0, 6) + "...", "length:", API_KEY?.length);

    const prompt = `
      You are a product advisor. The user asked: "${query}". Understand the query and check the catalog for the right response and follow the rules:
      RULES:
      - Always recommend only from the given catalog.
      - Understand the user’s request in a general way (e.g., "I need a device for work" → suggest a laptop).
      - If the request is specific (e.g., "neck massager"), recommend the exact or closest matching item in the catalog.
      - If the request is general (e.g., "a massager"), choose the most suitable product(s) in that category.
      - Do not recommend unrelated items or accessories unless they directly match the user’s intent.
      - If nothing relevant exists in the catalog, return [].
      - Return the response in strict JSON only.
      From the following catalog, return recommended products in strict JSON and if the number of responses/number of items they want as the response then strictly follow that:
      ${JSON.stringify(catalog)}
      Expected JSON format:
      [
        {
          "product": { "brand": "", "product_name": "", "price": 0, "category": "", "description": "" },
          "reason": "why it fits",
          "score": 0.85
        }
      ]
    `;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    // Extract text safely
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    // Remove triple backticks or leading/trailing whitespace
    const cleanText = text.replace(/```json|```/g, "").trim();
    console.log("💡 Raw Gemini response:", cleanText);
    // Try to parse JSON response
    let recommendations;
    // try {
    //   recommendations = JSON.parse(cleanText);
    // } catch {
    //   recommendations = [];
    // }
    try {
      const parsed = JSON.parse(cleanText);

      if (!Array.isArray(parsed)) throw new Error("Invalid format");

      // --- Keyword-based filtering: match query keywords with catalog ---
      const queryKeywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const catalogNames = catalog.map(c => c.product_name.toLowerCase());

      const filteredItems = parsed.filter(rec => {
        const productText = `${rec.product.product_name} ${rec.product.category} ${rec.product.description}`.toLowerCase();
        return catalogNames.includes(rec.product.product_name.toLowerCase()) &&
              queryKeywords.some(k => productText.includes(k));
      });

      // Apply fallback scoring
      recommendations = applyFallbackScore(query, filteredItems);

      // Full fallback if nothing survived filtering
      if (recommendations.length === 0) {
        recommendations = applyFallbackScore(
          query,
          catalog.map(p => ({
            product: p,
            reason: `Matched keywords in your query with product "${p.product_name}"`,
            score: 0,
          }))
        ).sort((a, b) => b.score - a.score).slice(0, 3);
      }
    } catch {
      // Parsing failed → fallback entirely
      recommendations = applyFallbackScore(
        query,
        catalog.map(p => ({
          product: p,
          reason: `Matched keywords in your query with product "${p.product_name}"`,
          score: 0,
        }))
      ).sort((a, b) => b.score - a.score).slice(0, 3);
    }

    res.json({ recommendations });
  } catch (err) {
    console.error("Error calling Gemini:", err);
    // fallback entirely if Gemini fails
    const fallback = applyFallbackScore(
      req.body.query,
      catalog.map(p => ({
        product: p,
        reason: `Matched keywords in your query with product "${p.product_name}"`,
        score: 0,
      }))
    ).sort((a, b) => b.score - a.score).slice(0, 3);

    res.status(500).json({ recommendations: fallback, error: "Gemini API call failed" });
  }
});

app.listen(PORT, () => console.log(`🚀 Proxy server running on http://localhost:${PORT}`));
