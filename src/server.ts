import {
    Command,
    GraphRecursionError,
    isInterrupted,
} from "@langchain/langgraph";
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

const DecisionSchema = z.object({
    threadId: z.string().uuid(),
    body: z.object({
        shouldRetry: z.boolean(),
    }).strict(),
});

const resumingThreads = new Set<string>();

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
    const controller = new AbortController();

    const handleClose = () => {
        if (!response.writableEnded) {
            controller.abort();
        }
    };

    response.on("close", handleClose);

    const config = {
        configurable: { thread_id: threadId },
        recursionLimit: 50,
        signal: controller.signal,
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
            if (controller.signal.aborted) {
                console.log("Клієнт відключився. Виконання скасовано.");
                return;
            }

            console.error("Не вдалося виконати граф:", error);

            if (error instanceof GraphRecursionError) {
                response.status(422).json({
                    code: "GRAPH_RECURSION_LIMIT",
                    error: "Граф перевищив дозволену кількість кроків.",
                });
                return;
            }

            response.status(500).json({
                error: "Не вдалося підготувати зведення.",
            });
        } finally {
            response.off("close", handleClose);
        }
    });

app.post("/api/weather-reports/:threadId/decision", async (request, response) => {
    const parsed = DecisionSchema.safeParse({
        threadId: request.params.threadId,
        body: request.body,
    });

    if (!parsed.success) {
        response.status(400).json({
            error: "Передай коректний threadId та shouldRetry зі значенням true або false.",
        });
        return;
    }

    const { threadId, body } = parsed.data;

    if (resumingThreads.has(threadId)) {
        response.status(409).json({
            error: "Рішення для цього зведення вже обробляється.",
        });
        return;
    }

    resumingThreads.add(threadId);

    const controller = new AbortController();

    const handleClose = () => {
        if (!response.writableEnded) {
            controller.abort();
        }
    };

    response.on("close", handleClose);

    const config = {
        configurable: { thread_id: threadId },
        recursionLimit: 50,
        signal: controller.signal,
    };

    try {
        const snapshot = await graph.getState(config);

        const awaitingDecision = snapshot.tasks.some(
            (task) => task.interrupts.length > 0,
        );

        if (!awaitingDecision) {
            response.status(404).json({
                error: "Зведення не знайдено або воно не очікує рішення.",
            });
            return;
        }

        const result = await graph.invoke(
            new Command({ resume: body.shouldRetry }),
            config,
        );

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
        if (controller.signal.aborted) {
            console.log("Клієнт відключився. Продовження графа скасовано.");
            return;
        }

        console.error("Не вдалося продовжити граф:", error);

        if (error instanceof GraphRecursionError) {
            response.status(422).json({
                code: "GRAPH_RECURSION_LIMIT",
                error: "Граф перевищив дозволену кількість кроків.",
            });
            return;
        }

        response.status(500).json({
            error: "Не вдалося продовжити підготовку зведення.",
        });
    } finally {
        response.off("close", handleClose);
        resumingThreads.delete(threadId);
    }
});
app.listen(3000, "127.0.0.1", () => {
    console.log("Сервер запущено на http://127.0.0.1:3000");
});