# ZCode usage import

ZCode requests appear under the **ZCode** application filter, regardless of the model/provider used. The importer reads `~/.zcode/cli/db/db.sqlite` strictly read-only; set `ZCODE_DB` for another database path. It imports terminal requests with a completion timestamp from `model_usage`, not the aggregated `turn_usage` table.

The importer reads only request/model/session IDs, status, token counters, and timing. No credentials, message content, raw usage JSON, or provider metadata are read. Persistent request-ID tombstones prevent duplicate imports, including after detail retention. Running requests are deferred until completed; out-of-order completions are supported without a time watermark.

Cache and reasoning inclusion are determined by reconciliation against the recorded provider/computed total. Negative, overflowing, or inconsistent counters are skipped. Stored input is fresh input and stored output includes reasoning, so the total equals fresh input + cache read + cache creation + output. For example, input 27,528, cached 22,080, output 37, total 27,565 becomes fresh input 5,448 + cache 22,080 + output 37.

Native duration and time-to-first-token are preserved. Completed status maps to 200; other terminal states use unknown HTTP status (0) rather than inventing an HTTP error. Costs use CC Switch's model price table, not subscription quota deductions. Unmatched model IDs remain unpriced.

The source database's entire terminal-request metadata is scanned during synchronization. Requests already imported are skipped in memory; no source database writes or indexes are created. Only this local machine's database is included; remote SSH/WSL ZCode databases need an explicit path or a separate future adapter.
