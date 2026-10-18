import { Link, useParams } from "react-router";
import { z } from "zod";
import {
  problemMessage,
  useGetAdminUserQuery,
  useSetAdminUserRolesMutation,
  useSuspendUserMutation,
  useTagUserMutation,
  useUnsuspendUserMutation,
  useUntagUserMutation,
} from "../../api/rtk/index.ts";
import { Avatar } from "@/components/ui/avatar.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Chip } from "@/components/ui/chip.tsx";
import { ConfirmPopover } from "@/components/ui/confirm-popover.tsx";
import { Form, FormError, SubmitButton, TextField } from "@/components/ui/form.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { toast } from "@/components/ui/toast.tsx";
import { useZodForm } from "@/hooks/useZodForm.ts";
import { timeAgo } from "../../data/dates.ts";
import { useStore } from "../../state/useStore.ts";
import { LoadError, Loading, StatTile, Tiles } from "./ui.tsx";
import { kes, num } from "./lib.ts";

const ROLES = ["reader", "writer", "curator", "admin"] as const;
const RUN_TONE: Record<string, "green" | "blue" | "yellow" | "red" | "grey"> = { completed: "green", running: "blue", waiting: "yellow", failed: "red", stopped: "grey" };

const tagSchema = z.object({
  tag: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Type a tag.")
    .max(32, "Keep tags under 32 characters.")
    .regex(/^[a-z0-9][a-z0-9-]*$/, "Letters, numbers and dashes only."),
});

const suspendSchema = z.object({
  reason: z.string().trim().min(3, "Say why in a few words; they'll see it.").max(280, "Keep it under 280 characters."),
});

/** One person: who they are, how they use the app, what automations did, and staff actions. */
export function AdminPerson() {
  const { id = "" } = useParams();
  const { account } = useStore();
  const { data: u, error, refetch, isFetching } = useGetAdminUserQuery({ id }, { skip: !id });
  const [setRoles, rolesState] = useSetAdminUserRolesMutation();
  const [tagUser] = useTagUserMutation();
  const [untagUser, untagState] = useUntagUserMutation();
  const [suspend] = useSuspendUserMutation();
  const [unsuspend, unsuspendState] = useUnsuspendUserMutation();

  const tagForm = useZodForm(tagSchema, { defaultValues: { tag: "" } });
  const suspendForm = useZodForm(suspendSchema, { defaultValues: { reason: "" } });

  if (error && !u) return <LoadError error={problemMessage(error)} onRetry={() => void refetch()} />;
  if (!u) return <Loading height="h-96" />;

  /** Runs a mutation, then toasts the outcome. The cache updates itself (see endpoints.ts). */
  const act = async (run: () => Promise<unknown>, done: string) => {
    try {
      await run();
      toast.success(done);
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };
  const toggleRole = (r: (typeof ROLES)[number]) => {
    const roles = u.roles.includes(r) ? u.roles.filter((x) => x !== r) : [...u.roles, r];
    if (!roles.length) return toast.error("Everyone needs at least one role.");
    void act(() => setRoles({ id, setRolesRequest: { roles } }).unwrap(), "Roles updated.");
  };
  const isMe = account?.id === u.id;
  const s = u.stats;

  return (
    <>
      <Link to="/admin/people" className="flex items-center gap-1 text-sm font-medium text-ink-soft no-underline">
        <Icon name="back" size={16} /> People
      </Link>
      <header className="flex flex-wrap items-center gap-4">
        <Avatar name={u.name} tone={u.tone} size={64} />
        <div className="grid flex-1 gap-1">
          <h1 className="flex flex-wrap items-center gap-2 text-3xl" aria-busy={isFetching || undefined}>
            {u.name}
            {u.suspended ? <Badge tone="red">Suspended</Badge> : null}
          </h1>
          <p className="text-ink-soft">
            {u.handle ? `@${u.handle} · ` : ""}
            {u.email} · {u.country ?? "No country"} · {u.timezone}
            {u.deliveryHour !== null ? ` · joke at ${u.deliveryHour}:00` : ""}
          </p>
          <p className="text-sm text-ink-soft">
            Joined {timeAgo(u.createdAt)} · last opened {u.lastOpenAt ? timeAgo(u.lastOpenAt) : "never"}
          </p>
        </div>
        {u.handle ? null : <Badge tone="yellow">Hasn't finished signing up</Badge>}
      </header>

      {u.suspended ? (
        <p className="rounded-lg border border-tag-red/30 bg-tag-red/8 px-4 py-3 text-sm font-medium text-tag-red-deep">
          Suspended {u.suspendedAt ? timeAgo(u.suspendedAt) : ""}: {u.suspendedReason}
        </p>
      ) : null}

      <Tiles>
        <StatTile label="Streak" value={`${u.streak} days`} hint={`${num(s.opens)} jokes opened, ${s.missed7d} missed this week`} />
        <StatTile label="Subscriptions" value={num(s.subscriptions)} hint={`${num(s.subscribers)} subscribe to them`} />
        <StatTile label="Tips sent" value={kes(s.tipsSentKes)} hint={`${s.tipsSent} tips`} />
        <StatTile label="Tips received" value={kes(s.tipsReceivedKes)} hint={`Balance ${kes(s.balanceKes)}`} />
        <StatTile label="Jokes" value={`${s.jokesDelivered} of ${s.jokesSubmitted}`} hint="picked of submitted" />
        <StatTile label="Taken down" value={num(s.jokesRemoved)} tone={s.jokesRemoved ? "warn" : "plain"} />
        <StatTile label="Reports against" value={num(s.reportsAgainst)} tone={s.reportsAgainst > 2 ? "bad" : "plain"} />
        <StatTile label="Reports filed" value={num(s.reportsFiled)} />
      </Tiles>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card as="section" className="grid content-start gap-3 p-4" aria-labelledby="roles-title">
          <h2 id="roles-title" className="text-lg">
            Roles
          </h2>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <Chip key={r} on={u.roles.includes(r)} disabled={rolesState.isLoading || (isMe && r === "admin")} onClick={() => toggleRole(r)}>
                {r}
              </Chip>
            ))}
          </div>
          <p className="text-sm text-ink-soft">Changes apply on their next request. You can't remove your own admin role.</p>
        </Card>

        <Card as="section" className="grid content-start gap-3 p-4" aria-labelledby="tags-title">
          <h2 id="tags-title" className="text-lg">
            Tags
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {u.tags.length ? (
              u.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-sm bg-butter py-0.5 pr-1 pl-2 text-sm font-medium text-butter-ink">
                  {t}
                  <ConfirmPopover
                    trigger={
                      <button
                        type="button"
                        className="grid size-5 place-items-center rounded-sm border-0 bg-transparent text-butter-ink hover:bg-butter-ink/15 disabled:opacity-50 data-popup-open:bg-butter-ink/15"
                        aria-label={`Remove tag ${t}`}
                        disabled={untagState.isLoading}
                      >
                        <Icon name="close" size={12} />
                      </button>
                    }
                    align="start"
                    title={`Remove the “${t}” tag?`}
                    confirmLabel="Remove tag"
                    pendingLabel="Removing…"
                    onConfirm={() => act(() => untagUser({ id, tag: t }).unwrap(), `Removed ${t}.`)}
                  />
                </span>
              ))
            ) : (
              <span className="text-sm text-ink-soft">No tags.</span>
            )}
          </div>
          <Form
            form={tagForm}
            resetOnSuccess
            className="grid-cols-[1fr_auto] items-start gap-2"
            onSubmit={async ({ tag }) => {
              await tagUser({ id, tag }).unwrap();
              toast.success(`Tagged ${tag}.`);
            }}
          >
            <TextField name="tag" label="New tag" hideLabel fieldSize="sm" className="min-w-0" placeholder="e.g. vip, beta, lapsing" autoComplete="off" />
            <SubmitButton variant="quiet" size="sm">
              Add tag
            </SubmitButton>
            <FormError className="col-span-2" />
          </Form>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card as="section" className="grid content-start gap-2 p-4" aria-labelledby="msgs-title">
          <h2 id="msgs-title" className="text-lg">
            Automated messages
          </h2>
          {u.messages.length ? (
            <ul className="m-0 grid list-none gap-1.5 p-0 text-sm">
              {u.messages.map((m, i) => (
                <li key={i} className="flex items-start gap-2 border-b border-line pb-1.5 last:border-b-0">
                  <Badge tone="blue">{m.channel}</Badge>
                  <span className="flex-1">
                    <strong>{m.title}</strong>
                    {m.workflowName ? <span className="block text-xs text-ink-soft">{m.workflowName}</span> : null}
                  </span>
                  <span className="whitespace-nowrap text-xs text-ink-soft">{timeAgo(m.sentAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-soft">No automated messages yet.</p>
          )}
        </Card>
        <Card as="section" className="grid content-start gap-2 p-4" aria-labelledby="runs-title">
          <h2 id="runs-title" className="text-lg">
            Workflow runs
          </h2>
          {u.runs.length ? (
            <ul className="m-0 grid list-none gap-1.5 p-0 text-sm">
              {u.runs.map((r) => (
                <li key={r.id} className="flex items-center gap-2 border-b border-line pb-1.5 last:border-b-0">
                  <Badge tone={RUN_TONE[r.status] ?? "grey"}>{r.status}</Badge>
                  <Link to={`/admin/runs?run=${r.id}`} className="flex-1 font-medium text-ink">
                    {r.workflowName}
                  </Link>
                  <span className="text-xs text-ink-soft">{timeAgo(r.startedAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-soft">No workflows have run for them.</p>
          )}
        </Card>
      </div>

      <Card as="section" className="grid content-start gap-3 p-4" aria-labelledby="account-title">
        <h2 id="account-title" className="text-lg">
          Account
        </h2>
        {u.suspended ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-sm text-ink-soft">They can't use Daddy Jokes until you lift the suspension.</p>
            <button
              type="button"
              className={button({ size: "sm" })}
              disabled={unsuspendState.isLoading}
              aria-busy={unsuspendState.isLoading || undefined}
              onClick={() => void act(() => unsuspend({ id }).unwrap(), "Suspension lifted.")}
            >
              Lift suspension
            </button>
          </div>
        ) : (
          <Form
            form={suspendForm}
            resetOnSuccess
            className="grid-cols-1 items-start gap-2 sm:grid-cols-[1fr_auto]"
            onSubmit={async ({ reason }) => {
              await suspend({ id, suspendRequest: { reason } }).unwrap();
              toast.success("Suspended and signed out everywhere.");
            }}
          >
            <TextField
              name="reason"
              label="Reason for suspending"
              hideLabel
              fieldSize="sm"
              className="min-w-0"
              placeholder="Reason (they'll see it when they try to sign in)"
              disabled={isMe}
              help={isMe ? "You can't suspend yourself." : undefined}
            />
            <SubmitButton variant="danger" size="sm" disabled={isMe} pendingLabel="Suspending…">
              Suspend account
            </SubmitButton>
            <FormError className="sm:col-span-2" />
          </Form>
        )}
        {u.audit.length ? (
          <ul className="m-0 grid list-none gap-1 border-t border-line p-0 pt-3 text-sm text-ink-soft">
            {u.audit.map((a, i) => (
              <li key={i}>
                <strong className="text-ink">{a.action.replace("user.", "").replace("_", " ")}</strong>
                {a.actor ? ` by @${a.actor}` : ""} · {timeAgo(a.createdAt)}
                {typeof a.data.reason === "string" ? ` · “${a.data.reason}”` : ""}
                {typeof a.data.tag === "string" ? ` · ${a.data.tag}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
