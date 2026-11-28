// src/components/react/videos/list.tsx
//
// 動画一覧。タイトル・ファイル名と視聴状況で絞り込める。
// 担当者管理の権限がある人は、タイトルの編集と全員の視聴状況の確認ができる。

import { useEffect, useMemo, useState } from "react";
import {
  CircleCheckIcon,
  FilmIcon,
  PencilIcon,
  PlayIcon,
  SearchIcon,
  SearchXIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchMe, type AuthUser } from "@/lib/auth";
import { go } from "@/lib/nav";
import { cn, errorMessage } from "@/lib/utils";
import {
  EMPTY_VIDEO_FILTER,
  VIDEO_STATUS_OPTIONS,
  filterVideos,
  formatFileSize,
  formatVideoTime,
  listPageUrl,
  listVideoProgress,
  listVideos,
  readVideoFilter,
  saveVideoTitle,
  videoTitle,
  watchPageUrl,
  type VideoFilter,
  type VideoItem,
  type WatchRow,
} from "@/lib/videos";
import {
  PageContainer,
  PageHeader,
} from "@components/react/layout/page-header";
import { Section } from "@components/react/patient/section";

type WatchStatus = "done" | "partial" | "none";

function watchStatus(item: {
  completed: boolean;
  positionSec: number;
}): WatchStatus {
  if (item.completed) return "done";
  if (item.positionSec > 0) return "partial";
  return "none";
}

const STATUS_LABEL: Record<WatchStatus, string> = {
  done: "完了",
  partial: "途中まで",
  none: "未視聴",
};

function StatusBadge({ status }: { status: WatchStatus }) {
  return (
    <Badge
      variant={
        status === "done"
          ? "default"
          : status === "partial"
            ? "secondary"
            : "outline"
      }
      className={cn(status === "none" && "text-muted-foreground")}
    >
      {status === "done" && <CircleCheckIcon />}
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function VideoList() {
  const [videos, setVideos] = useState<VideoItem[] | null>(null);
  const [progress, setProgress] = useState<WatchRow[]>([]);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<VideoFilter>(EMPTY_VIDEO_FILTER);
  const [editing, setEditing] = useState<VideoItem | null>(null);

  useEffect(() => {
    setFilter(readVideoFilter(window.location.search));
  }, []);

  const updateFilter = (patch: Partial<VideoFilter>) => {
    const next = { ...filter, ...patch };
    setFilter(next);
    // 再生画面から戻ったときに条件を復元できるよう URL に残す
    window.history.replaceState(window.history.state, "", listPageUrl(next));
  };

  const all = videos ?? [];
  const visibleVideos = useMemo(
    () => filterVideos(all, filter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [videos, filter],
  );
  const isFiltering = filter.q.trim() !== "" || filter.status !== "all";
  const canManage = me?.canManageUsers ?? false;

  const reload = async (nextMe: AuthUser | null = me) => {
    const nextVideos = await listVideos();
    setVideos(nextVideos);
    if (nextMe?.canManageUsers) setProgress(await listVideoProgress());
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const nextMe = await fetchMe();
        if (cancelled) return;
        setMe(nextMe);
        await reload(nextMe);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, "読み込みに失敗しました"));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageContainer className="max-w-6xl">
      <PageHeader title="動画" description="研修・手順の動画を見られます" />

      {all.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <InputGroup className="w-full sm:w-80">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="text"
              enterKeyHint="search"
              aria-label="動画を検索"
              placeholder="タイトル・ファイル名（スペースで複数語）"
              value={filter.q}
              onChange={(event) => updateFilter({ q: event.target.value })}
            />
          </InputGroup>
          <ButtonGroup aria-label="視聴状況で絞り込み">
            {VIDEO_STATUS_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={filter.status === option.value ? "default" : "outline"}
                aria-pressed={filter.status === option.value}
                onClick={() => updateFilter({ status: option.value })}
              >
                {option.label}
              </Button>
            ))}
          </ButtonGroup>
          <span className="ml-auto text-sm text-muted-foreground tabular-nums">
            {isFiltering
              ? `${all.length} 件中 ${visibleVideos.length} 件`
              : `${all.length} 件`}
          </span>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {videos === null && !error ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : all.length === 0 && !error ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FilmIcon />
            </EmptyMedia>
            <EmptyTitle>動画がありません</EmptyTitle>
            <EmptyDescription>
              サーバー役 PC のアプリと同じ階層にある videos フォルダに、MP4
              などのファイルを置いてください。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : visibleVideos.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>条件に当てはまる動画はありません</EmptyTitle>
          </EmptyHeader>
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateFilter(EMPTY_VIDEO_FILTER)}
          >
            条件をクリア
          </Button>
        </Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleVideos.map((video) => (
            <li key={video.name}>
              <VideoCard
                video={video}
                canManage={canManage}
                onPlay={() => go(watchPageUrl(video.name, filter))}
                onEdit={() => setEditing(video)}
              />
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <Section
          title="視聴状況"
          count={progress.length}
          description="担当者ごとの視聴の進み具合です"
        >
          <WatchProgressTable rows={progress} />
        </Section>
      )}

      <TitleDialog
        video={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={() => void reload()}
      />
    </PageContainer>
  );
}

function VideoCard({
  video,
  canManage,
  onPlay,
  onEdit,
}: {
  video: VideoItem;
  canManage: boolean;
  onPlay: () => void;
  onEdit: () => void;
}) {
  const status = watchStatus(video);
  const percent =
    video.durationSec > 0
      ? Math.min(100, (video.positionSec / video.durationSec) * 100)
      : status === "done"
        ? 100
        : 0;
  return (
    <Card className="h-full gap-3 px-4 py-4">
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 font-medium wrap-anywhere">
          {videoTitle(video)}
        </h2>
        <StatusBadge status={status} />
      </div>
      {canManage && (
        <p className="text-xs text-muted-foreground wrap-anywhere">
          {video.name}
        </p>
      )}
      <div className="grid gap-1.5">
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="視聴の進み具合"
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {video.durationSec > 0
            ? `${formatVideoTime(video.positionSec)} / ${formatVideoTime(video.durationSec)}`
            : "長さ不明"}
          {` ・ ${formatFileSize(video.size)}`}
        </p>
      </div>
      <div className="mt-auto flex gap-2">
        <Button size="sm" onClick={onPlay}>
          <PlayIcon />
          {status === "partial" ? "続きから再生" : "再生"}
        </Button>
        {canManage && (
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <PencilIcon />
            タイトル
          </Button>
        )}
      </div>
    </Card>
  );
}

function WatchProgressTable({ rows }: { rows: WatchRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        表示できる視聴状況がありません。
      </p>
    );
  }
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Table className="min-w-160">
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="pl-4">動画</TableHead>
            <TableHead>担当者</TableHead>
            <TableHead>位置</TableHead>
            <TableHead className="text-right">割合</TableHead>
            <TableHead>状態</TableHead>
            <TableHead className="pr-4">最終視聴</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.userId}-${row.fileName}`}>
              <TableCell className="pl-4 whitespace-normal">
                {row.title || row.fileName}
                {row.title && row.title !== row.fileName ? (
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({row.fileName})
                  </span>
                ) : null}
              </TableCell>
              <TableCell>
                {row.displayName}
                <span className="ml-1 text-xs text-muted-foreground">
                  {row.userId}
                </span>
              </TableCell>
              <TableCell className="tabular-nums">
                {formatVideoTime(row.positionSec)}
                {row.durationSec > 0
                  ? ` / ${formatVideoTime(row.durationSec)}`
                  : ""}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {Math.round(row.percent)}%
              </TableCell>
              <TableCell>
                <StatusBadge status={watchStatus(row)} />
              </TableCell>
              <TableCell className="pr-4 tabular-nums">
                {row.updatedAt ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function TitleDialog({
  video,
  onOpenChange,
  onSaved,
}: {
  video: VideoItem | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!video) return;
    setTitle(videoTitle(video));
    setError(null);
  }, [video]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!video) return;
    setPending(true);
    try {
      await saveVideoTitle({ fileName: video.name, title });
      toast.success("タイトルを保存しました");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err, "保存に失敗しました。"));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={video !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>タイトルを編集</DialogTitle>
            <DialogDescription className="wrap-anywhere">
              ファイル名：{video?.name}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="video-title">タイトル</FieldLabel>
            <Input
              id="video-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="空欄にするとファイル名を表示します"
            />
          </Field>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                キャンセル
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "保存中…" : "保存する"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
