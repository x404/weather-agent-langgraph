import { isInterrupted } from "@langchain/langgraph";
import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { graph } from "./weather-workflow.js";

const app = express();

app.use(express.json());

const StartReportSchema = z.object({
    city: z.string().trim().min(1),
    maxAttempts: z.number().int().min(1).max(10).default(2),
}).strict();

app.post("/api/weather-reports", async (request, response) => {
    const parsed = StartReportSchema.safeParse(request.body);

    if (!parsed.success) {
        response.status(400).json({
            error: "Перевір місто та кількість спроб.",
            issues: parsed.error.issues,
        });
        return;
    }

    const threadId = randomUUID();
    const config = {
        configurable: { thread_id: threadId },
        recursionLimit: 50,
    };

    try {
        const result = await graph.invoke(parsed.data, config);

        if (isInterrupted(result) && result.__interrupt__.length > 0) {
            response.status(202).json({
                status: "paused",
                threadId,
                interrupts: result.__interrupt__,
            });
            return;
        }

        response.status(200).json({
            status: "completed",
            threadId,
            state: result,
        });
    } catch (error) {
        console.error("Не вдалося виконати граф:", error);

        response.status(500).json({
            error: "Не вдалося підготувати зведення.",
        });
    }
});

app.listen(3000, "127.0.0.1", () => {
    console.log("Сервер запущено на http://127.0.0.1:3000");
});