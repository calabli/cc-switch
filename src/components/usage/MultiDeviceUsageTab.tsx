import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { UsageRangeSelection } from "@/types/usage";
import { LanUsagePanel } from "./LanUsagePanel";

/** The multi-device view shares the entire dashboard; only its management entry is additional. */
export function MultiDeviceUsageTab({ range }: { range: UsageRangeSelection }) {
  const { t } = useTranslation();
  const [manageOpen, setManageOpen] = useState(false);
  return (
    <>
      <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
      <Button
        type="button"
        variant="neutral"
        size="regular"
        onClick={() => setManageOpen(true)}
        aria-haspopup="dialog"
      >
        <Settings2 className="h-4 w-4 text-fg-3" />
        {t("usage.lan.manageDevices")}
      </Button>
      <span role="status" className="text-caption text-fg-3">
        {t("usage.lan.uiPreviewHint")}
      </span>
      <Sheet open={manageOpen} onOpenChange={setManageOpen}>
        <SheetContent
          width={560}
          closeLabel={t("common.close")}
          dismissOnOutsideClick
        >
          <SheetHeader className="pb-3">
            <SheetTitle>{t("usage.lan.manageDevices")}</SheetTitle>
            <SheetDescription>
              {t("usage.lan.sameFiltersHint")}
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4 border-t border-border">
            <LanUsagePanel range={range} defaultExpanded showOverview={false} />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
