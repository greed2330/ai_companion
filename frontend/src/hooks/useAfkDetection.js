import { useEffect, useRef } from "react";
import {
  checkProactiveEvent,
  postProactiveIgnored
} from "../services/proactive";

const AFK_TIMEOUT_MS = 10 * 60 * 1000;
const TIME_REACTION_INTERVAL_MS = 60 * 1000;
const IGNORE_TIMEOUT_MS = 4000;

export function getTimeReaction(date = new Date()) {
  const hour = date.getHours();

  if (hour >= 23) {
    return { eventType: "night_snack", mood: "CONCERNED" };
  }

  if (hour >= 2 && hour < 5) {
    return { eventType: "late_night", mood: "CONCERNED" };
  }

  return null;
}

export default function useAfkDetection({ setMood }) {
  const afkTimerRef = useRef(null);
  const ignoreTimerRef = useRef(null);
  const timeTimerRef = useRef(null);
  const isAfkRef = useRef(false);

  useEffect(() => {
    function clearIgnoreTimer() {
      if (ignoreTimerRef.current) {
        window.clearTimeout(ignoreTimerRef.current);
        ignoreTimerRef.current = null;
      }
    }

    function armIgnoreTimer(logId) {
      clearIgnoreTimer();
      if (!logId) return;
      ignoreTimerRef.current = window.setTimeout(() => {
        postProactiveIgnored(logId);
      }, IGNORE_TIMEOUT_MS);
    }

    async function runTimeReaction() {
      const reaction = getTimeReaction();
      if (!reaction) return;

      const payload = await checkProactiveEvent(reaction.eventType);
      if (!payload.can_trigger) return;

      setMood(reaction.mood);
      armIgnoreTimer(payload.log_id);
    }

    async function triggerAfkReaction() {
      const payload = await checkProactiveEvent("afk_sleepy");
      if (!payload.can_trigger) return;

      isAfkRef.current = true;
      setMood("SLEEPY");
      armIgnoreTimer(payload.log_id);
    }

    function resetAfkTimer() {
      if (afkTimerRef.current) {
        window.clearTimeout(afkTimerRef.current);
      }

      clearIgnoreTimer();
      if (isAfkRef.current) {
        isAfkRef.current = false;
        setMood("IDLE");
      }

      afkTimerRef.current = window.setTimeout(triggerAfkReaction, AFK_TIMEOUT_MS);
    }

    document.addEventListener("mousemove", resetAfkTimer);
    document.addEventListener("keydown", resetAfkTimer);
    resetAfkTimer();
    runTimeReaction();
    timeTimerRef.current = window.setInterval(runTimeReaction, TIME_REACTION_INTERVAL_MS);

    return () => {
      document.removeEventListener("mousemove", resetAfkTimer);
      document.removeEventListener("keydown", resetAfkTimer);
      window.clearTimeout(afkTimerRef.current);
      window.clearTimeout(ignoreTimerRef.current);
      window.clearInterval(timeTimerRef.current);
    };
  }, [setMood]);
}
