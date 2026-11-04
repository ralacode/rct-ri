import { useEffect, useRef, useState } from "react";

import { MyButton } from "@/components/react/my-button";
import { go } from "@/lib/nav";
import {
  formatVideoTime,
  listPageUrl,
  listVideos,
  readVideoFilter,
  saveVideoProgress,
  videoContentUrl,
  videoTitle,
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

export function VideoPlayer({ fileName = "" }: { fileName?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [name, setName] = useState(fileName);
  const [title, setTitle] = useState(fileName);
  const [message, setMessage] = useState("");
  const [resumeSec, setResumeSec] = useState(0);
  const resumeSecRef = useRef(0);
  const resumeKnown = useRef(false);
  const appliedResume = useRef(false);
  const playingRef = useRef(false);
  const nameRef = useRef(name);
  nameRef.current = name;

  const tryApplyResume = () => {
    const video = videoRef.current;
    if (!video || appliedResume.current || !resumeKnown.current) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    appliedResume.current = true;
    const sec = resumeSecRef.current;
    if (sec > 0 && sec < video.duration - 1) {
      video.currentTime = sec;
    }
  };

  useEffect(() => {
    const next = fileNameFromLocation() || fileName;
    setName(next);
    setTitle(next);
    appliedResume.current = false;
    resumeKnown.current = false;
    resumeSecRef.current = 0;
    setResumeSec(0);
    if (!next) {
      setMessage("動画が指定されていません");
      return;
    }
    void listVideos()
      .then((items) => {
        const item = items.find((video) => video.name === next);
        if (!item) {
          setMessage("動画が見つかりません");
          return;
        }
        const sec = item.completed ? 0 : item.positionSec;
        resumeSecRef.current = sec;
        resumeKnown.current = true;
        setResumeSec(sec);
        setTitle(videoTitle(item));
        setMessage("");
        tryApplyResume();
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : String(error));
      });
  }, [fileName]);

  const persist = (keepalive = false) => {
    const video = videoRef.current;
    const file = nameRef.current;
    if (!video || !file) return;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const position = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    void saveVideoProgress({
      fileName: file,
      positionSec: position,
      durationSec: duration,
    }).catch((error) => {
      if (!keepalive) {
        setMessage(error instanceof Error ? error.message : String(error));
      }
    });
  };

  useEffect(() => {
    const onHide = () => persist(true);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      persist(true);
    };
  }, [name]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (playingRef.current) persist();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [name]);

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
        <h2 className="text-2xl font-semibold tracking-tight">{title || name}</h2>
        <MyButton
          onClick={() => {
            persist();
            go(backUrl());
          }}
        >
          一覧へ戻る
        </MyButton>
      </div>
      {resumeSec > 0 && (
        <p className="text-sm text-muted-foreground">
          {formatVideoTime(resumeSec)} から続きを再生します
        </p>
      )}
      <video
        ref={videoRef}
        className="max-h-[70svh] w-full rounded-lg bg-black"
        src={videoContentUrl(name)}
        controls
        playsInline
        onLoadedMetadata={tryApplyResume}
        onPlay={() => {
          playingRef.current = true;
        }}
        onPause={() => {
          playingRef.current = false;
          persist();
        }}
        onEnded={() => {
          playingRef.current = false;
          persist();
        }}
      />
      {message && <p className="text-sm text-destructive">{message}</p>}
    </div>
  );
}
