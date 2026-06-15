function getGroqApiKey() {
  return (process.env.GROQ_API_KEY || process.env.GROK_API_KEY || "").trim();
}

function getGeminiModel() {
  return (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
}

module.exports = {
  getGroqApiKey,
  getGeminiModel,
};
