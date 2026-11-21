import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

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

function formatSummary(state: typeof WeatherState.State) {
    const attempts = state.attempts + 1;
    const notice = attempts > 1 ? " Це навчальні дані." : "";

    console.log("[formatSummary] Спроба:", attempts);

    return {
        attempts,
        summary: `${state.city}: ${state.temperatureC} °C, ${state.condition}.${notice}`,
        outcome: "running" as const,
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
        return "formatSummary";
    }

    return END;
}

const graph = new StateGraph(WeatherState)
    .addNode("loadWeather", loadWeather)
    .addNode("formatSummary", formatSummary)
    .addNode("reviewSummary", reviewSummary)
    .addEdge(START, "loadWeather")
    .addConditionalEdges("loadWeather", routeAfterWeather, [
        "formatSummary",
        END,
    ])
    .addEdge("formatSummary", "reviewSummary")
    .addConditionalEdges("reviewSummary", routeAfterReview, [
        "formatSummary",
        END,
    ])
    .compile();

const city = process.argv[2]?.trim() || "Київ";
const result = await graph.invoke({ city });

console.log("Підсумковий стан:", result);