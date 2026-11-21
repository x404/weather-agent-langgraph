import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

const WeatherState = new StateSchema({
    city: z.literal("Київ"),
    temperatureC: z.number().default(0),
    condition: z.string().default(""),
    summary: z.string().default(""),
});

function loadWeather(state: typeof WeatherState.State) {
    console.log("[loadWeather] Місто:", state.city);

    return {
        temperatureC: 15,
        condition: "дощ",
    };
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
    .addEdge("loadWeather", "formatSummary")
    .addEdge("formatSummary", END)
    .compile();

const result = await graph.invoke({ city: "Київ" });

console.log("Підсумковий стан:", result);