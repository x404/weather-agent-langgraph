import { ChatOpenAI } from "@langchain/openai";
import { createAgent, tool } from "langchain";
import { z } from "zod";

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
const modelId = process.env.OPENROUTER_MODEL?.trim();

if (!apiKey || !modelId) {
    throw new Error("Заповни OPENROUTER_API_KEY та OPENROUTER_MODEL у .env.");
}

const model = new ChatOpenAI({
    apiKey,
    model: modelId,
    configuration: {
        baseURL: "https://openrouter.ai/api/v1",
    },
});

const weatherTool = tool(
    ({ city }) => {
        console.log("[get_weather] Місто:", city);

        const normalizedCity = city.toLowerCase();
        if (normalizedCity !== "київ" && normalizedCity !== "kyiv") {
            return { error: "Навчальні дані доступні лише для Києва." };
        }

        return {
            city: "Київ",
            temperatureC: 15,
            condition: "дощ",
            sample: true,
        };
    },
    {
        name: "get_weather",
        description: "Повертає навчальні дані про погоду для Києва.",
        schema: z.object({
            city: z.string().trim().min(1).describe(
                "Назва міста в називному відмінку, наприклад Київ.",
            ),
        }),
    },
);

const agent = createAgent({
    model,
    tools: [weatherTool],
    systemPrompt: [
        "Відповідай стисло українською мовою.",
        "Для запитань про погоду викликай get_weather.",
        "Спирайся на результат інструмента.",
        "Зазначай, що показники погоди є навчальними даними.",
        "Якщо інструмент повернув помилку, поясни її користувачеві.",
    ].join(" "),
});

const question = process.argv[2]?.trim() || "Яка погода в Києві?";

const result = await agent.invoke({
    messages: [{ role: "user", content: question }],
});

console.log("Відповідь:", result.messages.at(-1)?.content);