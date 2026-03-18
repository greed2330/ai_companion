import { useEffect, useRef, useState } from "react";
import { buildApiUrl } from "../services/api";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

export default function useMoodStream({ onMoodChange, onModelChange }) {
  const retriesRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const pollingTimerRef = useRef(null);
  const sourceRef = useRef(null);
  const onMoodChangeRef = useRef(onMoodChange);
  const onModelChangeRef = useRef(onModelChange);
  const [mode, setMode] = useState("stream");

  onMoodChangeRef.current = onMoodChange;
  onModelChangeRef.current = onModelChange;

  useEffect(() => {
    async function pollMood() {
      try {
        const response = await fetch(buildApiUrl("/mood"));
        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        onMoodChangeRef.current?.(payload.mood || "IDLE");
      } catch {
        return;
      }
    }

    function startPolling() {
      setMode("polling");
      pollMood();
      pollingTimerRef.current = window.setInterval(pollMood, RETRY_DELAY_MS);
    }

    function cleanupTimers() {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      if (pollingTimerRef.current) {
        window.clearInterval(pollingTimerRef.current);
      }
    }

    function connect() {
      const source = new EventSource(buildApiUrl("/mood/stream"));
      sourceRef.current = source;

      source.onmessage = (event) => {
        if (!event.data) {
          return;
        }

        const payload = JSON.parse(event.data);
        if (payload.type === "mood_change") {
          retriesRef.current = 0;
          onMoodChangeRef.current?.(payload.mood || "IDLE");
        }

        if (payload.type === "model_change") {
          retriesRef.current = 0;
          onModelChangeRef.current?.(payload.model_id || null);
        }
      };

      source.onerror = () => {
        source.close();
        retriesRef.current += 1;

        if (retriesRef.current >= MAX_RETRIES) {
          startPolling();
          return;
        }

        reconnectTimerRef.current = window.setTimeout(connect, RETRY_DELAY_MS);
      };
    }

    connect();

    return () => {
      cleanupTimers();
      sourceRef.current?.close();
    };
  }, []);

  return { mode };
}
