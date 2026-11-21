import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

const WeatherState = new StateSchema({
    city: z.string().trim().min(1),
    temperatureC: z.number().nullable().default(null),
    condition: z.string().default(""),
    summary: z.string().default(""),
    error: z.string().default(""),
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
    console.log("state:", state);
    console.log("[formatSummary] Температура:", state.temperatureC);

    return {
        summary: `${state.city}: ${state.temperatureC} °C, ${state.condition}. Це навчальні дані.`,
    };
}

const graph = new StateGraph(WeatherState)
    .addNode("loadWeather", loadWeather)
    .addNode("formatSummary", formatSummary)
    .addEdge(START, "loadWeather")
    .addConditionalEdges("loadWeather", routeAfterWeather, [
        "formatSummary",
        END,
    ])
    .addEdge("formatSummary", END)
    .compile();

const city = process.argv[2]?.trim() || "Київ";
const result = await graph.invoke({ city });

console.log("Підсумковий стан:", result);