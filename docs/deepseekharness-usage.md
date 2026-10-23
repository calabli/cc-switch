# DeepSeekHarness usage import

This fork reads `DSH_HOME/sessions` (default: `~/.dsh/sessions`) without changing Harness data or reading credentials. No Harness plugin or local proxy is required.

The Usage dashboard has a **DeepSeekHarness** application filter. All models used inside Harness belong to that application; their original model IDs remain available in model statistics and request details. Costs use CC Switch's model pricing table. A model alias without a matching price remains unpriced; add its exact ID in Usage settings rather than assuming a DeepSeek price.

Supported logs: v4 `session.v4.jsonl.zstd` with concatenated Zstandard frames, and uncompressed `session.v4.jsonl`. Import committed `assistant/message` events carrying provider usage. Input excludes cache, output already includes reasoning. Copied seed history is excluded until `session/end-seed`. No synthetic speed or latency is recorded.

Changed files are reread with durable session/sequence deduplication. Tombstones survive request-detail retention; unchanged files are skipped using modification time and size. Malformed or partially written tails are deferred for retry. Logs exceeding the 256 MiB decoded safety limit are deferred. Other log schema versions are not imported.

The `build-dsh-windows.yml` workflow builds this branch, checks TypeScript, runs Harness and MiniMax importer regression tests, and uploads a Windows x64 executable. The MiniMax desktop model-name recovery patch is retained.
