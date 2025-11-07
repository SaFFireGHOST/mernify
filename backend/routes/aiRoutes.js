const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require("dotenv");

dotenv.config();
const router = express.Router();

// Initialize the Generative AI clien
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-09-2025" });

// POST /api/ai/ask
router.post("/ask", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt required" });
    }

    // Add a system instruction for formatting
    const formattedPrompt = `You are a helpful AI study assistant. Please format your response in readable Markdown.
    Use paragraphs, newlines, bullet points, or numbered lists as needed.
    
    User's question: ${prompt}`;

    // Send the formatted prompt to the model
    const result = await model.generateContent(formattedPrompt);
    const response = result.response.text();

    res.json({ response });
  } catch (err) {
    console.error("AI Error:", err);
    res.status(500).json({ error: "Failed to generate response" });
  }
});

// Export the router using module.exports
module.exports = router;