import { useSearchParams } from "react-router";
import { AppealsPanel } from "../../components/moderation/AppealsPanel.tsx";
import { ReportsPanel } from "../../components/moderation/ReportsPanel.tsx";
import { Tabs } from "@/components/ui/tabs.tsx";
import { PageHeader } from "./ui.tsx";

/** Reports and appeals, with the admin's full set of actions. */
export function AdminModeration() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "appeals" ? "appeals" : "reports";
  return (
    <>
      <PageHeader
        title="Moderation"
        description="Reported jokes and comments, and writers' appeals. Curators can hide comments; you decide what gets taken down. Every decision is in the audit log."
      />
      <Tabs
        value={tab}
        onChange={(t) => setParams(t === "reports" ? {} : { tab: t }, { replace: true })}
        tabs={[
          { id: "reports", label: "Reports" },
          { id: "appeals", label: "Appeals" },
        ]}
      />
      {tab === "reports" ? <ReportsPanel /> : <AppealsPanel />}
    </>
  );
}
