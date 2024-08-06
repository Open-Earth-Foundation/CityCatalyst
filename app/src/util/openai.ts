// This file is only needed when using OpenAI and will be currently always loaded
// If OpenAI models are not used, this file can be removed.

import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
