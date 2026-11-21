import {
    END,
    ReducedValue,
    START,
    StateGraph,
    StateSchema,
} from "@langchain/langgraph";
import { z } from "zod";

const ComparisonState = new StateSchema({
    reports: new ReducedValue(
        z.array(z.string()).default(() => []),
        {
            reducer: (current, incoming) => [...current, ...incoming],
        },
    ),
    summary: z.string().default(""),
});

function loadKyiv() {
    console.log("[loadKyiv] Отримано навчальні дані.");

    return {
        reports: ["Київ: 15 °C, дощ."],
    };
}

function loadParis() {
    console.log("[loadParis] Отримано навчальні дані.");

    return {
        reports: ["Париж: 22 °C, сонячно."],
    };
}

function formatComparison(state: typeof ComparisonState.State) {
    console.log("[formatComparison] Кількість звітів:", state.reports.length);

    return {
        summary: [
            "Навчальні дані про погоду.",
            ...[...state.reports].sort(),
        ].join("\n"),
    };
}

const graph = new StateGraph(ComparisonState)
    .addNode("loadKyiv", loadKyiv)
    .addNode("loadParis", loadParis)
    .addNode("formatComparison", formatComparison)
    .addEdge(START, "loadKyiv")
    .addEdge(START, "loadParis")
    .addEdge(["loadKyiv", "loadParis"], "formatComparison")
    .addEdge("formatComparison", END)
    .compile();

const result = await graph.invoke({});

console.log(result.summary);