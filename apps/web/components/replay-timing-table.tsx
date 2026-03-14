"use client";

import { useDeferredValue, useMemo } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { getLeaderboard } from "@/lib/session-insights";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type TimingRow = ReturnType<typeof getLeaderboard>[number];
type ReplayTimingRow = TimingRow & {
  progress?: number;
  replayLap?: number;
  replayStatus?: string;
};

const columnHelper = createColumnHelper<ReplayTimingRow>();

function compoundTone(compound: string | undefined) {
  switch (compound?.toLowerCase()) {
    case "soft":
      return "bg-red-500/15 text-red-600";
    case "medium":
      return "bg-yellow-500/15 text-yellow-700";
    case "hard":
      return "bg-white/10 text-[var(--foreground)]";
    case "intermediate":
    case "inter":
      return "bg-emerald-500/15 text-emerald-700";
    case "wet":
      return "bg-blue-500/15 text-blue-700";
    default:
      return "bg-[var(--muted)] text-[var(--muted-foreground)]";
  }
}

export function ReplayTimingTable({ rows, isLoading = false }: { rows: ReplayTimingRow[]; isLoading?: boolean }) {
  const deferredRows = useDeferredValue(rows);
  const columns = useMemo(
    () => [
      columnHelper.accessor("position", {
        header: "Pos",
        cell: (info) => <span className="font-semibold">P{info.getValue()}</span>,
      }),
      columnHelper.display({
        id: "driver",
        header: "Driver",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            {row.original.headshotUrl ? (
              <img
                src={row.original.headshotUrl}
                alt={row.original.name}
                className="size-9 rounded-full border border-[var(--border)] object-cover bg-[var(--muted)]"
              />
            ) : (
              <div className="flex size-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--muted)] text-xs font-semibold">
                {row.original.shortCode ?? row.original.racingNumber}
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate font-medium">{row.original.name}</div>
              <div className="truncate text-xs text-[var(--muted-foreground)]">
                #{row.original.racingNumber} {row.original.teamName}
              </div>
            </div>
          </div>
        ),
      }),
      columnHelper.accessor("currentCompound", {
        header: "Tyre",
        cell: (info) => (
          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${compoundTone(info.getValue())}`}>
            {info.getValue() ?? "-"}
          </span>
        ),
      }),
      columnHelper.accessor("currentStintLaps", {
        header: "Stint",
        cell: (info) => info.getValue() ?? "-",
      }),
      columnHelper.accessor("replayLap", {
        header: "Lap",
        cell: (info) => info.getValue() ?? info.row.original.numberOfLaps ?? "-",
      }),
      columnHelper.accessor("progress", {
        header: "Track",
        cell: (info) => {
          const value = info.getValue();
          return value !== undefined ? `${Math.round(value * 100)}%` : "-";
        },
      }),
      columnHelper.accessor("lastLapTime", {
        header: "Last",
        cell: (info) => info.getValue() ?? "-",
      }),
      columnHelper.accessor("bestLapTime", {
        header: "Best",
        cell: (info) => info.getValue() ?? "-",
      }),
      columnHelper.accessor("replayStatus", {
        header: "Status",
        cell: (info) => info.getValue() ?? "Running",
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: deferredRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Card className="bg-[var(--panel)]/95">
      <CardHeader>
        <CardTitle>Timing Tower</CardTitle>
        <CardDescription>Replay-aligned timing board that follows the current replay frame.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="grid grid-cols-[56px_1.4fr_0.7fr_0.5fr_0.5fr_0.7fr_0.7fr_0.7fr] gap-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-(--radius-md) border border-[var(--border)]">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-[var(--muted)]/60 text-left text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th key={header.id} className="px-4 py-3 font-medium">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--border)] bg-[var(--panel)] align-middle">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
