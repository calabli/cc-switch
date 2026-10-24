import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanUsagePanel } from "@/components/usage/LanUsagePanel";
import { LAN_SHARED_APPS, type LanShareSettings } from "@/types/lan";
import { APP_DISPLAY_NAME } from "@/components/shell/AppGlyph";

const api = vi.hoisted(() => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  listDevices: vi.fn(),
  getOverview: vi.fn(),
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const i18n = vi.hoisted(() => ({
  t: (key: string) => key,
  i18n: { language: "en", resolvedLanguage: "en" },
}));
vi.mock("@/lib/api/lan", () => ({ lanUsageApi: api }));
vi.mock("@/lib/toast", () => ({ toast }));
vi.mock("react-i18next", () => ({ useTranslation: () => i18n }));
vi.mock("@/hooks/useMoneyFormat", () => ({
  useMoneyFormat: () => ({ money: () => "$0" }),
}));

let settings: LanShareSettings;
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <LanUsagePanel range={{ preset: "all" }} />
    </QueryClientProvider>,
  );
  return client;
}

describe("LAN usage source settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settings = {
      enabled: false,
      port: 17890,
      deviceName: "A",
      autoSync: true,
      autoSyncIntervalSecs: 300,
      sharedAppTypes: [...LAN_SHARED_APPS],
    };
    api.getSettings.mockImplementation(async () => settings);
    api.saveSettings.mockImplementation(async (next: LanShareSettings) => {
      settings = next;
      return next;
    });
    api.listDevices.mockResolvedValue([]);
    api.getOverview.mockResolvedValue(null);
  });
  afterEach(cleanup);

  it("shows the first-time setup while sharing is off and exposes every app", async () => {
    const client = mount();
    await userEvent.click(
      screen.getByRole("button", { name: "usage.lan.title" }),
    );
    await waitFor(() =>
      expect(screen.getAllByRole("checkbox")).toHaveLength(
        LAN_SHARED_APPS.length,
      ),
    );
    for (const app of LAN_SHARED_APPS) {
      expect(
        screen.getByRole("checkbox", { name: APP_DISPLAY_NAME[app] }),
      ).toBeChecked();
    }
    expect(
      screen.getByRole("switch", { name: "usage.lan.shareLabel" }),
    ).not.toBeChecked();
    client.clear();
  });

  it("saves an app deselection and keeps it after reopening", async () => {
    const client = mount();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "usage.lan.title" }));
    const checkbox = await screen.findByRole("checkbox", {
      name: APP_DISPLAY_NAME.codex,
    });
    await waitFor(() => expect(checkbox).toBeEnabled());
    await user.click(checkbox);
    await waitFor(() =>
      expect(api.saveSettings).toHaveBeenCalledWith({
        ...settings,
        sharedAppTypes: LAN_SHARED_APPS.filter((app) => app !== "codex"),
      }),
    );
    await waitFor(() => expect(checkbox).not.toBeChecked());
    expect(
      screen.getByRole("checkbox", { name: APP_DISPLAY_NAME.zcode }),
    ).toBeChecked();
    await user.click(screen.getByRole("button", { name: "usage.lan.title" }));
    await user.click(screen.getByRole("button", { name: "usage.lan.title" }));
    expect(
      screen.getByRole("checkbox", { name: APP_DISPLAY_NAME.codex }),
    ).not.toBeChecked();
    client.clear();
  });

  it("keeps the saved selection when saving fails", async () => {
    api.saveSettings.mockRejectedValueOnce(new Error("offline"));
    const client = mount();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "usage.lan.title" }));
    const checkbox = await screen.findByRole("checkbox", {
      name: APP_DISPLAY_NAME.mcode,
    });
    await waitFor(() => expect(checkbox).toBeEnabled());
    await user.click(checkbox);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(checkbox).toBeChecked();
    client.clear();
  });
});
