import { createBrowserRouter, RouterProvider } from "react-router";
import { AppShell } from "./components/AppShell.tsx";
import { RequireCurator, RequireProfile, RequireWriter } from "./components/RoleGate.tsx";
import { Activity } from "./pages/Activity.tsx";
import { Create } from "./pages/Create.tsx";
import { Curate } from "./pages/Curate.tsx";
import { JokeDetail } from "./pages/JokeDetail.tsx";
import { OnboardingLayout } from "./pages/onboarding/OnboardingLayout.tsx";
import {
  DeliveryStep,
  DoneStep,
  EmailStep,
  FollowStep,
  PayoutsStep,
  ProfileStep,
  RoleStep,
  TopicsStep,
  VerifyStep,
  WelcomeStep,
} from "./pages/onboarding/Steps.tsx";
import { Placeholder } from "./pages/Placeholder.tsx";
import { Profile } from "./pages/Profile.tsx";
import { StoryViewer } from "./pages/StoryViewer.tsx";
import { Studio } from "./pages/Studio.tsx";
import { Today } from "./pages/Today.tsx";
import { StoreProvider } from "./state/store.tsx";

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
      <RequireProfile>
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
    </StoreProvider>
  );
}
