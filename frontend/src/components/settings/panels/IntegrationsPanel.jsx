import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import Badge from "../../common/Badge";
import { buildApiUrl } from "../../../services/api";

const INTEGRATIONS = [
  { key: "serper", label: "Serper API", desc: "웹 검색" },
  { key: "google_calendar", label: "Google Calendar", desc: "일정 관리" },
  { key: "github", label: "GitHub", desc: "저장소 연동" },
];

function tone(status) {
  if (status === "connected") return "badge-ok";
  if (status === "key_present") return "badge-warn";
  return "badge-off";
}

function label(status) {
  if (status === "connected") return "연결됨";
  if (status === "key_present") return "키 있음";
  return "연결 안됨";
}

function IntegrationsPanel() {
  const [state, setState] = useState({});
  const [editing, setEditing] = useState({});
  const [testResult, setTestResult] = useState({});

  useEffect(() => {
    async function load() {
      const entries = await Promise.all(
        INTEGRATIONS.map(async (integration) => {
          try {
            const response = await fetch(buildApiUrl(`/settings/integrations/${integration.key}`));
            if (!response.ok) {
              throw new Error("failed");
            }
            const payload = await response.json();
            return [integration.key, payload];
          } catch {
            return [integration.key, { status: "disconnected", key: "" }];
          }
        })
      );
      setState(Object.fromEntries(entries));
    }

    load();
  }, []);

  async function saveKey(key, value) {
    try {
      await fetch(buildApiUrl(`/settings/integrations/${key}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: value }),
      });
      setState((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          status: value ? "key_present" : "disconnected",
          key: value,
        },
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        [key]: { ...prev[key], status: "disconnected" },
      }));
    }
  }

  async function testIntegration(key) {
    try {
      const response = await fetch(buildApiUrl(`/settings/integrations/${key}/test`), {
        method: "POST",
      });
      setTestResult((prev) => ({
        ...prev,
        [key]: response.ok ? "ok" : "warn",
      }));
    } catch {
      setTestResult((prev) => ({ ...prev, [key]: "warn" }));
    }

    window.setTimeout(() => {
      setTestResult((prev) => ({ ...prev, [key]: null }));
    }, 3000);
  }

  return (
    <>
      {INTEGRATIONS.map((integration) => (
        <div key={integration.key} className="panel-section">
          <div className="panel-title">{integration.label}</div>
          <div className="integration-row">
            <div>
              <div className="integration-name">{integration.desc}</div>
            </div>
            <Badge tone={tone(state[integration.key]?.status || "disconnected")}>
              {label(state[integration.key]?.status || "disconnected")}
            </Badge>
          </div>

          <div className="integration-controls">
            <input
              className="hana-input"
              type={editing[integration.key] ? "text" : "password"}
              value={state[integration.key]?.key || ""}
              onChange={(event) =>
                setState((prev) => ({
                  ...prev,
                  [integration.key]: {
                    ...prev[integration.key],
                    key: event.target.value,
                  },
                }))
              }
            />
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() =>
                setEditing((prev) => ({
                  ...prev,
                  [integration.key]: !prev[integration.key],
                }))
              }
            >
              보기
            </button>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => saveKey(integration.key, state[integration.key]?.key || "")}
            >
              저장
            </button>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => testIntegration(integration.key)}
            >
              테스트
            </button>
            {testResult[integration.key] === "ok" ? (
              <Badge tone="badge-ok">정상</Badge>
            ) : null}
            {testResult[integration.key] === "warn" ? (
              <Badge tone="badge-warn">실패</Badge>
            ) : null}
          </div>
        </div>
      ))}
    </>
  );
}

IntegrationsPanel.propTypes = {
  settings: PropTypes.object,
};

export default IntegrationsPanel;
