require("dotenv").config();
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function testAPI() {
  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: "Halo ini test koneksi API",
    });

    console.log("Berhasil:");
    console.log(response.output_text);
  } catch (err) {
    console.error("Error:");
    console.error(err.message);
  }
}

testAPI();