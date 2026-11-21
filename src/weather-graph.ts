import { Command, isInterrupted } from "@langchain/langgraph";
import { createInterface } from "node:readline/promises";
import { z } from "zod";

import { graph } from "./weather-workflow.js";

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