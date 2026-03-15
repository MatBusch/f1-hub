import { Suspense } from "react";

import { F1DashReplicaPage } from "@/components/f1dash-replica-page";

export default function ReplicaRoute() {
  return (
    <Suspense fallback={null}>
      <F1DashReplicaPage />
    </Suspense>
  );
}
