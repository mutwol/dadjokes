import { createBrowserRouter, RouterProvider } from "react-router";
import { AppShell } from "./components/AppShell.tsx";
import { Create } from "./pages/Create.tsx";
import { JokeDetail } from "./pages/JokeDetail.tsx";
import { Placeholder } from "./pages/Placeholder.tsx";
import { StoryViewer } from "./pages/StoryViewer.tsx";
import { Studio } from "./pages/Studio.tsx";
import { Today } from "./pages/Today.tsx";
import { StoreProvider } from "./state/store.tsx";

const router = createBrowserRouter([
  // The viewer is full-screen, so it sits outside the app shell.
  { path: "/view/:id", element: <StoryViewer /> },
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Today /> },
      { path: "joke/:id", element: <JokeDetail /> },
      { path: "create", element: <Create /> },
      { path: "studio", element: <Studio /> },
      {
        path: "explore",
        element: (
          <Placeholder
            title="Explore"
            body="Browse creators, topics and regions. This screen is planned for a later step."
          />
        ),
      },
      {
        path: "activity",
        element: (
          <Placeholder
            title="Activity"
            body="Replies, reactions to your jokes and new subscribers will show here. Planned for a later step."
          />
        ),
      },
      {
        path: "me",
        element: (
          <Placeholder
            title="Profile"
            body="Your subscriptions, saved jokes, delivery time and plan. Planned for a later step."
          />
        ),
      },
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
