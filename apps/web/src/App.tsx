import { createBrowserRouter, RouterProvider } from "react-router";
import { AppShell } from "./components/AppShell.tsx";
import { Toaster } from "@/components/ui/toast.tsx";
import { RequireAdmin, RequireCurator, RequireProfile, RequireWriter } from "./components/RoleGate.tsx";
import { Landing } from "./pages/Landing.tsx";
import { Placeholder } from "./pages/Placeholder.tsx";
import { Today } from "./pages/Today.tsx";
import { StoreProvider } from "./state/store.tsx";
import { lazyNamed } from "./routes/lazy.ts";

/*
 * Today, the landing page and the app frame load with the first page. Everything else
 * (the admin console, onboarding, writing, curation…) is split into its own chunk and
 * fetched the first time someone opens it.
 */
const Activity = lazyNamed(() => import("./pages/Activity.tsx"), "Activity");
const AdminLayout = lazyNamed(() => import("./pages/admin/AdminLayout.tsx"), "AdminLayout");
const AdminAudit = lazyNamed(() => import("./pages/admin/Audit.tsx"), "AdminAudit");
const AdminEngagement = lazyNamed(() => import("./pages/admin/Engagement.tsx"), "AdminEngagement");
const AdminFinance = lazyNamed(() => import("./pages/admin/Finance.tsx"), "AdminFinance");
const AdminModeration = lazyNamed(() => import("./pages/admin/Moderation.tsx"), "AdminModeration");
const AdminOverview = lazyNamed(() => import("./pages/admin/Overview.tsx"), "AdminOverview");
const AdminPeople = lazyNamed(() => import("./pages/admin/People.tsx"), "AdminPeople");
const AdminPerson = lazyNamed(() => import("./pages/admin/Person.tsx"), "AdminPerson");
const AdminRuleSet = lazyNamed(() => import("./pages/admin/RuleSet.tsx"), "AdminRuleSet");
const AdminRules = lazyNamed(() => import("./pages/admin/Rules.tsx"), "AdminRules");
const AdminRuns = lazyNamed(() => import("./pages/admin/Runs.tsx"), "AdminRuns");
const AdminWorkflow = lazyNamed(() => import("./pages/admin/Workflow.tsx"), "AdminWorkflow");
const AdminWorkflows = lazyNamed(() => import("./pages/admin/Workflows.tsx"), "AdminWorkflows");
const Shop = lazyNamed(() => import("./pages/Shop.tsx"), "Shop");
const Create = lazyNamed(() => import("./pages/Create.tsx"), "Create");
const Curate = lazyNamed(() => import("./pages/Curate.tsx"), "Curate");
const JokeDetail = lazyNamed(() => import("./pages/JokeDetail.tsx"), "JokeDetail");
const OnboardingLayout = lazyNamed(() => import("./pages/onboarding/OnboardingLayout.tsx"), "OnboardingLayout");
const Profile = lazyNamed(() => import("./pages/Profile.tsx"), "Profile");
const StoryViewer = lazyNamed(() => import("./pages/StoryViewer.tsx"), "StoryViewer");
const Studio = lazyNamed(() => import("./pages/Studio.tsx"), "Studio");
const DeliveryStep = lazyNamed(() => import("./pages/onboarding/Steps.tsx"), "DeliveryStep");
const DoneStep = lazyNamed(() => import("./pages/onboarding/Steps.tsx"), "DoneStep");
const EmailStep = lazyNamed(() => import("./pages/onboarding/Steps.tsx"), "EmailStep");
const FollowStep = lazyNamed(() => import("./pages/onboarding/Steps.tsx"), "FollowStep");
const PayoutsStep = lazyNamed(() => import("./pages/onboarding/Steps.tsx"), "PayoutsStep");
const ProfileStep = lazyNamed(() => import("./pages/onboarding/Steps.tsx"), "ProfileStep");
const RoleStep = lazyNamed(() => import("./pages/onboarding/Steps.tsx"), "RoleStep");
const TopicsStep = lazyNamed(() => import("./pages/onboarding/Steps.tsx"), "TopicsStep");
const VerifyStep = lazyNamed(() => import("./pages/onboarding/Steps.tsx"), "VerifyStep");
const WelcomeStep = lazyNamed(() => import("./pages/onboarding/Steps.tsx"), "WelcomeStep");


const router = createBrowserRouter([
  {
    path: "/welcome",
    element: <OnboardingLayout />,
    children: [
      { index: true, element: <WelcomeStep /> },
      { path: "email", element: <EmailStep /> },
      { path: "verify", element: <VerifyStep /> },
      { path: "role", element: <RoleStep /> },
      { path: "profile", element: <ProfileStep /> },
      { path: "topics", element: <TopicsStep /> },
      { path: "follow", element: <FollowStep /> },
      { path: "delivery", element: <DeliveryStep /> },
      { path: "payouts", element: <PayoutsStep /> },
      { path: "done", element: <DoneStep /> },
    ],
  },
  // Public: anyone can see the shop page (a placeholder until it opens).
  { path: "/shop", element: <Shop /> },
  // The admin console has its own desktop-first frame.
  {
    path: "/admin",
    element: (
      <RequireAdmin>
        <AdminLayout />
      </RequireAdmin>
    ),
    children: [
      { index: true, element: <AdminOverview /> },
      { path: "finance", element: <AdminFinance /> },
      { path: "engagement", element: <AdminEngagement /> },
      { path: "moderation", element: <AdminModeration /> },
      { path: "people", element: <AdminPeople /> },
      { path: "people/:id", element: <AdminPerson /> },
      { path: "workflows", element: <AdminWorkflows /> },
      { path: "workflows/:id", element: <AdminWorkflow /> },
      { path: "runs", element: <AdminRuns /> },
      { path: "rules", element: <AdminRules /> },
      { path: "rules/:id", element: <AdminRuleSet /> },
      { path: "audit", element: <AdminAudit /> },
    ],
  },
  // The viewer is full-screen, so it sits outside the app shell.
  {
    path: "/view/:id",
    element: (
      <RequireProfile>
        <StoryViewer />
      </RequireProfile>
    ),
  },
  {
    element: (
      <RequireProfile signedOut={<Landing />}>
        <AppShell />
      </RequireProfile>
    ),
    children: [
      { index: true, element: <Today /> },
      { path: "joke/:id", element: <JokeDetail /> },
      {
        path: "create",
        element: (
          <RequireWriter>
            <Create />
          </RequireWriter>
        ),
      },
      {
        path: "studio",
        element: (
          <RequireWriter>
            <Studio />
          </RequireWriter>
        ),
      },
      {
        path: "curate",
        element: (
          <RequireCurator>
            <Curate />
          </RequireCurator>
        ),
      },
      {
        path: "explore",
        element: (
          <Placeholder
            title="Explore"
            body="Browse creators, topics and regions. This screen is planned for a later step."
          />
        ),
      },
      { path: "activity", element: <Activity /> },
      { path: "me", element: <Profile /> },
      {
        path: "*",
        element: (
          <Placeholder title="Nothing here" body="This page doesn't exist. Not even as a joke." />
        ),
      },
    ],
  },
]);

export default function App() {
  return (
    <StoreProvider>
      <RouterProvider router={router} />
      <Toaster />
    </StoreProvider>
  );
}
