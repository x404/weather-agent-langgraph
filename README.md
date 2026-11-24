# Weather Agent LangGraph

A TypeScript weather assistant built with LangChain and LangGraph to explore agent loops, stateful workflows, and human decisions.

## Setup

Use Node.js 24.

```bash
npm ci
cp .env.example .env
```

Set `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` in `.env`.

```bash
npm run typecheck
```

## LangChain agent

```bash
npm start -- 'Яка погода в Києві?'
```

The agent calls `get_weather` and answers in Ukrainian using sample data.
Weather data is available for Kyiv.

## Weather graph

Generate a summary through OpenRouter.

```bash
npx tsx --env-file=.env src/weather-graph.ts 'Київ'
```

The graph loads sample weather, generates a summary, and checks for the phrase `навчальні дані`.
This check only verifies the presence of that phrase.

If the phrase is missing and attempts remain, the graph pauses.
Type `так` to allow another attempt or `ні` to stop.

Possible outcomes are `approved`, `rejected`, and `retry_limit_reached`.
An unsupported city ends the graph with an `error` in its state.

## Offline scenarios

Scripted mode produces a summary without the notice on the first attempt and with the notice on the second attempt.

```bash
WEATHER_GRAPH_MODE=scripted npx tsx src/weather-graph.ts 'Київ'
```

- Enter `так` to finish with two attempts and `approved`.
- Enter `ні` to finish with one attempt and `rejected`.

Limit generation to one attempt.

```bash
WEATHER_GRAPH_MODE=scripted npx tsx src/weather-graph.ts 'Київ' 1
```

The expected outcome is `retry_limit_reached`.

## Parallel graph

```bash
npx tsx src/parallel-weather-graph.ts
```

Two independent nodes return sample weather for Kyiv and Paris.
A reducer merges their reports, then a final node builds the combined summary.

## HTTP API

Start the local server in scripted mode.

```bash
WEATHER_GRAPH_MODE=scripted npx tsx src/server.ts
```

Create a report from another terminal.

```bash
curl -i http://127.0.0.1:3000/api/weather-reports \
  -H 'Content-Type: application/json' \
  -d '{"city":"Київ","maxAttempts":2}'
```

A paused workflow returns HTTP 202 with a `threadId` and interrupt details.
Replace `THREAD_ID` below with the returned identifier.

```bash
curl -i http://127.0.0.1:3000/api/weather-reports/THREAD_ID/decision \
  -H 'Content-Type: application/json' \
  -d '{"shouldRetry":true}'
```

Use `false` to reject another attempt.

A completed workflow returns HTTP 200 with its final state.
Invalid request data returns HTTP 400.
An unknown thread or one without a pending decision returns HTTP 404.
A concurrent decision for a thread already being resumed returns HTTP 409.

For model-generated summaries, start the server with `.env`.

```bash
npx tsx --env-file=.env src/server.ts
```

`MemorySaver` keeps checkpoints in process memory.
Continue a paused workflow using the same server process and `threadId`.
Restarting the server clears its checkpoints.

## Error handling and cancellation

Model-generated summaries are rejected if the response contains a
structured refusal, its finish reason is not `stop`, or its text is empty.

Exceeding the graph recursion limit returns HTTP 422 with the code
`GRAPH_RECURSION_LIMIT`. Other execution errors return HTTP 500.

`maxAttempts` limits summary generation attempts.
`recursionLimit` limits graph execution steps.

Both HTTP endpoints pass an abort signal to the graph.
The summary generation node forwards it to the model.

If a client disconnects before the response ends, the server signals
cancellation and removes the connection listener when the handler finishes.
Cancellation does not guarantee that the provider immediately stops generation.

## Project files

- `src/index.ts` — LangChain agent with a weather tool.
- `src/weather-workflow.ts` — shared graph definition and summary generation.
- `src/weather-graph.ts` — terminal interface for the weather graph.
- `src/parallel-weather-graph.ts` — parallel nodes and reducer example.
- `src/server.ts` — HTTP endpoints for starting and resuming reports.