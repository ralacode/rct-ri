import { useEffect, useRef, useState } from "react";

import { MyButton } from "@/components/react/my-button";
import { go } from "@/lib/nav";
import {
  formatVideoTime,
  listPageUrl,
  listVideos,
  positionToSave,
  readVideoFilter,
  saveVideoProgress,
  videoContentUrl,
  videoTitle,
  type SavePositionState,
} from "@/lib/videos";

function fileNameFromLocation() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("name") ?? "";
}

/** 一覧から引き継いだ検索条件付きの戻り先 */
function backUrl() {
  if (typeof window === "undefined") return listPageUrl();
  return listPageUrl(readVideoFilter(window.location.search));
}

type PlaybackSession = {
  file: string;
  position: SavePositionState;
  durationSec: number;
  /** 保存済みの位置を読むまで、0 秒で上書きしない */
  allowSave: boolean;
  /** 再生かユーザーのシークが始まるまで保存しない */
  started: boolean;
  /** 最初から見始めた、またはユーザーがシークした */
  rewind: boolean;
};

type BeforePreparationEvent = Event & {
  loader?: () => Promise<void>;
};

function videoForFile(video: HTMLVideoElement | null, file: string) {
  if (!video || !file || !video.isConnected) return null;
  const src = video.currentSrc || video.src;
  if (!src) return null;
  try {
    const name = new URL(src, window.location.href).searchParams.get("name");
    if (name !== file) return null;
  } catch {
    return null;
  }
  return video;
}

function mediaDuration(video: HTMLVideoElement | null) {
  if (!video || !Number.isFinite(video.duration) || video.duration <= 0)
    return 0;
  return video.duration;
}

export function VideoPlayer({ fileName = "" }: { fileName?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<PlaybackSession | null>(null);
  const resumeSecRef = useRef(0);
  const resumeKnown = useRef(false);
  const resumeApplied = useRef(false);
  const awaitingSeek = useRef(false);
  const pendingPlay = useRef(false);
  const programmaticSeek = useRef(false);
  const playingRef = useRef(false);
  const leavingRef = useRef(false);
  const seekTimerRef = useRef(0);
  const [name, setName] = useState(fileName);
  const [title, setTitle] = useState(fileName);
  const [message, setMessage] = useState("");
  const [resumeSec, setResumeSec] = useState(0);
  const [resumeReady, setResumeReady] = useState(false);

  const markReady = () => {
    resumeApplied.current = true;
    awaitingSeek.current = false;
    setResumeReady(true);
    const video = videoRef.current;
    if (pendingPlay.current && video) {
      pendingPlay.current = false;
      void video.play();
    }
  };

  const rememberDuration = (
    session: PlaybackSession,
    video: HTMLVideoElement | null,
  ) => {
    const duration = mediaDuration(video);
    if (duration > 0) session.durationSec = duration;
  };

  const commitPosition = (session: PlaybackSession, live: number | null) => {
    const next = positionToSave({
      liveSec: live,
      rememberedSec: session.position.rememberedSec,
      resumeFloorSec: session.position.resumeFloorSec,
      userSeeked: session.position.userSeeked,
    });
    session.position = {
      rememberedSec: next.rememberedSec,
      resumeFloorSec: next.resumeFloorSec,
      userSeeked: next.userSeeked,
    };
    return next.positionSec;
  };

  const persistSession = async (
    session: PlaybackSession,
    options: { keepalive: boolean; report: boolean },
  ) => {
    if (!session.allowSave || !session.file || !session.started) return true;
    const video = videoForFile(videoRef.current, session.file);
    rememberDuration(session, video);
    const live =
      video && Number.isFinite(video.currentTime) ? video.currentTime : null;
    const positionSec = commitPosition(session, live);
    try {
      await saveVideoProgress(
        {
          fileName: session.file,
          positionSec,
          durationSec: session.durationSec,
          seeked: session.rewind,
        },
        { keepalive: options.keepalive },
      );
      return true;
    } catch (error) {
      if (options.report) {
        setMessage(error instanceof Error ? error.message : String(error));
      }
      return false;
    }
  };

  const tryApplyResume = () => {
    const video = videoRef.current;
    if (
      !video ||
      !resumeKnown.current ||
      resumeApplied.current ||
      awaitingSeek.current
    ) {
      return;
    }
    const target = resumeSecRef.current;
    const duration = mediaDuration(video);
    if (!(target > 0)) {
      markReady();
      return;
    }
    if (duration <= 0) return;
    if (!(target < duration)) {
      markReady();
      return;
    }
    if (Math.abs(video.currentTime - target) < 0.25) {
      markReady();
      return;
    }
    awaitingSeek.current = true;
    programmaticSeek.current = true;
    try {
      video.currentTime = target;
    } catch {
      markReady();
      return;
    }
    window.clearTimeout(seekTimerRef.current);
    seekTimerRef.current = window.setTimeout(() => {
      if (!awaitingSeek.current) return;
      programmaticSeek.current = false;
      markReady();
    }, 1000);
  };

  useEffect(() => {
    const next = fileNameFromLocation() || fileName;
    setName(next);
    setTitle(next);
    resumeKnown.current = false;
    resumeApplied.current = false;
    awaitingSeek.current = false;
    pendingPlay.current = false;
    programmaticSeek.current = false;
    playingRef.current = false;
    leavingRef.current = false;
    resumeSecRef.current = 0;
    setResumeSec(0);
    setResumeReady(false);
    setMessage("");
    window.clearTimeout(seekTimerRef.current);
    if (!next) {
      setMessage("動画が指定されていません");
      return;
    }
    let cancelled = false;
    void listVideos()
      .then((items) => {
        if (cancelled) return;
        const session = sessionRef.current;
        if (!session || session.file !== next) return;
        const item = items.find((video) => video.name === next);
        if (!item) {
          setMessage("動画が見つかりません");
          resumeKnown.current = true;
          markReady();
          return;
        }
        const sec = item.completed ? 0 : item.positionSec;
        resumeSecRef.current = sec;
        resumeKnown.current = true;
        session.allowSave = true;
        session.position = {
          rememberedSec: sec,
          resumeFloorSec: sec,
          userSeeked: false,
        };
        if (item.durationSec > 0) session.durationSec = item.durationSec;
        setResumeSec(sec);
        setTitle(videoTitle(item));
        setMessage("");
        tryApplyResume();
      })
      .catch((error) => {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : String(error));
        // 位置を読めなかったときは、0 秒で保存済みの位置を消さない。
        resumeKnown.current = true;
        markReady();
      });
    return () => {
      cancelled = true;
      window.clearTimeout(seekTimerRef.current);
    };
  }, [fileName]);

  useEffect(() => {
    const session: PlaybackSession = {
      file: name,
      position: { rememberedSec: 0, resumeFloorSec: 0, userSeeked: false },
      durationSec: mediaDuration(videoRef.current),
      allowSave: false,
      started: false,
      rewind: false,
    };
    sessionRef.current = session;
    if (resumeKnown.current && resumeSecRef.current >= 0 && name) {
      // 位置の取得が、この effect より先に終わっていた場合。
      const sec = resumeSecRef.current;
      session.allowSave = true;
      session.position = {
        rememberedSec: sec,
        resumeFloorSec: sec,
        userSeeked: false,
      };
    }

    const saveQuietly = () => {
      void persistSession(session, { keepalive: true, report: false });
    };
    const onPrepare = (event: Event) => {
      const video = videoForFile(videoRef.current, session.file);
      if (video && !video.paused) video.pause();
      const prep = event as BeforePreparationEvent;
      const original = prep.loader;
      if (typeof original !== "function") {
        saveQuietly();
        return;
      }
      prep.loader = async () => {
        await persistSession(session, { keepalive: false, report: false });
        await original();
      };
    };
    const onHide = () => saveQuietly();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    document.addEventListener("astro:before-preparation", onPrepare);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => {
      if (playingRef.current) {
        void persistSession(session, { keepalive: false, report: true });
      }
    }, 5000);
    return () => {
      document.removeEventListener("astro:before-preparation", onPrepare);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
      saveQuietly();
    };
  }, [name]);

  const noteTime = () => {
    const session = sessionRef.current;
    if (!session?.allowSave) return;
    const video = videoForFile(videoRef.current, session.file);
    if (!video) return;
    rememberDuration(session, video);
    commitPosition(session, video.currentTime);
  };

  if (!name) {
    return (
      <div className="mx-auto grid w-full max-w-5xl gap-4">
        <p className="text-sm text-destructive">
          {message || "動画が指定されていません"}
        </p>
        <MyButton onClick={() => go(backUrl())}>一覧へ戻る</MyButton>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl content-start gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          {title || name}
        </h2>
        <MyButton
          onClick={() => {
            if (leavingRef.current) return;
            leavingRef.current = true;
            const session = sessionRef.current;
            void (async () => {
              const ok =
                !session ||
                (await persistSession(session, {
                  keepalive: false,
                  report: true,
                }));
              if (!ok) {
                leavingRef.current = false;
                return;
              }
              go(backUrl());
            })();
          }}
        >
          一覧へ戻る
        </MyButton>
      </div>
      {!resumeReady && !message && (
        <p className="text-sm text-muted-foreground">
          再生位置を読み込んでいます
        </p>
      )}
      {resumeReady && resumeSec > 0 && (
        <p className="text-sm text-muted-foreground">
          {formatVideoTime(resumeSec)} から続きを再生します
        </p>
      )}
      <video
        key={name}
        ref={videoRef}
        className="max-h-[70svh] w-full rounded-lg bg-black"
        src={videoContentUrl(name)}
        controls={resumeReady}
        playsInline
        preload="metadata"
        onLoadedMetadata={() => {
          const session = sessionRef.current;
          const video = videoRef.current;
          if (session && video && videoForFile(video, session.file)) {
            rememberDuration(session, video);
          }
          tryApplyResume();
        }}
        onLoadedData={tryApplyResume}
        onError={() => {
          // 読めない動画は続きの位置へシークできないので、操作だけ戻す。
          resumeApplied.current = true;
          awaitingSeek.current = false;
          setResumeReady(true);
        }}
        onSeeking={() => {
          if (programmaticSeek.current) return;
          const session = sessionRef.current;
          if (!session?.allowSave) return;
          session.position.userSeeked = true;
          session.rewind = true;
          session.started = true;
        }}
        onSeeked={() => {
          programmaticSeek.current = false;
          noteTime();
          if (awaitingSeek.current) markReady();
          const session = sessionRef.current;
          if (session?.started) {
            void persistSession(session, { keepalive: false, report: true });
          }
        }}
        onTimeUpdate={noteTime}
        onPlay={() => {
          const video = videoRef.current;
          const session = sessionRef.current;
          if (!video || !session) return;
          if (!resumeKnown.current || !resumeApplied.current) {
            pendingPlay.current = true;
            video.pause();
            tryApplyResume();
            return;
          }
          const target = resumeSecRef.current;
          const duration = mediaDuration(video);
          if (
            !session.rewind &&
            target > 0.5 &&
            duration > 0 &&
            target < duration &&
            video.currentTime + 0.75 < target
          ) {
            programmaticSeek.current = true;
            video.currentTime = target;
          }
          session.started = true;
          if (target <= 0) session.rewind = true;
          playingRef.current = true;
        }}
        onPause={() => {
          playingRef.current = false;
          const session = sessionRef.current;
          if (!session?.started) return;
          noteTime();
          void persistSession(session, { keepalive: false, report: true });
        }}
        onEnded={() => {
          playingRef.current = false;
          const session = sessionRef.current;
          if (!session) return;
          session.started = true;
          noteTime();
          void persistSession(session, { keepalive: false, report: true });
        }}
      />
      {message && <p className="text-sm text-destructive">{message}</p>}
    </div>
  );
}
