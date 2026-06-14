"use client";

import PortalLoadingScene from "@/components/portal/portal-loading-scene";

type AdminLoadingSceneProps = {
  eyebrow?: string;
  title: string;
  body: string;
  badge?: string;
};

export default function AdminLoadingScene(props: AdminLoadingSceneProps) {
  return <PortalLoadingScene {...props} />;
}
