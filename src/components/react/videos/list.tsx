import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/react/card";
import { MyButton } from "@/components/react/my-button";
import { MyInput } from "@/components/react/my-input";
import { Button } from "@/components/ui/button";
import { fetchMe, type AuthUser } from "@/lib/auth";
import { go } from "@/lib/nav";
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

function statusLabel(item: VideoItem) {
  if (item.completed) return "完了";
  if (item.positionSec > 0) return "途中まで";
  return "未視聴";
}

export function VideoList() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [progress, setProgress] = useState<WatchRow[]>([]);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [titleEdits, setTitleEdits] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [filter, setFilter] = useState<VideoFilter>(EMPTY_VIDEO_FILTER);

  useEffect(() => {
    setFilter(readVideoFilter(window.location.search));
  }, []);

  const updateFilter = (patch: Partial<VideoFilter>) => {
    const next = { ...filter, ...patch };
    setFilter(next);
    // 再生画面から戻ったときに条件を復元できるよう URL に残す
    window.history.replaceState(window.history.state, "", listPageUrl(next));
  };

  const visibleVideos = useMemo(
    () => filterVideos(videos, filter),
    [videos, filter],
  );
  const isFiltering = filter.q.trim() !== "" || filter.status !== "all";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const nextMe = await fetchMe();
        if (cancelled) return;
        setMe(nextMe);
        const nextVideos = await listVideos();
        if (cancelled) return;
        setVideos(nextVideos);
        setTitleEdits(
          Object.fromEntries(
            nextVideos.map((video) => [video.name, videoTitle(video)]),
          ),
        );
        if (nextMe.canManageUsers) {
          const nextProgress = await listVideoProgress();
          if (cancelled) return;
          setProgress(nextProgress);
        }
      } catch (error) {
        if (!cancelled) {
          setIsError(true);
          setMessage(error instanceof Error ? error.message : String(error));
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveTitle = async (video: VideoItem) => {
    try {
      await saveVideoTitle({
        fileName: video.name,
        title: titleEdits[video.name] ?? videoTitle(video),
      });
      const nextVideos = await listVideos();
      setVideos(nextVideos);
      setTitleEdits(
        Object.fromEntries(
          nextVideos.map((item) => [item.name, videoTitle(item)]),
        ),
      );
      if (me?.canManageUsers) {
        setProgress(await listVideoProgress());
      }
      setIsError(false);
      setMessage("タイトルを保存しました");
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="grid gap-6">
      {videos.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <MyInput
              id="video-search"
              label="検索"
              type="search"
              placeholder="タイトル・ファイル名（スペース区切りで複数語）"
              className="w-full @3xl:w-auto @3xl:max-w-md @3xl:flex-1"
              value={filter.q}
              onChange={(event) => updateFilter({ q: event.target.value })}
            />
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label="視聴状況で絞り込み"
            >
              {VIDEO_STATUS_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="lg"
                  className="h-10"
                  variant={
                    filter.status === option.value ? "default" : "outline"
                  }
                  aria-pressed={filter.status === option.value}
                  onClick={() => updateFilter({ status: option.value })}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <span className="ml-auto self-center text-sm text-muted-foreground @3xl:self-end @3xl:pb-2.5">
              {isFiltering
                ? `${videos.length} 件中 ${visibleVideos.length} 件`
                : `${videos.length} 件`}
            </span>
          </div>
        </Card>
      )}

      <Card>
        <div className="grid gap-4">
          <h2 className="text-lg font-semibold tracking-tight">動画一覧</h2>
          {videos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              動画がありません。サーバー役 PC のアプリと同じ階層にある videos
              フォルダに、MP4 などのファイルを置いてください。
            </p>
          ) : visibleVideos.length === 0 ? (
            <div className="grid justify-items-start gap-2">
              <p className="text-sm text-muted-foreground">
                該当する動画がありません。
              </p>
              <MyButton onClick={() => updateFilter(EMPTY_VIDEO_FILTER)}>
                条件をクリア
              </MyButton>
            </div>
          ) : (
            <ul className="grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3">
              {visibleVideos.map((video) => (
                <li
                  key={video.name}
                  className="flex min-w-0 flex-col gap-3 rounded-lg border p-3 wrap-anywhere"
                >
                  {me?.canManageUsers ? (
                    <>
                      <MyInput
                        id={`video-title-${video.name}`}
                        label="タイトル"
                        value={titleEdits[video.name] ?? videoTitle(video)}
                        onChange={(event) =>
                          setTitleEdits((prev) => ({
                            ...prev,
                            [video.name]: event.target.value,
                          }))
                        }
                      />
                      <p className="text-sm text-muted-foreground">
                        ファイル名: {video.name}
                      </p>
                    </>
                  ) : (
                    <p className="font-medium">{videoTitle(video)}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {statusLabel(video)}
                    {video.durationSec > 0
                      ? ` ・ ${formatVideoTime(video.positionSec)} / ${formatVideoTime(video.durationSec)}`
                      : ""}
                    {` ・ ${formatFileSize(video.size)}`}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2">
                    {me?.canManageUsers && (
                      <MyButton onClick={() => void handleSaveTitle(video)}>
                        タイトルを保存
                      </MyButton>
                    )}
                    <MyButton onClick={() => go(watchPageUrl(video.name, filter))}>
                      再生
                    </MyButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {me?.canManageUsers && (
        <Card>
          <div className="grid gap-4">
            <h2 className="text-lg font-semibold tracking-tight">視聴状況</h2>
            {progress.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                表示できる視聴状況がありません。
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-160 text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 pr-3 font-medium">動画</th>
                      <th className="py-2 pr-3 font-medium">担当者</th>
                      <th className="py-2 pr-3 font-medium">位置</th>
                      <th className="py-2 pr-3 font-medium">割合</th>
                      <th className="py-2 pr-3 font-medium">状態</th>
                      <th className="py-2 font-medium">最終視聴</th>
                    </tr>
                  </thead>
                  <tbody>
                    {progress.map((row) => (
                      <tr
                        key={`${row.userId}-${row.fileName}`}
                        className="border-b last:border-b-0"
                      >
                        <td className="py-2 pr-3">
                          {row.title || row.fileName}
                          {row.title && row.title !== row.fileName ? (
                            <span className="ml-1 text-muted-foreground">
                              ({row.fileName})
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3">
                          {row.displayName}
                          <span className="ml-1 text-muted-foreground">
                            {row.userId}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          {formatVideoTime(row.positionSec)}
                          {row.durationSec > 0
                            ? ` / ${formatVideoTime(row.durationSec)}`
                            : ""}
                        </td>
                        <td className="py-2 pr-3">{Math.round(row.percent)}%</td>
                        <td className="py-2 pr-3">
                          {row.completed
                            ? "完了"
                            : row.positionSec > 0
                              ? "途中まで"
                              : "未視聴"}
                        </td>
                        <td className="py-2">{row.updatedAt ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}

      {message && (
        <p className={isError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {message}
        </p>
      )}
    </div>
  );
}
