import React from "react";
import { AlertTriangle, ShieldAlert, ArrowRight, Lock } from "lucide-react";

export function InsecureContextBanner() {
  const isHttp = typeof window !== "undefined" && window.location.protocol === "http:";
  const host = typeof window !== "undefined" ? window.location.host : "";
  const httpsUrl = `https://${host}`;

  const handleSwitchToHttps = () => {
    window.location.href = httpsUrl;
  };

  return (
    <div className="insecure-context-banner">
      <div className="insecure-context-content">
        <ShieldAlert size={18} className="insecure-context-icon" />
        <div className="insecure-context-text">
          <strong>Insecure Origin (LAN HTTP):</strong> Browsers disable Web Crypto (<code>window.crypto.subtle</code>) on network IP addresses unless delivered over HTTPS.
        </div>
      </div>
      <div className="insecure-context-actions">
        <button
          type="button"
          className="btn-switch-https"
          onClick={handleSwitchToHttps}
          title="Switch protocol to HTTPS"
        >
          <span>Switch to HTTPS</span>
          <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
