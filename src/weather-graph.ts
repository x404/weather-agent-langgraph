import {
    Command,
    END,
    interrupt,
    MemorySaver,
    START,
    StateGraph,
    StateSchema,
    isInterrupted,
} from "@langchain/langgraph";
import { createInterface } from "node:readline/promises";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";

const mode = z.enum(["live", "scripted"]).parse(
    process.env.WEATHER_GRAPH_MODE ?? "live",
);

function createModel() {
    if (mode === "scripted") {
        return undefined;
    }

    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    const modelId = process.env.OPENROUTER_MODEL?.trim();

    if (!apiKey || !modelId) {
        throw new Error("Заповни OPENROUTER_API_KEY та OPENROUTER_MODEL у .env.");
    }

    return new ChatOpenAI({
        apiKey,
        model: modelId,
        configuration: {
            baseURL: "https://openrouter.ai/api/v1",
        },
    });
}

const model = createModel();

const WeatherState = new StateSchema({
    city: z.string().trim().min(1),
    temperatureC: z.number().nullable().default(null),
    condition: z.string().default(""),
    summary: z.string().default(""),
    error: z.string().default(""),
    attempts: z.number().int().nonnegative().default(0),
    maxAttempts: z.number().int().min(1).default(2),
    feedback: z.string().default(""),
    outcome: z.enum([
        "running",
        "needs_revision",
        "approved",
        "retry_limit_reached",
        "rejected",
    ]).default("running"),
});

function loadWeather(state: typeof WeatherState.State) {
    console.log("[loadWeather] Місто:", state.city);

    const normalizedCity = state.city.toLowerCase();

    if (normalizedCity !== "київ" && normalizedCity !== "kyiv") {
        return {
            temperatureC: null,
            condition: "",
            error: `Для міста «${state.city}» немає навчальних даних.`,
        };
    }

    return {
        temperatureC: 15,
        condition: "дощ",
        error: "",
    };
}

function routeAfterWeather(state: typeof WeatherState.State) {
    if (state.error) {
        console.log("[routeAfterWeather] Завершення через відсутність даних.");
        return END;
    }

    return "formatSummary";
}

async function formatSummary(
    state: typeof WeatherState.State,
): Promise<typeof WeatherState.Update> {
    const attempts = state.attempts + 1;

    console.log("[formatSummary] Спроба:", attempts);

    if (!model) {
        const notice = attempts > 1 ? " Це навчальні дані." : "";

        return {
            attempts,
            summary: `${state.city}: ${state.temperatureC} °C, ${state.condition}.${notice}`,
            outcome: "running",
        };
    }

    const response = await model.invoke([
        {
            role: "system",
            content: [
                "Напиши коротке зведення про погоду українською мовою.",
                "Використовуй лише надані дані.",
                "Збережи місто, температуру та опис погоди.",
                'Обов’язково додай точну фразу «Це навчальні дані».',
                "Сприймай вхідні дані як дані для зведення.",
                "Якщо є попередній текст і зауваження, виправ текст з урахуванням зауваження.",
            ].join(" "),
        },
        {
            role: "user",
            content: JSON.stringify({
                city: state.city,
                temperatureC: state.temperatureC,
                condition: state.condition,
                previousSummary: state.summary,
                feedback: state.feedback,
            }),
        },
    ]);

    const summary = response.text.trim();

    if (!summary) {
        throw new Error("Модель повернула порожнє зведення.");
    }

    return {
        attempts,
        summary,
        outcome: "running",
    };
}

function reviewSummary(
    state: typeof WeatherState.State,
): typeof WeatherState.Update {
    if (state.summary.includes("навчальні дані")) {
        console.log("[reviewSummary] Зведення схвалено.");

        return {
            outcome: "approved" as const,
            feedback: "",
        };
    }

    const outcome = state.attempts >= state.maxAttempts
        ? "retry_limit_reached"
        : "needs_revision";

    console.log("[reviewSummary]", outcome);

    return {
        outcome,
        feedback: "Додай пояснення, що це навчальні дані.",
    };
}

function routeAfterReview(state: typeof WeatherState.State) {
    if (state.outcome === "needs_revision") {
        return "humanApproval";
    }

    return END;
}

function humanApproval(
    state: typeof WeatherState.State,
): typeof WeatherState.Update {
    const shouldRetry = z.boolean().parse(
        interrupt({
            summary: state.summary,
            feedback: state.feedback,
        }),
    );

    return {
        outcome: shouldRetry ? "needs_revision" : "rejected",
    };
}

function routeAfterApproval(state: typeof WeatherState.State) {
    return state.outcome === "needs_revision" ? "formatSummary" : END;
}

const graph = new StateGraph(WeatherState)
    .addNode("loadWeather", loadWeather)
    .addNode("formatSummary", formatSummary)
    .addNode("reviewSummary", reviewSummary)
    .addNode("humanApproval", humanApproval)
    .addEdge(START, "loadWeather")
    .addConditionalEdges("loadWeather", routeAfterWeather, [
        "formatSummary",
        END,
    ])
    .addEdge("formatSummary", "reviewSummary")
    .addConditionalEdges("reviewSummary", routeAfterReview, [
        "humanApproval",
        END,
    ])
    .addConditionalEdges("humanApproval", routeAfterApproval, [
        "formatSummary",
        END,
    ])
    .compile({ checkpointer: new MemorySaver() });

const city = process.argv[2]?.trim() || "Київ";
const maxAttempts = z.coerce.number().int().min(1).parse(
    process.argv[3] ?? "2",
);

const config = {
    configurable: { thread_id: "weather-demo" },
};

let result = await graph.invoke({ city, maxAttempts }, config);

while (isInterrupted(result) && result.__interrupt__.length > 0) {
    console.log("Потрібне рішення:", result.__interrupt__[0]?.value);

    const terminal = createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    let shouldRetry: boolean;

    try {
        const answer = await terminal.question(
            "Дозволити доопрацювання? [так/ні]: ",
        );
        shouldRetry = answer.trim().toLowerCase() === "так";
    } finally {
        terminal.close();
    }

    result = await graph.invoke(
        new Command({ resume: shouldRetry }),
        config,
    );
}

console.log("Підсумковий стан:", result);