export const TEAM_BULLETIN_CONTEXT_TYPE = "team_bulletin";
export const TEAM_BULLETIN_RETENTION_DAYS = 30;

export type TeamBulletinPortal = "admin" | "cleaner" | "grounds";

export type TeamBulletinSummary = {
  conversationId: string;
  organizationId: string;
  unreadCount: number;
};

export async function fetchTeamBulletinSummary(params: {
  accessToken: string;
  portal: TeamBulletinPortal;
  organizationId: string;
}) {
  const query = new URLSearchParams({
    portal: params.portal,
    organizationId: params.organizationId,
  });

  const response = await fetch(`/api/team-bulletin/summary?${query.toString()}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || "Could not load the team bulletin summary.");
  }

  return {
    conversationId: String(payload?.conversationId || ""),
    organizationId: String(payload?.organizationId || params.organizationId),
    unreadCount: Math.max(0, Number(payload?.unreadCount || 0)),
  } satisfies TeamBulletinSummary;
}
