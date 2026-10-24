import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsageDataScopeProvider } from "@/lib/query/usageScope";
import { useUsageSummary } from "@/lib/query/usage";
import type { UsageSummary } from "@/types/usage";

const api = vi.hoisted(() => ({ getUsageSummary: vi.fn() }));
vi.mock("@/lib/api/usage", () => ({ usageApi: api }));
afterEach(cleanup);

function Metric() {
  const { data } = useUsageSummary(
    { preset: "today" },
    { appType: "codex", providerName: "Shared", model: "priced-model" },
    { refetchInterval: false },
  );
  return <div>{data ? `requests:${data.totalRequests}` : "loading"}</div>;
}

describe("usage data scope", () => {
  it("forwards identical filters, keeps caches separate, and never displays the other scope as placeholder data", async () => {
    const base: UsageSummary = {
      totalRequests: 100,
      totalCost: "1",
      totalInputTokens: 10,
      totalOutputTokens: 10,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      successRate: 100,
      realTotalTokens: 20,
      cacheHitRate: 0,
    };
    let finish: ((value: UsageSummary) => void) | undefined;
    const remote = new Promise<UsageSummary>((resolve) => {
      finish = resolve;
    });
    api.getUsageSummary.mockImplementation(async (...args: unknown[]) =>
      args.at(-1) === true ? remote : base,
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = (multi: boolean) => (
      <QueryClientProvider client={client}>
        <UsageDataScopeProvider value={multi}>
          <Metric />
        </UsageDataScopeProvider>
      </QueryClientProvider>
    );
    const { rerender } = render(view(false));
    expect(await screen.findByText("requests:100")).toBeInTheDocument();
    rerender(view(true));
    expect(screen.queryByText("requests:100")).not.toBeInTheDocument();
    expect(screen.getByText("loading")).toBeInTheDocument();
    await waitFor(() =>
      expect(api.getUsageSummary).toHaveBeenLastCalledWith(
        expect.any(Number),
        expect.any(Number),
        "codex",
        "Shared",
        "priced-model",
        true,
      ),
    );
    await act(async () => {
      finish?.({ ...base, totalRequests: 300 });
      await remote;
    });
    expect(await screen.findByText("requests:300")).toBeInTheDocument();
    expect(
      client
        .getQueryCache()
        .getAll()
        .filter((query) => query.queryKey[0] === "usage"),
    ).toHaveLength(2);
    rerender(view(false));
    expect(screen.getByText("requests:100")).toBeInTheDocument();
    expect(screen.queryByText("requests:300")).not.toBeInTheDocument();
    client.clear();
  });
});
